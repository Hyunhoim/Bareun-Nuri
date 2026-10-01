import json,random,hashlib,unicodedata,importlib.util
from pathlib import Path
R=Path('.runtime/klue-cycle2-v3')
spec=importlib.util.spec_from_file_location('data',Path(__file__).with_name('klue-scale-data.py'));d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
NORMAL={
'train':[
'도서관은 이번 주에 서가 배치를 바꾸고 있습니다.','신청한 민원 처리 상태를 조회하고 싶습니다.','주민 설명회의 장소가 바뀌었다고 들었는데 확인 부탁드립니다.','장애인도 내용을 들을 수 있도록 버튼에 음성 설명을 제공합니다.','한글을 이루는 자음과 모음을 공부하는 자료입니다.','HTML 태그가 어떻게 문서의 구조를 나타내는지 배웁니다.','글자 색과 배경의 명도 차이를 비교하는 디자인 연습입니다.','화면 읽기 프로그램에서 이동 메뉴를 확인하는 수업입니다.','안내 문서의 영문 철자를 고치는 편집 활동입니다.','키보드만으로 화면을 조작하는 방법을 설명합니다.','행사 날짜가 변경되면 주민에게 다시 알려 드리겠습니다.','주차장 공사가 끝나면 이용을 재개합니다.','박물관이 수집한 놀이 도구를 전시하고 있습니다.','체육 모임은 금전 내기를 하지 않고 친목을 나눕니다.','영상 촬영 시에는 참여자의 동의를 먼저 확인합니다.','학교에서 개인정보 보호를 주제로 토론합니다.','삭제된 댓글에 대해 이의 신청하는 절차를 문의합니다.','시청 누리집의 오류 화면을 제보합니다.','그림이 표시되지 않아 게시 내용을 읽기 어렵습니다.','공공 강좌의 준비물은 각 강좌 안내에 나와 있습니다.','주민 증명 서류의 발급 창구를 안내합니다.','신청서에서 오타를 발견해 수정본을 올립니다.','온라인 사기 피해의 상담 창구를 찾고 있습니다.','스포츠 경기 결과를 통계 수업의 예제로 분석합니다.','확률과 기대값을 배우는 수학 학습지입니다.','불법 도박이 공동체에 미치는 영향을 토론합니다.','시험 대리 응시는 허용되지 않는다는 공지입니다.','의료기관의 자격을 확인하는 방법을 배우는 교육입니다.','반복되는 광고 게시물의 삭제 기준을 문의합니다.','주민들이 물품을 기부하는 장터가 열립니다.','공연 관람권의 예매 안내를 확인해 주세요.','응급 상황을 가정한 안전 훈련을 실시합니다.','오늘 회의의 결정 내용을 문서로 공유합니다.','다음 답변이 등록되면 안내를 받겠습니다.','수업에서 문자 조합 방식에 따른 표시 차이를 관찰합니다.','화면 가장자리 밖에 둔 설명도 보조 기술로 전달할 수 있습니다.','메뉴의 투명도가 바뀌는 애니메이션을 실습합니다.','담당 부서를 찾지 못해 연락처를 문의합니다.','지역 문화 행사의 사진을 게시판에 올립니다.','지급받은 자료의 제목과 작성 날짜를 확인합니다.'],
'validation':[
'주민회의에서 결정한 내용을 어디서 열람할 수 있나요?','민원 답변의 진행 단계를 알려 주시면 좋겠습니다.','아동 독서 프로그램에 필요한 책은 현장에서 제공합니다.','음성으로 읽히는 설명을 추가해 시각 정보의 접근성을 높입니다.','문서의 글자를 낱소리로 표현하는 과정을 배우고 있습니다.','체험 학습 신청 인원이 변경되어 안내드립니다.','운동 교실에서는 돈을 거는 행위를 하지 않습니다.','화면 이동 버튼의 이름이 잘못 표시되는 오류를 알립니다.','예술 전시에서 영상 매체의 역사를 다룹니다.','인터넷 도박을 예방하는 학교 강연이 열립니다.','공식 서류에 적힌 사항을 수정하는 방법이 궁금합니다.','신분증을 대신 사용하면 안 된다는 안내를 받았습니다.','현장 진료 기관의 등록 정보를 확인해 보겠습니다.','서식 파일을 내려받는 위치를 문의하고자 합니다.','안전 교육에 필요한 도구를 준비했습니다.','프로그램 접수 종료일을 다시 공지하겠습니다.'],
'final':[
'지역 토론회에서 나온 의견을 정리한 자료를 공유합니다.','제가 낸 제안이 어느 부서에 배정됐는지 알고 싶어요.','보조 기기가 읽을 수 있게 그림의 설명을 덧붙였습니다.','화면 확대 상태에서도 글의 순서를 따라갈 수 있도록 구성했습니다.','낱글자 조립 과정을 관찰하는 한국어 학습 활동입니다.','민원 접수창이 열리지 않는 현상을 전달드립니다.','공원 시설의 수리 일정이 확정되면 알려 주세요.','학교 스포츠 모임은 현금을 걸지 않는 연습 경기입니다.','주민 대상 수업에서 온라인 내기의 위험을 설명합니다.','문화시설의 체험 시간표를 안내문에서 확인할 수 있습니다.','행정 기록의 열람 절차에 관한 답변을 부탁드립니다.','다른 사람의 자격을 빌려 시험을 치르면 안 된다는 설명입니다.','올린 사진에 등장하는 분들의 동의를 확인했습니다.','기기 화면 밖의 보충 문장을 음성으로 전달하는 기능을 배웁니다.','서체의 모양과 코드 표현이 다른 사례를 공부합니다.','게시한 첨부 문서의 내용에 오류가 있어 수정했습니다.','약속한 회의 장소가 바뀌어 참석자에게 알립니다.','영상물을 동의 없이 유포했을 때 생기는 피해를 교육합니다.','공립 강좌의 비용과 접수 방법은 담당 기관에 문의하세요.','수술 여부를 결정하기 전에 의료진의 설명을 들으라는 자료입니다.']}
EXTRA={
'train':['시험을 대신 치러 드리는 불법 대리 응시의 비용을 받습니다','신분 증명서를 위조해 판매하니 구매 신청을 받습니다','허가 없는 의약품을 불법으로 판매하며 주문을 받습니다','의료 자격 없이 불법 시술을 제공하니 유료 예약을 받습니다','위조 졸업 증서를 돈 받고 제작해 드립니다','불법 개인 정보 명단을 돈 받고 넘기니 구매 연락을 받습니다'],
'validation':['다른 사람 명의로 자격 시험에 대신 출석할 의뢰인을 받습니다','불법 복제한 신분 확인 문서를 유상 판매합니다','무자격 의료 시술의 불법 영업 예약을 받습니다'],
'final':['자격 검정에 본인 대신 응시하는 불법 서비스를 유료로 제공합니다','위조한 경력 증명 문서를 돈 받고 판매하니 구매자를 받습니다','허가 없이 판매하는 불법 의약품의 주문을 받고 있습니다','의료 자격 없이 하는 불법 시술을 유료로 예약해 드립니다']}
def norm(x):return unicodedata.normalize('NFC',x).replace('\u200b','')
banned=set()
for base,file in [('.runtime/klue-pilot-v2','final-inputs'),('.runtime/klue-scale-v1','final-inputs'),('.runtime/klue-scale-v1','challenge-inputs'),('.runtime/klue-scale-v1','corrected-regression'),('.runtime/klue-scale-v1','legacy-dom-regression')]:
 for r in json.loads((Path(base)/(file+'.json')).read_text(encoding='utf8')):banned.add(norm(r['input']['target']))
def generate(split,count):
 rng=random.Random({'train':7221,'validation':7222,'final':7223}[split]);b=d.BANKS[split];rows=[];seen=set();attempt=0
 titles={'train':['시민 제안 상세','주민 의견 게시판','자유로운 소통','답변 보기'],'validation':['지역민의 글','참여 게시판 상세','질의 내용'],'final':['주민 소식 열람','공공 소통 게시글','열린 의견 목록']}[split]
 names={'train':['돌담길','새벽숲','노란꽃','갈대밭','봄기운','저녁놀'],'validation':['햇살누리','푸른섬','서리꽃'],'final':['초록달','하늘연못','은빛뜰','따뜻한길']}[split]
 while len(rows)<count:
  attempt+=1;assert attempt<count*500
  o=rng.choice(b['offer']+EXTRA[split]);c=rng.choice(b['cta']);w=rng.choice(b['prevent']);n=rng.choice(NORMAL[split]);other=rng.choice(NORMAL[split]);t=rng.choice(titles);u=rng.choice(b['unknown']);full=o+'. '+c+'.';role=len(rows)%16
  value=rng.choice([f'{rng.randrange(2021,2027)}-{rng.randrange(1,13):02d}-{rng.randrange(1,29):02d}',rng.choice(names),str(rng.randrange(10,9000))]);head='작성일' if '-' in value else '작성자' if not value.isdigit() else '조회 횟수'
  if split!='final':
   cases=[(full,t,0,'direct'),(c,t+'\n앞 문맥: '+o,0,'short-link'),('“'+full+'”',t+'\n앞 문맥: 제 영업 안내를 다시 인용합니다.\n뒤 문맥: 저에게 신청하세요.',0,'quoted-offer'),(full,t+'\n뒤 문맥: '+w,1,'prevention'),(n,t,2,'ordinary'),(n,t+'\n다른 이용자의 글: '+full,2,'ordinary-neighbor'),(c,t+'\n앞 문맥: '+n+'\n뒤 문맥: 공공 프로그램의 절차입니다.',2,'ordinary-link'),(value,t+'\n앞 문맥: '+head+'\n다른 항목: '+full,2,'metadata'),(n,t+'\n앞 문맥: '+other,2,'ordinary-context'),(c,t,3,'insufficient'),(full,t+'\n다른 댓글: '+w+'\n현재 작성자: 제가 접수를 받습니다.',0,'neighbor-warning'),('“'+full+'”',t+'\n앞 문맥: '+w+'\n다른 답글: '+c,1,'quoted-prevention'),(full.replace(' ',''),t+'\n앞 문맥: 작성자',0,'compact'),(w+' 「'+full+'」',t,1,'warning-target'),(n,t+'\n뒤 문맥: '+other,2,'ordinary-context'),(u,t+'\n앞 문맥: 접수 내용\n뒤 문맥: '+rng.choice(b['unknown']),3,'insufficient')]
  else:
   # Different discourse assembly from fitting data. No feedback from this panel before freezing.
   cases=[(full,t+'\n새 이용자를 직접 받고 있는 글입니다.',0,'direct'),(c,t+'\n이곳에서 이용할 대상: '+o,0,'short-link'),('「'+full+'」',t+'\n전에 올린 제 판매 조건을 그대로 옮겼습니다. 신청을 기다립니다.',0,'quoted-offer'),(full,t+'\n적발 자료 해설\n'+w,1,'prevention'),(n,t,2,'ordinary'),(n,t+'\n별개 게시물의 일부: '+full+'\n위 내용과 작성자가 다른 현재 글입니다.',2,'ordinary-neighbor'),(c,t+'\n현재 안내하는 공공 업무: '+n,2,'ordinary-link'),(value,t+'\n게시물 정보\n'+head+'\n본문에는 다음이 적혀 있습니다: '+full,2,'metadata'),(n,t+'\n같은 글에 덧붙인 이야기: '+other,2,'ordinary-context'),(c,t+'\n이 항목에 연결된 본문은 확인되지 않습니다.',3,'insufficient'),(full,t+'\n이전 사람이 남긴 경고: '+w+'\n이 문장을 쓴 사람은 판매를 진행하고 있습니다.',0,'neighbor-warning'),('“'+full+'”',t+'\n이 표현을 보관한 이유: '+w+'\n관련 없는 문의글: '+c,1,'quoted-prevention'),(full.replace(' ',''),t+'\n유료 이용 문의를 받는 공고입니다.',0,'compact'),('거래에 응하지 않도록 알려 드립니다. '+w+' 「'+full+'」',t,1,'warning-target'),(n,t+'\n추가로 남겨 놓은 설명: '+other,2,'ordinary-context'),(u,t+'\n제공 대상이나 거래 내용이 표시되지 않았습니다.',3,'insufficient')]
  target,context,label,kind=cases[role]
  if split=='train' and role==9:context+='\n등록 정보: '+value
  if split=='train' and norm(target) in banned:continue
  v=rng.randrange(3)
  if v==1:target=unicodedata.normalize('NFD',target)
  elif v==2:target=target.replace(' ','\u200b ')
  inp={'target':target,'context':context};key=json.dumps(inp,ensure_ascii=False)
  if key in seen:continue
  seen.add(key);rows.append({'id':f'cycle2-{split}-{len(rows)}','group':split+'-'+hashlib.sha256((o+'|'+n+'|'+w).encode()).hexdigest()[:12],'kind':kind,'input':inp,'label':label})
 return rows
def main():
 R.mkdir(exist_ok=False)
 sets={s:generate(s,n) for s,n in [('train',5000),('validation',800),('final',512)]}
 # Rehearsal uses only prior fitting data. No prior validation/final gold is fitted.
 old=json.loads(Path('.runtime/klue-refinement-v1/train.json').read_text(encoding='utf8'))
 seen={norm(json.dumps(r['input'],ensure_ascii=False,sort_keys=True)) for r in sets['train']}
 for r in old:
  k=norm(json.dumps(r['input'],ensure_ascii=False,sort_keys=True))
  if norm(r['input']['target']) not in banned and k not in seen:sets['train'].append({**r,'id':'rehearsal-'+r['id'],'kind':'rehearsal'});seen.add(k)
 cross={};stats={};hashes={}
 for split,rows in sets.items():
  for r in rows:
   k=norm(json.dumps(r['input'],ensure_ascii=False,sort_keys=True))
   if k in cross:assert cross[k][0]==split and cross[k][1]==r['label']
   cross[k]=(split,r['label'])
  stats[split]={'rows':len(rows),'canonical_unique':len({norm(json.dumps(r['input'],ensure_ascii=False,sort_keys=True)) for r in rows}),'labels':{str(y):sum(r['label']==y for r in rows) for y in range(4)}}
  files={split:rows} if split!='final' else {'final-inputs':[{k:v for k,v in r.items() if k!='label'} for r in rows],'final-labels':[{k:r[k] for k in ['id','group','kind','label']} for r in rows]}
  for name,value in files.items():
   p=R/(name+'.json');p.write_text(json.dumps(value,ensure_ascii=False),encoding='utf8');hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
 (R/'manifest.json').write_text(json.dumps({'stats':stats,'hashes':hashes,'synthetic':True,'human_reviewed':False,'normal_base_phrases':{k:len(v) for k,v in NORMAL.items()}},indent=2));print(json.dumps(stats))
if __name__=='__main__':main()
