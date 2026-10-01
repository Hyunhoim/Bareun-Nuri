import json,random,hashlib,unicodedata,importlib.util
from pathlib import Path
root=Path('.runtime/klue-cycle3-v1');root.mkdir(exist_ok=False)
s=importlib.util.spec_from_file_location('d',Path(__file__).with_name('klue-cycle2-data.py'));d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
def clean(x):return unicodedata.normalize('NFC',x).replace('\u200b','')
def load(base,file):return json.loads((Path(base)/(file+'.json')).read_text(encoding='utf8'))
panels={
'lexical':load('.runtime/klue-scale-v1','final-inputs'),
'boundary':load('.runtime/klue-scale-v1','challenge-inputs'),
'structure':load('.runtime/klue-cycle2-v3','sealed-inputs'),
'replica':load('.runtime/klue-scale-v1','corrected-regression'),
'legacy':load('.runtime/klue-scale-v1','legacy-dom-regression')}
for name,base,file in [('lexical','.runtime/klue-scale-v1','final-labels'),('boundary','.runtime/klue-scale-v1','challenge-labels'),('structure','.runtime/klue-cycle2-v3','sealed-labels')]:
 gold={r['id']:r['label'] for r in load(base,file)}
 for r in panels[name]:r['label']=gold[r['id']]
for name in ['replica','legacy']:
 for r in panels[name]:r['label']=None if r['is_ad'] is None else 0 if r['is_ad'] else 2
banned={clean(r['input']['target']) for rs in panels.values() for r in rs};rng=random.Random(9931)
services=['허가 없는 도박방 이용권','사설 스포츠 베팅 계정','불법 온라인 카드 내기','현금을 거는 무허가 경주 게임','사설 바카라 도박 서비스','허가 없이 운영되는 복권 도박','판돈을 받는 사설 룰렛','불법 현금 슬롯 게임','비인가 경륜 도박방','사설 승부 예측 도박','동의 없이 촬영된 성인 영상','불법 유출 성인 동영상','비동의 성인 사생활 녹화본','피해자 허락 없는 성인 기록 파일','몰래 촬영된 성인물 복제본','불법 촬영 성인 자료 이용권','다른 사람 대신 치르는 시험 응시','불법 자격 시험 대리 응시','유료 면접 대리 참가','위조 신분 증명 문서','가짜 경력 확인서','불법 위조 졸업 서류','의사 자격 없는 불법 의료 시술','면허 없이 진행하는 의료 행위','허가 없는 약품의 불법 유통','판매 허가가 없는 불법 의약품','도용한 개인정보의 불법 매매','유출된 개인 명부의 유상 거래']
acts=['돈을 받고 제공하고 있습니다','유료 이용을 원하는 고객을 받습니다','비용을 낼 신청자를 찾고 있습니다','구매 의뢰를 접수합니다','이용 대가를 받고 제공하겠습니다','이용할 분의 요청을 기다립니다','지금 유상 거래를 진행합니다','대금을 낸 분에게 공급합니다']
starts=['제가 제공하는 것은','여기서 거래하는 항목은','신규로 안내할 서비스는','제가 받고 있는 의뢰는','현재 접수하는 서비스는','이곳에서 유료로 공급할 것은']
calls=['신청할 분은 연락을 남겨 주세요','거래할 분의 상담을 받습니다','구매하려면 접수해 주세요','진행할 의사를 보내 주세요','유료로 이용할 분은 메시지를 남겨 주세요','연결된 창구로 이용을 요청하세요','계정에 주문 의사를 적어 주세요','참여를 원하면 접수 창을 열어 주세요']
pre=['단속 기록에 나온 모집 문장을 살펴보는 중입니다','수사 자료에서 문제된 게시물을 인용했습니다','피해 방지 차원에서 적발된 제안을 옮겨 적습니다','삭제 대상 표현을 교육 자료에 실었습니다','게시판 관리 교육을 위해 증거 문구를 보존합니다','잘못된 광고의 양상을 설명하려고 원문을 제시합니다','거래 피해를 막기 위한 설명에서 가져온 사례입니다','신고된 제안이 어떤 말인지 시민에게 알려 드립니다','당사자가 거절한 모집 메시지를 기록으로 남깁니다','방송의 범죄 예방 해설에서 해당 발언을 소개합니다']
reject=['이 제안에 응하면 안 됩니다','여기서는 가입을 받지 않습니다','판매를 중개하려는 목적이 아닙니다','이용하거나 돈을 보내지 마세요','연결을 안내하는 곳이 아닙니다','상품을 제공하는 게시글이 아닙니다','구매 신청을 권유하지 않습니다','현재 글쓴이는 판매자가 아닙니다']
pages=['참여 게시글','주민 발언','문의와 답변','소통 화면','상세 내용','시민 게시판','열린 공간','질문 보기']
normals=d.NORMAL['train'];rows=[];seen=set()
while len(rows)<6000:
 service=rng.choice(services);cta=rng.choice(calls);offer=rng.choice(starts)+' '+service+'입니다. '+rng.choice(acts)+'. '+cta+'.'
 warning=rng.choice(pre)+'. '+rng.choice(reject)+'.';n=' '.join(rng.sample(normals,rng.randrange(1,4)));other=rng.choice(normals);page=rng.choice(pages);short=rng.choice(['상담','신청','접수','연락','문의','진행'])+rng.choice([' 안내',' 요청','하실 분','을 남겨 주세요',' 방법',' 바랍니다']);role=len(rows)%12
 value=rng.choice([f'{rng.randrange(2019,2027)}.{rng.randrange(1,13):02d}.{rng.randrange(1,29):02d}',rng.choice(['고요한숲','별이뜨는밤','따뜻한바람','겨울바다','작은돌담']),str(rng.randrange(10,9999))]);head='등록일' if '.' in value else '작성자' if not value.isdigit() else '열람 수'
 own=rng.choice(['앞 문맥: ','글의 시작: ','같은 작성자의 설명: ','본문: ']);tail=rng.choice(['뒤 문맥: ','이어서: ','같은 글의 끝: ']);foreign=rng.choice(['다른 댓글의 내용: ','앞 게시물(다른 작성자): ','관련 없는 글: ']);both=rng.choice([True,False]);safe=page+'\n'+(own+warning if both else tail+warning)
 cases=[
 (offer,page if both else page+'\n'+foreign+n,0,'direct'),
 (short,page+'\n'+own+offer,0,'short-link'),
 ('“'+offer+'”',page+'\n'+own+'제가 판매하는 내용이라 다시 적었습니다. '+cta,0,'quoted-offer'),
 (offer,page+'\n'+foreign+warning+'\n'+tail+'제 거래에 참가할 분을 받습니다.',0,'neighbor-warning'),
 (offer,safe,1,'prevention'),
 (warning+' 「'+offer+'」',page,1,'warning-target'),
 ('“'+offer+'”',safe+'\n'+foreign+cta,1,'quoted-prevention'),
 (n,page if both else page+'\n'+foreign+offer,2,'ordinary'),
 (value,page+'\n'+own+head+'\n'+tail+offer,2,'metadata'),
 (other,page+'\n'+foreign+offer+'\n'+tail+n,2,'ordinary-neighbor'),
 (short,page+'\n'+foreign+n if both else page+'\n이 문구 외에 어떤 것을 신청하는지 나타난 자료가 없습니다.',3,'insufficient'),
 (short,page+'\n'+foreign+offer+'\n현재 선택한 항목의 제공 대상은 확인되지 않습니다.' if both else page+'\n'+foreign+n+'\n추가 설명이 빠져 있습니다.',3,'insufficient')]
 target,ctx,label,kind=cases[role]
 if clean(target) in banned:continue
 if rng.random()<.15 and label==0:target=target.replace(' ','')
 key=json.dumps([target,ctx],ensure_ascii=False)
 if key in seen:continue
 seen.add(key);rows.append({'id':f'compositional-{len(rows)}','input':{'target':target,'context':ctx},'label':label,'kind':kind})
# Retain a deterministic sample of previous fitting data only, never previous final labels.
old=load('.runtime/klue-cycle2-v3','train');rng.shuffle(old)
for r in old[:2000]:
 if clean(r['input']['target']) not in banned:rows.append({**r,'id':'rehearsal-'+r['id']})
hashes={}
for name,obj in [('train',rows),('development',panels)]:
 f=root/(name+'.json');f.write_text(json.dumps(obj,ensure_ascii=False),encoding='utf8');hashes[f.name]=hashlib.sha256(f.read_bytes()).hexdigest()
(root/'manifest.json').write_text(json.dumps({'rows':len(rows),'hashes':hashes,'development_is_observed':True,'synthetic':True,'service_atoms':len(services),'new_compositional_rows':6000},indent=2));print(json.dumps({'train':len(rows),'panels':{k:len(v) for k,v in panels.items()}}))
