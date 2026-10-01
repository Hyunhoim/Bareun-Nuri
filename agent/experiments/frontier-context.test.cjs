const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {D,features,initial,predict,update,scheduler}=require('./frontier-context.cjs');
const {run}=require('../src/core/scan.cjs'),{canonical}=require('../src/core/collect.cjs');
const {offline}=require('./frontier-four.cjs');
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),model=initial(),a=initial().inverse;
for(let k=0;k<9;k++){
 const x=features({text:'서로 다른 시민 의견 '+k,content_scope:k%2===0,context:{heading:'일반 자료 '+k,parent_detail:k%3===0,nearby:'문맥과 링크 내용을 보존합니다.',siblings:k}});
 for(let i=0;i<D;i++)for(let j=0;j<D;j++)a[i][j]+=x[i]*x[j];update(model,x,k%2);
 assert(predict(model,x).uncertainty<1);
}
for(let i=0;i<D;i++)for(let j=0;j<D;j++)assert(Math.abs(dot(a[i],model.inverse.map(row=>row[j]))-Number(i===j))<1e-9);
const link={text:'공개 의견',context:{heading:'시민 안내',nearby:'작성한 글을 확인합니다.'}};
assert.deepEqual(features(link),features({...link,url:'https://irrelevant.test/id123',case_id:'target',is_ad:true}));
assert.deepEqual(predict(model,features(link)),predict(JSON.parse(JSON.stringify(model)),features(link)));
const queue={attempts:Array(4).fill('visited'),pending:[link,{text:'다른 글'}],context_model:model};
assert.equal(scheduler('context-bandit').choose(queue),0);assert.equal(scheduler('best-first').choose(queue),0);
(async()=>{
 const root=process.argv[2]||'.runtime/frontier-four-v1',out=path.join(root,'checks-'+Date.now());fs.mkdirSync(out,{recursive:true});
 const data=JSON.parse(fs.readFileSync(path.join(root,'mixed-0.json')));
 for(const mode of ['context-bandit','best-first']){
  const accesses=[],options={entry:data.entry,scope:'/',mode,identity:{provider:'test',revision:1},scheduler:scheduler(mode),
   readPage:async url=>{accesses.push(url);const p=data.snapshot.pages.find(p=>canonical(p.url)===canonical(url));return {pages:[p],candidates:[],collection_issues:[]};},
   createJudge:()=>({calls:[],decide:()=>{throw Error('No candidates expected');}})};
  const dir=path.join(out,mode);const before=await run({...options,dir,limits:{pages:7,calls:20,seconds:30}});assert.equal(before.reason,'page_budget');
  const after=await run({...options,dir,limits:{pages:12,calls:20,seconds:30}});assert.equal(after.reason,'page_budget');
  assert.deepEqual(after.pages.map(p=>p.url),offline(data,mode,12).pages);assert.equal(accesses.length,12);assert.equal(new Set(accesses).size,12);
 }
 console.log(JSON.stringify({checks:'matrix inverse, no URL/label features, FIFO floor, serialized model, core resume',passed:true,out,api_calls:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
