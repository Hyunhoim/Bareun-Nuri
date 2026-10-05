using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Windows 11 includes .NET Framework 4.x. All analysis runtimes are bundled.
class Launcher : Form {
    readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    readonly Label status = new Label { AutoSize=false, Dock=DockStyle.Top, Height=70, Text="실행 환경을 준비하고 있습니다…" };
    readonly Button open = new Button { Text="검사 화면 열기", Width=150, Height=38, Enabled=false };
    readonly Button stop = new Button { Text="프로그램 종료", Width=150, Height=38 };
    readonly TextBox address = new TextBox { ReadOnly=true, Dock=DockStyle.Top, Visible=false };
    Process server; IntPtr job; StreamWriter log; string url; bool closing, finished;
    readonly bool noBrowser = Array.IndexOf(Environment.GetCommandLineArgs(), "--no-browser") >= 0;
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job,int info,IntPtr data,uint size);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [StructLayout(LayoutKind.Sequential)] struct Limits { public long PerProcess,PerJob; public uint Flags; public UIntPtr Min,Max; public uint Active; public UIntPtr Affinity; public uint Priority,Scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct Counters { public ulong A,B,C,D,E,F; }
    [StructLayout(LayoutKind.Sequential)] struct Extended { public Limits Basic; public Counters Io; public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob; }
    [STAThread] static void Main() {
        // Some host shells supply both PATH and Path; .NET's child environment rejects duplicates.
        string searchPath=Environment.GetEnvironmentVariable("PATH");
        for(int i=0;i<4 && Environment.GetEnvironmentVariable("PATH")!=null;i++)Environment.SetEnvironmentVariable("PATH",null);
        Environment.SetEnvironmentVariable("PATH",searchPath);
        if(Array.IndexOf(Environment.GetCommandLineArgs(),"--stop")>=0){File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"state","stop.request"),"");return;}
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        // Exclusive file lock is scoped to this portable copy, not every installation.
        try { Directory.CreateDirectory(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"state"));
            using(var gate=new FileStream(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"state","launcher.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None))
                Application.Run(new Launcher());
        } catch(IOException e) {
            if((e.HResult & 0xffff)==32){
                try {File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"state","open.request"),"");}
                catch(Exception error){MessageBox.Show("실행 중인 화면을 열지 못했습니다.\n"+error.Message,"Bareun-Nuri");}
            }else MessageBox.Show("실행 파일 폴더의 접근 권한을 확인하세요.\n"+e.Message,"Bareun-Nuri");
        } catch(Exception e) { MessageBox.Show("실행할 수 없습니다.\n"+e.Message,"Bareun-Nuri"); }
    }
    Launcher() {
        string stopFile=Path.Combine(root,"state","stop.request");if(File.Exists(stopFile))File.Delete(stopFile);
        Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Text="Bareun-Nuri 실행기"; ClientSize=new Size(430,195); Padding=new Padding(24);
        Font=new Font("맑은 고딕",10); FormBorderStyle=FormBorderStyle.FixedDialog; MaximizeBox=false;
        var row=new FlowLayoutPanel { Dock=DockStyle.Bottom, Height=42 }; row.Controls.Add(open);row.Controls.Add(stop);
        Controls.Add(address);Controls.Add(status);Controls.Add(row); open.Click+=(s,e)=>Open(); stop.Click+=(s,e)=>Close();
        Shown+=async(s,e)=>await Start(); FormClosing+=OnClosing;
        var timer=new System.Windows.Forms.Timer {Interval=1000};timer.Tick+=(s,e)=>{
            if(File.Exists(stopFile)){File.Delete(stopFile);Close();return;}
            string openFile=Path.Combine(root,"state","open.request");
            if(!closing&&open.Enabled&&File.Exists(openFile)){File.Delete(openFile);Show();WindowState=FormWindowState.Normal;Activate();Open();}
        };timer.Start();
    }
    void Open(){
        try {Process.Start(new ProcessStartInfo(url){UseShellExecute=true});Record("Browser opened using default handler");return;}
        catch(Exception e){Record("Default browser: "+e.Message);}
        // Browser integration failure must not stop the running inspection server.
        foreach(string folder in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}){
            string edge=Path.Combine(folder,"Microsoft","Edge","Application","msedge.exe");
            if(!File.Exists(edge))continue;
            try {Process.Start(new ProcessStartInfo(edge,"--new-window "+url){UseShellExecute=false,CreateNoWindow=true});Record("Browser opened using Edge fallback");return;}
            catch(Exception e){Record("Edge browser: "+e.Message);}
        }
        status.Text="서버는 실행 중입니다.\n아래 주소를 복사해 브라우저에서 열어 주세요.";
        Show();WindowState=FormWindowState.Normal;Activate();address.Focus();address.SelectAll();
    }
    void Record(string line){ if(line==null)return; lock(this){if(log!=null){log.WriteLine(line);log.Flush();}} }
    async Task Start() {
        try {
            foreach(var dir in new[]{"logs","config","state"})Directory.CreateDirectory(Path.Combine(root,dir));
            log=new StreamWriter(Path.Combine(root,"logs","backend.log"),true,Encoding.UTF8);
            string config=Path.Combine(root,"config",".env");
            if(!File.Exists(config))File.WriteAllText(config,"OPENAI_API_KEY=\n",new UTF8Encoding(false));
            var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();int port=((IPEndPoint)listener.LocalEndpoint).Port;listener.Stop();
            url="http://127.0.0.1:"+port;
            var info=new ProcessStartInfo(Path.Combine(root,"runtime","java","bin","java.exe"),"-Dfile.encoding=UTF-8 -jar \""+Path.Combine(root,"app","backend","public-ad-backend.jar")+"\" --app.development-settings=false --server.port="+port) {
                UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.Combine(root,"app"),RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8 };
            info.EnvironmentVariables["APP_ROOT"]=Path.Combine(root,"app");
            info.EnvironmentVariables["APP_STORAGE"]=Path.Combine(root,"state","jobs");
            info.EnvironmentVariables["APP_ENV_FILE"]=config;
            info.EnvironmentVariables["NODE_EXECUTABLE"]=Path.Combine(root,"runtime","node","node.exe");
            info.EnvironmentVariables["ANTISPOOF_PYTHON"]=Path.Combine(root,"runtime","python","python.exe");
            info.EnvironmentVariables["PLAYWRIGHT_BROWSERS_PATH"]=Path.Combine(root,"runtime","chromium");
            info.EnvironmentVariables["BROWSER_CHANNEL"]="chromium";
            info.EnvironmentVariables["PYTHONUTF8"]="1"; info.EnvironmentVariables["PYTHONNOUSERSITE"]="1";
            info.EnvironmentVariables.Remove("PYTHONHOME");info.EnvironmentVariables.Remove("PYTHONPATH");
            info.EnvironmentVariables.Remove("CLOVASTUDIO_API_KEY");
            info.EnvironmentVariables.Remove("OPENAI_API_KEY");
            info.EnvironmentVariables["HF_HUB_OFFLINE"]="1";
            job=CreateJobObject(IntPtr.Zero,null);
            var limits=new Extended();limits.Basic.Flags=0x2000;
            IntPtr ptr=Marshal.AllocHGlobal(Marshal.SizeOf(limits));
            try {Marshal.StructureToPtr(limits,ptr,false);if(job==IntPtr.Zero||!SetInformationJobObject(job,9,ptr,(uint)Marshal.SizeOf(limits)))throw new Exception("프로세스 보호 설정 실패");}
            finally {Marshal.FreeHGlobal(ptr);}
            server=Process.Start(info);
            if(!AssignProcessToJobObject(job,server.Handle)){server.Kill();throw new Exception("프로세스 종료 관리 설정 실패");}
            server.OutputDataReceived+=(s,e)=>Record(e.Data);server.ErrorDataReceived+=(s,e)=>Record(e.Data);
            server.BeginOutputReadLine();server.BeginErrorReadLine();
            bool ready=false;
            for(int i=0;i<90;i++){if(server.HasExited)throw new Exception("백엔드 시작 실패: logs/backend.log 확인");
                try {string health=await Get("/api/health");if(health.Contains("public-ad-baseline")){ready=true;break;}}catch{}
                await Task.Delay(1000);
            }
            if(!ready)throw new Exception("서버 시작 제한 시간 초과");
            File.WriteAllText(Path.Combine(root,"state","launcher.json"),new JavaScriptSerializer().Serialize(new {url=url,pid=server.Id,launcherPid=Process.GetCurrentProcess().Id}));
            status.Text="실행 중 · API 키 관리에서 키를 등록하세요.\n브라우저를 닫아도 검사는 계속됩니다.";open.Enabled=true;
            address.Text=url;address.Visible=true;
            if(!noBrowser)Open();
        }catch(Exception e){status.Text="실행 실패";if(log!=null)Record(e.ToString());if(!noBrowser)MessageBox.Show(this,e.Message,"Bareun-Nuri");finished=true;Close();}
    }
    async Task<string> Get(string path){using(var client=new WebClient()){client.Proxy=null;return await client.DownloadStringTaskAsync(url+path);}}
    async Task Cancel(string id){using(var client=new WebClient()){client.Proxy=null;client.Headers["Content-Type"]="application/json";client.Headers["X-Local-Client"]="public-ad-ui";await client.UploadStringTaskAsync(url+"/api/jobs/"+id+"/cancel","POST","{}");}}
    async void OnClosing(object sender,FormClosingEventArgs e){
        if(finished){if(job!=IntPtr.Zero)CloseHandle(job);lock(this){if(log!=null){log.Dispose();log=null;}}return;}
        e.Cancel=true;if(closing)return;closing=true;stop.Enabled=false;open.Enabled=false;status.Text="검사 중단과 저장을 기다리고 있습니다…";
        try {
            if(server!=null&&!server.HasExited&&url!=null){
                var json=new JavaScriptSerializer();json.MaxJsonLength=int.MaxValue;
                for(int wait=0;wait<40;wait++){
                    var jobs=json.DeserializeObject(await Get("/api/jobs")) as object[];bool active=false;
                    foreach(System.Collections.Generic.Dictionary<string,object> item in jobs){string state=(string)item["status"];
                        if(state=="running"||state=="queued"){active=true;if(wait==0)await Cancel((string)item["id"]);}}
                    if(!active)break;await Task.Delay(1000);
                }
            }
        }catch{/* Persisted checkpoint remains authoritative after unexpected shutdown. */}
        finally {finished=true;Close();}
    }
}
