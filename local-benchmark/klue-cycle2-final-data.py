import importlib.util,json,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('d',Path(__file__).with_name('klue-cycle2-data.py'));d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
b=d.d.BANKS['final'];b['offer']=['허가되지 않은 전자 경주 승부에 현금을 투입할 새 회원을 구합니다','비공인 인터넷 카드 승부장을 유료로 이용할 가입자를 받습니다','법적 허가 없는 온라인 추첨 도박에 돈을 보낼 참가자를 찾습니다','사설 구슬 승부 도박장에서 판돈을 낼 고객을 받습니다','당사자 동의가 없는 성인 사생활 녹화자료를 금액을 받고 전달하겠습니다','비동의 촬영 성인물 저장본의 유료 구독을 받겠습니다','동의받지 않고 유출한 성인 기록 영상의 구매자를 찾습니다','시험장에 의뢰인 대신 들어가는 불법 응시 대행을 돈 받고 맡습니다','존재하지 않는 경력을 적은 위조 확인서를 유상 제작합니다','판매 허가를 받지 않은 약품을 불법 거래하니 주문해 주세요','자격증 없이 의료 시술을 하는 불법 업소의 유료 이용자를 받습니다','도용한 개인 정보 명부의 불법 유상 거래를 제안합니다'];d.EXTRA['final']=[]
b['cta']=['상담 신청란으로 구매 의향을 보내 주세요','해당 서비스의 접수 창으로 이동해 주세요','개설한 연락창에 이용할 뜻을 적어 주세요','주문 담당자에게 진행 요청을 제출해 주세요','이용할 사람은 결제 안내창에 접수해 주세요','연락 화면을 통해 참가를 요청해 주세요']
b['prevent']=['시민이 거절해야 할 모집 문구를 보관한 안내입니다. 이용하라는 내용이 아닙니다','불법 영업을 제지하려고 남긴 발언 기록입니다. 상품을 제공하지 않습니다','신고 처리 교육에서 설명하는 증거 내용입니다. 연결하거나 구매하지 마세요','이 권유를 받은 사람이 피해를 피하도록 안내하는 글입니다. 결제는 하지 마세요','단속 후 남겨 둔 자료를 시민에게 설명합니다. 가입을 받으려는 게시물이 아닙니다','적발 경위를 이해하기 위한 발췌문입니다. 거래를 신청하라는 안내가 아닙니다']
b['unknown']=['관심 있으면 이후 연락','개별적으로 내용 전달 예정','조건에 맞는 분만 요청','요청하시면 다음에 설명','해당되면 따로 연락','나머지 설명은 추후 안내']
rows=d.generate('final',512)
for r in rows:
 r['id']=r['id'].replace('cycle2-final','cycle2-sealed')
 if r['kind']!='metadata':assert d.norm(r['input']['target']) not in d.banned,'Observed exact target reused'
fitting=[]
for split in ['train','validation']:fitting+=json.loads((d.R/(split+'.json')).read_text(encoding='utf8'))
keys={d.norm(json.dumps(r['input'],ensure_ascii=False,sort_keys=True)) for r in fitting}
assert not any(d.norm(json.dumps(r['input'],ensure_ascii=False,sort_keys=True)) in keys for r in rows)
hashes={}
for name,data in [('sealed-inputs',[{k:v for k,v in r.items() if k!='label'} for r in rows]),('sealed-labels',[{k:r[k] for k in ['id','group','kind','label']} for r in rows])]:
 p=d.R/(name+'.json');assert not p.exists();p.write_text(json.dumps(data,ensure_ascii=False),encoding='utf8');hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(d.R/'sealed-manifest.json').write_text(json.dumps({'rows':len(rows),'hashes':hashes,'supersedes_unused':'final-inputs/final-labels','synthetic':True,'human_reviewed':False},indent=2));print(json.dumps({'rows':len(rows),'hashes':hashes}))
