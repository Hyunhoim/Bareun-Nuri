// Experiment only. Lossless key encoding; never truncate or remove text.
const assert=require('node:assert/strict');
const {contract:baseContract}=require('../src/core/judgment.cjs');
const names=['node_id','source_ids','page_title','passage','normalized_text','links','scope','unscoped_nearby','boundary','target_quoted','truncated','tag','role','document_scope','before','after','text','url'];
const forward=Object.fromEntries(names.map((k,i)=>[k,'$'+String.fromCharCode(97+i)]));
const backward=Object.fromEntries(Object.entries(forward).map(([a,b])=>[b,a]));
function transform(value,decode=false){
 if(Array.isArray(value))return value.map(v=>transform(v,decode));
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[
  decode?(backward[k]??(k.startsWith('$$')?k.slice(1):k)):(forward[k]??(k.startsWith('$')?'$'+k:k)),transform(v,decode)]));
}
function contract(){const base=baseContract();return {...base,
 SYSTEM:base.SYSTEM+'\n입력 candidates 내부의 키만 다음 대응표로 축약했다. 값을 생략하거나 다른 후보와 공유한 것이 아니다. 각 키를 원래 이름으로 해석하고 모든 원문과 문맥을 그대로 읽는다: '+JSON.stringify(backward)+'. 출력 decisions의 node_id와 publication_act 계약은 바뀌지 않는다.',
 initialEvidence:c=>transform(base.initialEvidence(c))};}
function check(candidates){const base=baseContract();for(const c of candidates){const original=JSON.parse(JSON.stringify(base.initialEvidence(c)));assert.deepEqual(transform(JSON.parse(JSON.stringify(contract().initialEvidence(c))),true),original);}return candidates.length;}
module.exports={contract,transform,check};
if(require.main===module){assert.deepEqual(transform(transform({'$a':'collision','$$x':'escaped',node_id:'n',links:[{text:'자모 ᄀ',url:'https://example.test/?a=1'}]}),true),{'$a':'collision','$$x':'escaped',node_id:'n',links:[{text:'자모 ᄀ',url:'https://example.test/?a=1'}]});console.log('Lossless key encoding check passed');}
