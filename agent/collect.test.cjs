// Structural regression checks; no fixture labels or advertising vocabulary in collector rules.
const assert=require('node:assert/strict'),http=require('node:http');
const {collect}=require('./src/core/collect.cjs');
const texts=new Map();
function unit(tag,id,text,inside=text){texts.set(id,text);return `<${tag} id="${id}">${inside}</${tag}>`;}
const split='별빛 도서관 이용 안내입니다.';
const markup=[
  '<header>'+unit('span','mast','공공 안내')+'</header><article>'+unit('h2','heading','주민 소식')+unit('p','sentence',split,[...split].map(c=>`<span>${c}</span>`).join(''))+'</article>',
  '<section>'+unit('blockquote','quotation','이 문장은 교육을 위한 인용입니다.')+unit('strong','author','다른 작성자')+'</section>',
  '<aside>'+unit('custom-note','outside','본문 밖의 별도 의견')+'</aside>',
  '<div style="display:flex">'+unit('span','field1','첫 번째 값')+unit('span','field2','두 번째 값')+'</div>',
  '<footer>'+unit('small','footer','하단의 별도 텍스트')+'</footer>',
  unit('p','mixed','문장 중간 강조와 링크입니다.','문장 중간 <em>강조</em>와 <a href="#">링크</a>입니다.'),
  unit('div','embedded-code','앞 안내뒤 안내','앞 안내<script>window.executionMarker=true</script><style>.irrelevant{color:red}</style><span>뒤 안내</span>'),
  '<section><div class="entry"><p>다음 문구는 설명을 위한 인용입니다.</p><div><div><p id="scope-target">설명 대상 문장</p></div></div></div><div class="entry"><p id="scope-peer">독립된 다른 작성자의 문장</p></div></section>',
  '<ol><li>이웃의 인용 설명</li><li id="list-peer">독립된 목록 의견</li></ol><section><div role="comment">옆 댓글의 설명</div><div role="comment" id="role-peer">별개 댓글</div></section>',
  '<article><p>깊은 래퍼 밖의 설명</p>'+'<div>'.repeat(12)+'<p id="deep-target">깊게 중첩된 대상</p>'+'</div>'.repeat(12)+'</article>',
  '<article><div><span>항목</span><div><h2 id="separate-title">별개 제목</h2></div><div><span>작성자</span><div><p>작성자에 관한 인용 설명</p><span id="local-author">표시 이름</span></div><span>날짜</span></div></div></article>',
  '<p>보이는 안내 <span id="concealed" style="opacity:0">숨겨진 별도 문장</span></p>',
  '<div id="loading" aria-busy="true"></div><div id="frame-slot"></div>',
  '<script>setTimeout(()=>{document.querySelector("#loading").innerHTML="<p id=deferred>늦게 등록된 답글</p>";document.querySelector("#loading").setAttribute("aria-busy","false");document.querySelector("#frame-slot").innerHTML="<iframe src=/checks/frame></iframe>"},1400)</script>'
];
for(const [i,tag] of ['div','blockquote','p','h5','address','pre','figcaption','custom-text'].entries()){
  const text=`새로운 표현 ${i}: 한글을 나눠도 원문을 보존합니다.`;
  markup.push(unit(tag,'variation'+i,text,`<em>${text.slice(0,7)}</em><span>${text.slice(7)}</span>`));
}
const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/checks/')res.end('<!doctype html><html><head><title>Structure check</title></head><body>'+markup.join('')+'</body></html>');
  else if(req.url==='/checks/frame')res.end('<main aria-busy="true"><script>setTimeout(()=>{document.querySelector("main").innerHTML="<p id=frame-text>프레임의 늦은 댓글</p>";document.querySelector("main").removeAttribute("aria-busy")},800)</script></main>');
  else if(req.url==='/busy/')res.end('<main aria-busy="true"><p>계속 갱신하는 페이지</p></main>');
  else{res.statusCode=404;res.end();}
});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const result=await collect(base+'/checks/',{channel:'chromium',maxPages:2,maxNodes:200});
    for(const [id,text] of texts){const found=result.candidates.filter(c=>c.selector.endsWith('#'+id));assert.equal(found.length,1,id);assert.equal(found[0].raw_text,text,id);}
    assert(result.candidates.some(c=>c.selector==='span#concealed'&&c.signals.includes('TRANSPARENT')));
    assert(result.candidates.some(c=>c.selector==='p#deferred'));
    assert(result.candidates.some(c=>c.selector==='p#frame-text'&&c.frame_urls.length===1));
    const scoped=result.candidates.find(c=>c.selector==='p#scope-target').context_evidence;
    assert(scoped.units.some(u=>u.relation==='before'&&u.text.includes('설명을 위한 인용')));
    assert(!JSON.stringify(scoped).includes('독립된 다른 작성자'));
    const peer=result.candidates.find(c=>c.selector==='p#scope-peer').context_evidence;
    assert(!JSON.stringify(peer).includes('설명을 위한 인용'));
    assert(!JSON.stringify(result.candidates.find(c=>c.selector==='li#list-peer').context_evidence).includes('이웃의 인용 설명'));
    assert(!JSON.stringify(result.candidates.find(c=>c.selector==='div#role-peer').context_evidence).includes('옆 댓글의 설명'));
    assert(JSON.stringify(result.candidates.find(c=>c.selector==='p#deep-target').context_evidence).includes('깊은 래퍼 밖의 설명'));
    assert(!JSON.stringify(result.candidates.find(c=>c.selector==='h2#separate-title').context_evidence).includes('작성자에 관한 인용 설명'));
    assert(JSON.stringify(result.candidates.find(c=>c.selector==='span#local-author').context_evidence).includes('작성자에 관한 인용 설명'));
    assert(result.pages.every(p=>p.readiness.settled));
    assert(!result.candidates.some(c=>c.raw_text==='별'||c.raw_text.includes('setTimeout')));
    const busy=await collect(base+'/busy/',{channel:'chromium',maxPages:1,maxNodes:20,readiness:{minimumMs:200,quietMs:100,maximumMs:600}});
    assert.equal(busy.pages[0].readiness.settled,false);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('test cancelled')),400);
    try{await assert.rejects(()=>collect(base+'/busy/',{channel:'chromium',signal:controller.signal}),error=>{
      assert(controller.signal.aborted);assert.equal(controller.signal.reason.message,'test cancelled');
      assert.match(error.message,/test cancelled|closed|net::ERR_ABORTED/);return true;
    });}finally{clearTimeout(timer);}
    console.log(`PASS: ${texts.size} independent text units, outside-article/header/footer/custom tags, inline joining, hidden child, late nested frame, bounded readiness and cancellation`);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
