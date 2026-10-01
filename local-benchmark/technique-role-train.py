"""One data-only contrast augmentation, same fresh-base training recipe."""
import importlib.util,json,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('t',Path(__file__).with_name('technique-specialist-train.py'));t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
DATA=Path('.runtime/technique-role-data-v1');OUT=Path('.runtime/technique-role-model-v1')
def main():
    DATA.mkdir(exist_ok=False);old=t.DATA;tr,ys=t.load('train');gold=t.read(old/'train-gold.json');groups={}
    for row in tr:groups.setdefault(row['group_id'],row)
    extra=[];eg=[]
    for word,row in groups.items():
        token=row['token'];mark='[표기]'+token+'[/표기]'
        templates=[
          (f'현금 도박방으로 오세요. 전산이 임의로 준 거래키는 {mark}입니다. 이 키로 결제 내역을 찾으므로 대소문자나 숫자를 손대지 말고 보내 주세요.',1),
          (f'공연장 대관을 접수했는데 보관함 칸 번호가 {mark}로 나옵니다. 번호가 틀리면 다른 사람 물건을 열 수 있다고 합니다.',1),
          (f'사설 카지노 이용을 권하는 글에 {mark}라고 적었습니다. 원래 영어 {word}의 철자를 눈에 비슷한 숫자로 바꿔 쓴 말이니 이 메뉴로 가입하세요.',0),
          (f'학교 게시판 자료입니다. 영어 {word}를 {mark}처럼 숫자 모양을 빌려 적는 예를 들었습니다. 도박 이용 안내는 아닙니다.',0),
          (f'앞 광고에는 가입하면 돈을 준다고 했습니다. 별개로 잘린 메모에 {mark}가 보입니다. 그 메모를 광고 작성자가 쓴 건지는 확인되지 않았습니다.',2),
          (f'도박 사이트 이름을 신고하려는데 사진이 흐립니다. {mark}가 이름인지 다른 표기인지 알아볼 자료가 없습니다.',2),
          (f'신고된 도박 광고에는 글자를 바꿔 쓴 다른 단어가 있습니다. 여기서 확인할 {mark}는 판매업체가 부여한 일련 코드여서 사전 단어로 읽는 항목이 아닙니다.',1),
          (f'가입 코드 AB927은 그대로 두세요. 이용 메뉴 {mark}는 영어 {word}를 숫자와 섞어 적은 표현입니다. 사설 게임에 들어오실 회원을 모집합니다.',0)
        ]
        for j,(target,label) in enumerate(templates):
            uid=hashlib.sha256((word+':role:'+str(j)).encode()).hexdigest()[:16];extra.append({'id':uid,'group_id':word,'input':{'target':target,'context':['이용 문의','자료 안내','신고 게시판'][j%3]}});eg.append({'id':uid,'label':label,'group_id':word})
    keys=lambda rows:{json.dumps(x['input'],sort_keys=True,ensure_ascii=False) for x in rows}
    assert not keys(extra)&keys(tr);dev=t.read(old/'dev-inputs.json');assert not keys(extra)&keys(dev)
    manifest={'synthetic':True,'final_is_observed':True,'change':'training-role-contrast-only','splits':{}}
    for name,rows in [('train-inputs',tr+extra),('train-gold',gold+eg),('dev-inputs',dev),('dev-gold',t.read(old/'dev-gold.json'))]:
        file=DATA/(name+'.json');file.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8');manifest['splits'][file.name]={'count':len(rows),'sha256':t.p.digest(file)}
    (DATA/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
    t.DATA=DATA;t.OUT=OUT;t.main()
if __name__=='__main__':main()
