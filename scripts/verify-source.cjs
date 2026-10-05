const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {configFromEnv,parse,createSession}=require('../agent/src/core/luna.cjs');
const {messages}=require('../agent/src/core/luna-input.cjs');
const {identity}=require('../agent/src/core/antispoof.cjs');
async function main(){
 const config=configFromEnv({OPENAI_API_KEY:'fixture-only'});
 assert.equal(config.model,'gpt-6-luna');assert.equal(config.maxTokens,512);assert.equal(config.structuredOutput,true);assert.equal(config.tokensPerMinute,130000);
 const cs=Array.from({length:12},(_,i)=>({node_id:'fixture-'+i,raw_text:'검증용 정상 안내 '+i,page_title:'안내',links:[],nearby:'',signals:[]}));
 const raw=ids=>({model:'gpt-6-luna',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({decisions:Object.fromEntries(ids.map(id=>[id,{publication_act:'일반정보'}]))})}]}],usage:{input_tokens:20,output_tokens:12,total_tokens:32}});
 const ids=cs.map(c=>c.node_id);assert.equal(parse(raw(ids),cs).length,12);assert.throws(()=>parse(raw(ids.slice(0,4)),cs),e=>e.code==='confirmed_incomplete_decisions');assert.throws(()=>parse(raw(['unknown']),cs));
 const invalid=raw(ids);invalid.output[0].content[0].text=invalid.output[0].content[0].text.slice(0,-1);assert.throws(()=>parse(invalid,cs));
 let calls=0;const session=createSession({...config,maxCalls:1,timeoutMs:1000,minIntervalMs:0},{fetcher:async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.deepEqual(body.input,messages(cs));return new Response(JSON.stringify(raw(ids)),{status:200})}});
 assert.equal((await session.decide(cs)).length,12);assert.equal(calls,1);assert.equal(session.calls[0].status,'ok');
 identity();
 const seen=new Set();function check(file){file=path.resolve(file);if(seen.has(file))return;seen.add(file);const text=fs.readFileSync(file,'utf8');for(const m of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){const base=path.resolve(path.dirname(file),m[1]);const resolved=[base,base+'.cjs',base+'.js',base+'.json'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());assert(resolved,'Missing runtime dependency: '+base);if(resolved.endsWith('.cjs'))check(resolved)}}check(path.join(root,'agent/src/worker.cjs'));
 console.log('PASS: Luna strict response/quarantine, 12-item stub request, model hashes and runtime dependency closure; external API calls 0');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
