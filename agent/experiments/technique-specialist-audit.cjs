// Verify HTML identity and export through the real result.json formatter.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{outputResult}=require('../src/core/output.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),DATA='.runtime/technique-specialist-data-v3',ROOT=process.argv[2]||'.runtime/technique-specialist-eval-v1',LIVE='.runtime/technique-specialist-hcx-v1',INTENT='.runtime/technique-specialist-intent-v1';
async function main(){assert(read(INTENT+'/completion.json').completed);assert(!fs.existsSync(ROOT+'/submission-audit.json'));const browser=await chromium.launch({headless:true,channel:'msedge'});let inspected=0;const results={};
 try{const page=await browser.newPage();for(const split of ['dev','final']){const rows=read(DATA+'/'+split+'-inputs.json'),gold=read(DATA+'/'+split+'-gold.json'),intent=new Map(read(INTENT+'/'+split+'-decisions.json').map(x=>[x.node_id,x])),code=new Map(read(LIVE+'/'+split+'-code.json').map(x=>[x.id,x.label]));
   for(const row of rows){await page.goto(pathToFileURL(path.resolve(DATA,split,row.id+'.html')).href);assert.equal(await page.locator(row.location).count(),1);assert.equal(await page.locator(row.location).textContent(),row.raw_text);assert.equal(row.raw_text.slice(row.start,row.end),row.token);inspected++;}
   const expected=new Set(gold.filter(x=>x.is_ad&&x.label===0).map(x=>{const r=rows.find(y=>y.id===x.id);return JSON.stringify([r.url,r.location,'HOMOGLYPH']);}));results[split]={};
   for(const method of ['code','hcx','classifier'])for(const order of (method==='code'?['forward']:['forward','reverse'])){const pred=new Map(code);
    if(method==='hcx')for(const x of read(LIVE+'/'+split+'-'+order+'/decisions.json'))pred.set(x.node_id,['substitution','literal','uncertain'].indexOf(x.classification));
    if(method==='classifier')for(const x of read(ROOT+'/'+split+'-'+order+'-predictions.json'))pred.set(x.id,x.label);
    const ds=rows.map(x=>{const d=intent.get(x.id);assert(d);return {...d,techniques:d.is_violation&&pred.get(x.id)===0?['HOMOGLYPH']:[]};});
    const snapshot={entry_url:'http://127.0.0.1:64920/'+split,candidates:rows.map(x=>({...x,node_id:x.id}))};const out=outputResult(snapshot,ds,new Date().toISOString(),0,'hcx');
    const actual=new Set(out.result.findings.map(x=>JSON.stringify([x.url,x.location,x.technique])));assert.equal(actual.size,out.result.findings.length);const tp=[...actual].filter(x=>expected.has(x)).length,fp=actual.size-tp,fn=expected.size-tp;
    results[split][method+'-'+order]={tp,fp,fn,f1:2*tp/(2*tp+fp+fn),diagnostics:out.diagnostics.length,scope:'actual frozen HCX intent plus actual exporter; saved-input experiment, no live crawl'};
    fs.writeFileSync(ROOT+'/'+split+'-'+method+'-'+order+'-result.json',JSON.stringify(out.result,null,2));
   }
  }}finally{await browser.close();}
 fs.writeFileSync(ROOT+'/submission-audit.json',JSON.stringify({html_checked:inspected,results},null,2));console.log(JSON.stringify(results));
}main().catch(e=>{console.error(e);process.exitCode=1;});


