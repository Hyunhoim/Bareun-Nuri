"""Build a review-only, synthetic board corpus. Never export training messages."""
import json,random,re,html,unicodedata,hashlib,csv,collections
from pathlib import Path
ROOT=Path(__file__).with_name('exaone-ft-data-v2')
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def norm(s):return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',s)).strip()
def build():
 assert not (ROOT/'dataset.json').exists(),'Preserve review work'
 rng=random.Random(290929); rows=[]
 for gi,(category,title,offer,victim,legal,prevention,neutral,cta) in enumerate(read(ROOT/'scenario-bank.json')):
  cases=[(0,'direct',offer,neutral,''),(0,'owned_cta',cta,offer,''),(0,'quoted_offer','「'+offer+'」','위 안내대로 제가 접수받고 있어요. '+cta,''),(0,'mixed',neutral+'\n\n'+offer,'게시판 위치가 맞는지 모르겠네요. 내용 남깁니다.',''),(1,'prevention',offer,prevention,''),(1,'prevention_short',cta,prevention+'\n받은 내용: '+offer,'') if gi%2==0 else (3,'unresolved_neighbor',cta,'',offer),(2,'victim',victim,'관련해서 문의 남깁니다.',''),(2,'legitimate',cta,legal,''),(2,'other_author',neutral,'',offer),(3,'missing_object',cta,'','')]
  for ci,(label,kind,target,own,other) in enumerate(cases):
   sid=hashlib.sha256(f'{gi}/{ci}/exaone-v2'.encode()).hexdigest()[:12]
   rows.append({'id':sid,'group_id':f'scenario-{gi:02}','category':category,'suggested_label':label,'kind':kind,'title':title,'plain_target':target,'own_context':own,'other_author_context':other,'layout':(gi+ci)%4,'position':['body','comment','title','link','author_bio'][(gi+ci)%5],'source_style_refs':['busan-question','busan-program','jeonnam-board','busan-reply'][(gi+ci)%4],'provenance':'new_synthetic_text; public-board register only','review_status':'pending','reviewed_label':None,'split':'train_candidate_unreviewed'})
 # Technique allocation is independent of intent; 60 plain, 30 each single, 20 mixed.
 allocation={0:[24,12,12,12,12,8],1:[9,5,4,5,4,3],2:[18,9,9,9,9,6],3:[9,4,5,4,5,3]}
 modes=['PLAIN','HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN','MIXED']
 for label,counts in allocation.items():
  ix=[i for i,r in enumerate(rows) if r['suggested_label']==label];rng.shuffle(ix)
  choices=[m for m,n in zip(modes,counts) for _ in range(n)];assert len(ix)==len(choices)
  for i,m in zip(ix,choices):rows[i]['mode']=m
 site=ROOT/'site';site.mkdir(exist_ok=True)
 for i,r in enumerate(rows):
  raw=r['plain_target'];own=r['own_context'];style='';ops=[]
  if r['mode']=='HOMOGLYPH':
   # An ordinary navigation label appears inside the same authored unit as its description.
   own='\n'.join(x for x in [own,raw] if x);word=['OPEN','INFO','VIDEO','PHOTO','ROOM','BOOK','JOIN','LIVE','BONUS','CODE'][i%10]; variants=[str.maketrans({'O':'0','I':'1','E':'3','B':'8'}),str.maketrans({'O':'О','E':'Е','I':'І','C':'С','P':'Р','B':'В'}),str.maketrans({chr(n):chr(n+0xfee0) for n in range(65,91)})]; raw='자료 보기 ('+word.translate(variants[i%3])+')'; r['position']='link'; ops=['HOMOGLYPH']
  if r['mode'] in ['JAMO','MIXED']:
   match=re.search('[가-힣]{2,}',raw);assert match
   word=match.group();piece=unicodedata.normalize('NFD',word)
   if i%2:piece='\u200b'.join(piece)
   raw=raw[:match.start()]+piece+raw[match.end():];ops=['JAMO']
  if r['mode']=='TRANSPARENT' or r['mode']=='MIXED' and i%2==0:
   style=['color:transparent','opacity:0','color:#fff;background:#fff'][i%3];ops+=['TRANSPARENT']
  if r['mode']=='OFFSCREEN' or r['mode']=='MIXED' and i%2:
   style=['position:absolute;left:-9000px;top:0','display:none','font-size:1px;line-height:1px'][i%3];ops+=['OFFSCREEN']
  r.update(raw_target=raw,rendered_own_context=own,intended_techniques=ops,target_style=style,technique_verified=False,dom_collected=False)
  esc=html.escape;tag={'body':'p','comment':'p','title':'h3','link':'a','author_bio':'span'}[r['position']]
  attrs=' href="#detail"' if tag=='a' else ''
  target=f'<{tag} id="target" style="{style}"{attrs}>{esc(raw)}</{tag}>'
  content=f'<p class="own-context">{esc(own)}</p>{target}' if i%2 else f'{target}<p class="own-context">{esc(own)}</p>'
  targetunit=f'<section class="owned" data-author="writer-a">{content}</section>'
  other=f'<section class="reply" data-author="writer-b"><p>{esc(r["other_author_context"])}</p></section>'
  templates=[f'<article>{targetunit}</article>{other}',f'<div class="board-view">{targetunit}{other}</div>',f'<main><div class="post">{other}{targetunit}</div></main>',f'<div role="main">{targetunit}<aside>{other}</aside></div>']
  page=f'<!doctype html><html lang="ko"><meta charset="utf-8"><title>{esc(r["title"])}</title><style>body{{font-family:sans-serif;background:#fff;color:#222;max-width:840px;margin:32px auto}}section{{padding:12px;border:1px solid #ddd;margin:12px 0}}p{{white-space:pre-wrap}}</style><header>지역 소통 게시판 · 합성 검수 자료</header><h2>{esc(r["title"])}</h2>{templates[r["layout"]]}<footer>개인정보를 적지 마세요.</footer></html>'
  (site/(r['id']+'.html')).write_text(page,encoding='utf8')
  # Raw DOM-oriented draft, not manually restored gold text.
  r['input_draft']={'target':raw,'context_units':[{'relation':'same_author','text':own},{'relation':'other_author','text':r['other_author_context']}],'page_title':r['title']}
 rng.shuffle(rows)
 (ROOT/'dataset.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
 with (ROOT/'review.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.writer(f);w.writerow(['id','group_id','category','target','same_author','other_author','suggested_label','reviewed_label','review_note'])
  for r in rows:w.writerow([r['id'],r['group_id'],r['category'],r['raw_target'],r['rendered_own_context'],r['other_author_context'],r['suggested_label'],'',''])
 audit()
def audit():
 rows=read(ROOT/'dataset.json');assert len(rows)==200
 counts=collections.Counter(r['suggested_label'] for r in rows);assert counts=={0:80,1:30,2:60,3:30}
 modes=collections.Counter(r['mode'] for r in rows);assert modes=={'PLAIN':60,'HOMOGLYPH':30,'JAMO':30,'TRANSPARENT':30,'OFFSCREEN':30,'MIXED':20}
 assert len({r['id'] for r in rows})==200
 assert all(r['review_status']=='pending' and r['reviewed_label'] is None for r in rows)
 old=read('.runtime/slm-three/inputs.json');prior={(norm(x['input']['target']),norm(x['input']['context'])) for x in old}
 duplicate=sum((norm(r['plain_target']),norm(r['own_context'])) in prior for r in rows);assert duplicate==0
 result={'rows':200,'scenario_groups':20,'labels':dict(counts),'modes':dict(modes),'categories':dict(collections.Counter(r['category'] for r in rows)),'training_ready':False,'reviewed':0,'exact_pair_overlap_observed221':duplicate,'independent_holdout':False,'limitations':['Synthetic template-based contrast corpus, not 200 independently collected posts','Authored explanations and missing-object labels need human review','Twenty related groups must never be split by individual row','Homoglyph coverage is navigation labels only; embedded loanwords, natural identifiers and broader digit replacements still needed','No sealed evaluation was read']}
 (ROOT/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':
 import sys
 if '--audit' in sys.argv:audit()
 else:build()

