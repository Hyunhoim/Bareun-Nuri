"""Sequential logical batches, not parallel independent GPU requests."""
import os,json,time,hashlib,importlib.util
from pathlib import Path
os.environ['TOKENIZERS_PARALLELISM']='false'
import torch
from transformers import AutoTokenizer,AutoModelForCausalLM
from peft import PeftModel

ROOT=Path('.runtime/exaone-ft-batches-v1');BASE=Path('.runtime/exaone-ft-v1')
spec=importlib.util.spec_from_file_location('ft',Path(__file__).with_name('exaone-ft-train.py'))
ft=importlib.util.module_from_spec(spec);spec.loader.exec_module(ft)
def save(name,value):
    p=ROOT/(name+'.tmp');p.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8');p.replace(ROOT/name)

def next_tokens(stages,prefix):
    """Walk disjoint label paths; stage count grows linearly with batch size."""
    offsets={0};allowed=set()
    for stage in stages:
        following=set()
        for offset in offsets:
            remaining=prefix[offset:]
            for choice in stage:
                common=min(len(remaining),len(choice))
                if remaining[:common]!=choice[:common]:continue
                if len(remaining)<len(choice):allowed.add(choice[len(remaining)])
                else:following.add(offset+len(choice))
        offsets=following
        if not offsets:break
    return sorted(allowed)

def main():
    assert not ROOT.exists(),'Preserve prior experiment';ROOT.mkdir()
    torch.manual_seed(42);torch.set_num_threads(4)
    rows=ft.read('.runtime/slm-three/inputs.json');manifest=ft.read(BASE/'manifest.json')
    system=manifest['system'];batch_system=system.replace('설명 없이 JSON {"label": 0} 형태로 라벨 정수 하나만 출력하세요.',
       '각 대상의 문맥을 서로 섞지 말고, 설명 없이 각 id를 키로 라벨 정수를 값으로 갖는 JSON 객체 하나를 출력하세요.')
    tokenizer=AutoTokenizer.from_pretrained(BASE/'base',local_files_only=True)
    def grammar(count):
        encode=lambda s:tokenizer.encode(s,add_special_tokens=False)
        if count==1:return [[encode('{"label":'+str(label)+'}')+[tokenizer.eos_token_id] for label in range(4)]]
        stages=[]
        for i in range(count):
            start=('{' if i==0 else ',')+'"'+str(i)+'":'
            end='}' if i==count-1 else ''
            stages.append([encode(start+str(label)+end) for label in range(4)])
        stages.append([[tokenizer.eos_token_id]])
        return stages
    # Exhaustive label-path checks on small batches, representative paths on large ones.
    for size in [1,4,8,12]:
        stages=grammar(size)
        for label in range(4):
            prefix=[]
            for stage in stages:
                for token in stage[min(label,len(stage)-1)]:
                    assert token in next_tokens(stages,prefix);prefix.append(token)
            obj=json.loads(tokenizer.decode(prefix,skip_special_tokens=True))
            assert len(obj)==size and set(obj.values())=={label}
    plans=[]
    for order in ['original','reverse']:
        for size in [1,4,8,12]:
            chunks=[]
            for panel in dict.fromkeys(r['panel'] for r in rows):
                panel_rows=[r for r in rows if r['panel']==panel]
                if order=='reverse':panel_rows=list(reversed(panel_rows))
                chunks.extend(panel_rows[i:i+size] for i in range(0,len(panel_rows),size))
            requests=[]
            for chunk in chunks:
                count=len(chunk)
                # Size1 has the existing single contract, including singleton tails.
                content=chunk[0]['input'] if count==1 else [dict(id=str(i),**r['input']) for i,r in enumerate(chunk)]
                prompt=tokenizer.apply_chat_template([{'role':'system','content':system if count==1 else batch_system},
                  {'role':'user','content':json.dumps(content,ensure_ascii=False,separators=(',',':'))}],
                  tokenize=False,add_generation_prompt=True,enable_thinking=False)
                ids=tokenizer.encode(prompt,add_special_tokens=False)
                stages=grammar(count);assert len(ids)+512<=8192
                requests.append({'rows':chunk,'ids':ids,'stages':stages,'prompt':prompt})
            plans.append((order,size,requests))
    save('manifest.json',{'sizes':[1,4,8,12],'orders':['original','reverse'],'input_sha':ft.sha('.runtime/slm-three/inputs.json'),
       'adapter_sha':ft.sha(BASE/'selected-adapter/adapter_model.safetensors'),'system':system,'batch_system':batch_system,
       'precision':'BF16','device':'RTX4060','lora':'unmerged','max_output':512,'context_limit':8192,
       'seed':42,'sampling':False,'calls':{f'{o}-{s}':len(rs) for o,s,rs in plans},'script_sha':ft.sha(__file__),
       'criteria':'Both orders: faster and no lower mean ad F1 than contemporaneous single; report TP loss and uncertainty. Diagnostic only; no production adoption.'})
    base=AutoModelForCausalLM.from_pretrained(BASE/'base',local_files_only=True,dtype=torch.bfloat16,attn_implementation='sdpa').to('cuda')
    model=PeftModel.from_pretrained(base,BASE/'selected-adapter',is_trainable=False).eval();model.config.use_cache=True
    def run(req):
        x=torch.tensor([req['ids']],device='cuda');n=x.shape[1]
        def allowed(_,sentence):
            result=next_tokens(req['stages'],sentence[n:].tolist());assert result,'invalid constrained prefix';return result
        torch.cuda.synchronize();t=time.perf_counter()
        with torch.inference_mode():
            y=model.generate(x,attention_mask=torch.ones_like(x),do_sample=False,max_new_tokens=512,
              prefix_allowed_tokens_fn=allowed,pad_token_id=tokenizer.pad_token_id,eos_token_id=tokenizer.eos_token_id)
        torch.cuda.synchronize();seconds=time.perf_counter()-t
        output=y[0,n:].tolist();assert output[-1]==tokenizer.eos_token_id and len(output)<512
        text=tokenizer.decode(output,skip_special_tokens=True);obj=json.loads(text)
        keys=['label'] if len(req['rows'])==1 else [str(i) for i in range(len(req['rows']))]
        assert list(obj)==keys and all(type(v)==int and v in range(4) for v in obj.values())
        return dict(raw=text,predictions=[obj[k] for k in keys],seconds=seconds,input_tokens=n,output_tokens=len(output))
    run(plans[0][2][0]);report={};deadline=time.monotonic()+3600
    for order,size,requests in plans:
        name=f'{order}-{size}';records=[];start=time.perf_counter();torch.cuda.reset_peak_memory_stats()
        for i,req in enumerate(requests):
            assert time.monotonic()<deadline,'Safety time limit'
            result=run(req);result['items']=[{'id':r['id'],'panel':r['panel']} for r in req['rows']]
            result['prompt_sha']=hashlib.sha256(req['prompt'].encode()).hexdigest();records.append(result)
            if (i+1)%10==0:print(name,i+1,len(requests),flush=True)
        elapsed=time.perf_counter()-start
        pred={(r['panel'],r['id']):p for rec in records for r,p in zip(rec['items'],rec['predictions'],strict=True)}
        assert len(pred)==len(rows)
        ps=[pred[r['panel'],r['id']] for r in rows]
        score=ft.metrics(rows,ps)
        report[name]={'metrics':score,'seconds':elapsed,'calls':len(records),'max_input_tokens':max(r['input_tokens'] for r in records),
           'output_tokens':sum(r['output_tokens'] for r in records),'peak_allocated_vram':torch.cuda.max_memory_allocated(),
           'human17_fp':sum(p==0 for r,p in zip(rows,ps) if r['panel']=='human17')}
        save(name+'.json',{'records':records,'summary':report[name]});save('report.json',report)
        print('COMPLETE',name,json.dumps(report[name]),flush=True)
    save('completion.json',{'status':'completed'})

if __name__=='__main__':main()
