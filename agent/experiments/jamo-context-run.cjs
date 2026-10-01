// Experiment-only adapters; labels and oracle readings never enter baseline input.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {contract:base}=require('../src/core/judgment.cjs');
const {normalizeText}=require('../src/core/jamo.cjs');
const {runComparison,estimate}=require('./semantic-search-run.cjs');
const read=f=>JSON.parse(fs.readFileSync(f));
function groups(){
 const rows=require('./jamo-context-panel.cjs').buildPanel().map(r=>({...r,id:'n_'+require('node:crypto').createHash('sha256').update(r.id).digest('hex').slice(0,16)})),oracle=new Map(rows.map(r=>[r.id,r.reading]));
 const result=['dev','eval'].map(split=>{const rs=rows.filter(r=>r.split===split);return {name:split,labels:rs.map(r=>({node_id:r.id,is_ad:r.expected,scenario:r.group})),snapshot:{candidates:rs.map(r=>({node_id:r.id,raw_text:r.raw,normalized_text:normalizeText(r.raw),page_title:'시민 참여',frame_urls:[],signals:[],links:[],nearby:r.nearby||{},context_evidence:{scope:{tag:'section',role:'article',document_scope:false},target_quoted:!!r.targetQuoted,truncated:false,units:[...(r.before?[{relation:'before',text:r.before,quoted:false}]:[]),{relation:'target',quoted:!!r.targetQuoted},...(r.after?[{relation:'after',text:r.after,quoted:false}]:[])]}}))}};});
 const root='.runtime/call-budget-600-v1',labels=read(root+'/evaluation.json').controlled64.rows.filter(r=>r.judged),ids=new Set(labels.map(r=>r.node_id)),all=new Map();
 for(const file of fs.readdirSync(root+'/snapshots'))for(const c of read(root+'/snapshots/'+file).candidates)if(ids.has(c.node_id))all.set(c.node_id,c);
 assert.equal(all.size,labels.length);
 result.push({name:'replica',labels:labels.map(r=>({node_id:r.node_id,is_ad:r.is_ad,scenario:r.miss_reason||r.panel})),snapshot:{candidates:labels.map(r=>all.get(r.node_id))}});
 // Human oracle is confined to this diagnostic map, never the automatic candidate.
 for(const [id,text]of Object.entries({n_bdfacc5fd33139ac:'CASINO 사설 현금 룰렛 참가 회원 등록과 판돈 충전 접수',n_5157549a6b49a6c2:'ADULT 불법 영상 주의 공지를 읽었어도 필요한 분은 계시겠지요. 몰래 찍은 성인 자료를 판매하니 주문하세요.',n_8862b562cafb9734:'VIDEO 피해자동의없는성인영상유료배포'}))oracle.set(id,text);
 return {groups:result,oracle};
}
function specs(oracle){const a=base(),auto=require('./jamo-context-normalize.cjs').transform;
 return {A:{contract:a,batchSize:4,maxTokens:512},B:{contract:{...a,initialEvidence:c=>({...a.initialEvidence(c),normalized_text:oracle.get(c.node_id)??c.normalized_text})},batchSize:4,maxTokens:512},C:{contract:{...a,initialEvidence:c=>({...a.initialEvidence(c),normalized_text:auto(c.raw_text)})},batchSize:4,maxTokens:512},D:{contract:require('./jamo-context-variant.cjs').contract(),batchSize:4,maxTokens:512}};
}
async function main(){const data=groups(),methods=specs(data.oracle),arg=(k,d)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:d,root=path.resolve(arg('--out','.runtime/jamo-context-v1'));
 for(const g of data.groups)for(const c of g.snapshot.candidates){const original=base().initialEvidence(c);for(const mode of ['B','C']){const changed=methods[mode].contract.initialEvidence(c);changed.normalized_text=original.normalized_text;assert.deepEqual(changed,original);}assert.deepEqual(methods.D.contract.initialEvidence(c),original);}
 const sourceFiles=[__filename,require.resolve('./jamo-context-panel.cjs'),require.resolve('./jamo-context-normalize.cjs'),require.resolve('./jamo-context-variant.cjs'),require.resolve('../src/core/judgment.cjs'),require.resolve('../src/core/jamo.cjs'),'docs/jamo-context-plan.md'];
 let reservation=0;for(const g of data.groups)for(let i=0;i<g.snapshot.candidates.length;i+=4)for(const m of Object.values(methods))reservation+=2*(await estimate(g.snapshot.candidates.slice(i,i+4),{provider:'hcx',temperature:0,seed:42,maxTokens:512,reasoningEffort:'none'},m.contract)).tokens;
 assert(reservation<=900000);console.log(JSON.stringify({counts:data.groups.map(g=>[g.name,g.labels.length]),reservation,preservation:true}));
 if(!process.argv.includes('--live'))return;
 await runComparison({root,groups:data.groups,modes:['A','B','C','D'],rounds:2,maxTokens:512,methodSpecs:methods,sourceFiles,limits:{calls:184,tokens:900000,seconds:3600}});
}
module.exports={groups,specs};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
