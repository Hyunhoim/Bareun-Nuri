const assert=require('node:assert/strict'),{audit,profile,key}=require('./reuse-audit.cjs');
const candidate={node_id:'a',url:'http://localhost/one',location:'p#a',selector:'p#a',frame_urls:[],page_title:'시민 게시판',raw_text:'신청 방법을 확인하세요.',normalized_text:'신청 방법을 확인하세요.',
 own_style:{color:'black',opacity:1,rect:{x:8,y:20}},ancestors:[{opacity:1,rect:{height:200}}],nearby:{before:'공공 행사 안내',after:''},context:'공공 행사 안내 신청 방법을 확인하세요.',
 context_evidence:{target_quoted:false,units:[{relation:'before',text:'공공 행사 안내'},{relation:'target'}]},signals:[],links:[]};
const clone=()=>({...structuredClone(candidate),node_id:'b',url:'http://localhost/two',location:'p#b',selector:'p#b'});
const snapshot=b=>({pages:[],candidates:[candidate,b]});
const good=snapshot(clone()),before=JSON.stringify(good);assert.equal(audit(good).profiles.withObservation.duplicateCandidates,1);assert.equal(JSON.stringify(good),before);
for(const mutate of [
 c=>c.raw_text+='!',c=>c.normalized_text+='!',c=>c.page_title='예방 교육',c=>c.own_style.opacity=0,c=>c.own_style.rect.x=-200,
 c=>c.ancestors[0].opacity=0,c=>c.ancestors[0].rect.height=201,c=>c.nearby.before='광고 문구 인용',c=>c.context='다른 맥락',
 c=>c.context_evidence.target_quoted=true,c=>c.context_evidence.units[0].text='사설 서비스 가입 안내',c=>c.links.push('http://localhost/different'),
 c=>c.frame_urls.push('http://localhost/frame'),c=>c.signals.push('OFFSCREEN'),c=>c.future_evidence={role:'different'}
]){const c=clone();mutate(c);assert.equal(audit(snapshot(c)).profiles.withObservation.duplicateCandidates,0);}
const obs=c=>({node_id:c.node_id,url:c.url,location:c.location,raw_text:c.raw_text,version:1,observations:[],unresolved:[],evidence:{selector:c.selector,raw_text:c.raw_text,generated_content:false,runs:[{owner:c.selector,text:c.raw_text,start:0,end:c.raw_text.length,chain:[{location:c.selector,document_url:c.url,color:'black'}],rects:[{left:8,top:20}]}]}});
good.technique_observations=good.candidates.map(obs);assert.equal(audit(good).profiles.withObservation.duplicateCandidates,1);
good.technique_observations[1].evidence.runs[0].chain[0].color='transparent';assert.equal(audit(good).profiles.withObservation.duplicateCandidates,0);
good.technique_observations[1].raw_text='wrong owner';assert.throws(()=>audit(good));
assert.equal(profile(['a','b','a','b'],2).unchangedBatchSavedCalls,1);
assert.equal(profile(['a','b','b','a'],2).unchangedBatchSavedCalls,0);
assert.equal(profile(['a','b','b','a'],2).optimisticSavedCalls,1);
assert.equal(key({a:1,b:[2,3]}),key({b:[2,3],a:1}));assert.notEqual(key([1,2]),key([2,1]));
assert.throws(()=>audit({candidates:[candidate,candidate]}));
console.log('PASS: exact evidence, 15 meaningful differences rejected, observation ownership, stable ordering, batch-repacking distinction, read-only audit');
