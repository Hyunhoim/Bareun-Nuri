"""Phase 2 evaluation data only. No inference, training, or network access."""
import collections
import hashlib
import html
import importlib.util
import itertools
import json
from pathlib import Path
import random
import re

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
spec = importlib.util.spec_from_file_location('phase1_helpers', REPO/'test-set-operating-phase1/build.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
TECH = ['HOMOGLYPH', 'JAMO', 'TRANSPARENT', 'OFFSCREEN']
PAIRS = list(itertools.combinations(TECH, 2))
SEED = 209302


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def disguise(token, index):
    mode = index % 5
    if mode == 0:
        changed = ''.join(helper.HOMO.get(c, c) for c in token)
        kind = 'latin-cyrillic-visual'
    elif mode == 1:
        changed, kind = helper.fullwidth(token), 'fullwidth'
    else:
        maps = [{'O':'0', 'I':'1'}, {'A':'4', 'E':'3'}, {'I':'Ι', 'A':'Α', 'E':'Ε', 'O':'Ο', 'B':'Β', 'P':'Ρ'}]
        m = maps[mode-2]
        changed = ''.join(m.get(c, c) for c in token)
        kind = ['digit-0-1', 'digit-4-3', 'latin-greek-visual'][mode-2]
        if changed == token:
            changed = ''.join(helper.HOMO.get(c, c) for c in token)
            kind = 'latin-cyrillic-visual'
    assert changed != token, token
    return changed, kind


def transformed(text, latin, korean, techniques, index):
    edits = []
    for tech, original in [('HOMOGLYPH', latin), ('JAMO', korean)]:
        if tech not in techniques:
            continue
        if tech == 'HOMOGLYPH':
            replacement, kind = disguise(original, index)
        else:
            kind = ['compat', 'nfd', 'compat-spaces', 'partial-syllables'][index % 4]
            replacement = helper.jamo(original, kind)
        start = text.index(original)
        text = text[:start] + replacement + text[start+len(original):]
        edits.append({'technique':tech, 'kind':kind, 'original':original, 'replacement':replacement,
                      'start_codepoint':start, 'codepoints':[f'U+{ord(c):04X}' for c in replacement],
                      'evidence_origin':'synthetic_known_transformation_not_inferred_from_ad_intent'})
    return text, edits


def document(body, title='시민 소통 게시판'):
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(title)+'</title><link rel="stylesheet" href="/site.css"></head><body><header><strong>시민 소통 누리집</strong><nav><a href="/index.html">처음으로</a> · <a href="/board/index.html">이용자 게시판</a></nav></header><main>'+body+'</main><footer>개인정보를 댓글에 남기지 마세요.</footer><script src="/comments.js"></script></body></html>'


def render_case(row):
    text = row['target_text']
    if row['split_inline']:
        content = ''.join('<span>'+html.escape(text[i:i+9])+'</span>' for i in range(0,len(text),9))
    else:
        content = html.escape(text)
    css = ';'.join(s['css'] for s in row['style_evidence'])
    tag = {'body':'p','comment':'p','reply':'div','title':'h3','link':'a'}[row['slot']]
    attrs = f'id="n{row["id"]}" class="message" style="{css}"'
    if tag == 'a':
        attrs += ' href="#contact"'
    target = f'<{tag} {attrs}>{content}</{tag}>'
    before = '<p>'+html.escape(row['context_before'])+'</p>' if row['context_before'] else ''
    after = '<p>'+html.escape(row['context_after'])+'</p>' if row['context_after'] else ''
    owner = f'<div class="byline">이용자 · 09:30</div>{before}{target}{after}'
    key = row['scope_selector'][1:]
    if row['layout_kind'] == 'board-table':
        return f'<table id="{key}" class="post"><tbody><tr><th scope="row">내용</th><td>{owner}</td></tr></tbody></table>'
    if row['layout_kind'] == 'comment-list':
        return f'<ul class="comments"><li id="{key}" class="comment">{owner}</li></ul>'
    if row['layout_kind'] == 'article-reply':
        return f'<article id="{key}" class="reply">{owner}</article>'
    return f'<section id="{key}" class="post">{owner}</section>'


def build():
    status_path = ROOT/'private/status.json'
    if status_path.exists():
        status = json.loads(status_path.read_text(encoding='utf-8'))
        assert status['evaluation_runs'] == 0 and status['training_runs'] == 0, 'Consumed version must not be overwritten'
    raw = [line.split('|') for line in (ROOT/'cases.txt').read_text(encoding='utf-8').splitlines() if line and not line.startswith('#')]
    assert len(raw) == 100, len(raw)
    assert all(len(x) == 6 for x in raw)
    assert len({s for x in raw for s in x[4:]}) == 200
    sources = {s['id'] for s in json.loads((ROOT/'sources.json').read_text(encoding='utf-8'))['sources']}
    rows = []
    style_indices = {'TRANSPARENT':0, 'OFFSCREEN':0}
    for i, (domain, source, latin, korean, ad, normal) in enumerate(raw):
        assert source in sources
        assert all(latin in t and korean in t for t in (ad, normal)), (i, latin, korean)
        configs = [(TECH[i % 4],), (TECH[(i+1) % 4],)] + [PAIRS[(i*3+j) % 6] for j in range(3)]
        for variant, techniques in enumerate(configs):
            styles = []
            for tech in ('TRANSPARENT','OFFSCREEN'):
                if tech in techniques:
                    kind, css = helper.STYLES[tech][style_indices[tech] % 4]
                    style_indices[tech] += 1
                    styles.append({'technique':tech,'kind':kind,'css':css,'scope':'target'})
            for label, base in [(True, ad), (False, normal)]:
                identifier = hashlib.sha256(f'phase2:{i}:{variant}:{label}:{SEED}'.encode()).hexdigest()[:14]
                text, edits = transformed(base, latin, korean, techniques, i+variant)
                # The target is sometimes only the first sentence; the rest remains in the SAME author scope.
                target, after = text, ''
                if variant in (1, 3) and '. ' in text:
                    target, after = text.split('. ', 1)
                    target += '.'
                    # All labelled character evidence must remain on the target, not just neighbouring prose.
                    if any(e['replacement'] not in target for e in edits):
                        target, after = text, ''
                slot = ['body','comment','reply','title','link'][(i+variant)%5]
                rows.append({'id':identifier,'group_id':f'scenario-{i+1:03}', 'variant':variant,
                    'domain':domain,'source_ids':[source]+(['PUBLIC_REPORT'] if domain in ('drugs','illegal_trade') else []),
                    'authorship':'new_synthetic_source_structure_informed', 'is_violation':label,
                    'base_text':base,'target_text':target,'context_before':'','context_after':after,
                    'techniques':list(techniques), 'finding_techniques':list(techniques) if label else [],
                    'text_transformations':edits,'style_evidence':styles,'slot':slot,
                    'scope_selector':'#u'+identifier,'target_selector':'#n'+identifier,
                    'split_inline':(i+variant)%3==0,'dynamic':i%5==0 and variant==4,
                    'iframe':i%10==0 and variant==3,
                    'layout_kind':['board-table','comment-list','article-reply','board-section'][(i+variant)%4],
                    'evaluation_track':'four_technique','label_status':'author_assigned_not_independently_human_reviewed',
                    'label_reason': '같은 작성자가 이용·거래를 권유함' if label else '같은 작성자가 삭제·피해 상담·교육·자료 또는 정상 용도에 관해 문의함',
                    'technique_origin':'organizer_rule_synthetic_not_observed_source_style'})
    rng = random.Random(SEED)
    rng.shuffle(rows)
    public = ROOT/'public'
    (public/'board').mkdir(parents=True,exist_ok=True)
    (public/'frames').mkdir(exist_ok=True)
    css = 'body{font:16px/1.65 system-ui,sans-serif;color:#243044;background:#f1f4f8;margin:0}header,main,footer{max-width:1000px;margin:auto;padding:24px}header{background:#153e68;color:white}header a{color:white}nav{margin-top:8px}main{background:white}.post,.reply,.comments{border-bottom:1px solid #ccd4df;margin:0;padding:20px;width:100%;box-sizing:border-box}th{width:65px;text-align:left}td{padding:12px}.byline{font-size:13px;color:#687587}.message{font-size:16px;font-weight:normal;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65}.message span{color:inherit;background:transparent;font:inherit}.comments{list-style:none}iframe{width:100%;height:300px;border:1px solid #ccd4df}a{color:#174f90}h1{font-size:24px}footer{font-size:13px}'
    (public/'site.css').write_text(css,encoding='utf-8')
    (public/'comments.js').write_text('setTimeout(()=>{for(const t of document.querySelectorAll("template")){t.replaceWith(t.content.cloneNode(true));}},120);',encoding='utf-8')
    links = []
    for page_number in range(100):
        page_rows = rows[page_number*10:(page_number+1)*10]
        page_path = f'/board/view-{page_number+1:03}.html'
        title = ['이용 문의','자유게시판','자료 나눔','행사 안내와 이용자 의견'][page_number%4]
        body = '<h1>'+title+'</h1><p>게시물과 이용자 의견을 확인할 수 있습니다.</p>'
        for row in page_rows:
            row['page_path'] = page_path
            row['frame_path'] = f'/frames/{row["id"]}.html' if row['iframe'] else None
            row['location'] = row['target_selector']
            if row['iframe']:
                row['location'] = '#f'+row['id']+' >>> '+row['target_selector']
            content = render_case(row)
            if row['iframe']:
                (public/row['frame_path'].lstrip('/')).write_text(document(content,'이용자 의견'),encoding='utf-8')
                content = f'<iframe id="f{row["id"]}" src="{row["frame_path"]}" title="이용자 의견"></iframe>'
            elif row['dynamic']:
                content = '<template>'+content+'</template>'
            body += content
        if page_number < 99:
            body += f'<a href="/board/view-{page_number+2:03}.html">다음 글</a>'
        (public/page_path.lstrip('/')).write_text(document(body,title),encoding='utf-8')
        links.append(f'<li><a href="{page_path}">{page_number+1}. {title}</a></li>')
    (public/'board/index.html').write_text(document('<h1>이용자 게시판 목록</h1><ol>'+''.join(links)+'</ol>'),encoding='utf-8')
    (public/'index.html').write_text(document('<h1>시민 소통 누리집</h1><p>게시판 글과 댓글을 확인하세요.</p><a href="/board/index.html">게시판 목록</a>'),encoding='utf-8')
    private = ROOT/'private'
    private.mkdir(exist_ok=True)
    (private/'gold.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')
    inputs = [{k:r[k] for k in ('id','target_text','context_before','context_after','page_path','frame_path','target_selector','scope_selector')} for r in rows]
    (ROOT/'inputs.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in inputs),encoding='utf-8')
    write_json(private/'status.json',{'name':'운영 테스트 Phase 2','version':'1.0','evaluation_runs':0,'training_runs':0,
        'usage':'evaluation_only_do_not_train','independent_human_label_review':False,'model_quality_not_measured':True})
    old = [json.loads(line) for line in (REPO/'test-set-operating-phase1/private/gold.jsonl').read_text(encoding='utf-8').splitlines()]
    old_text = {r['target_text'] for r in old}
    assert not any(r['target_text'] in old_text for r in rows), 'Exact Phase1 target reused'
    assert len(rows) == len({r['id'] for r in rows}) == 1000
    distribution = {}
    for label, name in [(True,'ads'),(False,'normal')]:
        selected = [r for r in rows if r['is_violation'] == label]
        assert len(selected) == 500
        counts = collections.Counter(t for r in selected for t in r['techniques'])
        assert set(counts.values()) == {200}, counts
        assert sum(len(r['techniques'])==2 for r in selected) == 300
        distribution[name] = {'count':len(selected),'techniques':dict(counts),
            'single':200,'combined':300,'domains':dict(collections.Counter(r['domain'] for r in selected)),
            'combinations':dict(collections.Counter('+'.join(r['techniques']) for r in selected))}
    for r in rows:
        assert all(e['replacement'] in r['target_text'] for e in r['text_transformations'])
    for p in public.rglob('*.html'):
        text = p.read_text(encoding='utf-8')
        assert not re.search(r'https?://|is_violation|HOMOGLYPH|JAMO|TRANSPARENT|OFFSCREEN|scenario-',text), p
    quality = {'rows':1000,'scenario_groups':100,'distinct_authored_semantic_messages':200,
        'independent_scraped_messages':0,'distribution':distribution,'phase1_exact_target_overlap':0,
        'main_pages':102,'iframe_documents':20,'dynamic_rows':40,
        'paired_variants_not_independent':True,'human_review_complete':False,
        'same_author_generator_bias_possible':True,'model_calls':0,'checks':'counts, IDs, source IDs, text edits, label-free public HTML, exact Phase1 overlap'}
    quality['authored_lengths'] = {name: {'min':min(lengths),'median':sorted(lengths)[len(lengths)//2], 'max':max(lengths)}
        for name,lengths in [('ads',[len(x[4]) for x in raw]),('normal',[len(x[5]) for x in raw])]}
    quality['context_separated_rows'] = sum(bool(r['context_after']) for r in rows)
    quality['character_variants'] = dict(collections.Counter(e['kind'] for r in rows for e in r['text_transformations']))
    quality['styles'] = dict(collections.Counter(e['kind'] for r in rows for e in r['style_evidence']))
    quality['slots'] = dict(collections.Counter(r['slot'] for r in rows))
    write_json(ROOT/'quality.json',quality)
    examples = sorted(rows,key=lambda r:(r['group_id'],r['variant'],not r['is_violation']))
    preview = ['# Phase 2 원고 확인', '', '전체 1,000개는 gold.jsonl에 있으며 아래는 기법별 대표 발췌다. **정답 포함: 탐지 입력으로 제공하지 않는다.**','']
    chosen = []
    preview_combos = [('HOMOGLYPH','OFFSCREEN'),('JAMO','TRANSPARENT'),('HOMOGLYPH','JAMO'),('TRANSPARENT','OFFSCREEN'),('JAMO','OFFSCREEN')]
    for domain, combo in zip(('gambling','drugs','illegal_adult','sex_trade','illegal_trade'),preview_combos):
        for label in (True,False):
            chosen.append(next(r for r in examples if r['domain']==domain and r['is_violation']==label and tuple(r['techniques'])==combo))
    for n,r in enumerate(chosen,1):
        preview += [f'## {n}. {r["domain"]} / '+('광고' if r['is_violation'] else '정상'),
                    f'- 기법: {", ".join(r["techniques"])}',f'- 위치: {r["slot"]}',
                    '- CSS: '+('; '.join(s['css'] for s in r['style_evidence']) or '없음'),'',
                    '> '+r['target_text'],'','같은 작성자 뒤 문맥: '+(r['context_after'] or '(대상 안에 전체 문맥 포함)'), '']
    (private/'preview.md').write_text('\n'.join(preview),encoding='utf-8')
    seal()
    print(json.dumps(quality,ensure_ascii=False,indent=2))


def seal():
    files = [ROOT/'cases.txt',ROOT/'sources.json',ROOT/'inputs.jsonl',ROOT/'private/gold.jsonl',ROOT/'build.py']+sorted((ROOT/'public').rglob('*'))
    write_json(ROOT/'manifest.json',{'name':'운영 테스트 Phase 2','version':'1.0','seed':SEED,
        'helper_path':'../test-set-operating-phase1/build.py','helper_sha256':digest(REPO/'test-set-operating-phase1/build.py'),
        'files':{str(p.relative_to(ROOT)).replace('\\','/'):digest(p) for p in files if p.is_file()}})


if __name__ == '__main__':
    build()
