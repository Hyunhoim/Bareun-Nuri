"""Train a new three-way technique classifier; do not open final inputs/labels."""
import importlib.util,json,random,time,math
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
torch=p.torch;DATA=Path('.runtime/technique-specialist-data-v3');OUT=Path('.runtime/technique-specialist-model-v1')
def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def save(name,x):(OUT/(name+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def metric(gold,pred):
    cm=[[0]*3 for _ in range(3)]
    for y,v in zip(gold,pred,strict=True):cm[y][v]+=1
    fs=[]
    for k in range(3):
        tp=cm[k][k];fp=sum(cm[i][k] for i in range(3))-tp;fn=sum(cm[k])-tp;fs.append(2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0)
    return {'confusion':cm,'macro_f1':sum(fs)/3,'strict_f1':fs[0],'normal_false':cm[1][0],'uncertain_false':cm[2][0]}
def load(split):
    a=read(DATA/(split+'-inputs.json'));g=read(DATA/(split+'-gold.json'));assert [x['id'] for x in a]==[x['id'] for x in g];return a,[x['label'] for x in g]
def main():
    OUT.mkdir(exist_ok=False);torch.set_num_threads(8);torch.manual_seed(42);random.seed(42);assert torch.cuda.is_available();torch.cuda.manual_seed_all(42)
    manifest=read(DATA/'manifest.json')
    for file,entry in manifest['splits'].items():assert p.digest(DATA/file)==entry['sha256']
    tr,ty=load('train');dev,dy=load('dev');assert not {x['group_id'] for x in tr}&{x['group_id'] for x in dev}
    save('started',{'data_manifest':manifest,'base_hash':p.digest(Path('.runtime/klue-base/model.safetensors')),'final_opened':False,'device':torch.cuda.get_device_name(0)})
    tok=p.AutoTokenizer.from_pretrained('.runtime/klue-base',local_files_only=True)
    model=p.AutoModelForSequenceClassification.from_pretrained('.runtime/klue-base',local_files_only=True,num_labels=3,id2label={0:'substitution',1:'literal',2:'uncertain'},label2id={'substitution':0,'literal':1,'uncertain':2}).to('cuda')
    ti,nt=p.encoded(tok,tr);di,nd=p.encoded(tok,dev);assert nt==nd==0
    opt=torch.optim.AdamW(model.parameters(),lr=2e-5,weight_decay=.01);history=[];best=None;start=time.perf_counter()
    for epoch in range(1,4):
        model.train();ix=list(range(len(tr)));random.Random(41+epoch).shuffle(ix);losses=[]
        for i in range(0,len(ix),8):
            assert time.perf_counter()-start<900;ids=ix[i:i+8];opt.zero_grad(set_to_none=True);out=model(**p.batches(tok,ti,ids,'cuda'))
            loss=torch.nn.functional.cross_entropy(out.logits,torch.tensor([ty[j] for j in ids],device='cuda'));assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(loss.item())
        pred,sec=p.predict(model,tok,di,device='cuda');m=metric(dy,pred);rank=(m['macro_f1'],-m['uncertain_false'],-epoch)
        rec={'epoch':epoch,'loss':sum(losses)/len(losses),'development':m,'elapsed_sec':time.perf_counter()-start};history.append(rec);save('history',history);print(json.dumps(rec),flush=True)
        if best is None or rank>best:best=rank;model.save_pretrained(OUT/'model',safe_serialization=True);tok.save_pretrained(OUT/'model');save('selection',rec)
    save('frozen',{'model_sha256':p.digest(OUT/'model/model.safetensors'),'data_manifest':manifest,'classification':'argmax3','final_opened':False,'production_adoption':False})
if __name__=='__main__':main()
