"""One predeclared LoRA pilot; select on grouped development, then run old regression once."""
import os, json, time, random, hashlib, subprocess, math
from pathlib import Path
os.environ['TOKENIZERS_PARALLELISM']='false'
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import LoraConfig, get_peft_model, set_peft_model_state_dict
from safetensors.torch import load_file

ROOT=Path('.runtime/exaone-ft-v1')
def read(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def save(name,value):
    tmp=ROOT/(name+'.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(ROOT/name)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def metrics(rows,predictions):
    cm=[[0]*4 for _ in range(4)]
    for r,p in zip(rows,predictions,strict=True):
        assert p in range(4);cm[r['label']][p]+=1
    tp=cm[0][0];fp=cm[1][0]+cm[2][0];fn=sum(cm[0][1:])
    f=[]
    for i in range(4):
        den=sum(cm[i])+sum(row[i] for row in cm)
        f.append(2*cm[i][i]/den if den else 0)
    return dict(tp=tp,fp=fp,fn=fn,precision=tp/(tp+fp) if tp+fp else 0,recall=tp/(tp+fn) if tp+fn else 0,
                f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0,macro_f1=sum(f)/4,confusion=cm,
                uncertain_correct=cm[3][3],uncertain_as_ad=cm[3][0])

def main():
    assert not (ROOT/'completion.json').exists(), 'Preserve completed run'
    torch.manual_seed(42); random.seed(42);torch.set_num_threads(4)
    assert torch.cuda.is_available()
    source=read(ROOT/'collected.json'); rows=source['rows'];assert not source['missing'], 'Audit missing collection first'
    train=[r for r in rows if r['category']!='sextrade'];dev=[r for r in rows if r['category']=='sextrade']
    assert {r['group'] for r in train}.isdisjoint(r['group'] for r in dev)
    assert {r['family'] for r in train if r['family']}.isdisjoint(r['family'] for r in dev if r['family'])
    dedup={}
    for r in train:
        key=json.dumps(r['input'],sort_keys=True,ensure_ascii=False)
        if key in dedup:
            assert dedup[key]['label']==r['label'];dedup[key]['weight']+=r['weight']
        else:dedup[key]={**r}
    train=list(dedup.values());assert set(r['label'] for r in train)==set(range(4))
    save('split.json',{'train_ids':[r['id'] for r in train],'dev_ids':[r['id'] for r in dev],
        'train_groups':len({r['group'] for r in train}),'dev_groups':len({r['group'] for r in dev}),
        'input_sha':sha(ROOT/'collected.json'),'dataset_sha':sha('local-benchmark/exaone-ft-data-v3/dataset.json')})
    tokenizer=AutoTokenizer.from_pretrained(ROOT/'base',local_files_only=True)
    system=subprocess.check_output(['node','-e',"process.stdout.write(require('./local-benchmark/slm-three.cjs').body({input:{target:'',context:''}}).messages[0].content)"],encoding='utf-8')
    def prompt(r):
        messages=[{'role':'system','content':system},{'role':'user','content':json.dumps(r['input'],ensure_ascii=False,separators=(',',':'))}]
        return tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=True,enable_thinking=False)
    def encode(r):
        p=tokenizer.encode(prompt(r),add_special_tokens=False)
        answer=tokenizer.encode(json.dumps({'label':r['label']},separators=(',',':')),add_special_tokens=False)+[tokenizer.eos_token_id]
        assert len(p)+len(answer)<=2048,'Untruncated token cap'
        return p,answer
    encoded=[encode(r) for r in train]
    save('manifest.json',{'source':read(ROOT/'source.json'),'train_rows':len(train),'dev_rows':len(dev),'max_train_tokens':max(len(p)+len(a) for p,a in encoded),
         'torch':torch.__version__,'system':system,'seed':42,'lr':1e-4,'epochs':3,'rank':16,'alpha':32,'dropout':.05,'accumulation':8,
         'dev_selection':'macro F1 then ad F1 then earliest','regression_used_for_selection':False,'script_sha':sha(__file__)})
    base=AutoModelForCausalLM.from_pretrained(ROOT/'base',local_files_only=True,torch_dtype=torch.bfloat16,attn_implementation='sdpa').to('cuda')
    model=get_peft_model(base,LoraConfig(task_type='CAUSAL_LM',r=16,lora_alpha=32,lora_dropout=.05,target_modules=['q_proj','k_proj','v_proj','o_proj']))
    model.print_trainable_parameters();model.enable_input_require_grads()
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False})
    opt=torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],lr=1e-4,weight_decay=.01)
    choices=[tokenizer.encode('{"label":'+str(i)+'}',add_special_tokens=False)+[tokenizer.eos_token_id] for i in range(4)]
    assert len({tuple(c) for c in choices})==4
    def evaluate(rs,name):
        model.eval();model.config.use_cache=True;records=[];start=time.perf_counter()
        for i,r in enumerate(rs):
            ids=tokenizer.encode(prompt(r),add_special_tokens=False);assert len(ids)+32<=4096
            x=torch.tensor([ids],device='cuda');n=len(ids)
            def allowed(batch,sentence):
                suffix=sentence[n:].tolist()
                matches=[c for c in choices if c[:len(suffix)]==suffix]
                assert matches,'Invalid constrained prefix'
                return sorted({c[len(suffix)] for c in matches if len(c)>len(suffix)}) or [tokenizer.eos_token_id]
            torch.cuda.synchronize();t=time.perf_counter()
            with torch.inference_mode():y=model.generate(x,attention_mask=torch.ones_like(x),do_sample=False,max_new_tokens=32,
                prefix_allowed_tokens_fn=allowed,pad_token_id=tokenizer.pad_token_id,eos_token_id=tokenizer.eos_token_id)
            torch.cuda.synchronize();seconds=time.perf_counter()-t
            text=tokenizer.decode(y[0,n:],skip_special_tokens=True);v=json.loads(text);assert set(v)=={'label'} and v['label'] in range(4)
            records.append({'id':r['id'],'panel':r.get('panel'),'prediction':v['label'],'raw':text,'seconds':seconds})
            if (i+1)%40==0:print(name,i+1,len(rs),flush=True)
        result={'metrics':metrics(rs,[x['prediction'] for x in records]),'records':records,'seconds':time.perf_counter()-start}
        save(name+'.json',result);return result
    evaluate(dev,'dev-base')
    best=None;started=time.perf_counter();history=[];mean_weight=sum(r['weight'] for r in train)/len(train)
    for epoch in range(1,4):
        model.train();model.config.use_cache=False;opt.zero_grad();order=list(range(len(train)));random.Random(42+epoch).shuffle(order);losses=[]
        for j,i in enumerate(order):
            assert time.perf_counter()-started<3600,'Training safety time cap'
            p,a=encoded[i];x=torch.tensor([p+a],device='cuda');labels=torch.tensor([[-100]*len(p)+a],device='cuda')
            out=model(input_ids=x,attention_mask=torch.ones_like(x),labels=labels,use_cache=False)
            assert torch.isfinite(out.loss)
            window=min(8,len(order)-(j//8)*8)
            (out.loss*(train[i]['weight']/mean_weight)/window).backward();losses.append(float(out.loss.detach()))
            if (j+1)%8==0 or j==len(order)-1:
                torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();opt.zero_grad()
            if (j+1)%40==0:print('TRAIN',epoch,j+1,len(order),'loss',round(sum(losses[-40:])/len(losses[-40:]),4),flush=True)
        model.save_pretrained(ROOT/f'epoch-{epoch}')
        result=evaluate(dev,f'dev-epoch-{epoch}');key=(result['metrics']['macro_f1'],result['metrics']['f1'],-epoch)
        if best is None or key>best[0]:best=(key,epoch)
        history.append({'epoch':epoch,'loss':sum(losses)/len(losses),'dev':result['metrics']});save('history.json',history)
        print('EPOCH',epoch,json.dumps(result['metrics']),flush=True)
    selected=best[1];save('selection.json',{'epoch':selected,'history':history,'training_seconds':time.perf_counter()-started,'peak_vram':torch.cuda.max_memory_allocated()})
    set_peft_model_state_dict(model,load_file(str(ROOT/f'epoch-{selected}'/'adapter_model.safetensors')))
    model.save_pretrained(ROOT/'selected-adapter');tokenizer.save_pretrained(ROOT/'selected-adapter')
    # First regression access occurs after selection, and no regression result feeds training.
    regression=read('.runtime/slm-three/inputs.json')
    train_keys={json.dumps(r['input'],ensure_ascii=False,sort_keys=True) for r in train}
    assert all(json.dumps(r['input'],ensure_ascii=False,sort_keys=True) not in train_keys for r in regression)
    with model.disable_adapter(): before=evaluate(regression,'regression-before')
    after=evaluate(regression,'regression-after')
    report={}
    for name,result in [('before',before),('after',after)]:
        report[name]={'all':result['metrics'],'seconds':result['seconds'],'panels':{}}
        for panel in sorted({r['panel'] for r in regression}):
            ix=[i for i,r in enumerate(regression) if r['panel']==panel]
            report[name]['panels'][panel]=metrics([regression[i] for i in ix],[result['records'][i]['prediction'] for i in ix])
        ix=[i for i,r in enumerate(regression) if r['panel']!='human17']
        report[name]['development204']=metrics([regression[i] for i in ix],[result['records'][i]['prediction'] for i in ix])
    report['retention']={
      'lost_tp':[r['panel']+'/'+r['id'] for i,r in enumerate(regression) if r['label']==0 and before['records'][i]['prediction']==0 and after['records'][i]['prediction']!=0],
      'recovered_fn':[r['panel']+'/'+r['id'] for i,r in enumerate(regression) if r['label']==0 and before['records'][i]['prediction']!=0 and after['records'][i]['prediction']==0]}
    report['selected_epoch']=selected;report['regression_input_sha']=sha('.runtime/slm-three/inputs.json')
    save('report.json',report);save('completion.json',{'status':'completed','selected_epoch':selected});print(json.dumps(report,ensure_ascii=False),flush=True)

if __name__=='__main__':
    import sys
    if '--check' in sys.argv:
        m=metrics([{'label':x} for x in [0,0,1,2,3]],[0,2,0,2,0])
        assert (m['tp'],m['fp'],m['fn'],m['f1'],m['uncertain_as_ad'])==(1,1,1,.5,1)
        print('PASS metrics: unknown gold kept outside binary F1; false negatives retained')
    else: main()
