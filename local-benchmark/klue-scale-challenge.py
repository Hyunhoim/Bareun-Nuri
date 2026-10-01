"""Different context layouts, sealed before model selection; still author-generated."""
import importlib.util,json,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('data',Path(__file__).with_name('klue-scale-data.py'));d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
root=d.ROOT;rows=[];b=d.BANKS['final']
for i,offer in enumerate(b['offer']):
 ad=offer+'. '+b['cta'][i%len(b['cta'])]+'.';warning=b['prevent'][i%len(b['prevent'])];normal=b['normal'][i%len(b['normal'])]
 cases=[
 ('거래 접수창',offer+'\n접수하려면 바로 다음 항목을 선택하면 됩니다.',0,'short-link'),
 ('「'+ad+'」','글쓴이의 답변: 앞서 게시한 제 영업 내용을 다시 옮깁니다. 저에게 신청해 주세요.',0,'quoted-offer'),
 (ad,'위 댓글의 작성자: 불법 게시물을 신고합시다.\n현재 댓글 작성자: 저는 여기서 회원을 받고 있습니다.',0,'neighbor-warning'),
 (ad,'게시판 조치 내역\n신고를 받아 삭제한 내용의 사본입니다. 접근 경로는 폐쇄했습니다.',1,'report'),
 (f'2026.{i+1:02d}.17 09:42',ad+'\n작성 시점이 표시됩니다.',2,'metadata-value'),
 (['솔바람','강가산책','작은나무','푸른창','구름길','아침노래','여름들판','바다소리'][i],ad+'\n이 항목은 작성자 계정의 별명입니다.',2,'metadata'),
 ('이용 신청','이전 게시물: '+ad+'\n현재 글: '+normal+'의 신청 화면입니다.',2,'ordinary-neighbor'),
 ('조건 확인 후 연락','화면 제목: 주민 대화\n게시물 내용이 이 문구 외에는 보이지 않습니다.',3,'insufficient'),
 (ad,'부산의 생활 환경 개선을 제안합니다.\n주민 자유 게시글',0,'direct'),
 (ad,'현재 글: '+warning+'\n별도의 이용자 댓글: 가입은 어디서 하나요?',1,'quoted-prevention'),
 (ad.replace(' ',''),'제가 제공하는 서비스의 주문 안내입니다.',0,'author-offer'),
 ('그 제안에 응하거나 대금을 지불하지 마세요. '+ad,'피해를 막으려는 시민의 답글입니다.',1,'warning-target')]
 for j,(target,context,label,kind) in enumerate(cases):rows.append({'id':f'boundary-{i}-{j}','group':f'boundary-{i}','kind':kind,'label':label,'input':{'target':target,'context':context}})
assert not (root/'challenge-inputs.json').exists()
manifest={'synthetic':True,'human_reviewed':False,'different_layouts':True,'independent_author':False,'rows':len(rows),'hashes':{}}
for name,data in [('challenge-inputs',[{k:v for k,v in r.items() if k!='label'} for r in rows]),('challenge-labels',[{k:r[k] for k in ['id','group','label','kind']} for r in rows])]:
 p=root/(name+'.json');p.write_text(json.dumps(data,ensure_ascii=False),encoding='utf8');manifest['hashes'][p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(root/'challenge-manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(manifest))
