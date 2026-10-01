"""Compositional synthetic diagnostic, never claim 50k independent real texts."""
import json,random,hashlib,unicodedata
from pathlib import Path
ROOT=Path('.runtime/klue-scale-v1')
BANKS={
'train':{
'offer':['사설 스포츠 승부에 돈을 걸 수 있는 회원을 받습니다','불법 바카라 테이블에 입장할 고객을 모집합니다','허가 없는 슬롯 게임에 현금을 충전할 분을 찾습니다','비인가 경마 배당방을 운영하며 판돈을 받고 있습니다','무허가 룰렛 게임에서 현금 내기를 할 손님을 받습니다','사설 홀짝 도박 계정을 유료로 발급합니다','불법 카드 내기방에서 현금 참가비를 받습니다','온라인 주사위 도박에 입금하고 참여할 회원 모집합니다','비동의 성인 촬영물의 유료 열람권을 판매합니다','유출된 성인 사생활 영상을 돈 받고 전송합니다','불법 촬영 성인 영상 파일을 결제한 사람에게 보내드립니다','당사자 허락 없는 성인 자료의 다운로드 권한을 팝니다','무허가 투견 승부에 돈을 걸 고객을 모집합니다','현금을 걸고 즐기는 사설 마작방의 회원을 받습니다','불법 온라인 복권 참여비를 입금할 분을 모집합니다','동의 없이 찍은 성인 영상 모음을 유료로 공유합니다','사설 경륜 도박방 참가자의 충전을 받습니다','불법 성인 촬영본을 비용을 낸 구매자에게 배송합니다'],
'cta':['쪽지로 신청하세요','운영자에게 연락하세요','연결 주소로 접수하세요','상담을 남기세요','계정을 등록하세요','참가비를 보내세요','거래 의사를 알려 주세요','신청 양식을 작성하세요','주문을 전달하세요','링크에서 진행하세요','가입 메시지를 주세요','대금을 납부하세요'],
'prevent':['신고 접수된 원문을 증거로 보관합니다. 이용하지 마세요','단속 교육에서 적발 표현을 설명합니다. 돈을 보내지 마세요','피해자가 받은 메시지를 기록합니다. 거래를 중개하지 않습니다','경찰 보도의 사례 인용입니다. 접근을 권하지 않습니다','삭제된 광고를 예시로 옮겼습니다. 클릭하면 안 됩니다','범죄 예방 수업 자료입니다. 제시된 권유에 응하지 마세요','이런 게시물을 보면 신고해 주세요. 실제 판매글이 아닙니다','불법 모집 사례를 분석합니다. 이용 방법을 제공하지 않습니다','차단 사유를 설명하기 위한 기록입니다. 구매를 막으려 합니다','피해 방지를 위해 원문을 제시합니다. 계좌 송금은 금지합니다','신고자가 제출한 문장을 보존했습니다. 서비스 연결은 없습니다','언론에 실린 위험 사례입니다. 가입해서는 안 됩니다'],
'normal':['시립 도서관 독서 강좌','공공 수영장 정기 수업','주민 체육관 배드민턴 모임','복지관 무료 건강 교육','구립 공연장 관람 예약','시민 정원 가꾸기 봉사','보건소 금연 상담','마을 합창단 연습','시청 공개 강연','공립 박물관 가족 체험','청소년 무료 코딩 교실','주민 사진 전시회'],
'meta':['게시물 작성자','등록 시각','조회 수','첨부 크기','담당 부서','글 번호','수정 일시','페이지 이동','목록 보기','파일 형식','답변 상태','관리 담당'],
'unknown':['자세한 사항은 따로','준비되면 진행','접수하고 싶으면 연락','필요한 분만 문의','관심 있는 분은 메시지','연결 후 설명','원하시면 안내','참여 방법은 개별 전달'],
'frame':['게시판\n제목: 시민의견\n','댓글 목록\n현재 항목:\n','민원 답글\n','참여 마당\n본문과 부가 정보:\n'],
'join':['안내 사항','추가 설명','참고 문장','게시된 내용']},
'validation':{
'offer':['비인가 포커 도박 계정을 돈 받고 빌려 드립니다','사설 경정 내기의 베팅 금액을 받고 있습니다','허가 없는 온라인 빙고 도박방 유료 회원을 찾습니다','무허가 승패 예측장에서 현금 내기를 할 이용자 접수합니다','몰래 녹화된 성인 사생활 파일 구매자를 받습니다','유출 성인 동영상 복사본을 송금한 사람에게 넘깁니다','동의 없이 촬영한 성인물 이용료를 받습니다','불법 성인 영상 묶음의 구매 상담을 받습니다'],
'cta':['접속 창구에 요청을 제출하십시오','진행할 분은 신청서를 보내십시오','담당 계정으로 의사를 전하십시오','비용을 결제하고 등록하십시오','상세 연결을 열어 신청하십시오','이용 요청을 남겨 주십시오'],
'prevent':['민원 조사에 첨부된 증거 문장입니다. 따라 해서는 안 됩니다','위법 행위의 양상을 알리는 강연입니다. 판매 창구가 아닙니다','피해 상담 기록에 나온 제안입니다. 이용을 거절하십시오','해당 홍보를 삭제한 이유를 설명합니다. 접속하지 마십시오','사기 예방 해설에서 발췌한 것입니다. 지불을 권하지 않습니다','수사 사례집의 인용문입니다. 참가 안내로 오해하지 마십시오'],
'normal':['구립 천문관 관측 행사','청년센터 취업 특강','공공 미술학교 강좌','동네 환경 정화 활동','시립 빙상장 이용','청소년 역사 탐방'],
'meta':['열람 횟수','갱신 날짜','처리 기관','내선 번호','이전 글','문서 번호'],
'unknown':['별도 창구에서 설명','세부 조건 추후 공개','용무는 연락 후 확인','자세한 내용은 공란'],
'frame':['소통 게시글\n선택 요소:\n','답변 열람\n','열린 게시판 안내\n'],
'join':['함께 표시된 설명','주변 내용','항목 설명']},
'final':{
'offer':['무허가 온라인 투기 게임에 판돈을 예치할 고객을 찾고 있어요','사설 가상 경기 도박방을 열었으니 현금을 걸어 보실 분 받습니다','현금 배당을 지급하는 불법 숫자 맞히기방의 접수를 진행해요','허가받지 않은 인터넷 경주 도박에 참가할 사람을 유료 모집해요','촬영 동의가 없는 성인 사생활 녹화본 구매를 원하시면 판매해 드려요','몰래 촬영한 성인 영상 저장본을 대금 확인 후 넘겨 드려요','불법 유출된 성인 촬영 자료의 구입을 원하는 고객을 받아요','피해자의 허락 없이 만든 성인 영상 복제물을 돈을 받고 나눠 드려요'],
'cta':['희망자는 연결 화면에 뜻을 남겨 주세요','해당 접수처에 이용 신청을 전달해 주세요','안내창에서 금액과 진행 절차를 확인해 주세요','서비스를 원하시면 신청란을 채워 주세요','개설한 창구에 주문 의사를 보내 주세요','이어지는 화면에서 거래를 접수해 주세요'],
'prevent':['구매를 막기 위해 수집한 발언을 소개한 자료입니다. 이 제안은 거절해야 합니다','범죄 수법을 알리는 설명 중 가져온 내용입니다. 누구도 여기에 응해서는 안 됩니다','민원인이 제출한 홍보 표현을 남긴 기록입니다. 제공되는 상품은 없습니다','위험을 경고하는 발표에서 제시한 문구입니다. 거래를 원하는 글이 아닙니다','이용 금지를 알리려고 적발 당시 표현을 실었습니다. 판매나 가입은 받지 않습니다','삭제 처리 결과에 원문을 붙인 것입니다. 접속을 유도하는 목적이 아닙니다'],
'normal':['구민 공예 배움터 프로그램','시립 기록관 해설 방문','주민 안전 체험 교육','청소년 국악 감상 행사','공영 캠핑장 사용 예약','지역 문화유산 답사'],
'meta':['자료 게시 시점','응답 담당자','화면 이전 이동','문서 갱신 정보','게시 항목 식별번호','열람 누적 수'],
'unknown':['구체적인 조건은 이후에','연결하면 알려 드림','설명 없이 접수 중','필요하신 분께만 전달'],
'frame':['주민 참여 화면\n현재 선택한 내용:\n','시민 발언 열람 페이지\n','공공기관 소통 화면\n'],
'join':['동일 글에 있는 문장','선택 요소 주변의 글','관련 화면 내용']}}

def norm(s):return ''.join(unicodedata.normalize('NFKC',s).split()).replace('\u200b','')
def build(split,count):
 b=BANKS[split];rng=random.Random({'train':4201,'validation':4202,'final':4203}[split]);out=[];seen=set();tries=0
 while len(out)<count:
  tries+=1;assert tries<count*300,'Not enough distinct compositions'
  o,c,w,n,m,u,f,j=[rng.choice(b[k]) for k in ['offer','cta','prevent','normal','meta','unknown','frame','join']]
  role=len(out)%16;variant=rng.randrange(4);title=rng.choice(['질문과 답변','자유 의견','주민 글','제안 내용','참여 안내'])
  full=o+'. '+c+'.';normal=n+' 참가 신청을 받습니다. '+c+'.';quote='“'+full+'”'
  cases=[
   (full,f+title,0,'direct'),
   (c,f+title+'\n'+o,0,'short-link'),
   (quote,f+'제가 올린 거래 조건을 다시 적습니다. '+c,0,'quoted-offer'),
   (full,f+'다른 이용자의 별도 답글: '+w+'\n현재 작성자의 글: '+c,0,'neighbor-warning'),
   (full,f+w,1,'prevention'),
   (quote,f+w+'\n다른 댓글에 있던 문장: '+c,1,'quoted-prevention'),
   (full,f+title+'\n'+j+': '+w,1,'prevention-after'),
   (quote,f+w+'\n광고 행위를 차단하기 위해 남겨 둡니다.',1,'report'),
   (m,f+full+'\n문서 부가 정보 항목: '+m,2,'metadata'),
   (normal,f+'다른 글의 내용: '+full,2,'ordinary-neighbor'),
   (normal,f+title,2,'ordinary'),
   ('이런 제안에 돈을 보내거나 가입하지 마십시오. '+quote,f+title,1,'warning-target'),
   (c,f+title+'\n'+u+'\n'+rng.choice(b['unknown']),3,'insufficient'),
   (u,f+'제목: '+title+'\n'+rng.choice(b['unknown'])+'\n'+rng.choice(b['unknown']),3,'insufficient'),
   (m+': '+str(rng.randrange(100,9999)),f+full,2,'metadata-value'),
   (full,f+'작성자 본인이 제공하며 신청을 받고 있습니다. '+c,0,'author-offer')]
  target,ctx,label,kind=cases[role]
  if variant==1:target=target.replace(' ','\u200b ')
  elif variant==2:target=unicodedata.normalize('NFD',target)
  elif variant==3:target=target.replace('. ','\n')
  key=json.dumps([target,ctx],ensure_ascii=False);canonical=norm(key)
  # Variants stay in their lexical split. Exact duplicates are removed; near variants counted separately.
  if key in seen:continue
  seen.add(key);i=len(out);out.append({'id':split+'-'+str(i),'group':split+'-'+hashlib.sha256((o+'|'+c+'|'+w).encode()).hexdigest()[:16],'kind':kind,'label':label,'input':{'target':target,'context':ctx}})
 return out
def save(name,obj):
 p=ROOT/(name+'.json');assert not p.exists();p.write_text(json.dumps(obj,ensure_ascii=False),encoding='utf8');return hashlib.sha256(p.read_bytes()).hexdigest()
if __name__=='__main__':
 assert not (ROOT/'data-manifest.json').exists();sets={s:build(s,n) for s,n in [('train',50000),('validation',1600),('final',1600)]};seen={}
 for split,rows in sets.items():
  for r in rows:
   k=norm(json.dumps(r['input'],ensure_ascii=False));assert k not in seen or seen[k]==split;seen[k]=split
 hashes={};stats={}
 for split,rows in sets.items():
  if split=='train':
   # Stratified generation order gives nested balanced size subsets; training itself shuffles.
   hashes['train.json']=save('train',rows)
  elif split=='final':
   hashes['final-inputs.json']=save('final-inputs',[{k:v for k,v in r.items() if k!='label'} for r in rows]);hashes['final-labels.json']=save('final-labels',[{k:r[k] for k in ['id','label','kind','group']} for r in rows])
  else:hashes['validation.json']=save('validation',rows)
  stats[split]={'rows':len(rows),'groups':len({r['group'] for r in rows}),'canonical_inputs':len({norm(json.dumps(r['input'],ensure_ascii=False)) for r in rows}),'offers':len(BANKS[split]['offer']),'labels':{str(y):sum(r['label']==y for r in rows) for y in range(4)}}
 save('data-manifest',{'hashes':hashes,'stats':stats,'synthetic':True,'human_reviewed':False,'independent_author':False});print(json.dumps(stats))
