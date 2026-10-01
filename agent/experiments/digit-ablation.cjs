// Experimental paired contract: identical prompt/schema, optional input readings only.
const base=require('./digit-contract.cjs');
const SYSTEM=base.SYSTEM.replace('제공한 readings는','readings가 제공되면 이는').replace(
 'substitution이면 근거가 있는 읽기의 키를 reading으로 선택한다. literal 또는 uncertain이면 reading은 none이다. 후보 밖의 읽기는 생성하지 않는다.',
 'substitution이면 근거가 있는 복원 문자열을 reading으로 출력한다. literal 또는 uncertain이면 reading은 none이다. 복원은 원문의 영문 글자를 유지하고 숫자를 닮은 영문 글자로 바꾸는 범위로 제한한다.');
function makeContract(mode){
 if(!['control','no-readings','single'].includes(mode))throw Error('Unknown ablation mode');
 return {...base,SYSTEM,
  initialEvidence(q){
   const {source_ids,readings,readings_truncated,...evidence}=base.initialEvidence(q);
   return mode==='no-readings'?evidence:{...evidence,readings,readings_truncated};
  },
  modelItemSchema(){
   const schema=base.modelItemSchema();schema.properties.reading={type:'string',minLength:1,maxLength:256};return schema;
  },
  validateModelDecisions(value,queries){
   if(!Array.isArray(value)||value.length!==queries.length)throw Error('One digit decision per query required');
   const byId=new Map(queries.map(q=>[q.node_id,q]));
   const mapped=value.map(d=>{
    const q=byId.get(d?.node_id);if(!q)throw Error('Unknown digit ID');
    if(typeof d.reading!=='string')throw Error('Invalid reading string');
    if(d.classification!=='substitution')return d;
    const index=q.readings.findIndex(r=>r.toLowerCase()===d.reading.toLowerCase());
    if(index<0)throw Error('Reading must preserve original letters and use supported digit substitutions');
    return {...d,reading:'r'+index};
   });
   return base.validateModelDecisions(mapped,queries);
  }
 };
}
module.exports={makeContract};
