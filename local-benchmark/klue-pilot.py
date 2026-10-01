"""Isolated supervised classifier pilot. Final evaluation is single-use."""
import argparse, hashlib, json, os, random, time
from pathlib import Path

ROOT = Path('.runtime/klue-pilot-v2')
os.environ['HF_HOME'] = str(Path('.runtime/klue-hf').resolve())
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_DISABLE_XET'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

REV = '02f94ba5e3fcb7e2a58a390b8639b0fac974a8da'
LABELS = ['ad', 'quotation', 'ordinary', 'uncertain']
def read(name):
    return json.loads((ROOT / (name + '.json')).read_text(encoding='utf-8'))
def save(name, data):
    (ROOT / (name + '.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
def digest(p):
    return hashlib.file_digest(open(p, 'rb'), 'sha256').hexdigest()
def metrics(gold, pred):
    cm = [[0]*4 for _ in range(4)]
    for y, p in zip(gold, pred, strict=True):
        if y is not None: cm[y][p] += 1
    f = []
    for k in range(4):
        tp=cm[k][k]; fp=sum(cm[i][k] for i in range(4))-tp; fn=sum(cm[k])-tp
        f.append(2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0)
    tp=cm[0][0]; fp=sum(cm[i][0] for i in range(1,4)); fn=sum(cm[0][1:])
    # Insufficient evidence is excluded from binary ad F1, reported separately.
    fp_binary=sum(cm[i][0] for i in [1,2])
    return {'confusion':cm,'macro4_f1':sum(f)/4,'class_f1':f,'tp':tp,'fp':fp_binary,'fn':fn,
            'precision':tp/(tp+fp_binary) if tp+fp_binary else None,
            'recall':tp/(tp+fn) if tp+fn else None,
            'ad_f1':2*tp/(2*tp+fp_binary+fn) if 2*tp+fp_binary+fn else 0,
            'quotation_fp':cm[1][0],'uncertain_as_ad':cm[3][0], 'uncertain_correct':cm[3][3]}
def encoded(tok, rows):
    texts=['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context'] for r in rows]
    full=tok(texts, truncation=False, return_token_type_ids=False)
    short=tok(texts, truncation=True, max_length=512, return_token_type_ids=False)
    return [{k:v[i] for k,v in short.items()} for i in range(len(rows))], sum(len(x)>512 for x in full['input_ids'])
def batches(tok, inputs, indices, device):
    return tok.pad([inputs[i] for i in indices], padding=True, return_tensors='pt').to(device)
def predict(model, tok, inputs, batch=8, device='cpu'):
    model.eval(); result=[]; start=time.perf_counter()
    with torch.inference_mode():
        for i in range(0,len(inputs),batch):
            out=model(**batches(tok,inputs,list(range(i,min(i+batch,len(inputs)))),device))
            result.extend(out.logits.argmax(-1).cpu().tolist())
    return result,time.perf_counter()-start
def verify_data():
    for f,h in read('manifest')['hashes'].items():
        # Verify sealed bytes without interpreting final inputs or labels.
        assert digest(ROOT/f)==h, f
def train():
    assert not (ROOT/'training-started.json').exists(), 'Do not silently repeat training'
    verify_data(); save('training-started',{'seed':42,'epochs':4,'revision':REV})
    random.seed(42); torch.manual_seed(42); torch.set_num_threads(8)
    assert torch.cuda.is_available(), 'GPU unavailable; no unbounded CPU training fallback'
    torch.cuda.manual_seed_all(42)
    tok=AutoTokenizer.from_pretrained('.runtime/klue-base',local_files_only=True)
    model=AutoModelForSequenceClassification.from_pretrained('.runtime/klue-base',local_files_only=True,num_labels=4,id2label=dict(enumerate(LABELS)),label2id={x:i for i,x in enumerate(LABELS)},use_safetensors=True).to('cuda')
    tr,va=read('train'),read('validation'); ti,tt=encoded(tok,tr); vi,vt=encoded(tok,va)
    assert len({r['group'] for r in tr}&{r['group'] for r in va})==0
    opt=torch.optim.AdamW(model.parameters(),lr=2e-5,weight_decay=.01)
    history=[]; best=(-1,float('-inf')); start=time.perf_counter()
    for epoch in range(4):
        model.train(); indices=list(range(len(tr))); random.Random(42+epoch).shuffle(indices); losses=[]
        for i in range(0,len(indices),8):
            assert time.perf_counter()-start<1800,'Training time cap'
            ids=indices[i:i+8]; opt.zero_grad(set_to_none=True)
            out=model(**batches(tok,ti,ids,'cuda'),labels=torch.tensor([tr[j]['label'] for j in ids],device='cuda'))
            assert torch.isfinite(out.loss); out.loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),1); opt.step(); losses.append(out.loss.item())
        pred,seconds=predict(model,tok,vi,8,'cuda'); met=metrics([r['label'] for r in va],pred)
        with torch.inference_mode():
            vloss=sum(model(**batches(tok,vi,list(range(i,min(i+8,len(vi)))),'cuda'),labels=torch.tensor([r['label'] for r in va[i:i+8]],device='cuda')).loss.item()*len(va[i:i+8]) for i in range(0,len(vi),8))/len(vi)
        row={'epoch':epoch+1,'train_loss':sum(losses)/len(losses),'validation_loss':vloss,'validation':met,'elapsed_sec':time.perf_counter()-start};history.append(row);save('training-history',history)
        if (met['macro4_f1'],-vloss)>best:
            best=(met['macro4_f1'],-vloss);model.save_pretrained(ROOT/'model',safe_serialization=True);tok.save_pretrained(ROOT/'model');save('selection',row)
        print(json.dumps(row),flush=True)
    save('training-completed',{'seconds':time.perf_counter()-start,'train_truncated':tt,'validation_truncated':vt,'gpu':torch.cuda.get_device_name(0),'gpu_peak_bytes':torch.cuda.max_memory_allocated(),'torch':torch.__version__})
    files=[*sorted((ROOT/'model').glob('*')),Path(__file__),Path('local-benchmark/klue-data.cjs'),Path('docs/klue-pilot-plan.md')]
    save('frozen',{'hashes':{str(p):digest(p) for p in files if p.is_file()},'data_hashes':read('manifest')['hashes'],'selected_epoch':read('selection')['epoch']})
def evaluate():
    verify_data(); frozen=read('frozen')
    for p,h in frozen['hashes'].items():assert digest(p)==h,p
    assert not (ROOT/'final-started.json').exists(),'Final has already started: do not rerun'
    torch.set_num_threads(8); start=time.perf_counter()
    tok=AutoTokenizer.from_pretrained(ROOT/'model',local_files_only=True);model=AutoModelForSequenceClassification.from_pretrained(ROOT/'model',local_files_only=True).to('cpu')
    load_seconds=time.perf_counter()-start;vi,_=encoded(tok,read('validation'));predict(model,tok,vi[:8],8)
    timing={}
    for batch in [1,8]: timing[str(batch)]=[predict(model,tok,vi[:32],batch)[1] for _ in range(3)]
    with (ROOT/'final-started.json').open('x',encoding='utf-8') as f:json.dump({'started':time.time(),'freeze_hash':digest(ROOT/'frozen.json')},f)
    rows=read('final-inputs');inputs,truncated=encoded(tok,rows);pred,seconds=predict(model,tok,inputs)
    save('final-predictions',[{'id':r['id'],'prediction':p} for r,p in zip(rows,pred,strict=True)])
    # Gold is opened only after frozen-model predictions are durably saved.
    gold=read('final-labels');assert [r['id'] for r in gold]==[r['id'] for r in rows]
    import psutil
    save('final-result',{'metrics':metrics([r['label'] for r in gold],pred),'seconds':seconds,'cpu_threads':8,'batch':8,'truncated':truncated,'load_seconds':load_seconds,'validation_speed_32':timing,'memory':psutil.Process().memory_info()._asdict()})
    reg=read('regression');ri,rt=encoded(tok,reg);rp,rs=predict(model,tok,ri)
    save('regression-predictions',[{'id':r['id'],'prediction':p} for r,p in zip(reg,rp,strict=True)])
    # Binary-only labels; do not invent quotation vs ordinary labels for regression.
    save('regression-result',{'metrics':metrics([None if r['is_ad'] is None else 0 if r['is_ad'] else 2 for r in reg],rp),'seconds':rs,'truncated':rt,'note':'Observed binary regression; macro4 is not meaningful here'})
    print(json.dumps(read('final-result')),flush=True)
def check():
    m=metrics([0,0,1,2,3],[0,2,0,2,3]);assert (m['tp'],m['fp'],m['fn'])==(1,1,1);assert m['ad_f1']==.5
    assert metrics([0,1,2,3],[0,1,2,3])['macro4_f1']==1
    verify_data(); print('PASS scoring and sealed dataset hashes')
if __name__=='__main__':
    arg=argparse.ArgumentParser();arg.add_argument('mode',choices=['check','train','evaluate']);a=arg.parse_args();globals()[a.mode]()

