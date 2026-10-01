"""Evaluate the frozen development winner; open confirmation only after regression gates."""
import importlib.util,json,sys,time
from pathlib import Path
s=importlib.util.spec_from_file_location('ft',Path(__file__).with_name('a-finetune.py'));ft=importlib.util.module_from_spec(s);s.loader.exec_module(ft)
p=ft.p;R=Path(sys.argv[1]) if len(sys.argv)>1 else ft.R
def predict(model,tok,enc,bias):
 if not bias:return p.predict(model,tok,enc,8,'cpu')
 model.eval();ps=[];start=time.perf_counter()
 with p.torch.inference_mode():
  for i in range(0,len(enc),8):
   z=model(**p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cpu')).logits;z[:,0]+=bias;ps.extend(z.argmax(-1).tolist())
 return ps,time.perf_counter()-start
def main():
 out=R/'evaluation';out.mkdir(exist_ok=False)
 def save(n,x):(out/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
 sel=ft.read(R/'selection.json');arm=sel['arm']
 if arm is None:save('completed',{'eligible':False,'confirmation_opened':False});return
 for f,h in ft.read(R/'frozen.json').items():assert p.digest(f)==h
 assert p.digest(R/arm/'model/model.safetensors')==sel['model_hash']
 p.torch.set_num_threads(8);src=R/arm/'model';tok=p.AutoTokenizer.from_pretrained(src,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(src,local_files_only=True).to('cpu')
 rows=ft.norm(ft.read('.runtime/klue-input-audit-v2/corrected-inputs.json'));gold={r['id']:r for r in ft.read('test-set-contest-v1/data/private/gold.json')};ys=[0 if gold[r['id']]['is_violation'] else 2 for r in rows]
 enc,tr=p.encoded(tok,rows);ps,sec=predict(model,tok,enc,sel.get('ad_bias',0));baseline=ft.read('.runtime/a-generalization-v1/results.json')['regression']['baseline'];bp={x['id']:x['prediction'] for x in baseline['predictions']};met=p.metrics(ys,ps)
 bytype={t:p.metrics([y for r,y in zip(rows,ys) if gold[r['id']]['technique']==t],[v for r,v in zip(rows,ps) if gold[r['id']]['technique']==t]) for t in baseline['techniques']}
 changes={k:[] for k in ['lost_tp','gained_tp','fixed_fp','new_fp']}
 for r,y,v in zip(rows,ys,ps,strict=True):
  a=bp[r['id']]
  if (a==0)==(v==0):continue
  changes[('lost_tp' if a==0 else 'gained_tp') if y==0 else ('fixed_fp' if a==0 else 'new_fp')].append(r['id'])
 gate=met['ad_f1']>=baseline['metrics']['ad_f1'] and met['recall']>=baseline['metrics']['recall']-.02 and all(bytype[t]['ad_f1']>=baseline['techniques'][t]['ad_f1']-.02 for t in bytype)
 save('regression',{'arm':arm,'metrics':met,'techniques':bytype,'changes':changes,'seconds':sec,'truncated':tr,'gate':gate,'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rows,ps,strict=True)]});print(json.dumps({'regression':met,'gate':gate}),flush=True)
 if not gate:save('completed',{'regression_gate':False,'confirmation_opened':False,'adopt':False});return
 # Freeze winner BEFORE interpreting private confirmation inputs or labels.
 save('confirmation-started',{'candidate_hash':p.digest(src/'model.safetensors'),'ad_bias':sel.get('ad_bias',0),'sealed_hash':p.digest('local-benchmark/a-ft-confirmation-private.json')})
 raw=ft.read('local-benchmark/a-ft-confirmation-private.json');rs=ft.norm([{'id':r['group'],'group':r['group'],'label':r['label'],'input':{'target':r['target'],'context':r['context']}} for r in raw])
 train=ft.norm(ft.read('local-benchmark/a-ft-new-data.json')['train']+ft.read('.runtime/klue-cycle3-v1/train.json')+ft.read('local-benchmark/a-ft-context-pairs.json')+ft.read('local-benchmark/a-ft-domain-train.json'));key=lambda r:json.dumps(r['input'],ensure_ascii=False,sort_keys=True)
 dev=ft.norm(ft.read('local-benchmark/a-ft-new-data.json')['development']+ft.read('.runtime/klue-broad-development-v1/rows.json')+ft.read('.runtime/klue-retention-v1/development.json'))
 overlap={key(r) for r in rs}&{key(r) for r in train+dev+rows}
 save('confirmation-overlap',{'exact_inputs':len(overlap),'target_only_overlap':len({r['input']['target'] for r in rs}&{r['input']['target'] for r in train+dev+rows}),'human_reviewed':False});assert not overlap
 ei,ct=p.encoded(tok,rs);cp,cs=predict(model,tok,ei,sel.get('ad_bias',0));save('confirmation-candidate-predictions',[{'id':r['id'],'prediction':v} for r,v in zip(rs,cp,strict=True)]);del model
 model=p.AutoModelForSequenceClassification.from_pretrained(ft.SRC,local_files_only=True).to('cpu');ap,asec=p.predict(model,tok,ei,8,'cpu');save('confirmation-A-predictions',[{'id':r['id'],'prediction':v} for r,v in zip(rs,ap,strict=True)])
 candidate={'metrics':p.metrics([r['label'] for r in rs],cp),'seconds':cs};original={'metrics':p.metrics([r['label'] for r in rs],ap),'seconds':asec}
 a=original['metrics'];b=candidate['metrics'];adopt=b['ad_f1']>a['ad_f1'] and b['recall']>=a['recall'] and b['macro4_f1']>=a['macro4_f1'] and b['uncertain_as_ad']<=a['uncertain_as_ad']
 save('confirmation',{'A':original,'candidate':candidate,'truncated':ct,'independent_human_gold':False,'groups':len(rs),'adopt_research_candidate':adopt});save('completed',{'regression_gate':True,'confirmation_opened':True,'adopt':adopt,'production_change':False});print(json.dumps({'confirmation_A':a,'candidate':b,'adopt_research_candidate':adopt}),flush=True)
if __name__=='__main__':main()
