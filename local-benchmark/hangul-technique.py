"""Frozen-model Korean confusable diagnostic, separate from production/training."""
import importlib.util,json,hashlib,time,statistics,gc
from pathlib import Path
s=importlib.util.spec_from_file_location('c',Path(__file__).with_name('canine-technique.py'));c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
ROOT=Path('.runtime/hangul-technique-v1')
# Tuple text is authored evidence; labels/readings never go into model inputs.
GROUPS=[
 ('토ㅌ0','토토','digit',[
 '오늘 경기 아직 안 끝났습니다. {x} 신규방 들어오실 분은 댓글 남겨요. 첫 충전 추가 지급합니다.',
 '아이 휴대폰에 {x} 가입하고 충전하라는 쪽지가 왔어요. 도박 광고 같아서 신고하려는데 어디로 보내나요?',
 '사설 경기 베팅방 회원 받습니다. 문의할 때 상담번호 {x}를 그대로 보내 주세요. 끝의 숫자 영은 담당 창구 번호입니다.',
 '사진에 {x}라고 찍혀 있는데 앞뒤가 잘렸네요. 이것만 보고는 무엇인지 모르겠습니다.']),
 ('토ㅌO','토토','latin_circle',[
 '{x} 추천인 아직 없으신 분 계세요? 사설 경기 사이트 첫 입금 혜택 챙겨드려요. 제 프로필로 오세요.',
 '계속 {x} 추천인이라고 댓글이 붙습니다. 사설 베팅으로 연결되니 누르지 마세요. 관리자님 삭제 부탁드려요.',
 '사설 베팅방 가입 안내입니다. 상담 창구 이름은 {x}입니다. A부터 Z까지 창구를 나눴고 여기는 O창구라 이 코드를 적어 주세요.',
 '첨부가 사라져서 {x}라는 글자만 남았어요. 원래 어떤 게시물이었나요?']),
 ('카ㅈI노','카지노','latin_vertical',[
 '늦은 시간에도 {x} 입장됩니다. 사설 테이블 방이고 첫 충전 두 배 행사 오늘까지예요. 쪽지 주세요.',
 '주민 소통 게시판에 {x} 입장 링크가 있네요. 사설 도박방 광고를 여기까지 올리는 건 막아주세요.',
 '사설 도박방 입장 받습니다. 담당자 조회코드 {x}에서 I는 담당 팀의 영문 구분자입니다. 문의 시 전체 코드를 알려주세요.',
 '누가 {x}라고 적었는데 설명이 없어요. 뜻을 아시는 분 있나요?']),
 ('카ㅈl노','카지노','latin_vertical',[
 '{x} 방 바꾸실 분, 사설 라이브 테이블 운영 중입니다. 충전 확인되면 바로 자리 잡아드립니다.',
 '충전하면 자리 준다는 {x} 댓글, 불법 도박장으로 유도하는 내용입니다. 신고하고 차단했습니다.',
 '불법 도박 테이블 신규 손님 모집합니다. 예약 식별자 {x}의 소문자 l은 예약 채널 구분으로 쓰고 있으니 원문 그대로 보내세요.',
 '검색 목록에 {x} 한 줄만 나오고 페이지가 안 열립니다. 다른 정보는 없어요.']),
 ('ㅁr약','마약','latin_shape',[
 '단속 때문에 글 자주 지웁니다. {x} 구하시는 분만 연락 주세요. 대금 확인하고 물건 넘깁니다.',
 '{x} 구하면 연락하라는 댓글이 반복됩니다. 마약 판매를 돌려 쓴 것으로 보여 신고합니다. 답장하지 마세요.',
 '마약 판매 문의 받습니다. 상담키 {x}에서 r은 접수 서버 이름이고 앞의 자음은 담당자 표식입니다. 이 키를 복사해 문의하세요.',
 '종이에 {x}가 적혀 있는데 이게 무슨 약자인지 모르겠습니다. 출처도 알 수 없어요.']),
 ('대口ㅏ','대마','cjk_square',[
 '{x} 물량 있습니다. 국내에서 몰래 구하시는 분은 쪽지 주세요. 입금 후 전달 일정 잡습니다.',
 '동네 게시판의 {x} 판매 글을 신고합니다. 대마를 다른 문자로 적어 놓은 듯한데 거래하지 마세요.',
 '국내 불법 대마 거래 희망자 받습니다. 주문번호 {x}에서 네모 한자는 담당 창구를 뜻합니다. 번호 전체를 그대로 전달하세요.',
 '목록 제목이 {x}뿐입니다. 내용을 못 봐서 약자인지 단어인지 알 수 없습니다.']),
 ('ㅂI아그라','비아그라','latin_vertical',[
 '처방전 없어도 {x} 구매 가능합니다. 온라인으로 개인 판매합니다. 필요하신 분 수량 적어서 연락 주세요.',
 '처방전 없이 {x}를 판다는 글이 올라왔습니다. 의약품 불법 판매로 의심돼 신고하니 주문하지 마세요.',
 '처방전 없이 전문의약품 개인 판매합니다. 재고코드는 {x}이고 I는 창고 기호입니다. 문의할 때 코드를 바꾸지 마세요.',
 '깨진 화면에 {x}라는 표기가 있었어요. 설명이나 링크는 확보하지 못했습니다.']),
 ('성ㅇlㄴ','성인','latin_vertical',[
 '불법 촬영 영상 모아둔 {x} 자료방 유료 입장 받습니다. 결제하실 분만 연락 주세요.',
 '{x} 자료방이라는 댓글이 불법 촬영물 판매로 연결됩니다. 피해 확산 막도록 신고 처리 부탁드립니다.',
 '불법 촬영물 유료 판매합니다. 결제 식별자는 {x}이며 l은 결제 서버 코드입니다. 식별자를 그대로 입력하세요.',
 '문서에 {x}라고만 표시됩니다. 지워진 부분이 많아 어떤 의미로 쓴 건지는 확인할 수 없어요.'])]
BOUNDARY=[
 ('ㅌㅗㅌㅗ','사설 {x} 신규 가입 받고 있어요. 충전하면 추가 지급합니다.','JAMO',True),
 ('ㅋㅏㅈㅣㄴㅗ','{x} 사설 도박방 입장 희망자는 연락 주세요.','JAMO',True),
 ('ㅁㅏㅇㅑㄱ','{x} 판매합니다. 몰래 거래할 사람만 쪽지 주세요.','JAMO',True),
 ('ㅂㅣㅇㅏㄱㅡㄹㅏ','처방전 없이 {x} 개인 판매합니다. 구매할 분 연락 주세요.','JAMO',True),
 ('ㅌㅗㅌㅗ','가입을 권하는 {x} 댓글을 봤습니다. 도박 광고 신고합니다.','JAMO',False),
 ('ㅋㅏㅈㅣㄴㅗ','{x}라고 자모를 풀어 쓴 도박 광고입니다. 링크 누르지 마세요.','JAMO',False),
 ('ㄱㅏㄴㅏ','한글 수업에서 {x}를 글자로 합치는 활동을 했습니다.','JAMO',False),
 ('ㅎㅏㄴㄱㅡㄹ','아이에게 {x}의 자음과 모음을 하나씩 읽게 했어요.','JAMO',False),
 ('토토','불법 사설 {x} 사이트 가입 혜택 드립니다. 충전하고 이용하세요.','plain',True),
 ('카지노','{x} 사설 테이블 이용자를 모집합니다. 입금하면 입장됩니다.','plain',True),
 ('0O','도서관 강좌 자료의 {x}는 숫자 영과 영문 대문자 오를 나란히 쓴 예시입니다.','education',False),
 ('ㅇoO','국어와 영어 글자 모양을 비교하는 표에 {x}가 나옵니다. 각각 별개의 글자를 표시했습니다.','education',False),
 ('I1l','안내문에서 {x}를 구별하는 연습을 합니다. 대문자 아이, 숫자 일, 소문자 엘입니다.','education',False),
 ('가0동','시설도면 구역 {x}는 영번 동을 뜻하는 관리 명칭입니다. 표기 그대로 접수해 주세요.','identifier',False),
 ('나O형','기기 {x}는 영문 O형 모델입니다. 다른 모델과 부품이 호환되지 않습니다.','identifier',False),
 ('보건I팀','영문 로마숫자 체계를 쓴 조직표의 {x}는 제1팀이며 원래 공식 명칭입니다.','identifier',False)]
def prepare():
    ROOT.mkdir(exist_ok=False);rows=[];gold=[]
    def add(token,text,label,panel,family,kind,is_ad,reading=None):
        assert text.count(token)==1
        ident=hashlib.sha256((text+'|'+panel).encode()).hexdigest()[:20]
        rows.append({'id':ident,'token':token,'input':{'target':text.replace(token,'[표기]'+token+'[/표기]'),'context':'공공기관 홈페이지 게시판의 글 또는 댓글'}})
        gold.append({'id':ident,'label':label,'panel':panel,'family':family,'kind':kind,'is_ad':is_ad,'reading':reading,'label_source':'synthetic_author_not_independent_review'})
    for token,reading,kind,texts in GROUPS:
        for i,text in enumerate(texts):add(token,text.format(x=token),[0,0,1,2][i],'core',reading,kind,i in [0,2],reading)
    for token,text,kind,ad in BOUNDARY:add(token,text.format(x=token),1,'boundary',token,kind,ad)
    assert len(rows)==48 and len({r['id'] for r in rows})==48
    old=c.read(c.DATA/'train-inputs.json');oldtexts={r['input']['target'] for r in old};oldtokens={r['token'] for r in old}
    assert not oldtexts&{r['input']['target'] for r in rows}
    assert not oldtokens&{r['token'] for r in rows}
    c.save(ROOT/'inputs.json',rows);c.save(ROOT/'gold.json',gold)
    hashes={arm:c.p.digest(c.model_path(arm)/'model.safetensors') for arm in ['existing','klue_uts']}
    c.save(ROOT/'manifest.json',{'input_sha256':c.p.digest(ROOT/'inputs.json'),'gold_sha256':c.p.digest(ROOT/'gold.json'),'models':hashes,'training_overlap_exact':0,'training_token_overlap':0,'core_rows':32,'boundary_rows':16,'core_word_families':len({x[1] for x in GROUPS}),'synthetic':True,'new_final_holdout':False})
    print('48 diagnostic cases frozen before prediction')
def run():
    assert not (ROOT/'completed.json').exists();manifest=c.read(ROOT/'manifest.json');rows=c.read(ROOT/'inputs.json');m=c.mapping();c.torch.set_num_threads(8)
    assert c.p.digest(ROOT/'inputs.json')==manifest['input_sha256'];assert c.p.digest(ROOT/'gold.json')==manifest['gold_sha256']
    for arm in ['existing','klue_uts']:
        assert c.p.digest(c.model_path(arm)/'model.safetensors')==manifest['models'][arm]
        start=time.perf_counter();tok=c.p.AutoTokenizer.from_pretrained(c.model_path(arm),local_files_only=True);model=c.p.AutoModelForSequenceClassification.from_pretrained(c.model_path(arm),local_files_only=True).to('cpu');load=time.perf_counter()-start
        inp,lens=c.encode(tok,rows,arm,m);assert max(lens)<=512;c.p.predict(model,tok,inp[:8]);timings=[];preds=None
        for repeat in range(3):
            ordered=rows if repeat!=1 else list(reversed(rows));start=time.perf_counter();inp,_=c.encode(tok,ordered,arm,m);pred,secs=c.p.predict(model,tok,inp);wall=time.perf_counter()-start
            found={r['id']:v for r,v in zip(ordered,pred,strict=True)}
            if preds is None:preds=found
            else:assert preds==found
            timings.append({'inference_sec':secs,'wall_sec':wall})
        c.save(ROOT/(arm+'.json'),{'model_hash':manifest['models'][arm],'rows':[{'id':r['id'],'label':preds[r['id']]} for r in rows],'load_sec':load,'timings':timings,'median_wall_sec':statistics.median(x['wall_sec'] for x in timings),'max_length':max(lens),'truncated':0})
        del model;gc.collect();print('predictions completed',arm,flush=True)
    c.save(ROOT/'completed.json',{'completed':True,'training':False,'api_calls':0})
def score():
    assert c.read(ROOT/'completed.json')['completed'];gold=c.read(ROOT/'gold.json');results={};base={r['id']:r['label'] for r in c.read(ROOT/'existing.json')['rows']}
    for arm in ['existing','klue_uts']:
        saved=c.read(ROOT/(arm+'.json'));pred={r['id']:r['label'] for r in saved['rows']};result={}
        for name,group in [('core',[r for r in gold if r['panel']=='core']),('boundary',[r for r in gold if r['panel']=='boundary']),('gold_ad_context',[r for r in gold if r['panel']=='core' and r['is_ad']]),('posthoc_exclude_weak_circle_shape',[r for r in gold if r['panel']=='core' and r['family']!='토토']),('all48',[r for r in gold])]:
            met=c.t.metric([r['label'] for r in group],[pred[r['id']] for r in group]);met['count']=len(group);met['base_tp_lost']=sum(r['label']==0 and base[r['id']]==0 and pred[r['id']]!=0 for r in group);result[name]=met
        result['subtypes']={kind:c.t.metric([r['label'] for r in gold if r['panel']=='core' and r['kind']==kind],[pred[r['id']] for r in gold if r['panel']=='core' and r['kind']==kind]) for kind in sorted({r['kind'] for r in gold if r['panel']=='core'})}
        result['median_wall_sec']=saved['median_wall_sec'];result['errors']=[{**r,'prediction':pred[r['id']]} for r in gold if r['label']!=pred[r['id']]];results[arm]=result
    c.save(ROOT/'report.json',results);print(json.dumps({arm:{k:v for k,v in rec.items() if k not in ['errors','subtypes']} for arm,rec in results.items()},ensure_ascii=False))
def audit():
    manifest=c.read(ROOT/'manifest.json');rows=c.read(ROOT/'inputs.json');gold=c.read(ROOT/'gold.json')
    assert c.p.digest(ROOT/'inputs.json')==manifest['input_sha256'] and c.p.digest(ROOT/'gold.json')==manifest['gold_sha256']
    assert [r['id'] for r in rows]==[r['id'] for r in gold]
    assert len({r['id'] for r in rows})==48
    for arm in ['existing','klue_uts']:
        assert c.p.digest(c.model_path(arm)/'model.safetensors')==manifest['models'][arm]
        saved=c.read(ROOT/(arm+'.json'));assert [r['id'] for r in saved['rows']]==[r['id'] for r in rows];assert saved['truncated']==0
        features=c.adapted(rows,arm,c.mapping())
        assert all(set(r)=={'input'} and set(r['input'])=={'target','context'} for r in features)
        assert all(a['input']['target']==b['input']['target'] for a,b in zip(rows,features,strict=True))
    c.save(ROOT/'audit.json',{'passed':True,'gold_unchanged':True,'models_unchanged':True,'rows':48,'no_truncation':True,'api_calls':0,'human_reviewed':False,'posthoc_sensitivity':'exclude eight weak-circle-shape rows; do not replace primary gold'})
    print('Audit passed')
if __name__=='__main__':
    import sys
    {'prepare':prepare,'run':run,'score':score,'audit':audit}[sys.argv[1]]()
