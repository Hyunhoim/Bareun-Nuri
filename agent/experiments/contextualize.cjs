const {normalizeText}=require('../src/core/jamo.cjs');
function referenceScope(text){
 if(!text.trim())return 'none';
 // Korean demonstratives locate a verified quotation claim; they never classify advertising.
 const after=/(?:^|[\s“”"'‘’])(?:(?:아래|다음|뒤|이후)(?:의|에|에서|와|쪽|은|\s|$)|후술(?:한|할|하는|\s|$))/u.test(text);
 const before=/(?:^|[\s“”"'‘’])(?:(?:위|이전|앞)(?:의|에|에서|와|쪽|은|\s|$)|(?:앞서|상기|전술)(?:한|할|하는|\s|$))/u.test(text);
 return after&&before?'ambiguous':after?'following_text':before?'preceding_text':'unspecified';
}
function quotationSources(candidates,decisions){
 const byId=new Map(decisions.map(d=>[d.node_id,d]));
 if(byId.size!==candidates.length||decisions.length!==candidates.length)throw Error('Incomplete target judgments');
 return candidates.flatMap(c=>{
  const d=byId.get(c.node_id);if(!d)throw Error('Missing target judgment');
  if(!d.is_violation&&d.service_relation!=='근거부족')return [];
  return (c.context_evidence?.units||[]).flatMap((u,i)=>u.relation==='target'?[]:[{
   node_id:c.node_id+'_context_'+i,target_id:c.node_id,source_id:'context_'+i,relation:u.relation,
   raw_text:u.text,normalized_text:normalizeText(u.text),document_scope:c.context_evidence.scope.document_scope,
   single_target_context:c.context_evidence.units.length===2&&!c.context_evidence.truncated}]);
 });
}
function serviceCandidates(candidates,decisions){
 const byId=new Map(decisions.map(d=>[d.node_id,d]));
 if(decisions.length!==candidates.length||byId.size!==candidates.length||candidates.some(c=>!byId.has(c.node_id)))throw Error('Incomplete target judgments');
 return candidates.filter(c=>byId.get(c.node_id).is_violation||byId.get(c.node_id).needs_review);
}
function applyServiceContext(candidates,decisions,judgments){
 const expected=serviceCandidates(candidates,decisions),byId=new Map(judgments.map(j=>[j.node_id,j]));
 if(expected.length!==judgments.length||byId.size!==judgments.length||expected.some(c=>!byId.has(c.node_id)))throw Error('Service judgment coverage mismatch');
 return decisions.map(d=>{
  const j=byId.get(d.node_id);if(!j)return d;
  if(!['불법대상','정상대상','제안없음','근거부족'].includes(j.service_relation))throw Error('Invalid service relation');
  return {...d,service_relation:j.service_relation,is_violation:d.is_violation&&j.service_relation==='불법대상',
    author_purpose:['정상대상','제안없음'].includes(j.service_relation)?'ordinary':j.service_relation==='근거부족'?'uncertain':d.author_purpose,
    needs_review:d.needs_review||j.service_relation==='근거부족',target_judgment:d,
    reason:j.service_relation==='불법대상'?d.reason+'; 서비스 문맥: '+j.service_relation:'서비스 문맥 확인: '+j.service_relation};
 });
}
function applyQuotationContext(candidates,decisions,sources,observations){
 const expected=quotationSources(candidates,decisions),byId=new Map(observations.map(o=>[o.node_id,o]));
 if(sources.length!==expected.length||observations.length!==sources.length||byId.size!==sources.length||
   sources.some((s,i)=>JSON.stringify(s)!==JSON.stringify(expected[i]))||sources.some(s=>!byId.has(s.node_id)))throw Error('Quotation observation coverage mismatch');
 const grouped=new Map();for(const s of sources){if(!grouped.has(s.target_id))grouped.set(s.target_id,[]);grouped.get(s.target_id).push(s);}
 return decisions.map(d=>{
  const local=grouped.get(d.node_id)||[],unresolved=local.some(s=>{const o=byId.get(s.node_id);return o.needs_review||o.quotation_scope==='ambiguous'||
    o.quotation_scope==='unspecified'&&(s.document_scope||!s.single_target_context);});
  const supporting=local.find(s=>{const o=byId.get(s.node_id);if(o.needs_review)return false;
   return o.quotation_scope==='following_text'&&s.relation==='before'||o.quotation_scope==='preceding_text'&&s.relation==='after'||
    o.quotation_scope==='contained_text'&&s.relation==='contains_target'||o.quotation_scope==='unspecified'&&!s.document_scope&&s.single_target_context;
  });
  if(!supporting)return {...d,needs_review:d.needs_review||unresolved};
  // Explicit quotation can resolve service uncertainty, but not unrelated uncertainty.
  const serviceUncertaintyOnly=d.service_relation==='근거부족'&&d.target_judgment&&!d.target_judgment.needs_review;
  return {...d,author_purpose:'quotation',is_violation:false,techniques:[],context_source:supporting.source_id,
   evidence_quote:supporting.raw_text,context_summary:byId.get(supporting.node_id).reason,
   reason:byId.get(supporting.node_id).reason,needs_review:(d.needs_review&&!serviceUncertaintyOnly)||unresolved,target_judgment:d};
 });
}
async function decideIdentified(session,candidates){
 const ids=new Map(candidates.map((c,i)=>[String(i+1),c.node_id]));
 const out=await session.decide(candidates.map((c,i)=>({...c,node_id:String(i+1)})));
 return out.map(d=>{if(!ids.has(d.node_id))throw Error('Unknown request-local ID');return {...d,node_id:ids.get(d.node_id)};});
}
async function reconcileSourceClaims(session,sources,observations){
 const answers=new Map(sources.map(s=>[s.node_id,[]])),groups=new Map(),resolutions=[];
 for(const o of observations){if(!answers.has(o.node_id))throw Error('Unknown support observation');answers.get(o.node_id).push(o);}
 const byId=new Map();
 for(const s of sources){if(!answers.get(s.node_id).length)throw Error('Missing support observation');byId.set(s.node_id,answers.get(s.node_id)[0]);
  if(!groups.has(s.normalized_text))groups.set(s.normalized_text,[]);groups.get(s.normalized_text).push(s);}
 for(const [text,group]of groups){
  const previous=group.flatMap(s=>answers.get(s.node_id).map(o=>o.relation));
  if(new Set(previous).size<=1)continue;
  // Recheck contradictory claims about identical standalone evidence; candidate context is never reused.
  const [verified]=await decideIdentified(session,[group[0]]);
  resolutions.push({source_text:text,source_ids:group.map(s=>s.node_id),previous,verified:verified.relation});
  for(const s of group)byId.set(s.node_id,{...verified,node_id:s.node_id,reconciled:true});
 }
 return {observations:sources.map(s=>byId.get(s.node_id)),resolutions};
}
function rescueCandidates(candidates,initial,decisions){
 const first=new Map(initial.map(d=>[d.node_id,d])),last=new Map(decisions.map(d=>[d.node_id,d]));
 if(initial.length!==candidates.length||decisions.length!==candidates.length||first.size!==candidates.length||last.size!==candidates.length||
   candidates.some(c=>!first.has(c.node_id)||!last.has(c.node_id)))throw Error('Incomplete rescue inputs');
 // Recheck negative exits from any stage, including service rejection; preserve explicit quotations.
 return candidates.filter(c=>!last.get(c.node_id).is_violation&&last.get(c.node_id).author_purpose!=='quotation');
}
function applyRescueContext(candidates,initial,decisions,judgments){
 const expected=rescueCandidates(candidates,initial,decisions),byId=new Map(judgments.map(d=>[d.node_id,d]));
 if(expected.length!==judgments.length||byId.size!==judgments.length||expected.some(c=>!byId.has(c.node_id)))throw Error('Rescue judgment coverage mismatch');
 return decisions.map(d=>{const j=byId.get(d.node_id);return j?{...j,baseline_judgment:d}:d;});
}
function confirmationCandidates(candidates,judgments){
 const ids=new Set(judgments.filter(d=>d.is_violation||d.needs_review).map(d=>d.node_id));
 return candidates.filter(c=>ids.has(c.node_id));
}
function confirmRescue(judgments,roles,candidates){
 const expected=judgments.filter(d=>d.is_violation||d.needs_review),byId=new Map(roles.map(r=>[r.node_id,r]));
 if(expected.length!==roles.length||byId.size!==roles.length||expected.some(d=>!byId.has(d.node_id)))throw Error('Confirmation coverage mismatch');
 return judgments.map(d=>{const role=byId.get(d.node_id);if(!role)return d;
  if(!['action','reference','information','unclear'].includes(role.role))throw Error('Invalid confirmation role');
  if(role.role==='information'){
   const target=candidates?.find(c=>c.node_id===d.node_id);if(!target)throw Error('Missing confirmation target evidence');
   return {...d,author_purpose:'ordinary',is_violation:false,needs_review:false,reason:role.reason,context_source:'target',
    evidence_quote:target.normalized_text,context_summary:role.reason,role_judgment:role,proposed_judgment:d};
  }
  return {...d,needs_review:d.needs_review||role.role==='unclear',role_judgment:role};
 });
}
function domainCandidates(candidates,judgments){
 const ids=new Set(judgments.filter(d=>d.is_violation||d.needs_review).map(d=>d.node_id));return candidates.filter(c=>ids.has(c.node_id));
}
function verifyRescueDomain(candidates,judgments,services){
 const nodes=domainCandidates(candidates,judgments),ids=new Set(nodes.map(c=>c.node_id));
 const verified=applyServiceContext(nodes,judgments.filter(d=>ids.has(d.node_id)),services),byId=new Map(verified.map(d=>[d.node_id,d]));
 const serviceById=new Map(services.map(s=>[s.node_id,s]));
 return judgments.map(d=>{const v=byId.get(d.node_id);if(!v)return d;
  const normal=['정상대상','제안없음'].includes(v.service_relation);
  return {...v,service_judgment:serviceById.get(d.node_id),needs_review:normal?d.role_judgment?.role==='unclear':v.needs_review};
 });
}
module.exports={quotationSources,applyQuotationContext,decideIdentified,reconcileSourceClaims,referenceScope,serviceCandidates,applyServiceContext,rescueCandidates,applyRescueContext,confirmationCandidates,confirmRescue,domainCandidates,verifyRescueDomain};
