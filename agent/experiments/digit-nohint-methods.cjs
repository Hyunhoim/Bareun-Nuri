// Experiment only: retain raw token/context and compact S output; remove supplied readings.
const assert=require('node:assert/strict'),base=require('./digit-request-methods.cjs');
const REMOVED=['제공 readings는 검증된 단어가 아닌 문자 대응 가설이다.','readings_truncated가 true이거나 후보 중 근거 있는 읽기가 없으면 substitution으로 확정하지 않는다.'];
function initialEvidence(q){const {readings,source_ids,readings_truncated,...e}=base.contract().initialEvidence(q);return e;}
function contract(){const c=base.contract();let SYSTEM=c.SYSTEM;for(const text of REMOVED){assert.equal(SYSTEM.split(text).length,2,'Frozen S availability instructions changed');SYSTEM=SYSTEM.replace(text,'');}return {...c,SYSTEM,initialEvidence};}
function jobs(inputs,reverse){return base.jobs(inputs,reverse,'S');}
module.exports={contract,jobs,initialEvidence,postprocess:base.postprocess};
if(require.main===module){
 const row={node_id:'x',token:'B0nus7',target_text:'B0nus7 접수',context:'B0nus7 안내',gold:'DO_NOT_LEAK'},q=jobs([row],false)[0][0],e=initialEvidence(q);
 assert.deepEqual(Object.keys(e).sort(),['context','node_id','target_text','token','unchanged']);assert.equal(e.token,row.token);assert.equal(e.unchanged,row.token);assert.equal(e.target_text,row.target_text);assert.equal(e.context,row.context);assert(!JSON.stringify(e).includes('DO_NOT_LEAK'));
 const a=base.contract(),b=contract(),{SYSTEM:as,initialEvidence:ai,...aa}=a,{SYSTEM:bs,initialEvidence:bi,...bb}=b;assert.deepEqual(aa,bb);assert.equal(REMOVED.reduce((s,t)=>s.replace(t,''),as),bs);assert.deepEqual(b.modelItemSchema().required,['classification']);assert.equal(b.formatRepair,false);assert.equal(base.postprocess('N',[{node_id:'x',classification:'substitution'}],[q])[0].restored,null);
 console.log('PASS nohint: token/context unchanged; only reading fields and unavailable-field instructions removed; same compact output and no gold');
}
