// Fixture integrity only: no collector judgments, model loading, or API calls.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const {chromium} = require('../agent/node_modules/playwright');
const root = __dirname, publicRoot = path.join(root, 'public');
const rows = fs.readFileSync(path.join(root,'private/gold.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
  for (const [file,expected] of Object.entries(manifest.files)) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'), expected, file);
  }
  const server = http.createServer((req,res) => {
    const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = path.resolve(publicRoot,'.'+name);
    if (!file.startsWith(publicRoot+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); return res.end();
    }
    res.setHeader('Content-Type', file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const result = [];
  try {
    browser = await chromium.launch({channel:'msedge',headless:true});
    const context = await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
    await context.route('**/*', route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
    const page = await context.newPage();
    for (const pagePath of [...new Set(rows.map(r=>r.page_path))]) {
      await page.goto(origin+pagePath,{waitUntil:'load'});
      await page.waitForFunction(()=>!document.querySelector('template'));
      const expected = rows.filter(r=>r.page_path===pagePath);
      for (const row of expected) {
        const frame = row.frame_path?page.frames().find(f=>new URL(f.url()).pathname===row.frame_path):page.mainFrame();
        assert(frame, 'Missing iframe '+row.id);
        const actual = await frame.evaluate(r=>{
          const n=document.querySelector(r.target_selector), u=document.querySelector(r.scope_selector);
          if(!n || !u) return null;
          const s=getComputedStyle(n), b=n.getBoundingClientRect();
          return {text:n.textContent,scope:u.textContent,owned:u.contains(n),color:s.color,background:s.backgroundColor,
            opacity:s.opacity,display:s.display,fontSize:s.fontSize,left:b.left,right:b.right,
            spanColors:[...n.querySelectorAll('span')].map(x=>getComputedStyle(x).color)};
        },row);
        assert(actual, row.id);
        assert.equal(actual.text,row.target_text,row.id+' target text');
        assert(actual.owned && actual.scope.includes(row.context_after),row.id+' context ownership');
        for(const s of row.style_evidence) {
          const checks = {
            'opacity-zero':()=>Number(actual.opacity)===0,
            'transparent-color':()=>actual.color==='rgba(0, 0, 0, 0)' && actual.spanColors.every(x=>x===actual.color),
            'white-on-white':()=>actual.color===actual.background && actual.spanColors.every(x=>x===actual.color),
            'matching-solid-color':()=>actual.color===actual.background && actual.spanColors.every(x=>x===actual.color),
            'display-none':()=>actual.display==='none',
            'negative-left':()=>actual.right<0,
            'font-zero':()=>parseFloat(actual.fontSize)===0,
            'font-one':()=>parseFloat(actual.fontSize)===1
          };
          assert(checks[s.kind](), row.id+' computed CSS '+s.kind+' '+JSON.stringify(actual));
        }
        result.push({id:row.id,page_path:row.page_path,frame_path:row.frame_path,computed:actual});
      }
    }
    // Verify every fixture is reachable from the homepage, including lazy iframe documents.
    const seen=new Set(), queue=['/index.html'];
    while(queue.length) {
      const url=queue.shift(); if(seen.has(url)) continue; seen.add(url);
      const file=path.join(publicRoot,url);
      assert(fs.existsSync(file),url);
      const html=fs.readFileSync(file,'utf8');
      for(const match of html.matchAll(/(?:href|src)="(\/[^"#]+\.html)"/g)) if(!seen.has(match[1])) queue.push(match[1]);
    }
    assert.equal(result.length,1000);
    assert.equal(new Set(result.map(r=>r.id)).size,1000);
    assert.equal(seen.size,122);
    assert.equal((await fetch(origin+'/private/gold.jsonl')).status,404);
    const report={kind:'browser_fixture_integrity_not_detection_evaluation',passed:true,checked:result.length,
      reachable_html:seen.size,style_assertions:rows.reduce((n,r)=>n+r.style_evidence.length,0),model_calls:0,
      gold_not_public:true,results:result};
    fs.writeFileSync(path.join(root,'private/dom-audit.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({...report,results:undefined}));
  } finally {if(browser) await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
