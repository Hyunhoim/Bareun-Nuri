"""Training-fit diagnosis only. Never counts as generalization evidence."""
import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('a',Path(__file__).with_name('antispoof-scope.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
def main():
 root=Path('.runtime/antispoof-sparse-v1');rows=a.read(root/'train-inputs.json');gold=a.read(root/'train-gold.json');source=root/'scope/model';a.torch.set_num_threads(8)
 model=a.p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True).to('cuda').eval();tok=a.p.AutoTokenizer.from_pretrained(source,local_files_only=True)
 enc,lens=a.d.encoded(tok,rows);assert max(lens)<=512;ps=a.predict(model,tok,enc)
 result={'rows':len(rows),'exact':sum(g['labels']==v for g,v in zip(gold,ps,strict=True)),'by_kind':{}}
 for kind in sorted(set(g['kind'] for g in gold)):
  pairs=[(g,v) for g,v in zip(gold,ps,strict=True) if g['kind']==kind]
  result['by_kind'][kind]={'n':len(pairs),'exact':sum(g['labels']==v for g,v in pairs),'H_positive_expected':sum(g['labels'][1]==0 for g,v in pairs),'H_positive_found':sum(g['labels'][1]==0 and v[1]==0 for g,v in pairs),'H_false':sum(g['labels'][1]!=0 and v[1]==0 for g,v in pairs)}
 a.save(root/'training-fit-audit.json',result);print(result)
if __name__=='__main__':main()
