const fs=require('node:fs'),http=require('node:http');
const html='.runtime/nuri-1.2-human-review-v1/review.html';
const server=http.createServer((req,res)=>{if(req.method!=='GET'||req.url!=='/'){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(html));});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+'/'));
