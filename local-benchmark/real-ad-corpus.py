"""Bounded, read-only HTML corpus capture. Never visits advertiser destinations."""
import argparse, collections, datetime, hashlib, json, re, time, unicodedata
import html as H
import urllib.parse as U
import urllib.request as R
from pathlib import Path
from lxml import html

ROOT = Path('local-benchmark/real-ad-corpus-v1')
def sha(x): return hashlib.sha256(x if isinstance(x, bytes) else x.encode()).hexdigest()
def save(name, obj):
    p = ROOT / name; p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')
def clean(e):
    return '\n'.join(t.strip() for t in e.itertext() if t.strip())
def parse(text):
    d=html.fromstring(text)
    for e in d.xpath('//script|//style|//noscript'): e.drop_tree()
    return d
def fetch(url, scope):
    ident = sha(url)[:16]; meta = ROOT / 'sources' / (ident + '.json')
    if meta.exists():
        m = json.loads(meta.read_text(encoding='utf-8'))
        if not m.get('raw_file'): return m,None
        text=(ROOT/m['byte_file']).read_bytes().decode(m['encoding'])
        # Preserve CR/LF exactly on Windows; byte originals remain authoritative.
        (ROOT/m['raw_file']).write_bytes(text.encode('utf-8'))
        return m,parse(text)
    m = dict(id=ident, url=url, source_scope=scope, captured_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), rights_status='unverified_third_party_content', human_reviewed=False)
    try:
        # A redirect must stay on the requested host; outbound advertisements are never fetched.
        class Redirect(R.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                if U.urlsplit(newurl).hostname != U.urlsplit(url).hostname: raise ValueError('cross-host redirect refused')
                return super().redirect_request(req, fp, code, msg, headers, newurl)
        with R.build_opener(Redirect).open(R.Request(url, headers={'User-Agent':'PublicAdResearch/1.0 (read-only text collection)'}), timeout=18) as r:
            raw = r.read(3_000_001)
            if len(raw)>3_000_000: raise ValueError('HTML size limit')
            if 'html' not in r.headers.get('Content-Type',''): raise ValueError('non-HTML response')
            encoding = r.headers.get_content_charset() or 'utf-8'
        try: text = raw.decode(encoding)
        except UnicodeDecodeError: encoding='cp949';text = raw.decode(encoding)
        path = ROOT / 'raw' / (ident+'.html'); path.parent.mkdir(exist_ok=True)
        path.write_bytes(text.encode('utf-8'))
        (ROOT/'raw'/(ident+'.bin')).write_bytes(raw)
        m.update(raw_file='raw/'+ident+'.html', byte_file='raw/'+ident+'.bin', response_sha256=sha(raw), decoded_sha256=sha(text), encoding=encoding, status='captured')
        d = parse(text)
        m['page_title'] = ' '.join(d.xpath('//title/text()'))
    except Exception as e:
        m.update(status='failed', error=str(e)); d=None
    save('sources/'+ident+'.json',m)
    time.sleep(.2)
    return m,d

def links(d,base,predicate):
    return list(dict.fromkeys(U.urljoin(base,a.get('href')) for a in d.xpath('//a[@href]') if predicate(a.get('href'),a.text_content()) and U.urlsplit(U.urljoin(base,a.get('href'))).hostname==U.urlsplit(base).hostname))

def capture():
    ROOT.mkdir(parents=True, exist_ok=True)
    jobs=[]
    start='https://gen.go.kr/child/xboard/board.php?mode=list&tbnum=6'
    m,d=fetch(start,'government_board_index')
    if d is not None:
        indexes=[start]+links(d,start,lambda h,t:'page=' in h and t.strip() in ['2','3','4'] and 'tbnum=6' in h)
        seen=set()
        for url in list(dict.fromkeys(indexes))[:5]:
            _,tree=fetch(url,'government_board_index')
            if tree is None: continue
            for detail in links(tree,url,lambda h,t:'mode=view' in h and 'number=' in h and bool(t.strip())):
                key=U.parse_qs(U.urlsplit(detail).query).get('number',[detail])[0]
                if key not in seen: jobs.append((detail,'government_board','gen'));seen.add(key)
    start='https://babychu.co.kr/board/index.html'
    _,d=fetch(start,'private_board_index')
    if d is not None:
        jobs += [(u,'private_board','cafe24') for u in links(d,start,lambda h,t:'/read.html?' in h)][:18]
    jobs.append(('https://www.ntck.or.kr/ko/community/freeBoard/49484/view','public_cultural_institution_board','ntck'))
    for start,scope in [('https://kaum.or.kr/bbs/board.php?bo_table=free&page=721','museum_association_board'),('https://www.lifefood.or.kr/bbs/board.php?bo_table=free&page=38','private_company_board')]:
        _,d=fetch(start,scope+'_index')
        if d is not None:
            jobs += [(u,scope,'gnuboard') for u in links(d,start,lambda h,t:'wr_id=' in h and 'bo_table=free' in h and bool(t.strip()))][:20]
    seeds=[
      ('https://www.bspolice.go.kr/view.do?idx=51841&no=71&view=view','official_prevention'),
      ('https://www.fsc.go.kr/edu/news/85870','official_prevention'),
      ('https://www.gg.go.kr/woman/contents/contents.do?ciIdx=1253&menuId=3439','official_support'),
      ('https://eclass.jeju.go.kr/board.do?act=detail&idx=333&menuPos=25&pageIndex=1&searchValue1=0','official_education'),
      ('https://www.togetherschool.go.kr/playGround/playNotice/detailView?%3FsrchType=TITLE&pageNum=1&pstId=65980','official_prevention'),
      ('https://www.yuseonggucouncil.go.kr/bbs/board.php?bo_table=0704&page=97&wr_id=916','government_board'),
      ('https://www.daejeon.go.kr/drh/board/boardNormalView.do?boardId=normal_0167&menuSeq=1547&ntatcSeq=1033258','government_board'),
      ('https://www.jeongseon.go.kr/portal/openadmin/communication/residentsboard/freeboard?articleSeq=65787','government_board'),
      ('https://www.jeongseon.go.kr/portal/openadmin/communication/residentsboard/freeboard?articleSeq=236755','government_board'),
      ('https://hrd.jeonbuk.go.kr/board/view.training?boardId=BBS_0000016&dataSid=13044&menuCd=DOM_000000103001000000&startPage=4','government_board'),
      ('https://hrd.jeonbuk.go.kr/board/view.training?boardId=BBS_0000016&dataSid=13046&menuCd=DOM_000000103001000000&startPage=6','government_board'),
      ('https://www.uac.or.kr/newuac/community/community_06D.php?NUMBER=1989','public_cultural_institution_board'),
    ]
    jobs += [(u,s,'manual') for u,s in seeds]
    for url,scope in seeds:
        if 'hrd.jeonbuk' not in url: continue
        _,d=fetch(url,scope)
        if d is not None:
            jobs += [(u,scope,'jeonbuk') for u in links(d,url,lambda h,t:'view.training' in h and 'dataSid=' in h and bool(t.strip()))][:10]
    records=[]
    for url,scope,kind in list(dict.fromkeys(jobs))[:135]:
        m,d=fetch(url,scope)
        if d is None:continue
        x={
          'gen': ('//*[@id="xb_view"]//tr[1]/td[1]','//*[@id="xb_view"]//td[@class="con_box"]'),
          'ntck': ('//*[contains(@class,"boardView")]//li[1]','//div[@class="boardContent"]'),
          'cafe24': ('//div[@class="boardView"]//tr[1]/td','//div[contains(concat(" ",normalize-space(@class)," ")," detail ")]'),
          'gnuboard': ('//*[@id="bo_v_title"]','//*[@id="bo_v_con"]'),
          'jeonbuk': ('//div[@class="board_view02"]/*[1]','//div[@class="board_content"]'),
        }.get(kind)
        if kind=='manual':
            host=U.urlsplit(url).hostname
            x={
              'www.bspolice.go.kr': ('//title','//div[@class="board_subject chxss"]'),
              'www.fsc.go.kr': ('//title','//div[@class="view_cont"]'),
              'www.gg.go.kr': ('//title','//*[@id="result"]'),
              'eclass.jeju.go.kr': ('//strong[@class="tit top"]','//div[@class="board_view_con"]'),
              'www.jeongseon.go.kr': ('//div[@class="skinTb-td skinTb-sbj"]','//div[@class="skinTb-td skinTb-conts"]'),
              'www.togetherschool.go.kr': ('//title','//dl[@class="body_txt"]/dd'),
              'hrd.jeonbuk.go.kr': ('//div[@class="board_view02"]/*[1]','//div[@class="board_content"]'),
              'www.uac.or.kr': ('//title','//div[@class="contract_group"]'),
            }.get(host)
        if not x:
            save('pages/'+m['id']+'.json',dict(source=m, text=clean(d), status='needs_scoped_extraction'))
            continue
        ts,bs=d.xpath(x[0]),d.xpath(x[1])
        if len(bs)!=1:
            save('pages/'+m['id']+'.json',dict(source=m,status='body_not_unique',count=len(bs)));continue
        body=bs[0];raw=clean(body)
        title=clean(ts[0]) if ts else m['page_title']
        r=dict(id=m['id'],source=m, title=title, raw_text=raw, body_xpath=d.getroottree().getpath(body), title_xpath=d.getroottree().getpath(ts[0]) if ts else None,
               source_kind='real_web_post', extraction='static_HTML_lxml_itertext', comments_status='not_extracted_or_labeled', technique_observed=None,
               body_sha256=sha(raw), label=None, human_reviewed=False,
               outgoing_links=[{'text':clean(a),'href':a.get('href')} for a in body.xpath('.//a[@href]')],
               notes='No CSS technique claim from static text; listed neighbours are excluded from owned context.')
        records.append(r); save('records/'+m['id']+'.json',r)
        print(json.dumps({'id':m['id'],'title':title[:70],'chars':len(raw)},ensure_ascii=False),flush=True)
    save('inventory.json',records)
    print('CAPTURED POSTS',len(records),flush=True)

def read(name): return json.loads((ROOT/name).read_text(encoding='utf-8'))
def jsonl(name,rows):
    (ROOT/name).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')

def redact(s):
    s=re.sub(r'https?://[^\s<>"\u300b]+','[URL]',s,flags=re.I)
    s=re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}','[EMAIL]',s)
    s=re.sub(r'@[\w.\-Øø]+','[CONTACT]',s)
    s=re.sub(r'(?<!\w)(?:[\w-]+\.)+(?:com|net|org|kr|co|me|top|shop|at)(?:/[^\s<>]*)?','[URL]',s,flags=re.I)
    s=re.sub(r'(?<!\d)0\d{1,2}[)\- .]?\d{3,4}[\- .]?\d{4}(?!\d)','[PHONE]',s)
    s=re.sub(r'(가입코드\s*)\d+',r'\1[CODE]',s)
    return s

def excerpt(s,limit=560):
    if len(s)<=limit:return s
    end=max(s.rfind('\n',100,limit),s.rfind('. ',100,limit))
    return s[:end+1 if end>100 else limit]

def noisy(s,mode):
    if mode=='jamo':
        # Sparse NFD is deterministic and reversible, without guessing intended words.
        return ''.join(unicodedata.normalize('NFD',ch) if i%7==0 and '가'<=ch<='힣' else ch for i,ch in enumerate(s))
    if mode=='fullwidth':return ''.join(chr(ord(ch)+0xFEE0) if ch.isascii() and ch.isalnum() else ch for ch in s)
    if mode=='confusable':return s.translate(str.maketrans({'a':'а','e':'е','o':'о','c':'с','p':'р','A':'Α','B':'Β','E':'Ε','O':'О'}))
    if mode=='zero_width':return ''.join(ch+('\u200b' if i%19==7 and ch.isalnum() else '') for i,ch in enumerate(s))
    if mode=='spaced':return ''.join(ch+(' ' if i%23==9 and '가'<=ch<='힣' else '') for i,ch in enumerate(s))
    return s

def build():
    records=list({r['id']:r for r in read('inventory.json')}.values())
    config=read('annotation-seeds.json');ann={};review_ann={}
    for g in config['groups']:
        for ident in g['ids'].split():ann[ident]={k:v for k,v in g.items() if k!='ids'}
    for g in config['review_groups']:
        for ident in g['ids'].split():review_ann[ident]={k:v for k,v in g.items() if k!='ids'}
    assert set(ann).issubset({r['id'] for r in records})
    base=[];review=[];seen={}
    for r in records:
        a=ann.get(r['id']);host=U.urlsplit(r['source']['url']).hostname
        raw=excerpt(r['raw_text']);inp={'target':redact(raw),'context':'제목: '+redact(r['title'])}
        item=dict(id='real-'+r['id'],parent_id=r['id'],origin='real_web_excerpt',input=inp,
                  label=a['label'] if a else None,category=a['category'] if a else review_ann.get(r['id'],{}).get('category','UNRESOLVED'),
                  intent=a['intent'] if a else 'unresolved',reason=a['reason'] if a else review_ann.get(r['id'],{}).get('reason','본문 범위·모집 대상·불법성 추가 검수 필요'),
                  family_id=(a['campaign'] if a else 'unresolved-'+r['id']),group_id='source-'+host,
                  source_url=r['source']['url'],source_id=r['id'],raw_span=[0,len(raw)],
                  body_xpath=r['body_xpath'],raw_title=r['title'],human_reviewed=False,
                  annotation_status='assistant_provisional',legal_status='not_adjudicated',
                  split='train_candidate' if a else 'review_only',rights_status=r['source']['rights_status'],
                  input_contract='static_excerpt_with_owned_title_not_production_collector',
                  technique_observed=None,augmentation='none')
        # Exact input duplicates do not become additional training observations.
        signature=sha(json.dumps(inp,ensure_ascii=False,sort_keys=True))
        if signature in seen:
            item['duplicate_of']=seen[signature];item['split']='review_only'
        else:seen[signature]=item['id']
        review.append(item)
        if a and item['split']=='train_candidate':base.append(item)
    human_dir=Path('.runtime/nuri-1.2-human-review-v1')
    answers=json.loads((human_dir/'human-review-chat-answers.json').read_text(encoding='utf-8'))
    items_path=human_dir/'review-items.json'
    assert sha(items_path.read_bytes())==answers['source_items_sha256']
    old=json.loads(items_path.read_text(encoding='utf-8'));by_id={a['id']:a for a in answers['answers']}
    for r in old:
        a=by_id[r['id']];assert a['reviewed'] and a['is_illegal_ad'] is False and a['input_sha256']==r['input_sha256']
        item=dict(id='reviewed-'+r['id'],parent_id=r['id'],origin='previous_user_reviewed_runtime_element',
                  input={k:redact(v) for k,v in r['input'].items()},label=0,category='GENERAL',intent='non_target_user_confirmed',
                  reason='기존 사용자 이진 정상 검수. 세부 4분류는 미확정인 항목을 재라벨링하지 않음.',
                  family_id='reviewed-'+U.urlsplit(r['url']).hostname,group_id='source-'+U.urlsplit(r['url']).hostname,
                  source_url=r['url'],source_record=str(items_path),source_id=r['id'],human_reviewed=True,
                  annotation_status='user_binary_review_before_redaction',legal_status='not_adjudicated',split='train_candidate',
                  rights_status='unverified_third_party_content',input_contract='saved_runtime_input_redacted',
                  technique_observed=None,augmentation='none',original_input_sha256=r['input_sha256'],selector=r['selector'])
        base.append(item)
    real=list(base)
    scenarios=read('semantic-scenarios.json')
    for i,(cat,title,pos,neg) in enumerate(scenarios['pairs']):
        for label,target in [(1,pos),(0,neg)]:
            base.append(dict(id=f'scene-{i:02d}-{label}',parent_id=None,origin='synthetic_semantic',
                             input={'target':target,'context':'제목: '+title},label=label,category=cat,
                             intent='promotion' if label else 'non_promotional_context',
                             family_id=f'scenario-{i:02d}',group_id='synthetic-author-v1',split='train_candidate',
                             human_reviewed=False,annotation_status='assistant_provisional',augmentation='none',
                             input_contract='synthetic_owned_context',technique_observed=None,
                             inspiration_source_ids=sorted({x['source_id'] for x in real if x['category']==cat}),
                             reason='가상 역할 대조 사례. 실제 원문이나 독립 평가 자료가 아님.'))
    for i,(cat,title,target) in enumerate(scenarios['ambiguous']):
        review.append(dict(id=f'ambiguous-{i}',origin='synthetic_semantic',input={'target':target,'context':'제목: '+title},
                           label=None,category=cat,split='review_only',human_reviewed=False,reason='대상과 권유 근거 부족 또는 불법성 미확인'))
    # Same quoted words, different owned context; these are synthetic contexts, never real comments.
    for j,r in enumerate([r for r in real if r['label']==1][:16]):
        for label in [0,1]:
            n=dict(r);n.update(id=f'role-{j:02d}-{label}',parent_id=r['id'],origin='synthetic_role_contrast',label=label,
                              human_reviewed=False,annotation_status='assistant_provisional',input_contract='synthetic_owned_context',
                              intent='promotion' if label else 'prevention_quote',
                              input={'target':r['input']['target'],'context':
                                     ('제목: 게시물 안내\n앞 문맥: 아래 문구는 저희 서비스 안내입니다.\n뒤 문맥: 내용을 확인하고 저희 서비스를 이용해 주세요.' if label else
                                      '제목: 게시물 안내\n앞 문맥: 아래 문구는 신고된 광고를 그대로 인용한 것입니다.\n뒤 문맥: 해당 서비스를 이용하지 마시고 피해 예방을 위해 신고해 주세요.')},
                              reason='실제 광고 발췌를 가상 홍보/예방 인용 문맥에 배치한 대조. 대상 밖 설명은 새 합성이다.')
            base.append(n)
    for j,(cat,title,pos,neg) in enumerate(scenarios['pairs'][:12]):
        for label,target,other in [(1,pos,neg),(0,neg,pos)]:
            base.append(dict(id=f'comment-{j:02d}-{label}',parent_id=f'scene-{j:02d}-{label}',origin='synthetic_independent_comment',
                             input={'target':target,'context':'게시글 제목: 지역 소식\n같은 작성자 문맥: '+title},
                             separate_neighbor_not_model_input=other,label=label,category=cat,
                             family_id=f'scenario-{j:02d}',group_id='synthetic-author-v1',split='train_candidate',
                             human_reviewed=False,annotation_status='assistant_provisional',augmentation='none',
                             input_contract='synthetic_scoped_comment',technique_observed=None,
                             reason='이웃 댓글은 별개 작성 단위이며 대상 라벨로 전파하지 않는다. 실제 댓글 확보 수에 포함하지 않는다.'))
    rows=[];dedup={}
    for b in base:
        for mode in ['none','jamo','fullwidth','confusable','zero_width','spaced']:
            n=dict(b);n['input']={k:noisy(v,mode) for k,v in b['input'].items()};n['augmentation']=mode
            if mode!='none':n.update(id=b['id']+'-'+mode,parent_id=b['id'],origin='synthetic_surface_augmentation',human_reviewed=False,annotation_status='inherited_provisional')
            sig=sha(json.dumps(n['input'],ensure_ascii=False,sort_keys=True))
            if sig in dedup:
                assert dedup[sig]['label']==n['label'],'Conflicting input labels'
                continue
            dedup[sig]=n;rows.append(n)
    families=collections.Counter(r['family_id'] for r in rows)
    for r in rows:r['family_weight']=round(1/families[r['family_id']],8)
    jsonl('real-seeds.jsonl',real);jsonl('train-candidates.jsonl',rows);jsonl('review-queue.jsonl',review)
    jsonl('semantic-base.jsonl',[r for r in base if r not in real])
    jsonl('human-reviewed-base.jsonl',[r for r in real if r['human_reviewed']])
    # Balanced CSS fixtures, with an independent neighbour and no external requests.
    fixtures=[];fd=ROOT/'fixtures';fd.mkdir(exist_ok=True)
    scene_map={r['id']:r for r in base if r['origin']=='synthetic_semantic'}
    for i,r in enumerate([r for r in base if r['origin']=='synthetic_semantic'][:16]):
        for technique,style in [('TRANSPARENT','opacity:0'),('OFFSCREEN','position:absolute;left:-9999px;top:0'),('JAMO',''),('HOMOGLYPH','')]:
            ident=sha(r['id']+technique)[:16];target=r['input']['target'];title=r['input']['context'].removeprefix('제목: ')
            if technique=='JAMO':target=noisy(target,'jamo')
            if technique=='HOMOGLYPH':target += '\n안내 식별자: Ａ８'
            neighbour=scene_map[r['id'][:-1]+str(1-r['label'])]['input']['target']
            text='<!doctype html><html lang="ko"><meta charset="utf-8"><title>'+H.escape(title)+'</title><body><main><article><h1>'+H.escape(title)+'</h1><p id="target" style="'+style+'">'+H.escape(target)+'</p></article><section aria-label="댓글"><article><p>'+H.escape(neighbour)+'</p></article></section></main></body></html>'
            (fd/(ident+'.html')).write_text(text,encoding='utf-8')
            fixtures.append(dict(id=ident,parent_id=r['id'],file='fixtures/'+ident+'.html',target=target,independent_neighbor=neighbour,label=r['label'],technique=technique,origin='synthetic_dom_fixture',group_id=r['group_id']))
    save('fixtures.json',fixtures)
    stats=dict(real_extracted_pages=len(records),real_seed_rows=len(real),real_seed_unique_pages=len({r['source_url'] for r in real}),
               new_provisional_real_rows=sum(not r['human_reviewed'] for r in real),previous_user_reviewed_elements=sum(r['human_reviewed'] for r in real),
               train_candidate_rows=len(rows),base_rows_before_dedup=len(base),retained_base_rows=sum(r['augmentation']=='none' for r in rows),review_queue_rows=len(review),unresolved_rows=sum(r['label'] is None for r in review),
               labels=dict(collections.Counter(r['label'] for r in rows)),real_categories=dict(collections.Counter(r['category'] for r in real)),
               real_positive_categories=dict(collections.Counter(r['category'] for r in real if r['label']==1)),
               real_positive_families={cat:len({r['family_id'] for r in real if r['category']==cat and r['label']==1}) for cat in sorted({r['category'] for r in real})},
               origin_counts=dict(collections.Counter(r['origin'] for r in rows)),source_groups=len({r['group_id'] for r in real}),
               dom_fixtures=len(fixtures),holdout_rows=0,paid_api_calls=0,model_trained=False,
               status='provisional_training_candidates_not_all_categories_sufficient')
    save('summary.json',stats)
    save('training-manifest.json',dict(status='provisional_requires_review',automatic_training_ready=False,
         input_fields=['input.target','input.context'],target_field='label',labels={'0':'non_target_in_context','1':'requested_category_promotion_candidate'},
         never_input=['id','source_url','source_id','category','reason','label','family_id','group_id','raw_title','parent_id','augmentation','annotation_status'],
         split_policy='all observed material is train/development candidate; no independent final holdout',
         sampling_policy='group by family_id before sampling; do not treat augmented rows as independent sources',
         unresolved_policy='exclude label=null; do not convert to normal',
         long_input_policy='do not silently truncate; audit the chosen tokenizer and retained decision context before training',
         current_runtime_scope='production HCX prompt currently names gambling and illegal adult services; this corpus includes user-requested broader research categories without changing production',
         review_gates=['new real labels are assistant provisional','adult-content target definition needs explicit taxonomy review','source redistribution rights unverified','real positive sex-trade and illegal-medicine sources missing','live-site input parity not established']))
    sources=[json.loads(p.read_text(encoding='utf-8')) for p in sorted((ROOT/'sources').glob('*.json'))]
    jsonl('source-ledger.jsonl',sources)
    parts=['<!doctype html><html lang="ko"><meta charset="utf-8"><title>실제 광고 자료 검수</title><style>body{font:16px sans-serif;max-width:1100px;margin:40px auto}article{border-top:1px solid #aaa;padding:20px 0}pre{white-space:pre-wrap;background:#f5f5f5;padding:15px}.warn{color:#a30}</style><h1>원문 기반 학습 후보 검수표</h1><p class="warn">새 라벨은 AI 잠정 검수입니다. 1=요청 범주의 광고 권유 후보, 0=비권유/정상 문맥, 보류=이진 학습 제외. 법률 확정 라벨이 아닙니다. 모든 링크는 원문 기관/게시판만 가리킵니다.</p>']
    for r in review:
        parts.append('<article><h2>'+H.escape(r['id'])+' · '+str(r['label'])+' · '+H.escape(r['category'])+'</h2><p>'+H.escape(r['reason'])+'</p><pre>'+H.escape(r['input']['context']+'\n\n'+r['input']['target'])+'</pre>'+
                     ('<a href="'+H.escape(r['source_url'],quote=True)+'">원문 게시물</a>' if 'source_url' in r else '')+'</article>')
    (ROOT/'review.html').write_text(''.join(parts)+'</html>',encoding='utf-8')
    validate();print(json.dumps(stats,ensure_ascii=False,indent=2))

def validate():
    assert clean(parse('<div>A<script>unsafe()</script><style>x</style>B</div>'))=='AB'
    assert '[CONTACT]' in redact('문의 @someone')
    assert 'example.com' not in redact('https://example.com/path 문의')
    assert '010-1234-5678' not in redact('전화 010-1234-5678')
    assert links(parse('<a href="https://elsewhere.invalid/read.html">x</a>'),'https://example.com',lambda h,t:True)==[]
    assert unicodedata.normalize('NFC',noisy('카지노와 시민 상담','jamo'))=='카지노와 시민 상담'
    rows=[json.loads(l) for l in (ROOT/'train-candidates.jsonl').read_text(encoding='utf-8').splitlines()]
    assert len({r['id'] for r in rows})==len(rows)
    for r in rows:
        assert r['label'] in [0,1] and r['split']=='train_candidate'
        assert set(r['input'])=={'target','context'}
        assert r['input']['target'].strip()
        for value in r['input'].values():
            restored=unicodedata.normalize('NFKC',value).replace('\u200b','')
            assert 'http://' not in restored and 'https://' not in restored
    for r in read('inventory.json'):
        m=r['source'];assert sha((ROOT/m['byte_file']).read_bytes())==m['response_sha256']
        decoded=(ROOT/m['raw_file']).read_bytes().decode('utf-8');assert sha(decoded)==m['decoded_sha256']
        d=parse(decoded);es=d.xpath(r['body_xpath'])
        assert len(es)==1 and clean(es[0])==r['raw_text'],r['id']
        assert sha(r['raw_text'])==r['body_sha256']
    seeds=[json.loads(l) for l in (ROOT/'real-seeds.jsonl').read_text(encoding='utf-8').splitlines()]
    for r in seeds:
        if r['origin']=='real_web_excerpt':
            source=read('records/'+r['source_id']+'.json');a,b=r['raw_span']
            assert r['input']['target']==redact(source['raw_text'][a:b])
    by_id={r['id']:r for r in rows}
    for r in rows:
        if r.get('parent_id') in by_id:
            parent=by_id[r['parent_id']]
            assert r['group_id']==parent['group_id'] and r['family_id']==parent['family_id']
    assert len({sha(json.dumps(r['input'],ensure_ascii=False,sort_keys=True)) for r in rows})==len(rows)
    save('validation.json',dict(passed=True,checks=['raw_byte_hashes','cached_and_fresh_parser_contract','body_xpath_roundtrip','excerpt_offsets','redaction_examples','unique_ids','no_conflicting_input_labels_at_build','uncertain_excluded','parent_group_preserved','input_field_allowlist','NFD_roundtrip'],
                                training_rows=len(rows),accuracy_evaluated=False,production_collector_parity=False))
    print('PASS corpus integrity checks')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['capture','build','validate']);args=p.parse_args()
    {'capture':capture,'build':build,'validate':validate}[args.action]()
