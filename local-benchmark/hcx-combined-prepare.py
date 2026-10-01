from pathlib import Path
root=Path(__file__).resolve().parent.parent
src=root/'agent/experiments/hcx-throughput-rolling'
dst=root/'agent/experiments/hcx-throughput-combined'
dst.mkdir(exist_ok=True)
s=(src/'bounded-scan.cjs').read_text(encoding='utf-8')
def replace(a,b):
    global s
    assert s.count(a)==1,a
    s=s.replace(a,b)
replace("format:'experimental-independent-wave-v1'", "format:'experimental-independent-wave-publish5-v1'")
replace('let timer,state,session,baseCalls=0,baseElapsed=0;', 'let timer,publishTimer,state,session,baseCalls=0,baseElapsed=0;')
replace('const progress=()=>{account();persist();publish(dir,state,store);onProgress(state);};', '''// Keep every safety checkpoint; coalesce presentation only, bounded to five seconds.
 const flush=()=>{clearTimeout(publishTimer);publishTimer=null;publish(dir,state,store);};
 const progress=()=>{account();persist();if(!state.inflight)flush();else if(!publishTimer)publishTimer=setTimeout(()=>{try{flush();}catch(error){ctl.abort(error);}},5000);onProgress(state);};''')
replace('}finally{clearTimeout(timer);', '}finally{clearTimeout(timer);clearTimeout(publishTimer);')
(dst/'bounded-scan.cjs').write_text(s,encoding='utf-8')
(dst/'worker.cjs').write_text((src/'worker.cjs').read_text(encoding='utf-8'),encoding='utf-8')
print(dst)
