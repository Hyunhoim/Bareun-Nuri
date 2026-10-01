"""Build paired development/training candidates; never open a final evaluation set."""
import collections, csv, hashlib, html, json, random, re, shutil, unicodedata
from pathlib import Path

BASE = Path(__file__).parent
OLD = BASE / 'exaone-ft-data-v2'
OUT = BASE / 'exaone-ft-data-v3'

def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def save(name, value):
    temporary = OUT / (name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(OUT / name)

def normalized(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text)).strip()

def page(row, index):
    e = html.escape
    tag = ['p', 'h3', 'span', 'a', 'div'][row['layout'] % 5]
    # Splitting inline text changes DOM structure but not the target string.
    raw = row['raw_target']; cut = len(raw) // 2
    text = e(raw) if index % 2 else f'<span>{e(raw[:cut])}</span><span>{e(raw[cut:])}</span>'
    target = f'<{tag} id="target" style="{row["target_style"]}">{text}</{tag}>'
    own = f'<p class="own-context">{e(row["rendered_own_context"])}</p>'
    unit = f'<section class="owned">{own + target if index % 3 else target + own}</section>'
    other = f'<section class="reply"><p>{e(row["other_author_context"])}</p></section>'
    body = unit + other if index % 2 else other + unit
    wrap = ['article', 'main', 'div', 'section'][row['layout'] % 4]
    return f'<!doctype html><html lang="ko"><meta charset="utf-8"><title>{e(row["title"])}</title><style>body{{background:white;color:#222;font:16px sans-serif;margin:30px}}p{{white-space:pre-wrap}}</style><h2>{e(row["title"])}</h2><{wrap}>{body}</{wrap}></html>'

def build():
    assert not (OUT / 'dataset.json').exists(), 'Preserve review records; use --audit to check'
    OUT.mkdir(exist_ok=True); (OUT / 'site').mkdir(exist_ok=True)
    seeds = load(BASE / 'exaone-diversity-seeds.json')
    assert len(seeds) == 40
    assert collections.Counter(s['label'] for s in seeds) == {0:16, 1:6, 2:12, 3:6}
    old_bytes = (OLD / 'dataset.json').read_bytes()
    rows = load(OLD / 'dataset.json')
    for r in rows:
        r['naturalness_review'] = 'user_confirmed_existing_v2_2026-09-29'
        r['gold_review'] = 'not_confirmed_by_naturalness_review'
        r['origin_version'] = 'v2'
        r['recommended_group_weight'] = 1 / 10
        shutil.copyfile(OLD / 'site' / (r['id'] + '.html'), OUT / 'site' / (r['id'] + '.html'))

    # Literal-code controls get another valid code, never a guessed restoration.
    controls = {11: [('A4','A5'), ('A3','A4')], 12:[('O2','O3'),('B0','B1')],
                13:[('B0nus','Bonus')], 14:[('B08','B18'),('B09','B19')],
                15:[('자음 ㅇ','자음 ㅇ(이응)')], 17:[('C4RD','CARD')],
                18:[('V1P','VIP')], 19:[('oㅣ쪽','이쪽')]}
    # Numeric cases share a leakage key across contrasting intents.
    families = ['bonus','card','photo','hangul-ieung','time','sample','login','slot',
                'bonus','sample','video','paper-size','device-code','bonus','room-code',
                'hangul-ieung','save','card','vip','hangul-ieung']
    label_position = collections.Counter()
    for i, s in enumerate(seeds):
        layout = label_position[s['label']] % 5
        label_position[s['label']] += 1
        for view in range(2):
            raw = s['target']; ops = []; style = ''; edits = []
            status = s.get('status', 'not_applicable')
            if i < 20:
                changes = s.get('replace') or controls.get(i, [])
                if view:
                    # Simultaneous replacement avoids A4 -> A5 -> A4 cascades.
                    table = dict(changes)
                    if table:
                        raw = re.sub('|'.join(re.escape(x) for x in table), lambda m: table[m[0]], raw)
                    edits = changes
                if status == 'substitution' and ((s.get('replace') and view) or (not s.get('replace') and not view)):
                    ops = ['HOMOGLYPH']
                mode = 'HOMOGLYPH' if ops else 'PLAIN'
            else:
                mode = s['technique'] if view else 'PLAIN'
                if mode == 'JAMO':
                    word = re.search('[가-힣]{2,}', raw)
                    assert word
                    replacement = unicodedata.normalize('NFD', word[0])
                    if i % 2: replacement = '\u200b'.join(replacement)
                    raw = raw[:word.start()] + replacement + raw[word.end():]
                    edits = [[word[0], replacement]]
                elif mode == 'TRANSPARENT':
                    style = ['opacity:0', 'color:transparent', 'color:#fff;background:#fff'][i % 3]
                elif mode == 'OFFSCREEN':
                    style = 'position:absolute;left:-9000px;top:0'
                if view: ops = [mode]
            rid = f'diversity-{i:02}-{view}'
            r = dict(id=rid, group_id=f'diversity-{i:02}',
                     leakage_family=f'digit-{families[i]}' if i < 20 else f'discourse-{i:02}',
                     category=s['category'], suggested_label=s['label'], reviewed_label=None,
                     review_status='pending_gold_review', naturalness_review='new_not_user_reviewed',
                     origin_version='v3', split='train_candidate_only', recommended_group_weight=.5,
                     title=s['title'], plain_target=s['target'], raw_target=raw,
                     own_context=s['own'], rendered_own_context=s['own'], other_author_context=s['other'],
                     layout=layout, position=['body','title','author_bio','link','comment'][layout],
                     mode=mode, intended_techniques=ops, target_style=style,
                     technique_verified=False, dom_collected=False,
                     gold_rationale=s['reason'], digit_technique_status=(
                         'substitution' if 'HOMOGLYPH' in ops else
                         'ambiguous' if status == 'ambiguous' and not view else
                         'not_substitution' if i < 20 else 'not_applicable'),
                     character_mapping=s.get('mapping'), applied_edits=edits,
                     provenance='new fictional text; register inspired by v2 public-source notes',
                     input_draft={'target':raw, 'context_units':[
                         {'relation':'same_author','text':s['own']},
                         {'relation':'other_author','text':s['other']}], 'page_title':s['title']})
            # Neither restored reading, labels nor rationale is part of input_draft.
            rows.append(r)
            (OUT / 'site' / (rid + '.html')).write_text(page(r, i), encoding='utf-8')
    random.Random(290930).shuffle(rows)
    save('dataset.json', rows)
    shutil.copyfile(OLD / 'sources.json', OUT / 'sources.json')
    save('provenance.json', {'v2_sha256':hashlib.sha256(old_bytes).hexdigest(),
         'user_review':'Naturalness of existing v2 confirmed; no inferred gold approval',
         'new_semantic_scenarios':40, 'new_paired_views':80,
         'training_run':False, 'final_holdout_accessed':False,
         'split_policy':'All rows are training candidates, not validation/test. Keep group_id and leakage_family together. Also group v2/v3 shared scenario and lexical families before any future split; prefer separately authored validation sources.'})
    with (OUT / 'review-new.csv').open('w', encoding='utf-8-sig', newline='') as f:
        w=csv.writer(f); w.writerow(['id','target','own_context','other_author_context','reviewed_label','note'])
        for r in rows:
            if r['origin_version']=='v3': w.writerow([r['id'],r['raw_target'],r['rendered_own_context'],r['other_author_context'],'',''])
    save('new-gold-proposals.json', [{k:r[k] for k in ['id','suggested_label','gold_rationale','digit_technique_status','character_mapping','applied_edits']} for r in rows if r['origin_version']=='v3'])
    audit()

def audit():
    rows=load(OUT / 'dataset.json'); old=load(OLD / 'dataset.json')
    old_by_id={r['id']:r for r in old}; new=[r for r in rows if r['origin_version']=='v3']
    assert len(rows)==280 and len(new)==80
    assert collections.Counter(r['suggested_label'] for r in rows)=={0:112,1:42,2:84,3:42}
    assert len({r['id'] for r in rows})==280
    for r in rows:
        if r['id'] in old_by_id:
            for k,v in old_by_id[r['id']].items(): assert r[k]==v, (r['id'],k)
        assert set(r['input_draft'])=={'target','context_units','page_title'}
    keys=[(r['raw_target'],r['rendered_own_context'],r['other_author_context'],r['target_style']) for r in rows]
    assert len(set(keys))==len(keys), 'Duplicate full evidence'
    assert all(r['rendered_own_context'] for r in new if r['suggested_label']==3)
    groups=collections.defaultdict(list)
    for r in new: groups[r['group_id']].append(r)
    assert all(len(g)==2 and g[0]['suggested_label']==g[1]['suggested_label'] for g in groups.values())
    shape={str(label):{'count':sum(r['suggested_label']==label for r in new),
           'empty_own':sum(r['suggested_label']==label and not r['rendered_own_context'] for r in new),
           'layouts':dict(collections.Counter(str(r['layout']) for r in new if r['suggested_label']==label)),
           'mean_target_chars':round(sum(len(r['raw_target']) for r in new if r['suggested_label']==label)/sum(r['suggested_label']==label for r in new),1)} for label in range(4)}
    # Target-only similarity is expected in deliberate contrast pairs. Report it, do not call it independent data.
    target_duplicates=len(new)-len({normalized(r['raw_target']) for r in new})
    signatures=[]
    for r in rows:
        text=normalized(r['raw_target']+' '+r['rendered_own_context']+' '+r['other_author_context'])
        signatures.append(set(text[i:i+5] for i in range(max(0,len(text)-4))))
    close=[]
    for i,a in enumerate(rows):
        for j in range(i):
            b=rows[j]
            if a['group_id']==b['group_id']: continue
            union=signatures[i]|signatures[j]
            similarity=len(signatures[i]&signatures[j])/len(union) if union else 1
            if similarity>=.75: close.append({'ids':[a['id'],b['id']],'fivegram_jaccard':round(similarity,3)})
    save('near-duplicate-review.json',close)
    save('audit.json',{'passed':True,'total':280,'new_rows':80,'new_scenario_groups':40,
        'labels':dict(collections.Counter(r['suggested_label'] for r in rows)),
        'new_modes':dict(collections.Counter(r['mode'] for r in new)),
        'numeric_scenario_groups':20,'full_evidence_duplicates':0,
        'new_repeated_target_count':target_duplicates,'cross_group_near_duplicates':len(close),'new_label_structure':shape,
        'prior_v2_preserved':True,'independent_evaluation':False,
        'limitations':['Pairs are dependent; no row-random split or unweighted claim of 280 independent scenarios.',
          'Legacy v2 template correlations remain; use group weighting and separately sourced validation.',
          'All new uncertain examples have own context; uncertainty/length shortcuts still require model ablation.',
          'Suggested labels and character interpretation need review; browser audit is not production collector validation.',
          'No model training or generalization improvement has been measured.']})
    print(json.dumps(load(OUT / 'audit.json'), ensure_ascii=False))

if __name__=='__main__':
    import sys
    audit() if '--audit' in sys.argv else build()
