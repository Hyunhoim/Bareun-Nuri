"""Pre-training overlap audit. Never reads sealed confirmation contents."""
import json,unicodedata
from pathlib import Path
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def target(r):return unicodedata.normalize('NFC',r['input']['target'])
def grams(t):return {t[i:i+3] for i in range(max(1,len(t)-2))}
def compare(a,b):
 aa=[(target(r),grams(target(r))) for r in a];bb=[(target(r),grams(target(r))) for r in b];maximum=0;pairs=[]
 for i,(t,gs) in enumerate(aa):
  for j,(u,hs) in enumerate(bb):
   score=len(gs&hs)/len(gs|hs) if gs|hs else 1;maximum=max(maximum,score)
   if score>=.8:pairs.append({'a_id':a[i]['id'],'b_id':b[j]['id'],'similarity':score,'exact':t==u})
 return {'maximum_trigram_jaccard':maximum,'near_pairs':pairs}
def main():
 d=read('local-benchmark/a-ft-new-data.json');old=read('.runtime/klue-cycle3-v1/train.json');evaluation=read('.runtime/klue-input-audit-v2/corrected-inputs.json')+read('.runtime/klue-broad-development-v1/rows.json')+read('.runtime/klue-retention-v1/development.json')
 out={'train_to_development':compare(d['train'],d['development']),'train_to_observed_evaluation':compare(d['train'],evaluation),'old_training_to_new_development':compare(old,d['development']),'seal_contents_read':False}
 Path('.runtime/a-ft-data-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(out))
 assert all(not v['near_pairs'] for v in out.values() if isinstance(v,dict)), 'Review near duplicates before training'
if __name__=='__main__':main()
