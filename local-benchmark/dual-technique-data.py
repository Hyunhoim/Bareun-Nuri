"""Controlled synthetic observation labels; never a production detector."""
import hashlib, json, random, unicodedata
from pathlib import Path

ROOT=Path('.runtime/dual-technique-v1')
GROUPS={
 'base': [('미술','orchard'),('시민','lantern'),('기념','harvest'),('치마','copper'),('미로','meadow'),('비둘기','pencil'),('김밥','shelter'),('마을','crystal'),('지도','ribbon'),('임금','planet'),('시간','pocket'),('미용','timber'),('기차','fabric'),('치료','garden'),('지붕','marble'),('리본','silver'),('기름','velvet'),('미소','pebble'),('비밀','quartz'),('이름','basket'),('기온','stream'),('피부','rocket'),('미역','candle'),('지구','orange')],
 'extra': [('기숙사','anchor'),('시금치','compass'),('지하철','museum'),('미끄럼','cushion'),('기술자','stencil'),('피아노','cobalt'),('이미지','napkin'),('비누','castle'),('시계','breeze'),('기와','clover'),('미나리','gravel'),('지퍼','jacket'),('마당','lizard'),('지폐','mosaic'),('기상','acorn'),('비서','fossil')],
 'dev': [('시냇물','alpine'),('기린','cypress'),('미생물','badger'),('지진','dolphin'),('비행기','emerald'),('지렁이','falcon'),('기침','galaxy'),('피난','heather'),('밀가루','jasmine'),('시골','lagoon'),('기포','nectar'),('미숫가루','otter')],
 'final': [('시청각','coral'),('기러기','dahlia'),('미분','egret'),('지느러미','fern'),('비탈길','ginger'),('기압','hyacinth'),('피뢰침','iris'),('밀물','juniper'),('시나무','kelp'),('기틀','lilac'),('미립자','magnolia'),('지휘','nutmeg')],
}
# Disjoint surface templates. They are still one author's synthetic distributions.
TEMPLATES={
 'base': [('{x} 관련해서 질문 남깁니다. 답변 부탁드려요.','이 글의 본문입니다.'),('사설 도박방에서 {x}라는 행사로 회원을 모읍니다. 입금하고 이용할 분은 쪽지 주세요.','작성자가 올린 모집 글입니다.'),('가입하면 {x} 준다는 댓글을 받았습니다. 사설 도박으로 연결돼 신고합니다.','원문을 옮겨 적은 피해 문의입니다.'),('오늘 수업 자료에는 {x}가 나왔어요. 아이가 읽는 방법을 물어봅니다.','학부모의 교육 문의입니다.')],
 'extra': [('{x}, 이것 때문에 민원 넣어요. 담당 부서가 어딘가요?','이용자가 작성한 짧은 질문.'),('안내글 보고 왔는데 {x} 이용할 사람 모집합니다. 불법 자료방 결제는 개인 메시지로 받습니다.','대상은 마지막 문장까지 같은 작성자가 쓴 본문.'),('제가 본 쪽지에는 {x}라고 되어 있었고 결제를 요구했습니다. 더 연락 오지 않게 해주세요.','대상 작성자는 쪽지를 인용해 문의함.'),('교재에 실린 {x}를 그대로 적었습니다. 각 글자를 비교하려고요.','대상의 부모 문단은 문자 학습 내용.')],
 'dev': [('{x}라고 적혀 있는데 신청해 보신 주민 계세요?','열람 중인 의견 글의 일부.'),('오늘은 {x} 이름으로 사설 베팅 입장 받습니다. 새로 오실 분만 연락 주십시오.','대상 게시자의 작성 내용.'),('도박방 광고에 {x}가 보입니다. 캡처 첨부했으니 처리해 주실 수 있나요.','이용자가 신고하는 글.'),('책에 나온 {x}를 칠판에 옮겼습니다. 받아쓰기 자료로 쓸 예정입니다.','교사의 수업 기록.')],
 'final': [('주민센터에 {x} 건으로 방문하려 합니다. 예약이 필요한지 궁금하네요.','질문자가 남긴 원문.'),('사설 사이트 신규 모집 글 남겨요. {x} 행사 참여는 입금 후 제 연락처로 알려 주세요.','해당 요소는 모집자의 글.'),('아이 계정에 온 광고를 보니 {x}라는 글과 입금 주소가 있었습니다. 삭제를 요청합니다.','보호자가 받은 내용을 인용함.'),('글자 놀이 시간에 {x}를 써 보았습니다. 자료를 공유합니다.','공공 도서관 활동 후기.')],
}
L='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';V='ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';T=['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
def decompose(word):
 out=''
 for ch in word:
  n=ord(ch)-0xac00
  out+=L[n//588]+V[n%588//28]+T[n%28] if 0<=n<11172 else ch
 return out
def changed(word,table):
 out=''.join(table.get(c,c) for c in word)
 assert out!=word,word
 return out
def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def save(path,x):Path(path).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def variants(k,e,extended):
 j=decompose(k);d=changed(e,dict(zip('oeaisbt','0341587')));cy=changed(e,dict(zip('aceopxyis','асеорхуіѕ')))
 out=[(k,[1,1],'plain_hangul'),(e,[1,1],'plain_latin'),(j,[0,1],'compat_jamo'),(unicodedata.normalize('NFD',k),[0,1],'canonical_jamo'),(d,[1,0],'digit_homoglyph'),(cy,[1,0],'cyrillic_homoglyph'),(j+' '+d,[0,0],'combined'),(decompose(k[0])+k[1:],[0,1],'partial_jamo')]
 if extended:
  mixed=j.replace('ㅣ','l').replace('ㅁ','口');assert mixed!=j
  out += [(' '.join(j),[0,1],'spaced_jamo'),('\u200b'.join(j),[0,1],'zerowidth_jamo'),(mixed,[0,0],'hangul_cross_script'),(''.join(chr(ord(c)+0xfee0) for c in e),[1,0],'fullwidth')]
 return out
def prepare():
 ROOT.mkdir(exist_ok=True);assert not (ROOT/'manifest.json').exists(),'Dataset already sealed';rng=random.Random(741)
 manifest={'synthetic':True,'human_reviewed':False,'scope':'given target spans, observation not advertising intent','state_labels':['present','absent','uncertain'],'techniques':['JAMO','HOMOGLYPH'],'files':{},'counts':{},'limitations':['same author and transformation families','target spans supplied; not discovery','semantic contexts are controlled, not real posts']}
 forbidden=set()
 for folder in ['.runtime/technique-specialist-data-v3','.runtime/hangul-technique-v1']:
  for f in Path(folder).glob('*inputs.json'):
   forbidden.update(r.get('token','') for r in read(f))
 allgroups=[];seen_text=set();seen_abbreviations=set()
 for split,groups in GROUPS.items():
  rows=[];gold=[]
  def add(k,e,token,labels,kind,target,context):
   assert token in target and token not in forbidden,(split,token)
   start=target.index(token);marked=target[:start]+'[표기]'+token+'[/표기]'+target[start+len(token):]
   key=marked+'\n'+context;assert key not in seen_text;seen_text.add(key)
   rid=hashlib.sha256(key.encode()).hexdigest()[:20]
   rows.append({'id':rid,'group_id':k+'/'+e,'token':token,'raw_text':target,'start':start,'end':start+len(token),'input':{'target':marked,'context':context}})
   gold.append({'id':rid,'labels':labels,'kind':kind,'group_id':k+'/'+e,'source':'controlled_synthetic_author'})
  for index,(k,e) in enumerate(groups):
   allgroups.extend([k,e])
   for token,labels,kind in variants(k,e,split!='base'):
    for template,context in TEMPLATES[split]:add(k,e,token,labels,kind,template.format(x=token),context)
   # Natural identifier components and incomplete evidence, independent of ad context.
   code=e.upper()+'-'+str(rng.randrange(100,999))
   for text,ctx in TEMPLATES[split][:2]:
    add(k,e,code,[1,1],'identifier',text.format(x=code),'등록된 관리번호를 그대로 전달한 요소입니다. '+ctx)
   ambiguous=changed(e,dict(zip('oeaisbt','0341587')))
   add(k,e,ambiguous,[1,2],'ambiguous_h',f'{ambiguous}',{'base':'잘린 첨부에 남은 문자열. 원래 문서 없음.','extra':'확보한 부분은 이 문자열뿐입니다.','dev':'앞뒤 내용과 출처는 확인되지 않았습니다.','final':'일부만 전사되어 글자의 용도를 알 수 없습니다.'}[split])
   consonants=''.join(c for c in decompose(k) if c in L)
   if consonants not in seen_abbreviations and consonants not in forbidden:
    seen_abbreviations.add(consonants)
    add(k,e,consonants,[2,1],'ambiguous_j',consonants,{'base':'메모 일부이고 약자인지 빠진 글자인지 확인되지 않음.','extra':'초성 메모만 남아 뜻을 확인하지 못함.','dev':'게시물 본문 없이 자음 몇 개만 보입니다.','final':'작성 경위를 모르는 자음 표기입니다.'}[split])
  for suffix,data in [('inputs',rows),('gold',gold)]:
   f=ROOT/f'{split}-{suffix}.json';save(f,data);manifest['files'][f.name]=digest(f)
  manifest['counts'][split]={'rows':len(rows),'lexical_groups':len(groups),'kinds':{kind:sum(g['kind']==kind for g in gold) for kind in sorted({g['kind'] for g in gold})}}
 assert len(allgroups)==len(set(allgroups))
 manifest['split_group_overlap']=0;manifest['exact_target_overlap_with_old_inputs']=0
 manifest['plan_sha256']=digest('docs/dual-technique-plan.md')
 save(ROOT/'manifest.json',manifest);print(json.dumps(manifest['counts'],ensure_ascii=False))
if __name__=='__main__':prepare()
