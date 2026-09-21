// Small connection fixture, intentionally separate from the accuracy benchmark.
const http=require('node:http');
const server=http.createServer((req,res)=>{
  if(req.url!=='/demo/' && req.url!=='/demo/comment') {res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(req.url==='/demo/'?`<!doctype html><html lang="ko"><head><title>연결 확인용 시민 게시판</title></head><body><main><h1>시민 게시판</h1><p id="notice">불법 도박 광고를 발견하면 신고해 주세요.</p><p id="ad">ㅅㅏㅅㅓㄹ ㄱㅕㅇㅁㅏ ㅎㅚㅇㅝㄴ ㅁㅗㅈㅣㅂ, ㅊㅜㅇㅈㅓㄴㅎㅏㅅㅔㅇㅛ.</p><a href="/demo/comment">댓글 보기</a></main></body></html>`:
    '<!doctype html><html lang="ko"><head><title>댓글</title></head><body><main><p id="normal">시민 문화강좌 신청 기간은 다음 주까지입니다.</p></main></body></html>');
});
server.listen(8767,'127.0.0.1',()=>console.log('Connection fixture: http://127.0.0.1:8767/demo/'));
