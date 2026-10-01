const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
function serve(site,port=site.port){
 const key=value=>{const u=new URL(value,'http://127.0.0.1');u.hash='';u.searchParams.sort();return u.pathname+u.search;},files=new Map(Object.entries(site.files).map(([route,file])=>[key(route),file]));
 const server=http.createServer((req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  let u;try{u=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);res.end();return;}
  const route=key(u.href),file=route==='/site.css'?'site.css':files.get(route);
  if(!file){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?'':fs.readFileSync(path.join(__dirname,'public',file)));
 });server.listen(port,'127.0.0.1');return server;
}
if(require.main===module){const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'private','catalog.json'))),selected=process.argv[2]?catalog.filter(s=>s.id===process.argv[2]):catalog;if(!selected.length)throw Error('Unknown site');for(const s of selected){const server=serve(s);server.on('listening',()=>console.log(s.id+' '+s.entry));server.on('error',e=>{console.error(e);process.exitCode=1;});}}
module.exports={serve};
