"""Label-free Unicode/length probes, separate from advertisement evaluation."""
import importlib.util,json,random,statistics,unicodedata,collections
from pathlib import Path
s=importlib.util.spec_from_file_location('x',Path(__file__).with_name('antispoof-indexed.py'));x=importlib.util.module_from_spec(s);s.loader.exec_module(x)
a=x.a;R=Path('.runtime/antispoof-encoding-properties-v1')
def main():
 R.mkdir(exist_ok=False);tok=a.p.AutoTokenizer.from_pretrained(x.t.R/'scope/model',local_files_only=True);m=a.d.c.mapping()
 def chars(lo,hi):return [chr(n) for n in range(lo,hi+1) if unicodedata.category(chr(n))[0] in 'LMN']
 families={'ascii':chars(0x30,0x7a),'modern_jamo':chars(0x1100,0x1112)+chars(0x1161,0x1175)+chars(0x11a8,0x11c2),'compat_jamo':chars(0x3131,0x3163),'extended_jamo':chars(0xa960,0xa97c)+chars(0xd7b0,0xd7fb),'fullwidth':chars(0xff10,0xff5a),'greek':chars(0x370,0x3ff),'cyrillic':chars(0x400,0x4ff),'combining':chars(0x300,0x36f),'format':['\u200b','\u200c','\u200d','\u2060','\ufeff']}
 samples=[]
 for family,alphabet in families.items():
  for length in [1,4,8,16,32,64,128]:
   for mode in ['repeat','varied']:
    for seed in [17,29,43]:
     rng=random.Random(seed);token=rng.choice(alphabet)*length if mode=='repeat' else ''.join(rng.choices(alphabet,k=length));samples.append({'family':family,'length':length,'mode':mode,'seed':seed,'token':token})
 encoders={'typed':x.t.evidence,'indexed':x.evidence};summary={};collision={}
 for arm,fn in encoders.items():
  texts=['판정대상: [표기]'+r['token']+'[/표기]\n문맥: 문자 비교용 입력.'+fn(r['token'],m) for r in samples]
  encoded=tok(texts,truncation=False,return_token_type_ids=False)['input_ids']
  for r,ids in zip(samples,encoded,strict=True):r[arm+'_tokens']=len(ids)
  summary[arm]={family:{'rows':len(ix),'mean_tokens':statistics.mean(len(encoded[i]) for i in ix),'over512':sum(len(encoded[i])>512 for i in ix),'first_tested_over512_length':min((samples[i]['length'] for i in ix if len(encoded[i])>512),default=None)} for family in families for ix in [[i for i,r in enumerate(samples) if r['family']==family]]}
  groups=collections.defaultdict(list)
  for ch in sorted(set(''.join(sum(families.values(),[]))),key=ord):groups[tuple(tok('판정대상: [표기]'+ch+'[/표기]'+fn(ch,m),add_special_tokens=False)['input_ids'])].append(f'U+{ord(ch):04X}')
  collision[arm]=[v for v in groups.values() if len(v)>1]
 out={'families':{k:len(v) for k,v in families.items()},'rows':len(samples),'summary':summary,'character_collision_groups':{k:len(v) for k,v in collision.items()},'collisions':collision,'newly_over512':sum(r['typed_tokens']<=512<r['indexed_tokens'] for r in samples),'recovered_under512':sum(r['indexed_tokens']<=512<r['typed_tokens'] for r in samples),'api':0,'training':0,'model_inference':0,'scope':'Label-free diagnostic stress probes, not language realism or advertisement F1','script_sha256':a.p.digest(Path(__file__))}
 a.save(R/'summary.json',out);a.save(R/'probes.json',samples);print(json.dumps({k:v for k,v in out.items() if k!='collisions'},ensure_ascii=False))
if __name__=='__main__':main()
