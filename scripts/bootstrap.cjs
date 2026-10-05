const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), dir = path.join(root, '.tools');
async function download(url, file, algorithm, expected) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw Error(`Download HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file));
  const digest = crypto.createHash(algorithm).update(fs.readFileSync(file)).digest('hex');
  if (digest !== expected.toLowerCase()) throw Error('Runtime checksum mismatch');
}
function unzip(file, destination) {
  // Pass paths via environment; never interpolate paths into shell source.
  execFileSync('powershell.exe', ['-NoProfile','-Command','Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:SETUP_ZIP, $env:SETUP_DEST)'],
    {env:{...process.env,SETUP_ZIP:file,SETUP_DEST:destination},stdio:'inherit'});
}
async function main() {
  fs.mkdirSync(dir,{recursive:true});
  let java = fs.existsSync(path.join(dir,'jdk')) && fs.readdirSync(path.join(dir,'jdk')).find(n=>fs.existsSync(path.join(dir,'jdk',n,'bin/java.exe')));
  if (!java) {
    console.log('Downloading portable Java 21 (verified checksum)...');
    const response = await fetch('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse');
    if(!response.ok) throw Error('Cannot resolve Java download');
    const pkg=(await response.json())[0].binary.package;
    const file=path.join(dir,'jdk.zip');await download(pkg.link,file,'sha256',pkg.checksum);unzip(file,path.join(dir,'jdk'));
    fs.unlinkSync(file);
  }
  if (!fs.existsSync(path.join(dir,'apache-maven-3.9.11/bin/mvn.cmd'))) {
    console.log('Downloading portable Maven (verified checksum)...');
    const url='https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.11/apache-maven-3.9.11-bin.zip';
    const response=await fetch(url+'.sha512');if(!response.ok) throw Error('Cannot resolve Maven checksum');
    const file=path.join(dir,'maven.zip');await download(url,file,'sha512',(await response.text()).trim().split(/\s/)[0]);unzip(file,dir);fs.unlinkSync(file);
  }
  console.log('Portable Java and Maven ready.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
