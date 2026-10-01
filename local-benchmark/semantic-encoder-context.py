"""Reuse the fixed trainer; change only truncation to preserve both fields."""
import importlib.util,collections,unicodedata
from pathlib import Path
s=importlib.util.spec_from_file_location('e',Path(__file__).with_name('semantic-encoder.py'))
e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
ORIGINAL=e.R;ROOT=Path('.runtime/semantic-encoder-context-v1');original_encode=e.encode

def encode(tok,rows,limit):
    original,stats=original_encode(tok,rows,limit);result=[];kept=[]
    for row,old in zip(rows,original,strict=True):
        prefix='판정대상: '+unicodedata.normalize('NFC',row['input']['target'])
        text=prefix+'\n문맥: '+unicodedata.normalize('NFC',row['input']['context'])
        full=tok(text,add_special_tokens=False,return_offsets_mapping=True,return_token_type_ids=False)
        ids=full['input_ids'];budget=limit-tok.num_special_tokens_to_add(pair=False)
        if len(ids)<=budget:
            result.append(old);continue
        boundary=len(prefix)+1
        cut=next(i for i,(a,b) in enumerate(full['offset_mapping']) if a>=boundary)
        target,context=ids[:cut],ids[cut:]
        reserve=min(96,len(context));nt=min(len(target),budget-reserve);nc=min(len(context),budget-nt)
        assert nt>0 and nc>0
        selected=tok.build_inputs_with_special_tokens(target[:nt]+context[:nc]);assert len(selected)<=limit
        result.append({'input_ids':selected,'attention_mask':[1]*len(selected)})
        kept.append(dict(id=row['id'],target_kept=nt,target_total=len(target),context_kept=nc,context_total=len(context)))
    stats.update(policy='context_reserve96_target_remainder',changed_rows=len(kept),allocations=kept)
    return result,stats

def main():
    assert (ORIGINAL/'completed.json').exists(),'Wait for original nine conditions'
    ROOT.mkdir(exist_ok=False);e.verify();train,dev,_=e.rows();audit={}
    for name,folder in e.BASES.items():
        tok=e.p.AutoTokenizer.from_pretrained(folder,local_files_only=True)
        enc,stats=encode(tok,train,256);de,ds=encode(tok,dev,256);olddev,_=original_encode(tok,dev,256)
        assert de==olddev and all(len(x['input_ids'])<=256 for x in enc)
        groups=collections.defaultdict(set)
        for row,x in zip(train,enc,strict=True):groups[tuple(x['input_ids'])].add(row['label'])
        conflicts=sum(len(labels)>1 for labels in groups.values())
        audit[name]=dict(train=stats,dev=ds,conflict_groups=conflicts,token_unique=len(groups))
        assert conflicts==0,'Context allocation still leaves contradictory token inputs'
    e.save(ROOT/'input-audit.json',audit)
    manifest=e.read(ORIGINAL/'manifest.json')
    manifest['files'].update({str(f):e.p.digest(f) for f in [Path(__file__),Path('docs/semantic-encoder-context-plan.md')]})
    manifest['parent_manifest_sha256']=e.p.digest(ORIGINAL/'manifest.json');manifest['input_policy']='context_reserve96_target_remainder'
    e.save(ROOT/'manifest.json',manifest);e.R=ROOT;e.encode=encode
    original_score=e.v.score
    e.v.score=lambda path,name:original_score(path,'context/'+name)
    for name in e.BASES:e.train_one(name,8,256)
    e.save(ROOT/'completed.json',{'runs':3,'input_conflicts':0,'production_changed':False})

if __name__=='__main__':main()
