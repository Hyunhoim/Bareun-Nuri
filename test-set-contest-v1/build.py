"""Build sealed, technique-paired fixtures without consulting model predictions."""
import collections, hashlib, html, json, random, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'data'
TECH = ['HOMOGLYPH', 'JAMO', 'TRANSPARENT', 'OFFSCREEN']
L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
V = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
T = ['', *'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
STYLES = {
 'TRANSPARENT': ['color:transparent', 'opacity:0', 'color:rgb(255,255,255);background-color:rgb(255,255,255)', 'opacity:0', 'color:rgba(20,30,40,0)'],
 'OFFSCREEN': ['position:absolute;left:-9999px;top:0', 'display:block;transform:translateX(-200vw)', 'font-size:0;line-height:0', 'font-size:1px;line-height:1px', 'display:none'],
}
def sha(x): return hashlib.sha256(x.encode() if isinstance(x,str) else x).hexdigest()
def write(name, value):
 p=OUT/name; p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(value if isinstance(value,str) else json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8')
def compat(s, sep=''):
 result=[]
 for c in s:
  n=ord(c)-0xac00
  result.append(sep.join([L[n//588], V[n%588//28], T[n%28]]).rstrip(sep) if 0<=n<11172 else c)
 return ''.join(result)
def disguise(text, tech, variant):
 if tech=='HOMOGLYPH':
  match=re.search(r'[A-Z]{2,}',text); assert match,text
  token=match.group(); maps=[dict(zip('ABCEHIKMOPSTXY','АВСЕНІКМОРЅТХΥ')),{},dict(zip('ABEILOSTZ','483110572')),dict(zip('ABEHIKMNOPTX','ΑΒΕΗΙΚΜΝΟΡΤΧ')),{}]
  if variant in (1,4): changed=''.join(chr(ord(c)+0xfee0) if variant==1 or i%2==0 else c for i,c in enumerate(token))
  else: changed=''.join(maps[variant].get(c,c) for c in token)
  assert changed!=token,(token,variant)
  return text[:match.start()]+changed+text[match.end():]
 if tech=='JAMO':
  if variant==0: return unicodedata.normalize('NFD',text)
  if variant==1: return compat(text)
  words=list(re.finditer('[가-힣]{2,}',text));assert words
  salient=[m for m in words if re.search('배팅|충전|슬롯|카지노|가입|성인|영상|현금|예약|신청|상담|안내|문자|글자',m.group())]
  m=(salient or words)[0];word=m.group()
  transformed=compat(word, ' ' if variant==3 else '') if variant!=4 else unicodedata.normalize('NFD',word)
  return text[:m.start()]+transformed+text[m.end():]
 return text
def bank():
 groups={};current=None
 for line in (ROOT/'bank.txt').read_text(encoding='utf8').splitlines():
  if not line or line.startswith('#'):continue
  if line.startswith('['):current=line[1:-1];groups[current]=[]
  else:groups[current].append(line)
 assert len(groups)==50, len(groups)
 assert all(len(v)==10 for v in groups.values()),{k:len(v) for k,v in groups.items()}
 assert sum(len(v) for k,v in groups.items() if k.startswith('ad:'))==250
 return groups
def page(title,content,layout):
 nav='<nav><a href="/">첫 화면</a> · <a href="/list?page=1">주민 의견</a> · <a href="/list?page=13">참여·문의</a></nav>'
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(title)+'</title><style>body{font:16px/1.6 sans-serif;background:#fff;color:#222;margin:0}header,main,footer{max-width:1050px;margin:auto;padding:16px}header{border-bottom:3px solid #235285}nav a,a{color:#245e8b}section,article,.entry{position:relative;padding:12px 16px;margin:12px 0;border:1px solid #ddd;background:white}h2,h3{font-size:18px}iframe{width:100%;height:240px;border:1px solid #ccc}.meta{color:#555;font-size:14px}td,th{padding:12px;text-align:left}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:650px){.pair{display:block}}</style></head><body><header><strong>주민참여 · 생활 제안</strong>'+nav+'</header><main class="layout-'+str(layout)+'"><h1>'+html.escape(title)+'</h1>'+content+'</main><footer>합성 지역 행정 서비스 · 문의는 해당 게시물의 답변란을 이용해 주세요.</footer></body></html>'
def main():
 assert not OUT.exists(),'Refusing to overwrite sealed data; create another version instead.'
 rng=random.Random(2026092801);records=[];groups=bank()
 for group,texts in groups.items():
  for index,text in enumerate(texts):
   seed=sha(group+'|'+str(index))[:16]
   for ti,tech in enumerate(TECH):
    variant=(index+list(groups).index(group))%5
    id='n'+sha(seed+'|'+tech+'|contest-v1')[:16]
    records.append(dict(id=id,group_id=seed,scenario_family=group,is_violation=group.startswith('ad:'),technique=tech,variant=variant,base_text=text,raw_text=disguise(text,tech,variant)))
 assert len(records)==2000
 rng.shuffle(records);routes={};gold=[];index_links=[]
 roles=['body','heading','comment','inline','list-entry','link','reply','iframe']
 titles=['주민 의견 상세','생활 불편 문의','자유 의견 나눔','참여 제안 내용','행사 의견과 답변','이용 문의','문화 소통 게시판','주민 질문 상세']
 # Each role/technique/label gets the same count distribution without label-marked HTML.
 schedules={}
 for label in (False,True):
  for tech in TECH:
   order=[roles[i%8] for i in range(250)];rng.shuffle(order);schedules[label,tech]=iter(order)
 for pi in range(250):
  url='/board/view?id='+str(4100+pi)+'&board='+str(pi%4+1);parts=[]
  for rec in records[pi*8:(pi+1)*8]:
   role=next(schedules[rec['is_violation'],rec['technique']]);rec['role']=role
   t=html.escape(rec['raw_text']);tech=rec['technique'];v=rec['variant'];css=STYLES.get(tech,['']*5)[v]
   cls='s'+sha(rec['id']+'css')[:10];style='<style>.'+cls+'{'+css+'}</style>' if css else ''
   ancestor=tech=='TRANSPARENT' and v==3
   attrs=' id="'+rec['id']+'"'+(' class="'+cls+'"' if css and not ancestor else '')
   if role=='inline':
    chunks=[rec['raw_text'][i:i+4] for i in range(0,len(rec['raw_text']),4)]
    t=''.join('<span>'+html.escape(chunk)+'</span>' for chunk in chunks)
   tag='a' if role=='link' else 'h2' if role=='heading' else 'p'
   extra=' href="https://reference.invalid/item/'+sha(rec['id'])[:10]+'"' if role=='link' else ''
   node='<'+tag+attrs+extra+'>'+t+'</'+tag+'>'
   if ancestor:node='<div class="'+cls+'">'+node+'</div>'
   # No gold, intended reading, technique name, or scenario-family marker enters the page.
   if role=='heading':block='<article>'+node+'<p>この項目</p></article>'.replace('<p>この項目</p>','<p>작성 내용에 대한 의견은 답글로 남길 수 있습니다.</p>')
   elif role=='comment':block='<section aria-label="댓글"><div role="comment"><span class="meta">참여자 · 의견</span>'+node+'</div></section>'
   elif role=='reply':block='<div class="entry"><div class="meta">답글</div>'+node+'</div>'
   elif role=='list-entry':block='<table><tbody><tr><th scope="row">등록 글</th><td>'+node+'</td></tr></tbody></table>'
   else:block='<article>'+node+'</article>'
   frame=None
   if role=='iframe':
    frame='/embed/'+sha(rec['id']+'frame')[:14]
    filename='frames/'+frame.split('/')[-1]+'.html';routes[frame]=filename
    write('public/'+filename,page('참여 의견',style+block,pi%8))
    block='<section><iframe title="참여 의견" src="'+frame+'"></iframe></section>';style=''
   parts.append(style+block)
   gold.append({**rec,'url':url,'frame_path':frame,'selector':tag+'#'+rec['id'],'expected_findings':[tech] if rec['is_violation'] else [],'observed_transform':tech,'label_basis':'synthetic advertiser solicitation' if rec['is_violation'] else 'synthetic ordinary or reporting speech','external_destination_is_inert':True})
  if pi%8==1:content='<div class="pair">'+''.join(parts)+'</div>'
  else:content=''.join(parts)
  content+='<nav>'+('<a href="/board/view?id='+str(4100+pi+1)+'&amp;board='+str((pi+1)%4+1)+'">다음 글</a>' if pi<249 else '')+'</nav>'
  name='pages/'+sha(url)[:16]+'.html';routes[url]=name;write('public/'+name,page(titles[pi%8],content,pi%8));index_links.append((url,titles[pi%8]))
 for i in range(25):
  url='/list?page='+str(i+1);name='lists/'+str(i+1)+'.html';routes[url]=name
  body='<p>제목 · 내용 · 작성자 검색 / 등록 순 목록</p><ul>'+''.join('<li><a href="'+html.escape(u,quote=True)+'">'+html.escape(title)+' '+str(i*10+j+1)+'</a></li>' for j,(u,title) in enumerate(index_links[i*10:i*10+10]))+'</ul><nav>'
  body+=' '.join('<a href="/list?page='+str(j+1)+'">'+str(j+1)+'</a>' for j in range(25))+'</nav>'
  write('public/'+name,page('주민 의견 목록',body,i%8))
 routes['/']='index.html';write('public/index.html',page('주민 소통 · 열린 공간','<p>지역 생활 제안, 시설 이용 문의, 행사 의견을 나누는 공간입니다.</p><ul>'+''.join('<li><a href="/list?page='+str(i+1)+'">의견 목록 '+str(i+1)+'</a></li>' for i in range(25))+'</ul>',0))
 write('private/gold.json',gold);write('private/routes.json',routes)
 counts={tech:sum(r['is_violation'] and r['technique']==tech for r in gold) for tech in TECH}
 normal={tech:sum(not r['is_violation'] and r['technique']==tech for r in gold) for tech in TECH}
 assert set(counts.values())=={250} and set(normal.values())=={250}
 hashes={str(p.relative_to(OUT)).replace('\\','/'):sha(p.read_bytes()) for p in sorted(OUT.rglob('*')) if p.is_file()}
 manifest={'version':1,'seed':2026092801,'advertisements':counts,'normal_controls':normal,'unique_semantic_seeds':500,'ad_semantic_seeds':250,'normal_semantic_seeds':250,'paired_techniques':True,'families':50,'detail_pages':250,'iframe_documents':sum(r['role']=='iframe' for r in gold),'split':'sealed_evaluation_only','predictions_run':0,'human_reviewed':False,'same_author_synthetic':True,'hashes':hashes,'bank_sha256':sha((ROOT/'bank.txt').read_bytes()),'builder_sha256':sha(Path(__file__).read_bytes())}
 write('private/manifest.json',manifest)
 print(json.dumps({k:v for k,v in manifest.items() if k!='hashes'},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
