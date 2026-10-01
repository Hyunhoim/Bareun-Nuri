from pathlib import Path
import time

root = Path(__file__).resolve().parent.parent
backup = root / '.runtime' / ('parallel3-adoption-' + str(int(time.time()*1000)))
backup.mkdir()
def replace(s, a, b):
    assert s.count(a) == 1, a
    return s.replace(a, b)

p = root/'agent/src/core/bounded-scan.cjs'
s = p.read_text(encoding='utf-8')
(backup/'bounded-scan.cjs').write_text(s, encoding='utf-8')
s = "const {AsyncLocalStorage}=require('node:async_hooks');\nconst requestContext=new AsyncLocalStorage();\n" + s
s = s.replace('collectionConcurrency=1}', 'collectionConcurrency=1,judgmentConcurrency=1}')
s = replace(s, "format:'bounded-evidence-v3-quarantine',batch:batchSize,collectionConcurrency", "format:'bounded-evidence-v4-concurrent',batch:batchSize,collectionConcurrency,judgmentConcurrency")
s = replace(s, 'observeTechniques,batchSize,collectionConcurrency});', 'observeTechniques,batchSize,collectionConcurrency,judgmentConcurrency});')
s = replace(s, ' assert(Number.isInteger(collectionConcurrency)', " assert([1,3].includes(judgmentConcurrency));assert(judgmentConcurrency===1||(policy==='srpt'&&quantum===1));\n assert(Number.isInteger(collectionConcurrency)")
s = replace(s, "if(state.inflight&&['prepared','rejected'].includes(state.inflight.phase))state.inflight=null;if(state.inflight)throw Error('Unconfirmed in-flight judgment: automatic retry refused');", "if(judgmentConcurrency===3){if(state.inflight){assert.equal(state.inflight.phase,'wave');if(state.inflight.requests.some(r=>!['prepared','rejected','durable'].includes(r.phase)))throw Error('Unconfirmed in-flight judgment: automatic retry refused');}}else{if(state.inflight&&['prepared','rejected'].includes(state.inflight.phase))state.inflight=null;if(state.inflight)throw Error('Unconfirmed in-flight judgment: automatic retry refused');}")
s = replace(s, "onRequestState:event=>{assert(state.inflight,'Unexpected lifecycle event');Object.assign(state.inflight,event);account();persist();}", "onRequestState:event=>{const request=judgmentConcurrency===3?requestContext.getStore():state.inflight;assert(request&&(judgmentConcurrency===1||state.inflight.requests.includes(request)),'Unowned lifecycle event');Object.assign(request,event);account();persist();}")
s = replace(s, 'if(!state.service_page&&state.active.length<activeWindow', 'if(!state.inflight&&!state.service_page&&state.active.length<activeWindow')
e = (root/'agent/experiments/phase1-parallel/bounded-scan.cjs').read_text(encoding='utf-8')
start=e.index('   if(!state.inflight){\n    const shadow=')
end=e.index('\n  }\n }catch(e)',start)
wave=e[start:end].replace('n<3&&', 'n<judgmentConcurrency&&')
start=s.index('   const selected=state.service_page?')
end=s.index('\n  }\n }catch(e)',start)
s=s[:start]+"   if(judgmentConcurrency===3){\n   // ponytail: ordered waves can wait for a slow peer; independent commits need separate resume validation.\n"+wave+'\n   }else{\n'+s[start:end]+'\n   }'+s[end:]
p.write_text(s,encoding='utf-8')
p=root/'agent/src/worker.cjs'
s=p.read_text(encoding='utf-8')
(backup/'worker.cjs').write_text(s,encoding='utf-8')
s=replace(s,'collectionConcurrency:5};',"collectionConcurrency:5,judgmentConcurrency:input.provider==='hcx'?3:1};")
s=replace(s,"if(previous?.state.inflight&&!['prepared','rejected'].includes(previous.state.inflight.phase))", "if(previous?.state.inflight&&(previous.state.inflight.phase==='wave'?previous.state.inflight.requests.some(r=>!['prepared','rejected','durable'].includes(r.phase)):!['prepared','rejected'].includes(previous.state.inflight.phase)))")
s=replace(s,'tracked.decide=async items=>antiSpoof.annotate(items,await decide(items));', 'let cpu=Promise.resolve();\n          tracked.decide=async items=>{const values=await decide(items);const result=cpu.then(()=>antiSpoof.annotate(items,values));cpu=result.catch(()=>{});return result;};')
p.write_text(s,encoding='utf-8')
print(backup)
