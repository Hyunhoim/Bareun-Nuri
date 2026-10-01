"""Build data only. No model loading, classifier calls, crawler, or external API."""
import argparse
import collections
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import random
import re
import unicodedata

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
SEED = 20260931  # Dataset revision seed, not a date.
TECH = ['HOMOGLYPH', 'JAMO', 'TRANSPARENT', 'OFFSCREEN']
DOMAINS = ['gambling', 'drugs', 'illegal_adult', 'sex_trade', 'illegal_trade']
SOURCES = {
    'gambling': ['board-spam', 'board-bonus', 'gambling-prevention', 'yju-qna-snippet', 'wipo-ad-analysis'],
    'drugs': ['drug-community', 'drug-report', 'fn-drug-ad-report'],
    'illegal_adult': ['adult-report', 'police-categories'],
    'sex_trade': ['sextrade-report', 'sextrade-reservations', 'police-categories'],
    'illegal_trade': ['public-abuse-report', 'forgery-report', 'sim-report', 'police-categories', 'segye-account-ad-report', 'account-qna-snippet'],
}
L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
V = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
T = ['', *'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
HOMO = {'a':'а', 'c':'с', 'e':'е', 'o':'о', 'p':'р', 's':'ѕ', 'x':'х',
        'A':'А', 'B':'В', 'C':'С', 'E':'Е', 'H':'Н', 'K':'К', 'M':'М', 'O':'О', 'P':'Р', 'T':'Т', 'X':'Х'}
STYLES = {
 'TRANSPARENT': [
    ('opacity-zero', 'opacity:0'),
    ('transparent-color', 'color:transparent'),
    ('white-on-white', 'color:rgb(255,255,255);background-color:rgb(255,255,255)'),
    ('matching-solid-color', 'color:rgb(245,245,245);background-color:rgb(245,245,245)')],
 'OFFSCREEN': [
    ('display-none', 'display:none'),
    ('negative-left', 'position:absolute;left:-9999px;top:0;width:600px'),
    ('font-zero', 'font-size:0px'),
    ('font-one', 'font-size:1px')],
}
PREFACES = [
 '문의가 있어 글 남깁니다.', '글이 안 보여서 다시 적습니다.', '쪽지가 많아 여기에도 남깁니다.',
 '댓글로 물어보신 내용 남깁니다.', '모바일로 작성해서 짧게 적을게요.', '아까 글에 이어서 적습니다.',
 '게시판 이용하시는 분들 참고하세요.', '요즘 문의가 많아서 안내 남깁니다.',
 '늦은 시간인데 글 남깁니다.', '이쪽으로 문의하시면 됩니다.',
]
AD_ENDINGS = ['문의는 아래 상담 링크로 주세요.', '메시지 남기시면 확인하겠습니다.',
 '댓글보다 상담으로 연락 부탁해요.', '관심 있는 분 문의 남겨주세요.', '신청하실 분 연락 주세요.',
 '연락 주시면 안내해드릴게요.', '문의 확인하고 답드립니다.', '이용할 분 상담 가능합니다.']
WARNINGS = [
 '제 민원 답글인 줄 눌렀는데 이게 달려 있네요. 지워주실 수 있나요?',
 '어제 신고했는데 그대로예요. 아래 댓글 삭제 좀 부탁드려요.',
 '운영자님, 이 내용으로 쪽지가 계속 와요. 수신 거부는 어디서 하나요?',
 '신고하려고 눌렀더니 로그인만 반복됩니다. 문제의 글 복사해놓을게요.',
 '아래 글 신고합니다. 이런 거 올리는 계정 차단 안 되나요?',
 '다른 분 게시물에도 똑같이 달려 있던데요. 이 댓글 신고할게요.',
 '아이랑 행사 일정 보다가 이런 댓글을 봤어요. 아래 내용 삭제 요청합니다.',
 '삭제 요청한 댓글 내용이에요. 처리됐는지 답변 부탁드려요.',
 '새벽에 또 올라왔네요. 아래 글 관리 부탁드립니다.',
 '이 댓글 보고 연락하면 안 될 것 같아요. 신고는 했습니다.',
 '어제 지워진 글이 다시 보여요. 아래 내용 확인 부탁드립니다.',
 '이걸 왜 우리 동네 게시판에 올리는지 모르겠네요. 삭제해주세요.',
]
REPORTS = [
 '이 문장을 올린 사람이 다른 글에도 같은 댓글을 달았습니다. 신고 내역에 남깁니다.',
 '광고를 발견한 경위를 문의하셔서 원문만 옮깁니다. 원 게시자는 제가 아닙니다.',
 '제 글에 달린 광고 댓글입니다. 댓글 작성자 차단할 방법이 있을까요?',
 '민원 첨부 자료입니다. 아래 문구를 게시한 계정에 대해 확인 부탁드립니다.',
 '관리자에게 전달하려고 가져온 내용입니다. 동일한 글이 여러 게시판에 있습니다.',
 '원글은 삭제됐지만 알림에 광고가 남아 있습니다. 내용 확인 부탁드립니다.',
 '신고한 광고의 문구를 아래에 붙였습니다. 처리 결과를 어디서 볼 수 있나요?',
 '이 광고 때문에 글 읽기가 어렵습니다. 도배를 막아주세요.',
]
VICTIMS = [
 '이런 글을 보고 연락했다가 돈만 보내고 답을 못 받았습니다. 어디로 신고해야 하나요?',
 '이 광고를 통해 연락했는데 계정이 사라졌습니다. 대화 내역을 보관하면 도움이 될까요?',
 '이 문구를 믿고 문의했다가 피해를 봤습니다. 다른 분들은 연락하지 마세요.',
 '가족이 이 글을 보고 연락한 것 같습니다. 신고와 상담을 받을 수 있을까요?',
 '이미 송금한 뒤 연락이 끊겼습니다. 당시 보았던 글을 남깁니다.',
 '저도 이 글 보고 돈 보냈어요. 신고할 때 대화 캡처만 있어도 되나요?',
 '이 광고에서 안내받은 내용과 달라 피해 신고하려고 합니다. 준비할 자료가 궁금합니다.',
 '상담 중 이상해서 그만뒀는데 계속 연락이 옵니다. 아래 광고 신고하고 싶어요.',
]
NORMAL = {
 'gambling': [
  '도박 예방 상담 신청은 어디에서 하나요? 가족과 같이 상담받고 싶습니다.',
  '아이 놀이터 바닥이 파손됐습니다. 공원 시설 점검 부탁드립니다.',
  '주말 보드게임 모임을 모집합니다. 참가비나 현금 환전 없이 같이 게임만 합니다.',
  '은행 입금 내역 확인 방법을 알려주세요. 복지 지원금이 아직 들어오지 않았습니다.',
  '카지노라는 단어가 나온 영어 교재를 도서관에서 빌릴 수 있나요?',
  '청소년 도박 예방 강의 자료를 신청하려고 합니다. 담당 부서가 어디인가요?',
  '축구 동호회에서 공 차실 분 구합니다. 경기 결과에 돈을 걸지는 않습니다.',
  '충전식 교통카드 잔액 환불 문의입니다. 잔액을 돌려받을 창구가 궁금해요.'],
 'drugs': [
  '마약 중독 상담을 가족이 대신 신청할 수 있나요? 치료 안내를 받고 싶습니다.',
  '처방받은 약을 다 먹지 못했습니다. 남은 약 수거함 위치 알려주세요.',
  '학교 마약 예방교육에 쓸 안내 자료가 필요합니다. 신청 방법 부탁드립니다.',
  '얼음 판매점 앞 보도가 미끄럽습니다. 안전 점검 부탁드려요.',
  '의료용 약 복용 중 불편한 점이 있어 병원 상담을 예약하고 싶습니다.',
  '아이스팩 수거함이 가득 찼습니다. 언제 비워주시는지 궁금합니다.',
  '약물 오남용 상담 창구 운영시간을 알려주세요.',
  '가족이 약물 치료를 받고 있습니다. 지역 회복 지원 프로그램이 있나요?'],
 'illegal_adult': [
  '제 사진이 허락 없이 올라갔습니다. 삭제 지원을 신청하려면 어떻게 해야 하나요?',
  '성인 대상 디지털 성범죄 예방교육 신청 안내를 받고 싶습니다.',
  '사진 동아리 전시회 참가자를 모집합니다. 본인이 촬영한 풍경사진만 받습니다.',
  '유출 영상 신고 후 처리 상황을 확인할 수 있을까요?',
  '도서관 성인 영화 읽기 강좌를 신청하고 싶습니다. 교육 일정 알려주세요.',
  '촬영 동의서를 작성할 때 필요한 항목을 문의합니다. 행사 기록용입니다.',
  '불법촬영물 삭제 지원 연락처가 변경됐는지 확인 부탁드립니다.',
  '개인 영상이 검색되는 것을 발견했습니다. 재유포 신고를 도와주세요.'],
 'sex_trade': [
  '성매매 피해 상담을 익명으로 받을 수 있나요? 가족에게 알려질까 걱정됩니다.',
  '성인 주민 대상 취업교육 참가자를 모집합니다. 수강 신청은 주민센터로 해주세요.',
  '운동 후 재활치료 예약을 변경하고 싶습니다. 보건소 연락처 알려주세요.',
  '거리 성매매 광고 전단 수거 요청드립니다. 위치는 민원 첨부에 적었습니다.',
  '숙박 예약 취소 문의입니다. 결제 영수증은 보관하고 있습니다.',
  '여성 긴급 상담소 운영시간이 궁금합니다. 방문 전 예약이 필요한가요?',
  '보건소 건강 상담 예약하려고 합니다. 성인도 신청할 수 있나요?',
  '이웃 모임 장소로 회의실을 빌리고 싶습니다. 저녁 예약 가능한지 알려주세요.'],
 'illegal_trade': [
  '분실한 신분증 재발급을 신청하려고 합니다. 주민센터 방문 준비물을 알려주세요.',
  '통장을 잃어버렸습니다. 지급 정지부터 해야 하는지 문의합니다.',
  '대포통장 모집 메시지를 받았습니다. 어디에 신고하면 될까요?',
  '휴대폰 유심 명의도용이 의심됩니다. 가입 내역 확인 방법을 알려주세요.',
  '운전면허증 갱신 기간 안내를 받고 싶습니다. 정식 발급 절차를 문의합니다.',
  '보이스피싱 피해를 신고했습니다. 추가 서류 제출 방법을 알려주세요.',
  '금융 사기 예방 강의 신청합니다. 입금 유도 메시지 구별법을 배우고 싶어요.',
  '본인 명의 계좌를 해지하려고 합니다. 은행에서 필요한 서류가 있나요?'],
}

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def jamo(text, variant):
    if variant == 'nfd':
        return unicodedata.normalize('NFD', text)
    parts = []
    for ch in text:
        n = ord(ch)-0xac00
        parts.append(L[n//588]+V[(n%588)//28]+T[n%28] if 0 <= n < 11172 else ch)
    if variant == 'compat-spaces':
        return ' '.join(parts)
    if variant == 'partial-syllables':
        return ''.join(p if i % 2 == 0 else text[i] for i, p in enumerate(parts))
    return ''.join(parts)

def fullwidth(text):
    return ''.join(chr(ord(c)+0xfee0) if 0x21 <= ord(c) <= 0x7e else c for c in text)

def codepoints(text):
    return [f'U+{ord(c):04X}' for c in text]

def load_bank():
    bank = [line.split('|') for line in (ROOT/'bank.tsv').read_text(encoding='utf-8').splitlines()
            if line and not line.startswith('#')]
    assert len(bank) == 200
    assert collections.Counter(x[0] for x in bank) == dict.fromkeys(DOMAINS, 40)
    for d, word, en, body in bank:
        assert word in body and en in body
    return bank

def revised_bank():
    bank=load_bank()
    edits=[x.split('|') for x in (ROOT/'revisions.tsv').read_text(encoding='utf-8').splitlines()
           if x and not x.startswith('#')]
    assert collections.Counter(x[0] for x in edits)==dict.fromkeys(DOMAINS,16)
    for d in DOMAINS:
        replacements=iter(x for x in edits if x[0]==d)
        for i in [i for i,x in enumerate(bank) if x[0]==d][:16]: bank[i]=next(replacements)
    for d,word,en,text in bank: assert word in text and en in text
    return bank

def make_rows():
    rng = random.Random(SEED)
    rows = []
    for bi, (domain, word, en, original) in enumerate(revised_bank()):
        # The substitution span must already exist; never append a contact address to create gold.
        rewritten=bi%40<16
        core = original if rewritten else original.replace(' '+en,'')
        if domain=='drugs' and word=='아이스':
            core=core.replace('아이스','아이스·필로폰',1)
        family = 'g_'+hashlib.sha256(f'{SEED}:{bi}'.encode()).hexdigest()[:12]
        for v in range(10):
            uid = hashlib.sha256(f'{SEED}:{bi}:{v}:target'.encode()).hexdigest()[:14]
            ad = v < 5
            before = after = ''
            if v == 0:
                text, role = core, 'direct_offer'
            elif v == 1:
                text, role = PREFACES[bi % len(PREFACES)]+' '+core, 'ordinary_preface_offer'
            elif v == 2:
                text, role = core+' '+AD_ENDINGS[bi % len(AD_ENDINGS)], 'offer_with_contact_request'
            elif v == 3:
                text, role = word+(' '+en if rewritten else '')+' 문의', 'short_offer_with_own_body'
                after = core
            elif v == 4:
                text, role = core+' '+word+' 문의 / '+word+' 상담', 'repeated_search_words'
            elif v == 5:
                text, role = core, 'reported_ad_with_own_context'
                before = WARNINGS[bi % len(WARNINGS)]
            elif v == 6:
                text, role = REPORTS[bi % len(REPORTS)]+' «'+core+'»', 'removal_request'
            elif v == 7:
                text, role = '«'+core+'» '+VICTIMS[bi % len(VICTIMS)], 'victim_or_family_inquiry'
            elif v == 8:
                text, role = NORMAL[domain][bi % len(NORMAL[domain])], 'legitimate_inquiry'
                # Local context changes are meaningful inquiries, not arbitrary IDs for uniqueness.
                after = ['온라인으로 신청할 수 있을까요?', '방문 전에 확인하고 싶습니다.',
                         '담당 부서로 연결 부탁드립니다.', '처음 문의하는 내용이라 절차가 궁금합니다.',
                         '대리인이 문의해도 되는지 궁금합니다.'][bi//8 % 5]
            else:
                text, role = f'{word} 관련 광고가 제 글에 달렸습니다. 차단해도 다시 보입니다.', 'moderation_inquiry'
                after = ['댓글 신고 내역 확인 부탁드립니다.', '다른 이용자에게 노출되지 않도록 처리해주세요.',
                         '삭제 요청을 어디로 보내야 하나요?', '새 계정으로 다시 올리는 것 같습니다.',
                         '원글 주소는 담당자에게 전달하겠습니다.'][bi//8 % 5]
                after += ' 신고하는 댓글 내용: «'+core+'»'
            # Vary quote/context placement without changing its author or meaning.
            if v==5 and bi%2:
                before,after='',before
            rows.append({'id':uid, 'group_id':family, 'seed_index':bi, 'variant':v,
                'domain':domain, 'role':role, 'is_violation':ad, 'base_text':text,
                'context_before':before, 'context_after':after, 'keyword':word, 'latin':en,
                'source_ids':SOURCES[domain], 'authorship':'codex_synthetic_source_informed',
                'revision_stratum':'rewritten_scenario' if bi%40<16 else 'explicit_basic_control',
                'provenance_scope':'domain_pattern_reference_not_verbatim_or_per_sentence_proof',
                'technique_origin':'organizer_rule_based_synthetic_not_observed_source_css'})
    # Within each domain and ad/control status, exact 50-case primary buckets.
    for domain in DOMAINS:
        for ad in [True, False]:
            bucket = [r for r in rows if r['domain']==domain and r['is_violation']==ad]
            rng.shuffle(bucket)
            for j, r in enumerate(bucket):
                primary = TECH[j % 4]
                r['primary_stratum'] = primary
                r['techniques'] = [primary]
                rank = j//4
                if rank < 10:
                    r['techniques'].append(TECH[(j+1)%4])
                elif rank < 12:
                    r['techniques'] = TECH.copy()
                # Non-ad cases with transformed text/styles, plus genuine plain controls.
                # No forced transformations of arbitrary product IDs or letter education puzzles.
                if not ad and r['variant'] in [8,9]:
                    r['techniques'] = []
                r['style_variant_index'] = (rank+j)%4
            # Give character tests to scenarios that already use Latin naturally. Preserve all
            # technique counts; do not insert English glosses into Korean ads to manufacture H.
            bad=[r for r in bucket if 'HOMOGLYPH' in r['techniques'] and r['revision_stratum']=='explicit_basic_control']
            available=[r for r in bucket if 'HOMOGLYPH' not in r['techniques']
                       and r['revision_stratum']=='rewritten_scenario' and r['variant']<8]
            assert len(available)>=len(bad), (domain,ad,len(bad),len(available))
            for a,b in zip(bad,available):
                for k in ['primary_stratum','techniques','style_variant_index']: a[k],b[k]=b[k],a[k]
    # Usernames are short; do not turn entire complaint paragraphs into author names.
    author_ids=set()
    for v in [3,8]:
        selected=[r for r in rows if r['variant']==v]
        rng.shuffle(selected)
        for r in selected[:50]:
            author_ids.add(r['id'])
            if v==8:
                r['context_after']=r['base_text']+' '+r['context_after']
                r['base_text']=['동네주민','시민회원','지역주민','문의드립니다','이웃사람'][r['seed_index']%5]
    for i, r in enumerate(rows):
        rng2 = random.Random(SEED+i*7919)
        text = r['base_text']
        changes = []
        if 'JAMO' in r['techniques']:
            word = r['keyword']
            assert word in text
            kind = ['compat','nfd','compat-spaces','partial-syllables'][i%4]
            mutated = jamo(word, kind)
            start = text.index(word)
            text = text[:start]+mutated+text[start+len(word):]
            changes.append({'technique':'JAMO','kind':kind,'original':word,'changed':mutated,
                            'original_codepoints':codepoints(word),'changed_codepoints':codepoints(mutated)})
        if 'HOMOGLYPH' in r['techniques']:
            token = r['latin']
            assert token in text, (r['id'],token,text)
            if 'O' in token and i%3==0:
                mutated = token.replace('O','0',1)
                kind = 'digit-O-to-0'
            elif i%2 and any(c in HOMO for c in token):
                mutated = ''.join(HOMO.get(c,c) for c in token)
                kind = 'mixed-cyrillic-existing-span'
            else:
                mutated = fullwidth(token)
                kind = 'fullwidth-existing-span'
            text = text.replace(token,mutated,1)
            assert token != mutated
            changes.append({'technique':'HOMOGLYPH','kind':kind,'original':token,'changed':mutated,
                'original_codepoints':codepoints(token),'changed_codepoints':codepoints(mutated),
                'basis':'visual character substitution, not phonetic transliteration'})
        # Locate transformed spans after all replacements; Unicode codepoint and UTF-16 explicit.
        for c in changes:
            start=text.index(c['changed']); end=start+len(c['changed'])
            c['start_codepoint'],c['end_codepoint']=start,end
            c['start_utf16']=len(text[:start].encode('utf-16-le'))//2
            c['end_utf16']=len(text[:end].encode('utf-16-le'))//2
        r['target_text'],r['text_transformations'] = text, changes
        r['style_evidence'] = []
        for tech in ['TRANSPARENT','OFFSCREEN']:
            if tech in r['techniques']:
                name,css=STYLES[tech][r['style_variant_index']]
                r['style_evidence'].append({'technique':tech,'kind':name,'css':css,
                    'scope':'ancestor' if i%3==0 else 'target'})
        r['split_inline'] = False
        r['dynamic'] = False
        r['iframe'] = False
    # Loading and nesting must not predict the advertising label.
    for ad in [True, False]:
        bucket=[r for r in rows if r['is_violation']==ad]
        rng.shuffle(bucket)
        for i,r in enumerate(bucket):
            r['split_inline']=i%5==0
            r['dynamic']=i%10==2
            r['iframe']=i%10==4
    # Shuffle layout assignments separately from source, technique, and label.
    slots = ['body']*6+['title']*3+['comment']*5+['reply']*2+['link']*2+['table']
    layout = slots*100
    rng.shuffle(layout)
    rng.shuffle(rows)
    li=0
    for i,r in enumerate(rows):
        if r['id'] in author_ids:
            r['slot']='author'
        else:
            r['slot']=layout[li];li+=1
        r['site']=i//200
        r['page']=i//20
        r['page_path']=f'/site-{r["site"]+1}/page-{r["page"]+1:03}.html'
        r['target_selector']='#n'+r['id']
        r['scope_selector']='#u'+r['id']
        r['title']=['시민 게시판','자유게시판','생활 문의','주민 소통','참여 마당'][r['site']%5]
        r['location']=(f'iframe#f{r["id"]} >>> ' if r['iframe'] else '')+r['target_selector']
    return rows

def target_markup(r):
    text=r['target_text']
    content=html.escape(text)
    if r['split_inline']:
        pieces=[text[k:k+5] for k in range(0,len(text),5)]
        content=''.join('<span>'+html.escape(p)+'</span>' for p in pieces)
    css=';'.join(x['css'] for x in r['style_evidence'] if x['scope']=='target')
    attr=f'id="n{r["id"]}" class="text" style="{css}"'
    tag={'body':'p','title':'h3','comment':'p','reply':'div','author':'span','link':'a','table':'td'}[r['slot']]
    if tag=='a': attr+=' href="#contact"'
    target=f'<{tag} {attr}>{content}</{tag}>'
    if tag=='td': target='<table><tbody><tr>'+target+'</tr></tbody></table>'
    if r['slot']=='author': target='<div class="byline">작성자 '+target+'</div>'
    return target

def publicweb_rows():
    """New authored pairs inspired by observed public-board formats, not scraped copies."""
    cases=json.loads((ROOT/'publicweb-cases.json').read_text(encoding='utf-8'))
    assert len(cases)==24
    rows=[]
    for i,c in enumerate(cases):
        for v,tech in enumerate([None,*TECH]):
            for ad in [True,False]:
                text=c['ad' if ad else 'normal']
                original=text; changes=[];styles=[]
                uid=hashlib.sha256(f'publicweb-v1:{i}:{v}:{ad}'.encode()).hexdigest()[:14]
                if tech in ['JAMO','HOMOGLYPH']:
                    token=c['keyword' if tech=='JAMO' else 'latin']
                    assert token in text
                    if tech=='JAMO':
                        kind=['compat','nfd','compat-spaces','partial-syllables'][i%4]
                        changed=jamo(token,kind)
                    elif i%3==0 and 'O' in token:
                        kind='digit-O-to-0';changed=token.replace('O','0',1)
                    elif i%2 and any(ch in HOMO for ch in token):
                        kind='mixed-cyrillic-existing-span';changed=''.join(HOMO.get(ch,ch) for ch in token)
                    else:
                        kind='fullwidth-existing-span';changed=fullwidth(token)
                    text=text.replace(token,changed,1)
                    start=text.index(changed);end=start+len(changed)
                    changes=[dict(technique=tech,kind=kind,original=token,changed=changed,
                        original_codepoints=codepoints(token),changed_codepoints=codepoints(changed),
                        start_codepoint=start,end_codepoint=end,
                        start_utf16=len(text[:start].encode('utf-16-le'))//2,
                        end_utf16=len(text[:end].encode('utf-16-le'))//2)]
                if tech in STYLES:
                    kind,css=STYLES[tech][i%4]
                    styles=[dict(technique=tech,kind=kind,css=css,scope='ancestor' if i%3==0 else 'target')]
                techniques=[tech] if tech else []
                rows.append(dict(id=uid,group_id=f'publicweb_pair_{i:02}',seed_index=i,variant=v,
                    domain=c['domain'],role='solicitation' if ad else 'non_soliciting_context',
                    is_violation=ad,base_text=original,target_text=text,keyword=c['keyword'],latin=c['latin'],
                    context_before=c['title'],context_after='',source_ids=[c['source']],
                    authorship='new_synthetic_source_pattern_informed',revision_stratum='publicweb_supplement',
                    provenance_scope='format_reference_not_verbatim_or_legal_finding',
                    technique_origin='synthetic_organizer_four_types' if tech else 'plain_text_control_no_four_type',
                    primary_stratum=tech or 'PLAIN',techniques=techniques,text_transformations=changes,
                    style_evidence=styles,style_variant_index=i%4,split_inline=i%4==0,dynamic=False,iframe=False,
                    slot='body' if ad==(i%2==0) else 'comment',site=10,page=100+i,
                    page_path=f'/field/page-{101+i:03}.html',target_selector='#n'+uid,scope_selector='#u'+uid,
                    title='시민 참여 게시판',location='#n'+uid,
                    layout_kind='table_board' if i%2==0 else 'comment_list',pattern=c['pattern'],
                    evaluation_track='four_technique' if tech else 'ad_intent_without_four_technique'))
    return rows

def card(r):
    ancestor_css=';'.join(x['css'] for x in r['style_evidence'] if x['scope']=='ancestor')
    target='<div class="entry-text" style="'+ancestor_css+'">'+target_markup(r)+'</div>'
    before='<p class="message">'+html.escape(r['context_before'])+'</p>' if r['context_before'] else ''
    after='<p class="message">'+html.escape(r['context_after'])+'</p>' if r['context_after'] else ''
    role=' role="comment"' if r['slot'] in ['comment','reply'] else ''
    if r.get('layout_kind')=='table_board':
        return f'<table class="xb_view"><tbody><tr><td id="u{r["id"]}" class="con_box entry">'+before+target+after+'</td></tr></tbody></table>'
    if r.get('layout_kind')=='comment_list':
        return f'<ul class="comment-list"><li id="u{r["id"]}" class="replyTogArea comnt entry">'+before+target+after+'</li></ul>'
    return f'<article id="u{r["id"]}" class="entry"{role}>'+before+target+after+'</article>'

CSS='''body{font-family:Arial,"Malgun Gothic",sans-serif;color:#253344;background:#f5f7fa;margin:0}header{background:#124e78;color:white;padding:22px}nav,main,footer{max-width:1080px;margin:auto;padding:20px}nav a{margin-right:18px}main{background:white}h1{font-size:24px}.entry{border-bottom:1px solid #ccd5de;padding:18px 12px;position:relative}.text,.message{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65}.byline{font-size:14px}table{width:100%}iframe{width:100%;height:280px;border:1px solid #ccd5de}button,input{padding:8px}.meta{color:#62768a;font-size:14px}'''

def document(title,body,extra=''):
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+html.escape(title)+'</title><link rel="stylesheet" href="/site.css"></head><body>'+body+extra+'</body></html>'

def build():
    if (ROOT/'private/status.json').exists():
        status=json.loads((ROOT/'private/status.json').read_text(encoding='utf-8'))
        assert status['evaluation_runs']==0 and status['training_runs']==0, 'Consumed dataset cannot be overwritten'
    public=ROOT/'public'; public.mkdir(exist_ok=True)
    private=ROOT/'private'; private.mkdir(exist_ok=True)
    rows=make_rows()+publicweb_rows()
    expected_frames={r['id']+'.html' for r in rows if r['iframe']}
    frame_root=(public/'frames').resolve()
    for old in (public/'frames').glob('*.html'):
        assert old.resolve().parent==frame_root and re.fullmatch(r'[0-9a-f]{14}\.html',old.name)
        if old.name not in expected_frames: old.unlink()
    (public/'site.css').write_text(CSS,encoding='utf-8')
    page_rows=collections.defaultdict(list)
    for r in rows: page_rows[r['page_path']].append(r)
    page_paths=list(page_rows)
    for page_index,(page_path,items) in enumerate(page_rows.items()):
        first=items[0]
        header='<header>시민 소통 마당</header><nav><a href="/index.html">홈</a><a href="/index.html">게시판</a><button type="button">로그인</button></nav>'
        body=header+'<main><h1>'+first['title']+'</h1><p class="meta">홈 &gt; 참여 &gt; '+first['title']+'</p>'
        body+='<form onsubmit="return false"><label>제목·내용 검색 <input type="search"></label><button>검색</button></form>'
        for r in items:
            rendered=card(r)
            if r['iframe']:
                frame='/frames/'+r['id']+'.html'
                p=public/frame.lstrip('/');p.parent.mkdir(exist_ok=True)
                p.write_text(document('게시판 답글',rendered),encoding='utf-8')
                rendered=f'<iframe id="f{r["id"]}" src="{frame}" title="게시판 답글"></iframe>'
            elif r['dynamic']:
                rendered='<div class="comment-area"><template id="t'+r['id']+'">'+rendered+'</template></div>'
            body+=rendered
        previous=page_paths[max(0,page_index-1)]
        following=page_paths[min(len(page_paths)-1,page_index+1)]
        body+='<nav><a href="'+previous+'">이전</a><a href="'+following+'">다음</a><a href="/index.html">목록</a></nav></main><footer>게시판 이용 안내</footer>'
        script='<script>setTimeout(()=>{for(const t of document.querySelectorAll("template")){t.replaceWith(t.content.cloneNode(true));}},180);</script>'
        p=public/page_path.lstrip('/');p.parent.mkdir(exist_ok=True)
        p.write_text(document(first['title'],body,script),encoding='utf-8')
    index='<header>시민 소통 마당</header><main><h1>참여 게시판</h1><ul>'
    for page_path,items in page_rows.items():
        index+='<li><a href="'+page_path+'">'+items[0]['title']+' '+str(items[0]['page']+1)+'</a></li>'
    (public/'index.html').write_text(document('참여 게시판',index+'</ul></main>'),encoding='utf-8')
    # Input-only JSONL is separate from authored gold, provenance, and transformation history.
    with (ROOT/'inputs.jsonl').open('w',encoding='utf-8',newline='\n') as f:
        for r in rows:
            inp={k:r[k] for k in ['id','target_text','context_before','context_after','title','page_path','location','scope_selector']}
            f.write(json.dumps(inp,ensure_ascii=False)+'\n')
    with (private/'gold.jsonl').open('w',encoding='utf-8',newline='\n') as f:
        for r in rows:
            r['finding_techniques']=r['techniques'] if r['is_violation'] else []
            r['label_reason']=('대상과 같은 작성자의 문맥이 불법 대상 거래·이용을 직접 권유함.' if r['is_violation'] else
                '신고·삭제 요청·피해 상담·합법적 문의이며 해당 거래나 이용을 권유하지 않음.')
            r['label_status']='author_assigned_not_independently_human_reviewed'
            f.write(json.dumps(r,ensure_ascii=False)+'\n')
    dump(private/'status.json',{'name':'운영 테스트 phase 1','purpose':'evaluation_only',
        'version':'1.2','previous_archive':'.runtime/phase1-before-publicweb-v12.zip',
        'evaluation_runs':0,'training_runs':0,'training_allowed':False,
        'model_outputs_exist':False,'human_reviewed':False,
        'evaluation_requires_separate_user_request':True})
    # Pin current production source for future comparison without invoking any model.
    pins=json.loads((REPO/'.runtime/antispoof-scope-v1/operating-before.json').read_text(encoding='utf-8-sig'))
    dump(private/'operating-source-pin.json',{p:sha(REPO/p) for p in pins})
    dump(ROOT/'manifest.json',{
       'name':'운영 테스트 phase 1','version':'1.2','seed':SEED,'purpose':'evaluation_only',
       'count':len(rows),'base_count':2000,'publicweb_supplement_count':240,
       'seed_messages':248,'independence_note':'기존 200 원문 파생 2000개 + 새 24시나리오의 광고/정상 48원문에 일반표기 및 4종을 적용한 240개. 실수집 2240건이 아니고 동일 작성자 편향 및 파생 상관 존재.',
       'real_ad_css_verified':False,'all_test_messages_synthetic':True,
       'model_calls':0,'training_runs':0,'evaluation_runs':0,
       'gold_path':'private/gold.jsonl','input_path':'inputs.jsonl','public_root':'public',
       'source_registry':'sources.json','files':{str(p.relative_to(ROOT)).replace('\\','/'):sha(p)
         for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name not in ['manifest.json','quality.json'] and '__pycache__' not in str(p)}})
    check()

class Targets(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.stack=[];self.targets={};self.styles={}
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);ident=a.get('id','')
        if ident.startswith('n'):
            assert ident not in self.targets
            self.targets[ident]='';self.styles[ident]=a.get('style','')
        if tag not in ['meta','link','input','br','hr','img']: self.stack.append((tag,ident))
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][0]==tag:
                self.stack=self.stack[:i];break
    def handle_data(self,data):
        for _,ident in self.stack:
            if ident in self.targets: self.targets[ident]+=data

def check():
    rows=[json.loads(x) for x in (ROOT/'private/gold.jsonl').read_text(encoding='utf-8').splitlines()]
    inputs=[json.loads(x) for x in (ROOT/'inputs.jsonl').read_text(encoding='utf-8').splitlines()]
    assert len(rows)==len(inputs)==2240
    assert len({r['id'] for r in rows})==2240
    base=rows[:2000];extra=rows[2000:]
    assert sum(r['is_violation'] for r in base)==1000
    assert collections.Counter(r['primary_stratum'] for r in base if r['is_violation'])==dict.fromkeys(TECH,250)
    assert collections.Counter(r['domain'] for r in base)==dict.fromkeys(DOMAINS,400)
    assert len({r['group_id'] for r in base})==200
    assert len({r['group_id'] for r in extra})==24
    assert collections.Counter(r['primary_stratum'] for r in extra if r['is_violation'])==dict.fromkeys(['PLAIN',*TECH],24)
    targets={}
    for p in (ROOT/'public').rglob('*.html'):
        parser=Targets();parser.feed(p.read_text(encoding='utf-8'))
        for key,val in parser.targets.items():
            assert key not in targets
            targets[key]=val
        assert not re.search(r'https?://',p.read_text(encoding='utf-8')), 'External URL in served HTML'
    assert len(targets)==2240
    for r,inp in zip(rows,inputs):
        assert targets['n'+r['id']]==r['target_text']
        assert inp['id']==r['id'] and inp['target_text']==r['target_text']
        assert not {'domain','role','is_violation','techniques','text_transformations','source_ids'} & inp.keys()
        for c in r['text_transformations']:
            assert r['target_text'][c['start_codepoint']:c['end_codepoint']]==c['changed']
            assert r['target_text'].encode('utf-16-le')[c['start_utf16']*2:c['end_utf16']*2].decode('utf-16-le')==c['changed']
            assert c['changed']!=c['original']
        assert set(r['techniques'])=={c['technique'] for c in r['text_transformations']}|{c['technique'] for c in r['style_evidence']}
        assert not r['finding_techniques'] if not r['is_violation'] else r['finding_techniques']==r['techniques']
    exact=collections.Counter((r['target_text'],r['context_before'],r['context_after']) for r in rows)
    text_duplicate=sum(n-1 for n in exact.values() if n>1)
    # Plain/T/O pairs intentionally keep identical language and change only browser evidence.
    evidence=collections.Counter((r['target_text'],r['context_before'],r['context_after'],
        json.dumps(r['style_evidence'],sort_keys=True)) for r in rows)
    duplicate=sum(n-1 for n in evidence.values() if n>1)
    assert duplicate==0, f'{duplicate} duplicate complete text/context/style inputs'
    assert text_duplicate==96, 'Unexpected text duplication beyond controlled plain/T/O pairs'
    sources=json.loads((ROOT/'sources.json').read_text(encoding='utf-8'))
    source_ids={s['id'] for s in sources['sources']}
    for r in rows:
        assert set(r['source_ids'])<=source_ids
        assert 'contact.example.invalid' not in r['target_text']
        for c in r['text_transformations']:
            assert c['original'] in r['base_text'], 'Invented span appended solely to create a technique'
    manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    assert all(sha(ROOT/p)==h for p,h in manifest['files'].items()),'File drift'
    pins=json.loads((ROOT/'private/operating-source-pin.json').read_text(encoding='utf-8'))
    assert all(sha(REPO/p)==h for p,h in pins.items()),'Production changed'
    quality={'kind':'data_integrity_only_not_model_test','rows':2240,
       'ads':1120,'non_ad_controls':1120,'primary_ad_counts':dict(collections.Counter(r['primary_stratum'] for r in rows if r['is_violation'])),
       'observed_ad_technique_counts':dict(collections.Counter(t for r in rows if r['is_violation'] for t in r['techniques'])),
       'ad_multi_technique':sum(r['is_violation'] and len(r['techniques'])>1 for r in rows),
       'normal_with_observed_technique':sum(not r['is_violation'] and bool(r['techniques']) for r in rows),
       'homoglyph_subtypes':dict(collections.Counter(c['kind'] for r in rows for c in r['text_transformations'] if c['technique']=='HOMOGLYPH')),
       'homoglyph_source_spans':dict(collections.Counter(c['original'] for r in rows for c in r['text_transformations'] if c['technique']=='HOMOGLYPH')),
       'revision_strata':dict(collections.Counter(r['revision_stratum'] for r in rows)),
       'jamo_subtypes':dict(collections.Counter(c['kind'] for r in rows for c in r['text_transformations'] if c['technique']=='JAMO')),
       'style_subtypes':dict(collections.Counter(c['kind'] for r in rows for c in r['style_evidence'])),
       'slots':dict(collections.Counter(r['slot'] for r in rows)),
       'iframes':sum(r['iframe'] for r in rows),'dynamic':sum(r['dynamic'] for r in rows),'inline_split':sum(r['split_inline'] for r in rows),
       'main_pages':len({r['page_path'] for r in rows}),'exact_text_context_duplicates':text_duplicate,
       'exact_text_context_style_duplicates':duplicate,
       'independent_human_review':False,'model_calls':0,'evaluation_runs':0,'training_runs':0,
       'source_files_unchanged':True,'html_target_texts_match':True,'unicode_offsets_match':True,
       'limitations':['기법은 실제 CSS 관찰이 아닌 요강 기반 합성','일부 원자료는 검색 결과만 확인','동일 작성자와 반복 문장군 편향 존재','1:1은 현실 유병률이 아닌 통제 비율','모델용 토큰 길이/수집 누락/정확도/지연은 미측정']}
    dump(ROOT/'quality.json',quality)
    print(json.dumps(quality,ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
    check() if args.check else build()
