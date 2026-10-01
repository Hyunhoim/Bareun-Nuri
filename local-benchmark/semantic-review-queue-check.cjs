const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require('../agent/node_modules/playwright');
const root='local-benchmark/semantic-review-queue-v1',out='.runtime/semantic-review-queue-check-v1';
(async()=>{assert(!fs.existsSync(out));fs.mkdirSync(out);const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(root,'review.html')).href);
 assert.equal(await page.locator('article').count(),62);assert.equal(await page.locator('article a').count(),0);
 const payload=await page.locator('#data').textContent();assert(!/proposed_label|annotation_reason|prediction/.test(payload));
 await page.locator('#scope').selectOption('observed');assert.equal(await page.locator('article:visible').count(),31);
 await page.locator('#scope').selectOption('training_candidate');assert.equal(await page.locator('article:visible').count(),31);
 await page.locator('#scope').selectOption('all');
 await page.locator('article select').first().selectOption('uncertain');await page.locator('article textarea').first().fill('UI TEST ONLY - NOT HUMAN GOLD');
 assert.match(await page.locator('#progress').innerText(),/1\/62/);
 await page.reload();assert.equal(await page.locator('article select').first().inputValue(),'uncertain');
 const downloaded=page.waitForEvent('download');await page.locator('#export').click();const file=await downloaded;assert.equal(file.suggestedFilename(),'semantic-review-queue-answers.json');await file.saveAs(out+'/ui-test-export.json');
 const obj=JSON.parse(fs.readFileSync(out+'/ui-test-export.json'));assert.equal(obj.answers.length,62);assert.equal(obj.answers.filter(x=>x.reviewed).length,1);assert.equal(obj.answers.filter(x=>x.purpose==='observed').length,31);
 await page.evaluate(()=>localStorage.clear());await page.reload();assert.match(await page.locator('#progress').innerText(),/0\/62/);await page.screenshot({path:out+'/review-ui.png'});assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/audit.json',JSON.stringify({passed:true,cards:62,purpose_filter:true,download_contract:true,persistence:true,active_advertiser_links:0,errors,human_gold_created:false,test_export_not_human_gold:true},null,2));console.log('PASS 62 cards, split filter, persistence, export; no human labels created.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
