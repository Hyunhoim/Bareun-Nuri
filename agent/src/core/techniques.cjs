// Observations only. This module never reads an advertising verdict or fixture labels.
const {mapping}=require('./confusables-latin.json');
const {normalizeText}=require('./jamo.cjs');
const TECHNIQUES=['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'];

// Runs in the page; collect rendered text-node styles without changing candidate selection.
function readTechniqueEvidence(selectors){
 const ignored='script,style,template,noscript,iframe';
 function pathFor(node){
  if(node.id&&node.ownerDocument.querySelectorAll('#'+CSS.escape(node.id)).length===1)return node.tagName.toLowerCase()+'#'+CSS.escape(node.id);
  const parts=[];for(let p=node;p;p=p.parentElement){parts.unshift(p.tagName.toLowerCase()+':nth-child('+([...p.parentElement?.children||[p]].indexOf(p)+1)+')');}
  return parts.join(' > ');
 }
 const styles=new Map();
 function chainFor(node){
  const chain=[];for(let p=node;p;p=p.parentElement||p.ownerDocument.defaultView.frameElement){
   if(!styles.has(p)){const win=p.ownerDocument.defaultView,s=win.getComputedStyle(p),r=p.getBoundingClientRect();styles.set(p,{location:pathFor(p),document_url:p.ownerDocument.URL,display:s.display,visibility:s.visibility,opacity:Number(s.opacity),
    color:s.webkitTextFillColor||s.color,background:s.backgroundColor,background_image:s.backgroundImage,font_size:parseFloat(s.fontSize),
    position:s.position,shadow:s.textShadow,stroke:parseFloat(s.webkitTextStrokeWidth)||0,filter:s.filter,blend:s.mixBlendMode,
    clip:s.clip,clip_path:s.clipPath,overflow:s.overflow,
    frame_outside:p.tagName==='IFRAME'&&(r.right+(s.position==='fixed'?0:win.scrollX)<=0||r.bottom+(s.position==='fixed'?0:win.scrollY)<=0)});}
   chain.push(styles.get(p));
  }return chain;
 }
 return selectors.map(selector=>{
  const nodes=document.querySelectorAll(selector);if(nodes.length!==1)throw Error('Technique selector must resolve uniquely');
  const runs=[];let raw_text='',generated=false;
  function visit(node){
   if(node.nodeType===3){
    const text=node.textContent,start=raw_text.length;raw_text+=text;if(!text.trim())return;
    const range=document.createRange();range.selectNodeContents(node);const chain=chainFor(node.parentElement);
    const fixed=chain.some(s=>s.position==='fixed');
    runs.push({text,start,end:raw_text.length,owner:pathFor(node.parentElement),chain,
     rects:[...range.getClientRects()].map(r=>({left:r.left+(fixed?0:scrollX),top:r.top+(fixed?0:scrollY),right:r.right+(fixed?0:scrollX),bottom:r.bottom+(fixed?0:scrollY),width:r.width,height:r.height}))});
   }else if(node.nodeType===1&&!node.matches(ignored)){
    for(const pseudo of ['::before','::after']){const content=getComputedStyle(node,pseudo).content;generated ||=!!content&&!['none','normal','""'].includes(content);}
    for(const child of node.childNodes)visit(child);
   }
  }
  visit(nodes[0]);return {selector,raw_text,runs,generated_content:generated};
 });
}

function rgba(value){
 const m=/^rgba?\(([^)]+)\)$/.exec(value||'');if(!m)return null;
 const v=m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
 return (v.length===3||v.length===4)&&v.every(Number.isFinite)?[...v.slice(0,3),v[3]??1]:null;
}
function observeTechniques(candidate,evidence){
 if(typeof candidate.raw_text!=='string'||typeof candidate.location!=='string')throw Error('Missing observation text/location');
 const text=candidate.raw_text,proof=[],unresolved=[];
 const add=(technique,reason,start,end,details={})=>proof.push({technique,reason,start,end,text:text.slice(start,end),...details});
 const pending=(technique,reason,details={})=>unresolved.push({technique,reason,...details});
 for(const m of text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)){
  const token=m[0],start=m.index,end=start+token.length,nfkc=token.normalize('NFKC');
  if([...token].some(c=>c.codePointAt(0)>127&&c.normalize('NFKC')!==c&&/^[A-Za-z0-9]+$/.test(c.normalize('NFKC')))){
   add('HOMOGLYPH','compatibility-letter-or-number',start,end,{reading:nfkc});
  }else if(/[A-Za-z]/.test(token)&&[...token].some(c=>mapping[c])){
   add('HOMOGLYPH','mixed-script-confusable',start,end,{reading:[...token].map(c=>mapping[c]||c).join('')});
  }else if([...token].some(c=>mapping[c])||/[A-Za-z][0-9]+[A-Za-z]/.test(token)){
   pending('HOMOGLYPH','ambiguous-script-or-digit-substitution',{start,end,text:token});
  }
 }
 // Composition establishes a decomposed syllable, not advertising intent. Preserve raw offsets.
 for(const m of text.matchAll(/[\u1100-\u11ff\u3130-\u318f\uffa0-\uffdc]+(?:[\s\u200b\u200c\u200d]+[\u1100-\u11ff\u3130-\u318f\uffa0-\uffdc]+)*/gu)){
  const joined=m[0].replace(/[\s\u200b\u200c\u200d]/g,'').replace(/[\uffa0-\uffdc]/g,c=>c.normalize('NFKC'));
  const reading=normalizeText(joined);
  if(/[가-힣]/.test(reading))add('JAMO','decomposed-syllable',m.index,m.index+m[0].length,{reading});
  else pending('JAMO','incomplete-jamo-sequence',{start:m.index,end:m.index+m[0].length,text:m[0]});
 }
 if(!evidence){
  pending(null,'legacy-snapshot-missing-text-run-evidence');
 }else{
  if(evidence.raw_text!==text||!Array.isArray(evidence.runs))throw Error('Observation text does not match candidate');
  if(evidence.generated_content)pending(null,'generated-content-not-collected');
  for(const run of evidence.runs){
   if(!Number.isInteger(run.start)||!Number.isInteger(run.end)||run.start<0||run.end>text.length||run.start>=run.end||text.slice(run.start,run.end)!==run.text||!run.chain?.length)throw Error('Invalid text-run evidence');
   const own=run.chain[0],detail={owner:run.owner},mark=(t,why,source)=>add(t,why,run.start,run.end,{...detail,source:source.location,source_document_url:source.document_url});
   const zero=run.chain.find(s=>s.opacity===0),none=run.chain.find(s=>s.display==='none'),outsideFrame=run.chain.find(s=>s.frame_outside);
   if(zero)mark('TRANSPARENT','zero-opacity',zero);
   if(none)mark('OFFSCREEN','display-none',none);
   if(outsideFrame)mark('OFFSCREEN','iframe-outside-document-origin',outsideFrame);
   if(Number.isFinite(own.font_size)&&own.font_size>=0&&own.font_size<=1)mark('OFFSCREEN','font-size-0-to-1',own);
   if(run.rects?.length&&run.rects.every(r=>r.width>0&&r.height>0&&(r.right<=0||r.bottom<=0)))mark('OFFSCREEN','text-outside-document-origin',own);
   const color=rgba(own.color),decorated=own.shadow!=='none'||own.stroke>0;
   if(color?.[3]===0&&!decorated)mark('TRANSPARENT','transparent-text-color',own);
   let background=null,complex=false;
   for(const style of run.chain){
    const c=rgba(style.background);complex ||=style.background_image!=='none'||!c||(c[3]>0&&c[3]<1);
    if(c?.[3]===1){background=c;break;}
   }
   // ponytail: compare solid opaque paint only; gradients/images/filters need a rendering-aware verifier.
   const effects=run.chain.some(s=>s.filter!=='none'||s.blend!=='normal');
   if(!background&&!complex)background=[255,255,255,1];
   if(color&&background&&!complex&&!effects&&!decorated&&color.slice(0,3).every((v,i)=>v===background[i]))mark('TRANSPARENT','same-solid-background',own);
   if(complex||effects||decorated||!color)pending('TRANSPARENT','unsupported-paint',{...detail,start:run.start,end:run.end});
   if(own.visibility!=='visible'||run.chain.some(s=>s.clip!=='auto'||s.clip_path!=='none'||['hidden','clip'].includes(s.overflow)))pending('OFFSCREEN','visibility-or-clipping-needs-review',{...detail,start:run.start,end:run.end});
  }
 }
 const observations=TECHNIQUES.flatMap(technique=>{
  const evidence=proof.filter(p=>p.technique===technique);if(!evidence.length)return [];
  const coversAll=technique==='HOMOGLYPH'||technique==='JAMO'||text.split('').every((c,i)=>!c.trim()||evidence.some(e=>i>=e.start&&i<e.end));
  // Text transformations have precise spans but do not establish which span carries advertising intent.
  return [{technique,coverage:['TRANSPARENT','OFFSCREEN'].includes(technique)?(coversAll?'all-text':'partial-text'):'text-span',evidence}];
 });
 return {node_id:candidate.node_id,url:candidate.url,location:candidate.location,raw_text:text,version:1,observations,unresolved};
}

function integrateObservations(snapshot,decisions,observations){
 const {mergeObservation}=require('./antispoof.cjs');
 const decided=new Map(decisions.map(d=>[d.node_id,d]));
 observations=observations.map(o=>mergeObservation(o,decided.get(o.node_id)));
 const {validateDecisions}=require('./llm.cjs');
 validateDecisions({decisions:structuredClone(decisions)},snapshot.candidates);
 const nodes=new Map(snapshot.candidates.map(c=>[c.node_id,c])),byId=new Map();
 for(const o of observations){const c=nodes.get(o.node_id);
  if(!c||byId.has(o.node_id)||o.url!==c.url||o.location!==c.location||o.raw_text!==c.raw_text)throw Error('Observation identity mismatch');
  if(!Array.isArray(o.observations)||!Array.isArray(o.unresolved)||o.observations.some(x=>!TECHNIQUES.includes(x.technique)||!['all-text','partial-text','text-span'].includes(x.coverage)||!x.evidence?.length))throw Error('Invalid observation');
  for(const x of o.observations){
   for(const e of x.evidence)if(e.technique!==x.technique||!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<0||e.end>c.raw_text.length||e.start>=e.end||e.text!==c.raw_text.slice(e.start,e.end))throw Error('Invalid observation span');
   if(['TRANSPARENT','OFFSCREEN'].includes(x.technique)){
    const all=c.raw_text.split('').every((ch,i)=>!ch.trim()||x.evidence.some(e=>i>=e.start&&i<e.end));
    if(x.coverage!==(all?'all-text':'partial-text'))throw Error('Invalid observation coverage');
   }else if(x.coverage!=='text-span')throw Error('Invalid text observation coverage');
  }
  if(new Set(o.observations.map(x=>x.technique)).size!==o.observations.length)throw Error('Duplicate observed technique');
  byId.set(o.node_id,o);
 }
 if(byId.size!==nodes.size)throw Error('Incomplete observations');
 const diagnostics=[];
 const combined=decisions.map(d=>{
  const o=byId.get(d.node_id),techniques=o.observations.filter(x=>x.coverage!=='partial-text').map(x=>x.technique);
  if(o.unresolved.length||o.observations.some(x=>x.coverage==='partial-text'))diagnostics.push({node_id:d.node_id,url:o.url,location:o.location,
   is_violation:d.is_violation,intent_needs_review:d.needs_review,technique_needs_review:true,
   reasons:[...o.unresolved,...o.observations.filter(x=>x.coverage==='partial-text').map(x=>({technique:x.technique,reason:'partial-style-intent-attribution-unverified'}))]});
  return {...d,techniques:d.is_violation?techniques:[],observed_techniques:o.observations.map(x=>x.technique)};
 });
 return {decisions:combined,technique_diagnostics:diagnostics};
}
module.exports={readTechniqueEvidence,observeTechniques,integrateObservations};
