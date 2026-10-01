const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'data'),routes=JSON.parse(fs.readFileSync(path.join(root,'private/routes.json')));
function key(raw){const u=new URL(raw,'http://127.0.0.1');u.searchParams.sort();return u.pathname+u.search;}
const files=new Map(Object.entries(routes).map(([url,file])=>[key(url),file]));
function serve(port=8792){
 const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let file;try{file=files.get(key(req.url));}catch{res.writeHead(400);res.end();return;}
  if(!file){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; script-src 'none'; connect-src 'none'; object-src 'none'"});
  res.end(req.method==='HEAD'?'':fs.readFileSync(path.join(root,'public',file)));
 });server.listen(port,'127.0.0.1');return server;
}
if(require.main===module){const server=serve(Number(process.argv[2]||8792));server.on('listening',()=>console.log('http://127.0.0.1:'+server.address().port));server.on('error',e=>{console.error(e.message);process.exitCode=1;});}
module.exports={serve};
