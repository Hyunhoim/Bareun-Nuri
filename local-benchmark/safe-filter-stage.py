"""Isolated conservative D filter. Emits routes, never final ad verdicts."""
import argparse,hashlib,importlib.util,json,math,os,unicodedata
from pathlib import Path
sp=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(sp);sp.loader.exec_module(p)
MODEL=Path('.runtime/klue-audit-learning-v1/run-cpu/model')
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def valid(row):
    return isinstance(row.get('input'),dict) and all(isinstance(row['input'].get(k),str) and row['input'][k].strip() for k in ['target','context']) and row.get('collection_truncated') is False
def verdict(row,scores,length):
    if not valid(row):return 'HCX','missing_or_incomplete_evidence'
    if not 0<length<=512:return 'HCX','token_limit'
    if len(scores)!=4 or not all(isinstance(x,(float,int)) and math.isfinite(x) and 0<=x<=1 for x in scores) or abs(sum(scores)-1)>1e-5:return 'HCX','invalid_scores'
    if max(range(4),key=scores.__getitem__)==2 and scores[0]<.0001 and scores[2]>=.9:return 'EXCLUDE','D_fixed_normal_gate'
    return 'HCX','not_verified_normal'
def dump(path,obj):
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8');os.replace(tmp,path)
def run(inp,out,max_items):
    rows=json.loads(inp.read_text(encoding='utf8'));assert isinstance(rows,list)
    assert all(isinstance(x,dict) and isinstance(x.get('id'),str) and x['id'] for x in rows)
    assert len({x['id'] for x in rows})==len(rows),'Duplicate IDs'
    out.mkdir(parents=True,exist_ok=True);statefile=out/'routes.json';lock=out/'running.lock'
    signature={'model':sha(MODEL/'model.safetensors'),'code':sha(__file__),'input':sha(inp),'thresholds':{'ad':.0001,'ordinary':.9},'semantics':'routing-only'}
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY);os.close(fd)
    try:
        state=json.loads(statefile.read_text(encoding='utf8')) if statefile.exists() else {'signature':signature,'routes':[],'routing_complete':False}
        assert state['signature']==signature,'Changed input/model/config: preserve old routes; use a new run'
        assert [x['id'] for x in state['routes']]==[x['id'] for x in rows[:len(state['routes'])]],'Broken checkpoint prefix'
        start=len(state['routes']);end=min(len(rows),start+max_items)
        p.torch.set_num_threads(8);tok=p.AutoTokenizer.from_pretrained(MODEL,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(MODEL,local_files_only=True).to('cpu').eval()
        for begin in range(start,end,8):
            batch=rows[begin:min(begin+8,end)];good=[i for i,x in enumerate(batch) if valid(x)];results={}
            if good:
                texts=[unicodedata.normalize('NFC','판정대상: '+batch[i]['input']['target']+'\n문맥: '+batch[i]['input']['context']) for i in good];full=tok(texts,truncation=False,return_token_type_ids=False);short=tok(texts,truncation=True,max_length=512,return_token_type_ids=False);encoded=[{k:v[j] for k,v in short.items()} for j in range(len(good))]
                with p.torch.inference_mode():scores=model(**p.batches(tok,encoded,list(range(len(good))),'cpu')).logits.softmax(-1).tolist()
                for j,i in enumerate(good):results[i]=(scores[j],len(full['input_ids'][j]))
            for i,row in enumerate(batch):
                scores,length=results.get(i,([],0));route,reason=verdict(row,scores,length)
                state['routes'].append({'id':row['id'],'route':route,'reason':reason,'scores':scores,'tokens':length,'evidence':row})
            state['routing_complete']=len(state['routes'])==len(rows);dump(statefile,state)
        dump(out/'summary.json',{'completed':len(state['routes']),'pending':len(rows)-len(state['routes']),'excluded':sum(x['route']=='EXCLUDE' for x in state['routes']),'routing_complete':state['routing_complete'],'ad_judgment_complete':False,'production_adoption':False})
    finally:lock.unlink()
def check():
    row={'input':{'target':'본문','context':'문맥'},'collection_truncated':False}
    assert verdict(row,[.00001,.00001,.99997,.00001],10)[0]=='EXCLUDE'
    for obj,scores,n in [(row,[float('nan'),0,1,0],10),(row,[.1,.1,.9,.1],10),(row,[0,0,1,0],513),({**row,'collection_truncated':True},[0,0,1,0],10),({'input':row['input']},[0,0,1,0],10)]:assert verdict(obj,scores,n)[0]=='HCX'
    assert verdict(row,[.00001,.00001,.00001,.99997],10)[0]=='HCX'
    print('PASS fail-open and fixed threshold contract')
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--check',action='store_true');a.add_argument('--input',type=Path);a.add_argument('--out',type=Path);a.add_argument('--max-items',type=int,default=100000);args=a.parse_args()
    if args.check:check()
    else:
        assert args.input and args.out and args.max_items>0;run(args.input,args.out,args.max_items)
