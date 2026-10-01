"""Build synthetic Nuri 1.2 training only; no old evaluation text is generated from."""
import json,random,hashlib,unicodedata,re,csv,sys
from collections import Counter
from pathlib import Path
ROOT=Path('local-benchmark/nuri-1.2');BANK=Path('local-benchmark/nuri12-topics.json')
CTA=['희망하시면 제게 쪽지 주세요.','필요한 분은 댓글에 연락 가능 시간을 남겨 주세요.','진행할 분은 제 프로필의 문의 창을 이용해 주세요.','참여 의사가 있으면 답글 부탁드립니다.','오늘 신청을 받고 있으니 메시지 남겨 주세요.','세부 일정은 제게 문의해 주세요.','접수할 분은 아래 신청 버튼을 눌러 주세요.','제가 연결해 드릴 테니 연락 주세요.','원하시는 분은 대화 요청을 보내 주세요.','이용하실 분의 문의를 기다립니다.']
SHORT=['저도 연결해 드릴 수 있어요.','원하시면 안내해 드립니다.','여기서 신청하시면 됩니다.','자리는 아직 남아 있습니다.','연락 가능한 시간 남겨 주세요.','이번 주에도 접수합니다.','자료를 보내 드릴게요.','자세한 내용은 메시지로 드립니다.','가능한 분은 답글 주세요.','다음 일정도 열어두겠습니다.']
QUESTION=['이 경우 어디에 상담을 요청하면 될까요?','제가 먼저 남겨 둬야 할 기록이 있을까요?','이후 대응 절차를 아시는 분 계신가요?','비슷한 피해를 겪으셨다면 도움받은 곳을 알려 주세요.','신고할 때 대화 기록도 제출해야 하나요?','더 돈을 보내지 않고 도움을 받으려면 어떻게 해야 할까요?','사실관계를 확인할 기관을 찾고 있습니다.','상담 예약을 잡으려는데 담당 창구가 궁금합니다.','연락 내역은 보관했는데 다음에 무엇을 해야 할까요?','주변에 알리기 전에 증거부터 남기고 싶습니다.']
CAUTION=['아래 메시지를 받은 뒤 거래를 중단했습니다. 상담할 때 원문이 필요하다고 해서 남깁니다.','이런 모집 글에 응했다가 연락이 끊겼습니다. 기록을 첨부해 신고하려고 합니다.','오늘 교육에서는 다음 제안이 어떻게 사람을 끌어들이는지 살펴봤습니다.','게시판 신고 접수 내용입니다. 인용한 메시지의 삭제 절차를 문의합니다.','가족에게 온 메시지를 옮깁니다. 돈을 보내기 전에 상담을 받아보려 합니다.','피해 상담 때 제출할 화면의 내용입니다. 더 이상 연락하지 않고 기록만 보관합니다.','수업 과제로 모집 문구의 위험을 분석하고 있습니다. 다음은 분석할 인용문입니다.','아래와 같은 제안을 거절했는데 계속 연락이 옵니다. 차단 외에 대응 방법이 있을까요?','신고한 게시물이 다시 올라왔습니다. 동일한 문구인지 확인하려고 원문을 남깁니다.','다음 인용은 참여 안내가 아니라 제가 받은 연락의 증거입니다. 접수 방법을 문의합니다.']
NEUTRAL=['게시판에서 답변을 확인하는 시간이 일정하지 않습니다.','어제 올린 글의 내용을 조금 정리했습니다.','주말에는 휴대전화를 자주 확인하지 못합니다.','글을 읽어 주신 분들께 먼저 감사드립니다.','첨부파일은 화면 아래에 따로 올려두었습니다.','지난주에 문의가 있어 내용을 보충합니다.','등록 과정에서 줄바꿈이 달라져 다시 적습니다.','연락처를 공개하기는 어려워 댓글로 이야기하려고 합니다.','확인되는 내용부터 순서대로 적어둡니다.','사진은 용량 때문에 나누어 첨부했습니다.']
INFO=['주민센터 강의실은 저녁 여섯 시에 문을 닫습니다.','분실물은 안내 데스크에서 접수하고 있습니다.','작은도서관 도서 반납함 위치가 바뀌었습니다.','마을 회의 일정은 다음 주 수요일입니다.','체육관 공사 기간에는 옆 출입구를 이용합니다.','공원 자전거 거치대 보수 일정이 궁금합니다.','강좌 신청서의 주소 칸을 수정하고 싶습니다.','주민 모임 회계 자료는 회의 때 함께 확인합니다.','새 버스 시간표를 게시판에도 올려 주시면 좋겠습니다.','장애인 경사로 앞에 놓인 물건을 정리해 주세요.']
PLACES=['주민 이야기','시민 질문','생활 제안','자유 의견','동네 소식','이용 문의','참여 마당','생활 상담','주민 모임','시설 안내']
ALIASES=['Silver','Market','Studio','Bridge','Circle','Ticket','River','Garden','Signal','Planet']
ENGLISH=['table','betting room','slot room','dice','video','account','contact','recording','diploma','career document','exam','receipt','sleeping pill','injection','prescription','medicine','account','login','concert','product']
LONG=['건물 입구 게시판에는 지난달 일정이 아직 붙어 있습니다. 새 일정이 나오면 함께 교체해 주셨으면 합니다.','주차장 쪽에서 들어가면 안내 표지가 잘 보이지 않습니다. 처음 방문한 분들이 다른 층으로 가는 경우가 있었습니다.','게시물을 휴대전화로 읽을 때 표의 오른쪽이 잘립니다. 안내 내용은 확인했지만 첨부파일은 컴퓨터로 다시 열어보겠습니다.','자료를 확인하는 데 시간이 걸려 답변이 늦었습니다. 이전에 남긴 질문과 중복되는 부분은 정리해서 적겠습니다.','모임 장소가 변경되었다고 들었습니다. 기존 안내문을 보신 분들도 확인할 수 있게 입구에 별도 안내를 부탁드립니다.']
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def digest(f):return hashlib.sha256(Path(f).read_bytes()).hexdigest()
def dump(f,x):f.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def render(place,role,own,before,after,layout):
 if layout==0:return f'{place}\n선택 요소: {role}\n같은 게시글: {own}\n다른 작성자의 댓글: {before}\n다음 댓글: {after}'
 if layout==1:return f'{place}\n앞 댓글(다른 작성자): {before}\n선택한 {role}의 본문: {own}\n이후 별도 댓글: {after}'
 if layout==2:return f'{place}\n대상과 같은 작성 영역 시작\n{own}\n대상 작성 영역 끝\n별도 게시물: {before}\n별도 답글: {after}'
 if layout==3:return f'{place}\n별도 답글: {after}\n{role}가 속한 글의 앞뒤 문장: {own}\n이전 글(다른 작성자): {before}'
 return f'{place}\n선택한 {role}\n상위 글 본문: {own}\n아래는 다른 작성자의 글\n{after}\n{before}'
def jamo(text,rng):
 words=list(re.finditer('[가-힣]{2,}',text));assert words
 w=rng.choice(words);method=rng.choice(['nfd','compat','spaced']);piece=unicodedata.normalize('NFD',w.group())
 if method!='nfd':
  lead='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';vowel='ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';tail=' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'
  piece=''.join(lead[ord(c)-0x1100] if 0x1100<=ord(c)<=0x1112 else vowel[ord(c)-0x1161] if 0x1161<=ord(c)<=0x1175 else tail[ord(c)-0x11a7] if 0x11a8<=ord(c)<=0x11c2 else c for c in piece)
  if method=='spaced':piece=' '.join(piece)
 return text[:w.start()]+piece+text[w.end():],method
def build():
 if ROOT.exists():
  assert '--rebuild-unreviewed' in sys.argv and not read(ROOT/'manifest.json')['human_reviewed']
  with (ROOT/'review.csv').open(encoding='utf-8-sig',newline='') as f:assert all(not r['reviewed_label'] and not r['review_note'] for r in csv.DictReader(f))
 ROOT.mkdir(exist_ok=True);rng=random.Random(120928);rows=[];meta=[];topics=read(BANK)
 for ti,t in enumerate(topics):
  for scene in range(50):
   g=ti*50+scene;cta=CTA[scene%10];short=SHORT[(scene+ti)%10];n=NEUTRAL[(scene//5+ti)%10];normal=INFO[(scene+ti*3)%10];alias=ALIASES[(scene+ti)%10];offer=t['offer']+'. '+cta;warning=CAUTION[(scene+ti)%10];victim=t['harm']+'. '+QUESTION[(scene+ti*2)%10];legal=t['safe']+'. '+cta
   cases=[(offer,n,normal,t['safe'],0,'direct_offer'),(short,offer,n,normal,0,'short_owned_offer'),('「'+offer+'」',n+' 위 내용은 제가 지금 받는 신청입니다. '+cta,normal,t['safe'],0,'quoted_actual_offer'),(normal+' '+offer,n,warning,t['safe'],0,'mixed_intent'),(victim,n,offer,normal,1,'victim_request'),('「'+offer+'」',warning,cta,normal,1,'protective_quote'),(normal,n,offer,warning,2,'normal_next_to_offer'),(short,legal,n,offer,2,'legitimate_invitation'),(t['identifier']+' — 안내판에 적힌 관리번호입니다.',n+' '+normal,offer,t['safe'],2,'identifier'),(short,n,offer,legal,3,'unresolved_scope')]
   mode=['plain']*4+['jamo']*2+['homoglyph']*2+['transparent','offscreen'];mode=mode[g%10]
   for slot,(target,own,before,after,label,kind) in enumerate(cases):
    if (scene+ti)%2==0:
     if slot in [0,4,5]:
      own=own+' '+target;target=short if slot!=4 else QUESTION[(scene+ti*2)%10]
      if slot==5:own=warning+' 수신한 문장: 「'+offer+' '+short+'」';target='「'+short+'」'
     if slot in [6,8,9]:target=n+' '+target+' '+normal
    # Balance irrelevant long context across labels, without claiming real DOM collection.
    if (scene+slot)%5==0:own=LONG[(scene+ti)%5]+' '+own+' '+LONG[(scene+ti+2)%5]
    role=['본문','댓글','제목','링크 문구','작성자 소개'][(g+slot)%5]
    ctx=render(PLACES[(scene+ti)%10],role,own,before,after,scene//10)
    raw=target;rawctx=ctx;operation='none';style={};control=False
    if mode=='jamo':target,operation=jamo(target,rng)
    if mode=='homoglyph':
     control=(scene//10+slot)%5==0
     if control:
      raw=target+' ['+t['identifier']+']';target=raw;operation='unchanged_identifier'
     elif scene%2:
      word=ENGLISH[ti];raw=target.replace(t['term'],word);rawctx=ctx.replace(t['term'],word);encoded=word.translate(str.maketrans({'a':'4','e':'3','i':'1','o':'0'}));target=raw.replace(word,encoded);ctx=rawctx.replace(word,encoded);operation='latin_digit_core';assert target!=raw or ctx!=rawctx
     else:
      raw=target+' ['+alias+']';target=target+' ['+alias.translate(str.maketrans({'a':'4','e':'3','i':'1','o':'0'}))+']';operation='latin_digit_alias'
    if mode=='transparent':style={'color':'rgba(0,0,0,0)' if scene%2 else 'inherit','opacity':'1' if scene%2 else '0'};operation='css_only'
    if mode=='offscreen':style={'position':'absolute','left':'-12000px','top':'0px'};operation='css_only'
    rid=f'nuri12-{g:04d}-{slot}';rows.append({'id':rid,'group':f'nuri12-scene-{g:04d}','input':{'target':target,'context':ctx},'label':label})
    reason=['작성자가 구체적인 불법 거래를 모집한다.','짧은 권유의 대상이 같은 작성자의 불법 거래 설명으로 확인된다.','따옴표를 사용했지만 작성자가 현재 신청을 받고 있다.','정상 문장에 이어 대상 자체에 실제 모집이 포함된다.','대상은 피해 경위와 도움 요청이며 주변 모집 글은 다른 작성자다.','대상 인용문은 같은 작성자의 신고·예방 맥락에 속한다.','대상은 일반 정보이며 다른 작성자의 거래를 권유하지 않는다.','짧은 권유의 대상이 같은 작성자의 합법적 활동이다.','대상은 관리번호이며 주변 거래와 독립적이다.','같은 작성자 영역에는 구체적인 신청 대상이 없고 다른 글로 보완할 수 없다.'][slot]
    meta.append({'id':rid,'topic_family':t['topic'],'domain':t['domain'],'template_family':kind,'layout_family':scene//10,'source_family':'synthetic_nuri12_v1','scope':'same_owner' if label!=3 else 'insufficient_same_owner','presentation':mode,'operation':operation,'identifier_control':control,'raw_target':raw,'raw_context':rawctx,'style':style,'role':role,'human_reviewed':False,'rationale':reason})
 assert len(rows)==10000 and Counter(r['label'] for r in rows)=={0:4000,1:2000,2:3000,3:1000}
 assert len({json.dumps(r['input'],ensure_ascii=False,sort_keys=True) for r in rows})==10000
 assert all('[object Object]' not in str(r['input']) for r in rows)
 dump(ROOT/'train.json',rows);dump(ROOT/'provenance.json',meta)
 with (ROOT/'review.csv').open('w',encoding='utf-8-sig',newline='') as f:
  writer=csv.writer(f);writer.writerow(['id','target','context','suggested_label','reviewed_label','review_note'])
  for r in rows:
   group=int(r['id'].split('-')[1]);topic=group//50
   if group%50 in {topic%10,(topic+5)%10}:writer.writerow([r['id'],r['input']['target'],r['input']['context'],r['label'],'',''])
 manifest={'name':'Nuri 1.2','status':'synthetic_training_candidate_not_trained','base_model':'klue/roberta-base','initialize_from_A_or_D':False,'rows':len(rows),'labels':dict(Counter(r['label'] for r in rows)),'label_names':{'0':'illegal_offer','1':'quotation_or_victim_request','2':'ordinary_or_legal_offer','3':'insufficient_evidence'},'scenario_groups':1000,'topic_families':20,'discourse_families':10,'layout_families':5,'presentation':dict(Counter(m['presentation'] for m in meta)),'human_reviewed':False,'collected_real_dom':False,'final_evaluation_created':False,'split_policy':'training-only; do not randomly split rows. Shared topic/template/source require separate validation authoring. Group alone does not ensure unseen template or topic.','model_input_fields':['input.target','input.context'],'metadata_must_not_be_model_input':True,'files':{name:digest(ROOT/name) for name in ['train.json','provenance.json','review.csv']},'generator_sha256':digest(__file__),'topics_sha256':digest(BANK)};dump(ROOT/'manifest.json',manifest);print(json.dumps({'rows':len(rows),'manifest':str(ROOT/'manifest.json')}))
if __name__=='__main__':build()
