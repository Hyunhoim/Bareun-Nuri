"""Grouped synthetic contrast data; no previous evaluation text is training data."""
import json,hashlib,html
from pathlib import Path
ROOT=Path('.runtime/technique-specialist-data-v3')
WORDS={
'train':'welcome:환영 reward:보상 ticket:입장권 point:포인트 member:회원 access:접속 account:계정 credit:적립금 secret:비밀 event:행사 gift:선물 offer:제안 return:반환 payment:결제 support:지원 service:서비스 private:비공개 lucky:행운 prize:경품 money:돈 agent:담당자 special:특별 notice:공지 update:갱신 report:신고 market:시장 order:주문 status:상태 contact:연락처 message:메시지 benefit:혜택 finance:금융 jackpot:당첨금 deposit:입금 match:경기 sport:스포츠 chance:기회 start:시작 direct:직접 partner:파트너',
'dev':'balance:잔액 customer:고객 register:등록 promotion:홍보 invite:초대 premium:고급 option:선택사항 session:접속시간 instant:즉시처리 winner:당첨자 transfer:이체 certificate:증명서',
'final':'advance:선지급 entrance:입장 voucher:교환권 cashout:출금 receipt:영수증 reserve:예약 channel:채널 advice:조언 renewal:갱신처리 depositary:보관기관 participation:참여 commission:수수료'}
DIGITS={'a':'4','e':'3','i':'1','o':'0','s':'5','t':'7','b':'8','l':'1'}
CYR={'a':'а','e':'е','o':'о','c':'с','p':'р','x':'х','i':'і','s':'ѕ','y':'у'}
def changed(word,mapping):
    for i,c in enumerate(word):
        if c in mapping:return word[:i]+mapping[c]+word[i+1:]
    raise ValueError(word)
def templates(split,token,gloss):
    if split=='train':return [
      (f'사설 카지노 신규 가입 {token} 안내입니다. {gloss} 혜택을 받으려면 지금 가입하고 입금하세요.',0,True),
      (f'문자에 {token} 지급이라고 적혀 있었습니다. {gloss}로 유혹하는 도박 광고이니 입금하지 마세요.',0,False),
      (f'{token} 시간은 하루 24시간입니다. {gloss} 신청은 사설 도박 회원 가입 후 가능합니다.',0,True),
      (f'{token} 메뉴에서 {gloss} 관련 공지사항을 확인할 수 있습니다.',0,False),
      (f'사설 도박 신청시 접수번호 {token}를 담당자에게 보내세요. 접수번호의 숫자를 변경하면 신청을 찾을 수 없습니다.',1,True),
      (f'장비 모델명 {token}의 점검 일정 문의입니다. 제품 라벨에 적힌 모델명을 그대로 적었습니다.',1,False),
      (f'게시판에 {token}라고 적혀 있습니다.',2,False),
      (f'{token} 관련해서 아시는 분 계신가요?',2,False)]
    if split=='dev':return [
      (f'{gloss} 받으실 분, 사설 슬롯 가입란의 {token}를 누르고 충전하시면 됩니다.',0,True),
      (f'{gloss}라는 뜻의 {token} 문구가 온 사례를 접수했습니다. 불법 도박 안내에 응하지 않도록 주의 부탁드립니다.',0,False),
      (f'저희 사설 카지노 {token}는 24시간 열려 있습니다. {gloss} 원하시면 회원으로 등록해 주세요.',0,True),
      (f'이 화면의 {gloss} 항목은 {token}로 표시되어 있습니다. 시청 홈페이지 이용 안내입니다.',0,False),
      (f'불법 카지노 상담을 신청하세요. 상담 건 식별값은 {token}이며 숫자는 접수 순번입니다.',1,True),
      (f'공공 시설 센서 {token} 규격은 부품 구매 시 그대로 사용합니다. 이 규격으로 주문 가능한가요?',1,False),
      (f'어제 본 화면 이름이 {token}였습니다.',2,False),
      (f'제목에는 {token}만 보이고 내용은 열리지 않아요.',2,False)]
    return [
      (f'사설 도박방에서 {gloss} 도와드립니다. 신청 화면의 {token} 선택 후 가입하셔서 현금을 충전해 주세요.',0,True),
      (f'현금 도박 사이트가 {token}라며 {gloss}를 내세운 문자를 보내왔네요. 이런 광고 차단을 요청합니다.',0,False),
      (f'24시간 {gloss}가 되는 사설 도박방입니다. {token} 접수 중이니 회원 가입해서 이용하세요.',0,True),
      (f'{gloss} 안내 화면에서 보이는 {token} 항목의 글꼴을 바꿔 달라는 의견입니다.',0,False),
      (f'도박방 이용자 모집합니다. 신청서 관리키 {token}를 복사해 주세요. 그 숫자가 신청서 번호라 바꾸면 안 됩니다.',1,True),
      (f'납품받은 기기에는 {token}라는 형식번호가 부착되어 있어요. 동일 형식 부품 재고를 확인하고 싶습니다.',1,False),
      (f'사진 아래 {token}가 있었는데 무슨 표시인지 잘 모르겠습니다.',2,False),
      (f'본문이 삭제되어 {token}라는 이름 외에는 알 수 없습니다.',2,False)]
def main():
    for items in WORDS.values():
        for pair in items.split():
            word=pair.split(':')[0];changed(word,DIGITS);changed(word,CYR)
    ROOT.mkdir(exist_ok=False);manifest={'splits':{},'synthetic':True,'human_reviewed':False,'final_evaluations':0};seen=set();allinputs=set()
    for split,items in WORDS.items():
        inputs=[];gold=[];folder=ROOT/split;folder.mkdir()
        for i,pair in enumerate(items.split()):
            word,gloss=pair.split(':');assert word not in seen;seen.add(word)
            digit=changed(word,DIGITS);cyr=changed(word,CYR);wide=''.join(chr(ord(c)+0xfee0) for c in word)
            tokens=[digit,digit,digit+'24',wide if i%2 else cyr,digit,digit,digit,digit]
            for j,token in enumerate(tokens):
                text,label,ad=templates(split,token,gloss)[j];title={'train':'자유 의견 게시판','dev':'시민 참여 마당','final':'생활 제안 및 답변'}[split]
                uid=hashlib.sha256((word+':'+str(j)).encode()).hexdigest()[:16];start=text.index(token)
                inp={'target':text[:start]+'[표기]'+token+'[/표기]'+text[start+len(token):],'context':title}
                key=json.dumps(inp,ensure_ascii=False);assert key not in allinputs;allinputs.add(key)
                row={'id':uid,'node_id':uid,'group_id':word,'input':inp,'raw_text':text,'token':token,'start':start,'end':start+len(token),'url':f'http://127.0.0.1:64920/{split}/{uid}.html','location':'article > p','technique':'HOMOGLYPH'}
                inputs.append(row);gold.append({'id':uid,'label':label,'is_ad':ad,'group_id':word,'variant':j,'reading':word+('24' if j==2 else ''),'label_source':'synthetic_author'})
                (folder/(uid+'.html')).write_text('<!doctype html><meta charset="utf-8"><title>'+title+'</title><main><article><h1>'+title+'</h1><p>'+html.escape(text)+'</p></article></main>',encoding='utf8')
        for name,data in [('inputs',inputs),('gold',gold)]:
            file=ROOT/(split+'-'+name+'.json');file.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8');manifest['splits'][file.name]={'count':len(data),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8');print(json.dumps(manifest))
if __name__=='__main__':main()
