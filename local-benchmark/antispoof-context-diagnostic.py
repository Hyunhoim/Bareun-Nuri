"""Explicitly artificial context interventions; not an operational evaluation."""
import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('a',Path(__file__).with_name('antispoof-scope.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
R=Path('.runtime/antispoof-context-diagnostic-v1')
def main():
 R.mkdir(exist_ok=False);rows=[]
 for plain,changed in [('alpine','4lpine'),('cypress','cypr3ss'),('badger','b4dger'),('dolphin','d0lphin'),('emerald','3merald'),('falcon','falc0n')]:
  pos=next(i for i,(x,y) in enumerate(zip(plain,changed,strict=True)) if x!=y)
  for neighbor in ['', 'ㅎㅏㄱㄱㅛ ']:
   for mode,context in [('original','이용 안내'),('explicit_substitution',f'문자 표기 점검 기록: 원래 영단어 {plain}의 {pos+1}번째 글자 {plain[pos]} 대신 숫자 {changed[pos]}를 넣어 {changed}로 표시했다.'),('literal_identifier',f'제품 대장 기록: {changed}는 처음부터 이 문자와 숫자로 부여한 식별번호다. 영어 단어를 바꾸거나 글자를 대신 쓴 표기가 아니다.')]:
    rows.append({'id':str(len(rows)),'token':changed,'neighbor_jamo':bool(neighbor),'mode':mode,'input':{'target':neighbor+'[표기]'+changed+'[/표기]','context':context}})
 a.save(R/'inputs.json',rows);a.torch.set_num_threads(8);summary={}
 for arm,path in [('baseline',Path('agent/models/kcelectra-antispoof-v1')),('sparse',Path('.runtime/antispoof-sparse-v1/scope/model'))]:
  model=a.p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda').eval();tok=a.p.AutoTokenizer.from_pretrained(path,local_files_only=True);enc,lens=a.d.encoded(tok,rows);assert max(lens)<=512
  ps=a.predict(model,tok,enc);a.save(R/(arm+'-predictions.json'),ps);counts=[]
  for neighbor in [False,True]:
   for mode in ['original','explicit_substitution','literal_identifier']:
    labels=[v for r,v in zip(rows,ps,strict=True) if r['neighbor_jamo']==neighbor and r['mode']==mode];counts.append({'neighbor_jamo':neighbor,'context':mode,'n':len(labels),'J_present':sum(v[0]==0 for v in labels),'H_present':sum(v[1]==0 for v in labels),'H_absent':sum(v[1]==1 for v in labels),'H_uncertain':sum(v[1]==2 for v in labels)})
  summary[arm]=counts;del model;a.torch.cuda.empty_cache()
 pins=a.read(a.R/'operating-before.json');assert all(a.p.digest(Path(f))==h for f,h in pins.items())
 a.save(R/'summary.json',summary);a.save(R/'audit.json',{'intervention_not_performance':True,'training':0,'api':0,'final860_access':False,'plan_sha256':a.p.digest(Path('docs/antispoof-context-diagnostic-plan.md'))});print(summary,flush=True)
if __name__=='__main__':main()
