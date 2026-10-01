// Browser evidence checks. Labels stay in this test, never in the observer's input.
const assert=require('node:assert/strict'),http=require('node:http');
const {collect}=require('../src/core/collect.cjs');
const {observeTechniques,integrateObservations}=require('../src/core/techniques.cjs');
const {outputResult}=require('../src/core/output.cjs');
const specs=[
 {text:'ＣＩＴＹ 안내',want:['HOMOGLYPH']},
 {text:'cаfe 안내',want:['HOMOGLYPH']}, // Cyrillic a, independent of advertising vocabulary.
 {text:'Ελληνικά 안내',want:[]},
 {text:'Русский 안내',want:[]},
 {text:'model2026x 안내',want:[],pending:'HOMOGLYPH'},
 {text:'ㅎㅏㄱㄱㅛ 안내',want:['JAMO']},
 {text:'학교'.normalize('NFD')+' 안내',want:['JAMO']},
 {text:'ㄱ ㅏ ㄴ ㅏ 안내',want:['JAMO']},
 {text:'ㅋㅋ 안내',want:[],pending:'JAMO'},
 {text:'일반 한글 안내',want:[]},
 {style:'opacity:0',want:['TRANSPARENT']},
 {parent:'opacity:0',want:['TRANSPARENT']},
 {style:'color:transparent',want:['TRANSPARENT']},
 {style:'color:white',want:['TRANSPARENT']},
 {parent:'background:rgb(20,30,40)',style:'color:rgb(20,30,40)',want:['TRANSPARENT']},
 {parent:'color:transparent',style:'color:black',want:[]},
 {parent:'opacity:0',style:'opacity:1',want:['TRANSPARENT']},
 {style:'background:transparent;color:black',want:[]},
 {style:'color:white;background:linear-gradient(white,black)',want:[],pending:'TRANSPARENT'},
 {style:'color:transparent;text-shadow:0 0 1px black',want:[],pending:'TRANSPARENT'},
 {style:'display:none',want:['OFFSCREEN']},
 {parent:'display:none',want:['OFFSCREEN']},
 {style:'font-size:0',want:['OFFSCREEN']},
 {style:'font-size:1px',want:['OFFSCREEN']},
 {style:'font-size:1.01px',want:[]},
 {parent:'font-size:0',style:'font-size:16px',want:[]},
 {style:'position:absolute;left:-9999px',want:['OFFSCREEN']},
 {style:'position:relative;transform:translateX(-9999px)',want:['OFFSCREEN']},
 {style:'margin-top:1500px',want:[]},
 {style:'visibility:hidden',want:[],pending:'OFFSCREEN'},
 {style:'clip-path:inset(100%)',want:[],pending:'OFFSCREEN'},
 {text:'ㄱㅏ ＨＥＬＰ 안내',style:'opacity:0;font-size:1px',want:['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN']},
 {inside:'보이는 내용 <span style="opacity:0">숨긴 내용</span>',want:['TRANSPARENT'],partial:true},
 {inside:'<span>ㄱ</span><span>ㅏ</span><span> 안내</span>',want:['JAMO']},
 {inside:'<span style="color:white">희게</span><span style="color:white"> 작성</span>',want:['TRANSPARENT']},
];
const cases=specs.flatMap((s,i)=>['p','h3'].map((tag,j)=>({...s,id:'t'+i+'x'+j,tag,text:s.text||'공공 도서관 운영 안내'})));
const page='<!doctype html><html style="background:white"><head><meta charset=utf-8></head><body style="color:black">'+cases.map(s=>`<article style="${s.parent||''}"><${s.tag} id="${s.id}" style="${s.style||''}">${s.inside||s.text}</${s.tag}></article>`).join('')+'<iframe id="frame" src="/observe/frame" style="opacity:0"></iframe></body></html>';
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/observe/frame'?'<p id="framed">프레임 안내</p>':page);});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/observe/`;
 try{
  const plain=await collect(url,{maxPages:2,maxNodes:300}),snapshot=await collect(url,{maxPages:2,maxNodes:300,observeTechniques:true});
  assert.deepEqual(snapshot.candidates,plain.candidates,'Observation must not change model candidates');
  const selected=[];
  for(const spec of cases){
   const node=snapshot.candidates.find(c=>c.selector===spec.tag+'#'+spec.id);assert(node,'Missing '+spec.id);
   const observed=snapshot.technique_observations.find(o=>o.node_id===node.node_id);selected.push(node);
   assert.deepEqual(observed.observations.map(x=>x.technique).sort(),spec.want.slice().sort(),spec.id);
   if(spec.pending)assert(observed.unresolved.some(x=>x.technique===spec.pending),spec.id+' missing review');
   if(spec.partial)assert(observed.observations.some(x=>x.coverage==='partial-text'));
   assert.deepEqual(observeTechniques({...node,signals:['BAD'],context:'다른 문맥',is_ad:true},observed.evidence),observeTechniques(node,observed.evidence));
   for(const item of observed.observations)for(const e of item.evidence)assert.equal(e.text,node.raw_text.slice(e.start,e.end));
  }
  const frame=snapshot.candidates.find(c=>c.selector==='p#framed'&&c.frame_urls.length===1);assert(frame);
  assert(snapshot.technique_observations.find(o=>o.node_id===frame.node_id).observations.some(x=>x.technique==='TRANSPARENT'));
  const baseline=snapshot.candidates.map((c,i)=>({node_id:c.node_id,is_violation:i%2===0,needs_review:i%3===0,reason:'고정된 의미 판정',techniques:[]}));
  const saved=JSON.stringify(baseline),combined=integrateObservations(snapshot,baseline,snapshot.technique_observations);
  assert.equal(JSON.stringify(baseline),saved);
  combined.decisions.forEach((d,i)=>{const {techniques,observed_techniques,...actual}=d,{techniques:old,...expected}=baseline[i];assert.deepEqual(actual,expected);});
  const output=outputResult(snapshot,combined.decisions,new Date().toISOString(),0,'mock');
  for(const f of output.result.findings){const node=snapshot.candidates.find(c=>c.url===f.url&&c.location===f.location);assert.equal(f.evidence_text,node.raw_text);assert(baseline.find(d=>d.node_id===node.node_id).is_violation);}
  assert.throws(()=>integrateObservations(snapshot,baseline,snapshot.technique_observations.slice(1)),/Incomplete/);
  assert.throws(()=>integrateObservations(snapshot,baseline,snapshot.technique_observations.map((o,i)=>i?o:{...o,location:'elsewhere'})),/identity/);
  console.log(`PASS: ${cases.length} browser targets, iframe ancestor, unchanged candidates, raw spans, intent invariance and output locations`);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
