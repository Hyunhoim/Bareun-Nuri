const assert=require('node:assert/strict');
function context(candidate,evidence){
 const lines=[evidence.page_title||''];
 for(const u of candidate.context_evidence?.units||[])if(u.relation!=='target'&&typeof u.text==='string')lines.push((u.relation==='before'?'앞 문맥: ':u.relation==='after'?'뒤 문맥: ':u.relation+': ')+u.text);
 const near=candidate.nearby;
 if(typeof near==='string'&&near)lines.push(near);
 else if(near&&typeof near==='object')for(const [key,prefix]of [['before','앞 문맥: '],['after','뒤 문맥: ']])if(typeof near[key]==='string'&&near[key])lines.push(prefix+near[key]);
 return [...new Set(lines.filter(Boolean))].join('\n');
}
module.exports={context};
if(require.main===module){assert.equal(context({nearby:{after:'다음',before:'앞'},context_evidence:{units:[{relation:'target',text:'대상'},{relation:'after',text:'다음'}]}},{page_title:'제목'}),'제목\n뒤 문맥: 다음\n앞 문맥: 앞');assert.equal(context({nearby:{}},{}),'');assert.equal(context({nearby:'주변'},{}),'주변');console.log('PASS context text preservation and deduplication');}
