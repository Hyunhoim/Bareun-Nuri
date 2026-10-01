// Preserve the frozen v1 serializer; remove only unowned nearby text when scoped evidence exists.
const {context:legacy}=require('./klue-context.cjs');
function context(candidate,evidence){
 const scoped=Array.isArray(candidate.context_evidence?.units)&&candidate.context_evidence.units.some(u=>u.relation==='target');
 return legacy(scoped?{...candidate,nearby:undefined}:candidate,evidence);
}
module.exports={context};
if(require.main===module){
 const assert=require('node:assert/strict');
 const c={nearby:{after:'다른 댓글'},context_evidence:{units:[{relation:'target'},{relation:'before',text:'같은 글 설명'}]}};
 assert.equal(context(c,{page_title:'제목'}),'제목\n앞 문맥: 같은 글 설명');
 assert.equal(context({nearby:{before:'옛 입력'}},{}),'앞 문맥: 옛 입력');
 console.log('PASS scoped context preserves owned units and omits unscoped siblings; legacy fallback retained');
}
