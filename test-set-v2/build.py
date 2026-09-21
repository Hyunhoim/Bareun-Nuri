"""Deterministic synthetic diagnostic corpus; no network or model calls."""
import hashlib
import html
import json
import random
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RNG = random.Random(220922)
TECH = ["HOMOGLYPH", "JAMO", "TRANSPARENT", "OFFSCREEN"]
SURFACES = ["title", "body", "comment", "reply", "author", "signature", "link", "attachment"]
TOTALS = [40, 80, 60, 40, 20, 20, 20, 20]
LABELS = dict(zip(SURFACES, ["제목", "본문", "댓글", "답글", "작성자", "서명", "관련 링크", "첨부파일"] ))
AD = [
    "사설 카지노 신규 회원을 모집합니다. 첫 입금에 추가 금액을 드리고 현금 환전을 지원합니다.",
    "사설 스포츠 도박방 참여자를 찾습니다. 충전 후 원하는 경기에 베팅하고 배당금을 받으세요.",
    "비공개 바카라 테이블이 열렸습니다. 가입비를 입금하면 즉시 게임에 참여할 수 있습니다.",
    "현금 환전이 되는 사설 슬롯을 소개합니다. 회원 등록 후 첫 충전을 진행해 주세요.",
    "온라인 사설 경마 이용 안내입니다. 지금 가입해서 경주에 돈을 걸어 보세요.",
    "사설 도박 사이트로 옮기실 분을 받습니다. 입금 내역을 보내면 가입 혜택을 적용합니다.",
    "사설 카지노 추천 가입 창구입니다. 회원 등록을 마치면 충전금 일부를 추가 지급합니다.",
    "스포츠 도박 배당표를 받아 보세요. 사설방 가입과 현금 충전을 마치면 참여 가능합니다.",
    "비공개 사설 카드게임 이용자를 모집합니다. 참가금을 보내고 현금 배당에 도전하세요.",
    "사설 슬롯 첫 이용 혜택입니다. 가입 후 충전하면 추가 베팅 금액을 바로 드립니다.",
    "퇴근 후 사설 카지노에서 한 판 어떠세요. 소액 입금으로 시작하고 당첨금은 현금으로 받으세요.",
    "사설 경마방 자리가 조금 남았습니다. 회원 신청과 첫 충전을 마치면 자리 안내를 드립니다.",
    "기존 사설 베팅방보다 높은 배당을 드립니다. 새 계정으로 가입하고 충전해 보세요.",
    "오늘 밤 사설 바카라 참여자를 받습니다. 입장 전에 충전 금액을 확인해 주세요.",
    "사설 카지노 가입 문의를 받고 있습니다. 입금 방법과 즉시 환전 절차를 안내해 드립니다.",
    "비공개 슬롯방에 초대합니다. 현금을 충전하고 게임 수익을 계좌로 받아 가세요.",
    "사설 스포츠 도박 신규 가입 혜택이 오늘 끝납니다. 첫 입금 후 추천 코드를 등록하세요.",
    "사설 경마 추천 회원에게 충전 혜택을 드립니다. 지금 회원 가입을 진행해 주세요.",
    "현금 배당 사설 카드방을 함께 이용할 분을 찾습니다. 등록 후 참가금을 충전하세요.",
    "사설 카지노 이용 방법이 궁금하면 가입부터 해 주세요. 충전과 환전은 회원에게 안내합니다.",
    "불법 촬영물 공유방 유료 회원을 받습니다. 가입비 결제 후 비공개 자료를 이용하세요.",
    "불법 성인영상 공유관 신규 가입을 모집합니다. 결제하면 자료실을 열어 드립니다.",
    "불법 촬영 영상 비공개 목록을 제공합니다. 유료 회원 등록과 결제를 진행해 주세요.",
    "불법 성인물 공유방 입장권 판매 안내입니다. 입금 확인 후 열람 권한을 드립니다.",
    "불법 촬영물 자료실을 이용할 회원을 찾습니다. 가입 결제 후 원하는 영상을 선택하세요.",
    "신규 사설 도박방 운영 안내를 남깁니다. 회원 가입 후 충전하면 입금 혜택을 받을 수 있습니다.",
    "사설 슬롯 이용 후기와 함께 가입을 권합니다. 첫 충전 금액에 추가 혜택을 드립니다.",
    "사설 카지노 접속 안내를 받아 보세요. 가입과 현금 입금 후 바로 게임을 시작할 수 있습니다.",
    "사설 스포츠 베팅방 공동 참여 안내입니다. 충전금을 넣고 배당금을 함께 노려 보세요.",
    "사설 바카라 회원 전용 이벤트입니다. 신규 가입자가 입금하면 추가 게임 금액을 드립니다.",
    "관련 안내를 덧붙입니다. 사설 카지노에서 현금 게임을 하려면 가입 후 충전해 주세요.",
    "게시판을 보신 분께 사설 경마방을 소개합니다. 회원 등록과 첫 입금을 기다립니다.",
    "자세한 내용은 사설 슬롯 회원방에서 안내합니다. 가입하고 게임 금액을 충전해 주세요.",
    "아래 안내를 통해 사설 도박방에 가입하세요. 추천 회원에게 충전 보너스를 지급합니다.",
    "사설 카지노 결제 안내를 확인하세요. 가입 계정으로 입금하면 현금 게임 참여가 가능합니다.",
    "이번 주 사설 경마 신규 회원을 모집합니다. 배당금 환전을 받으려면 가입과 입금을 마치세요.",
    "비공개 불법 성인물 공유관 이용 안내를 드립니다. 회원 등록 후 결제하면 입장할 수 있습니다.",
    "사설 도박방 가입 신청서를 확인해 주세요. 첫 충전을 마치면 추가 베팅 금액이 적립됩니다.",
    "사설 바카라방 회원 소개 혜택을 드립니다. 가입자를 추천하고 첫 입금을 진행해 주세요.",
    "사설 슬롯 이용자를 위한 충전 창구입니다. 계정을 만들고 입금하면 바로 참여할 수 있습니다."
]
NORMAL = [
    "시립도서관 야간 열람실은 오후 아홉 시까지 운영합니다.", "문화회관 주민 합창단의 공개 연습 일정을 안내합니다.",
    "생활체육 강좌는 온라인으로 신청하고 정규 수강료를 납부합니다.", "공원 산책로 정비 구간에서는 안전 안내에 따라 이동해 주세요.",
    "마을 독서회 신규 회원을 모집합니다. 가입비 없이 누구나 참여할 수 있습니다.", "대중교통 환승 안내 자료를 확인하고 의견을 남겨 주세요.",
    "청소년 금융교육에서 충전식 교통카드 사용법을 배웁니다.", "시민 행사 참가비는 취소 기한 안에 신청하면 환불합니다.",
    "시립 수영장 정기권은 회원 등록 후 창구에서 결제할 수 있습니다.", "재활용품 분리배출 시간을 지켜 쾌적한 거리를 만들어 주세요.",
    "공영주차장 요금 결제 영수증을 내려받을 수 있습니다.", "지역 화폐 충전 혜택은 공식 안내문에서 확인해 주세요.",
    "도서 대출 회원증 재발급 절차를 안내합니다.", "복지관 어르신 스마트폰 교실 수강생을 모집합니다.",
    "수해 예방을 위한 하천 정비 의견을 접수합니다.", "점자 안내 자료와 화면 읽기용 문서를 함께 제공합니다.",
    "주민자치회 회의록은 개인정보를 제외한 후 공개합니다.", "시민 사진 공모전 작품 접수는 다음 달까지입니다.",
    "체험관 무료 입장 예약은 하루에 한 번 신청할 수 있습니다.", "밤길 조명 개선이 필요한 위치를 알려 주세요.",
    "찾아가는 건강 상담 일정은 동별 안내문을 참고하세요.", "도시숲 가꾸기 자원봉사에 함께할 주민을 모집합니다.",
    "민원 처리 현황은 접수 번호로 확인할 수 있습니다.", "노후 시설 보수 계획에 관한 주민 설명회를 엽니다.",
    "전통시장 장보기 행사에 참여하고 이용 후기를 남겨 주세요.", "교육장에는 키보드만으로 조작할 수 있는 안내 단말기가 있습니다.",
    "청년 취업상담 참가 신청에는 수수료가 없습니다.", "관광 안내소에서 무료 지도와 교통 정보를 제공합니다.",
    "주민 설문에 응답할 때는 개인정보를 적지 마세요.", "공공시설 이용 중 불편 사항은 담당 부서로 전달해 주세요."
]

def esc(s):
    return html.escape(str(s), quote=True)

def digest(s):
    return hashlib.sha256(s.encode()).hexdigest()[:12]

def jamo(text):
    result = []
    for ch in text:
        n = ord(ch) - 0xAC00
        result.append("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"[n // 588] + "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"[n % 588 // 28] + ([""] + list("ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"))[n % 28] if 0 <= n < 11172 else ch)
    return "".join(result)

def transform(text, codes, variant):
    if "JAMO" in codes:
        if variant % 3 == 0:
            text = jamo(text)
        elif variant % 3 == 1:
            text = unicodedata.normalize("NFD", text)
        else:
            words = text.split(" "); words[0] = jamo(words[0]); text = " ".join(words)
    if "HOMOGLYPH" in codes:
        token = ["ＣＡＳＩＮＯ", "cаsinо", "CΑSINΟ", "B0NUS"][variant % 4]
        text = token + " · " + text
    return text

def allocate_surfaces(items, counts, cover_techniques=False):
    items=list(items)
    counts=list(counts)
    if cover_techniques:
        for index,surface in enumerate(SURFACES):
            for technique in TECH:
                item=next(r for r in items if r["observed"]==[technique])
                item["surface"]=surface;items.remove(item);counts[index]-=1
    pool = [surface for surface, n in zip(SURFACES, counts) for _ in range(n)]
    RNG.shuffle(pool)
    for item, surface in zip(items, pool):
        item["surface"] = surface
    assert len(items) == len(pool)

def records():
    singles = [dict(kind="single", family=f"ad-{i//2:02}", plain_text=AD[i//2], observed=[TECH[i % 4]], variant=i//2) for i in range(80)]
    pairs = [[0,1]]*7 + [[0,2]]*7 + [[0,3]]*6 + [[1,2]]*6 + [[1,3]]*7 + [[2,3]]*7
    RNG.shuffle(pairs)
    composites = [dict(kind="composite", family=f"ad-{i:02}", plain_text=AD[i], observed=[TECH[t] for t in pair], variant=i) for i,pair in enumerate(pairs)]
    positive = singles + composites
    for i,item in enumerate(positive):
        item.update(case_id=f"advanced-{i+1:03}", is_ad=True, techniques=item["observed"], text=transform(item["plain_text"], item["observed"],item["variant"]), rationale="불법 서비스 가입·입금·이용 권유", context="")
    allocate_surfaces(singles,[10,22,16,10,6,6,4,6],True); allocate_surfaces(composites,[6,10,8,6,2,2,4,2])
    hard=[]
    for i,source in enumerate(singles):
        item=dict(source); item.update(kind="hard_negative", is_ad=False, techniques=[], pair_id=source["case_id"], rationale="광고의 예방·신고·단속 인용이며 이용 권유가 아님")
        if i%2:
            item["text"] = "예방 자료 인용: ‘"+source["text"]+"’ 같은 광고는 신고하고 가입하거나 입금하지 마세요."
        else:
            item["context"]="아래 문구는 신고되어 삭제된 광고의 인용입니다. 이용을 권하는 글이 아니며 가입하거나 입금하지 마세요."
        hard.append(item)
    for i in range(40):
        codes=[TECH[i%4]]
        plain=["국어 교실에서는 바다라는 단어를 자음과 모음으로 나누어 읽습니다.", "화면 읽기 사용자는 댓글 목록과 민원 답변으로 이동할 수 있습니다.", "정상 행사 회원 모집과 정규 수강료 결제 안내입니다.", "광고 신고 안내입니다. 사설 도박에 가입하거나 충전하지 마세요."][i%4]
        hard.append(dict(kind="hard_negative", family=f"normal-hard-{i%4}", plain_text=plain, text=transform(plain,codes,i), observed=codes, techniques=[], is_ad=False, variant=i, context="", rationale="교육·접근성·정상 행사·예방 문구"))
    allocate_surfaces(hard,[16,32,24,16,8,8,8,8])
    ordinary=[dict(kind="normal", family=f"normal-{i%30}", plain_text=NORMAL[i%30], text=NORMAL[i%30]+(" 자세한 운영 시간은 공지사항을 확인하세요." if i>=30 else ""), observed=[], techniques=[], is_ad=False, variant=i, context="", rationale="정상 공공서비스 안내") for i in range(60)]
    allocate_surfaces(ordinary,[8,16,12,8,4,4,4,4])
    rows=positive+hard+ordinary
    for i,item in enumerate(rows):
        item["case_id"]=f"advanced-{i+1:03}"
        item["element_id"]="v"+digest(item["case_id"]+":node")
        item["segmented"]="JAMO" in item["observed"] and i%2==0
        item["inherited"]=bool(item["observed"]) and i%3==0
        item["transport"]="static"
    candidates=[r for r in rows if r["surface"] in ["comment","reply"]]; RNG.shuffle(candidates)
    for i,r in enumerate(candidates[:24]): r["transport"]="dynamic";r["delay_ms"]=150 if i%2 else 650
    for i,r in enumerate(candidates[24:36]): r["transport"]="iframe";r["frame_depth"]=2 if i%3==0 else 1
    return rows

def decorated(item, tag):
    text=item["text"]
    inner="".join("<span>"+esc(text[i:i+3])+"</span>" for i in range(0,len(text),3)) if item["segmented"] else esc(text)
    style=[]
    if "TRANSPARENT" in item["observed"]: style.append(["opacity:0", "color:transparent", "color:#fff;background-color:#fff"][item["variant"]%3])
    if "OFFSCREEN" in item["observed"]: style.append(["display:none", "position:absolute;left:-10000px;top:0", "font-size:0px", "font-size:1px", "position:absolute;top:-10000px;left:0"][item["variant"]%5])
    css=";".join(style)
    target_style="" if item["inherited"] else css
    href=' href="#content"' if tag=="a" else ""
    node=f'<{tag} id="{item["element_id"]}" class="text-value" style="{target_style}"{href}>{inner}</{tag}>'
    if tag=="dd":node="<dl><dt>등록 이름</dt>"+node+"</dl>"
    if tag=="td":node="<table class=metadata-table><tbody><tr>"+node+"</tr></tbody></table>"
    if tag=="li":node="<ul class=text-list>"+node+"</ul>"
    # No label, family, category or technique names are embedded in public HTML.
    if item["inherited"] and css: node=f'<div class="text-wrap" style="{css}">{node}</div>'
    if item["context"]: node='<p class="reading-note">'+esc(item["context"])+"</p>"+node
    item["selector"]=tag+"#"+item["element_id"]
    return node

def shell(title, content, template="portal"):
    return f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} | 새빛시 시민소통</title><link rel="stylesheet" href="/assets/site.css"><script defer src="/assets/site.js"></script></head>
<body class="layout-{template}"><a class="skip" href="#content">본문 바로가기</a><div class="gov-strip">가상 공공 포털 · 모든 게시물은 소프트웨어 검증을 위한 합성 자료입니다</div>
<header><a class="brand" href="/advanced/"><b>새빛</b><span>새빛시 시민소통<small>SAEBIT CITY · CITIZEN PORTAL</small></span></a><span class="header-note">시민의 일상과 함께합니다</span></header>
<nav class="global-nav" aria-label="주요 메뉴"><a href="/advanced/">소통 첫 화면</a><a href="/advanced/board/list?board=free&amp;page=1">시민 게시판</a><a href="/advanced/board/list?board=free&amp;page=6">생활·문화</a></nav>
<div class="page"><aside><h2>소통·참여</h2><a href="/advanced/board/list?board=free&amp;page=1">시민 의견</a><a href="/advanced/board/list?board=free&amp;page=4">민원·답변</a><a href="/advanced/board/list?board=free&amp;page=7">생활정보</a><p>여러분의 의견을 듣고<br>더 나은 내일을 만듭니다.</p></aside><main id="content"><div class="breadcrumb">홈 / 소통·참여 / {esc(title)}</div>{content}</main></div>
<footer><strong>새빛시 시민소통</strong><span>이용 안내 · 접근성 안내 · 개인정보 보호</span><p>실제 기관·인물·서비스와 무관한 로컬 합성 사이트입니다. 외부 가입·결제 연결을 제공하지 않습니다.</p></footer></body></html>'''

def build():
    RNG.seed(220922)
    public=ROOT/"public";private=ROOT/"private";public.mkdir(exist_ok=True);private.mkdir(exist_ok=True)
    # Remove only this generator's prior HTML files; preserve authored assets.
    for file in public.glob("*.html"):
        if len(file.stem)==12 and all(c in "0123456789abcdef" for c in file.stem) and not file.is_symlink():
            file.unlink()
    rows=records(); slots=[0]*10+[1]*15+[3]*30+[5]*30+[9]*5;RNG.shuffle(slots)
    pages=[dict(path=f"/advanced/board/view?board=free&id={2401+i*7}", capacity=n, items=[], template=["board","notice","petition","community","service"][i%5]) for i,n in enumerate(slots)]
    # Assign rare surfaces first. Title/author/signature appear at most once per article.
    for surface in SURFACES:
        group=[r for r in rows if r["surface"]==surface];RNG.shuffle(group)
        for row in group:
            possible=[p for p in pages if len(p["items"])<p["capacity"] and (surface not in ["title","author","signature"] or not any(r["surface"]==surface for r in p["items"]))]
            assert possible,(surface,row["case_id"])
            p=RNG.choice(possible);p["items"].append(row);row["page"]=p["path"];row["template"]=p["template"];row["frames"]=[]
    routes={};frame_routes=[]
    def write(route,document):
        name=digest(route)+".html";(public/name).write_text(document,encoding="utf-8");routes[route]=name
    for i,p in enumerate(pages):
        blocks=defaultdict(list)
        for item in p["items"]:
            surface=item["surface"]
            tags={"title":["h2","h1","h3","h2","h4"],"body":["p","div","blockquote","p","div"],"comment":["p","div","li","p","div"],"reply":["p","div","p","li","p"],"author":["span","strong","dd","span","td"],"signature":["p","span","div","p","div"],"link":["a"]*5,"attachment":["a","span","li","a","span"]}
            tag=tags[surface][i%5];node=decorated(item,tag)
            if item["transport"]=="dynamic":node=f'<template class="comment-template" data-delay="{item["delay_ms"]}">{node}</template>'
            elif item["transport"]=="iframe":
                urls=[f'/advanced/widget/comments?thread={item["element_id"][1:]}']
                if item["frame_depth"]==2:urls.append(f'/advanced/widget/replies?thread={item["element_id"][1:]}')
                head='<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/site.css"></head><body class="frame-body">'
                write(urls[-1],head+'<main>'+node+'</main></body></html>')
                if len(urls)==2:write(urls[0],head+f'<iframe title="연계 답글" src="{urls[1]}"></iframe></body></html>')
                item["frames"]=urls;frame_routes.extend(urls);node=f'<iframe title="연계 시민 의견" src="{urls[0]}"></iframe>'
            blocks[surface].append('<div class="field-item">'+node+'</div>')
        title="".join(blocks.pop("title",[])) or '<h2>생활 환경 개선에 관한 시민 의견</h2>'
        author="".join(blocks.pop("author",[])) or '<span>새빛시민</span>'
        intro='<p class="intro">지역 시설 운영과 시민 생활에 관한 의견을 나누는 공간입니다.</p>'
        body="".join(blocks.pop("body",[])) or '<p>시설 이용 경험과 개선이 필요한 내용을 남겨 주세요.</p>'
        if i%6==0:body='<p>'+('우리 동네 공공시설을 이용하면서 안내 표지와 운영 시간에 관한 의견을 모았습니다. 누구나 편하게 이용할 수 있도록 다양한 관점에서 검토하면 좋겠습니다. '*8)+'</p>'+body+'<p>주민 여러분의 추가 의견도 기다리겠습니다.</p>'
        extras="".join(f'<section class="support-field"><h3>{LABELS[s]}</h3>{"".join(blocks.pop(s,[]))}</section>' for s in ["signature","link","attachment"] if blocks[s])
        comments="".join(f'<section class="comments"><h3>{LABELS[s]}</h3>{"".join(blocks[s])}</section>' for s in ["comment","reply"] if blocks[s])
        header=f'<div class="post-heading"><span class="badge">시민 의견</span>{title}<div class="meta"><span>작성자</span>{author}<span>등록일 2026.09.22</span><span>접수 {2401+i*7}</span></div></div>'
        container="article" if i%5 in [0,2,3] else "div"
        # Some real layouts keep comments outside article. Do not force the collector's preferred layout.
        inside=comments if i%5 in [0,1,4] else ""
        content=f'<h1 class="section-heading">{["시민 게시판","알림·공지","민원 답변","주민 이야기","생활 안내"][i%5]}</h1>{intro}<{container} class="post">{header}<section class="post-body">{body}</section>{extras}{inside}</{container}>'
        if not inside:content+=comments
        content+=f'<div class="actions"><a href="/advanced/board/list?board=free&amp;page={i//9+1}">목록으로</a>'
        if i<89:content+=f'<a href="{esc(pages[i+1]["path"])}">다음 게시글 →</a>'
        content+='</div>';write(p["path"],shell("게시글 상세",content,p["template"]))
    for n in range(1,11):
        listing=''.join(f'<tr><td>{2401+i*7}</td><td><a href="{esc(p["path"])}">시민 생활 의견 · 접수 {2401+i*7} 상세보기</a></td><td>새빛시민</td><td>2026.09.22</td></tr>' for i,p in enumerate(pages) if i//9+1==n)
        pagination=''.join(f'<a href="/advanced/board/list?board=free&amp;page={j}"'+(' aria-current="page"' if j==n else '')+f'>{j}</a>' for j in range(1,11))
        write(f'/advanced/board/list?board=free&page={n}',shell('시민 게시판',f'<h1>시민 게시판</h1><p class="intro">시민 여러분의 제안과 생활 이야기를 확인하세요.</p><div class="list-meta">전체 90건 · {n}/10 페이지</div><div class="table-scroll"><table class="board-table"><thead><tr><th>접수번호</th><th>제목</th><th>작성자</th><th>등록일</th></tr></thead><tbody>{listing}</tbody></table></div><nav class="pagination" aria-label="게시판 페이지">{pagination}</nav>'))
    hero='<section class="hero"><span>CITIZENS MAKE OUR CITY</span><h1>당신의 이야기가<br>새빛의 내일이 됩니다.</h1><p>생활 속 작은 제안부터 이웃과 나누는 소식까지.<br>시민의 목소리를 가까이에서 듣겠습니다.</p><a class="button" href="/advanced/board/list?board=free&amp;page=1">시민 게시판 둘러보기 →</a><div class="city-art" aria-hidden="true"><i></i><i></i><i></i><i></i></div></section>'
    cards=''.join(f'<a class="service-card" href="/advanced/board/list?board=free&amp;page={n}"><span>0{k+1}</span><h2>{label}</h2><p>{sub}</p><b>바로가기 ↗</b></a>' for k,(n,label,sub) in enumerate([(1,"시민 의견","생활 속 의견과 제안을 나눕니다."),(4,"민원·답변","지역의 불편 사항을 함께 살핍니다."),(7,"생활·문화","시민을 위한 소식과 정보를 만납니다.")]))
    write('/advanced',shell('소통 첫 화면',hero+'<div class="services">'+cards+'</div><section class="home-notice"><h2>참여 안내</h2><p>게시글 제목과 본문, 댓글 및 연계 게시판을 함께 확인할 수 있습니다. 개인정보가 담긴 내용은 게시하지 마세요.</p></section>'))
    truth={"version":"2.0.0-dev","synthetic":True,"purpose":"development-diagnostic-not-holdout","techniques":TECH,"splits":{"advanced":{"entry":"/advanced/","cases":rows,"pages":[{k:v for k,v in p.items() if k not in ['items','capacity']} for p in pages],"counts":{"cases":300,"positive_elements":120,"negative_elements":180,"findings":160,"per_technique":dict(Counter(t for r in rows for t in r['techniques']))}}},"top_pages":[k for k in routes if '/widget/' not in k],"frame_documents":frame_routes}
    assert len(rows)==300 and len(truth['top_pages'])==101
    assert Counter(r['surface'] for r in rows)==dict(zip(SURFACES,TOTALS))
    assert truth['splits']['advanced']['counts']['per_technique']==dict.fromkeys(TECH,40)
    assert Counter(len(p['items']) for p in pages)==Counter(slots)
    route_bytes=json.dumps(routes,ensure_ascii=False,indent=2).encode();(private/'routes.json').write_bytes(route_bytes)
    h=hashlib.sha256()
    for f in sorted(p for p in public.rglob('*') if p.is_file()):h.update(f.relative_to(public).as_posix().encode());h.update(f.read_bytes())
    h.update(route_bytes);h.update(json.dumps(truth,ensure_ascii=False,separators=(',',':')).encode());truth['dataset_sha256']=h.hexdigest()
    (private/'ground_truth.json').write_text(json.dumps(truth,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'top_pages':101,'subpages':100,'frame_documents':len(frame_routes),'cases':len(rows),'findings':160,'sha256':h.hexdigest()},ensure_ascii=False))

if __name__=='__main__':build()
