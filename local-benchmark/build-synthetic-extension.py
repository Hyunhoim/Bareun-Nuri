"""Build a separate addendum; preserve the original collected corpus."""
import collections, hashlib, importlib.util, json
from pathlib import Path

ROOT=Path('local-benchmark/synthetic-extension-v2')
BASE=Path('local-benchmark/real-ad-corpus-v1/train-candidates.jsonl')
spec=importlib.util.spec_from_file_location('corpus',Path(__file__).with_name('real-ad-corpus.py'))
corpus=importlib.util.module_from_spec(spec);spec.loader.exec_module(corpus)

def dump(name,rows):
    (ROOT/name).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')

def main():
    before=hashlib.sha256(BASE.read_bytes()).hexdigest()
    old=[json.loads(line) for line in BASE.read_text(encoding='utf-8').splitlines()]
    data=json.loads((ROOT/'seeds.json').read_text(encoding='utf-8'))
    rows=[];base=[];seen={json.dumps(r['input'],ensure_ascii=False,sort_keys=True):r['label'] for r in old}
    for i,(category,pattern,pos,pos_context,neg,neg_context,reason) in enumerate(data['pairs']):
        for label,target,context in [(1,pos,pos_context),(0,neg,neg_context)]:
            seed=dict(id=f'extension-{i:02d}-{label}',origin='synthetic_semantic_extension',
                      input={'target':target,'context':context},label=label,category=category,pattern=pattern,
                      reason=reason,parent_id=None,family_id=f'extension-pair-{i:02d}',group_id='synthetic-author-v1',
                      split='train_candidate',human_reviewed=False,annotation_status='assistant_provisional',
                      input_contract='synthetic_owned_context_not_live_collected',technique_observed=None,
                      source_url=None,source_relation='new_fiction_informed_by_observed_patterns_not_a_real_post',augmentation='none')
            base.append(seed)
            for mode in ['none','jamo','fullwidth','confusable','zero_width','spaced']:
                row=dict(seed);row['input']={k:corpus.noisy(v,mode) for k,v in seed['input'].items()}
                if mode!='none':row.update(id=seed['id']+'-'+mode,parent_id=seed['id'],origin='synthetic_surface_extension',augmentation=mode)
                signature=json.dumps(row['input'],ensure_ascii=False,sort_keys=True)
                if signature in seen:
                    assert seen[signature]==row['label'],'Contradictory labels for the same input'
                    continue
                seen[signature]=row['label'];rows.append(row)
    counts=collections.Counter(r['family_id'] for r in rows)
    for r in rows:r['family_weight']=1/counts[r['family_id']]
    review=[dict(id=f'extension-review-{i}',origin='synthetic_ambiguous',category=c,
                 input={'target':t,'context':x},reason=why,label=None,split='review_only',human_reviewed=False,
                 group_id='synthetic-author-v1') for i,(c,t,x,why) in enumerate(data['review_only'])]
    combined=old+rows
    assert len({r['id'] for r in combined})==len(combined)
    assert len({json.dumps(r['input'],ensure_ascii=False,sort_keys=True) for r in combined})==len(combined)
    assert collections.Counter(r['label'] for r in base)=={0:len(data['pairs']),1:len(data['pairs'])}
    by_id={r['id']:r for r in rows}
    for r in rows:
        assert set(r['input'])=={'target','context'} and r['label'] in (0,1)
        assert r['split']=='train_candidate' and r['human_reviewed'] is False
        if r['parent_id']:
            p=by_id[r['parent_id']];assert (r['label'],r['family_id'],r['group_id'])==(p['label'],p['family_id'],p['group_id'])
        assert all('http' not in v and '@' not in v for v in r['input'].values())
    assert all(r['label'] is None for r in review)
    for name,items in [('semantic-base.jsonl',base),('addendum.jsonl',rows),('review-only.jsonl',review),('combined-train-candidates.jsonl',combined)]:dump(name,items)
    summary=dict(passed=True,old_rows=len(old),new_semantic_pairs=len(data['pairs']),new_semantic_rows=len(base),
                 addendum_rows=len(rows),combined_rows=len(combined),new_review_only=len(review),
                 categories=dict(collections.Counter(r['category'] for r in base)),
                 exact_same_target_opposite_context_pairs=sum(p[2]==p[4] and p[3]!=p[5] for p in data['pairs']),
                 addon_label_counts=dict(collections.Counter(r['label'] for r in rows)),
                 old_file_sha256=before,real_source_count_increased=False,independent_holdout_rows=0,
                 model_training_performed=False,accuracy_improvement_verified=False,
                 limitations=['one synthetic author','provisional labels','not live collected inputs','same source gaps as v1'])
    assert hashlib.sha256(BASE.read_bytes()).hexdigest()==before
    (ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
