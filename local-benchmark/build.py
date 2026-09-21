"""Build a synthetic, labeled public-portal fixture. No network access."""
import hashlib
import html
import json
import random
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VERSION = "1.0.0"
TECHNIQUES = ["HOMOGLYPH", "JAMO", "TRANSPARENT", "OFFSCREEN"]


def esc(value):
    return html.escape(str(value), quote=True)


def jamo(text):
    initials = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
    vowels = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
    finals = [""] + list("ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ")
    out = []
    for char in text:
        n = ord(char) - 0xAC00
        out.append(initials[n // 588] + vowels[n % 588 // 28] + finals[n % 28]
                   if 0 <= n < 11172 else char)
    return "".join(out)


def records(split):
    """Private annotations; none of these labels are included in served HTML."""
    def row(text, codes, visual="", reason="가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고", segmented=False):
        return dict(text=text, techniques=codes.split() if codes else [], visual=visual,
                    rationale=reason, segmented=segmented)
    H, J, T, O = TECHNIQUES
    if split == "dev":
        rows = [
            row("ＣＡＳＩＮＯ 신규 가입 첫 입금 두 배 지급, 지금 참여하세요.", H),
            row("cаsinо 전용방 입장 모집! 실시간 베팅과 즉시 환전 안내.", H),
            row("온라인 카지노 B0NUS 지급 중, 입금 후 추천 코드를 등록하세요.", H),
            row(jamo("카지노 가입하면 입금 보너스 지급, 즉시 환전 가능."), J),
            row(unicodedata.normalize("NFD", "슬롯 회원 모집, 첫 충전 혜택과 현금 환전 제공."), J),
            row(jamo("토토 가입 전용 창구, 배팅하고 당첨금 받아가세요."), J, segmented=True),
            row("사설 카지노 신규 회원 모집, 첫 입금 추가 지급과 현금 환전.", T, "opacity"),
            row("불법 성인영상 공유관 가입 안내, 유료 비공개 영상 무제한 이용.", T, "transparent"),
            row("사설 토토 충전 이벤트, 추천 가입 후 베팅을 시작하세요.", T, "same-color"),
            row("슬롯 신규 가입하고 첫충 보너스 받기, 바로 환전 가능합니다.", O, "display"),
            row("불법 성인물 공유방 입장 회원 모집, 비공개 영상 결제 안내.", O, "left"),
            row("사설 스포츠베팅 회원 모집, 충전 즉시 추가 적립해 드립니다.", O, "font-zero"),
            row("ＣＡＳＩＮＯ " + jamo("카지노 가입 시 입금 보너스 지급."), H + " " + J),
            row("ｍｅｇａ－ＢＥＴ 첫충 혜택, 사설 베팅방 회원 즉시 모집.", H + " " + T, "opacity-parent"),
            row(jamo("슬롯 가입하면 첫 충전 두 배, 현금 환전 접수."), J + " " + O, "display-parent"),
            row("사설 카지노 충전 회원 모집, 배팅 후 현금으로 환전하세요.", T + " " + O, "opacity-left"),
            row("본문 바로가기 · 주메뉴 바로가기", "", "font-one", "접근성 보조 문구. 광고 아님"),
            row("전체 메뉴 닫기 및 검색 도움말", "", "opacity", "메뉴 상태 안내. 광고 아님"),
            row("예방 교육: ‘ＣＡＳＩＮＯ 첫 입금 보너스’라는 문구는 불법도박 유도 사례입니다. 가입하지 마세요.", "", reason="교육용 인용. 실제 가입 유도 아님"),
            row("문자 우회 사례인 ‘" + jamo("카지노") + "’를 발견하면 신고하고 접속하지 마세요.", "", reason="자모 분해 표현을 설명하는 예방 안내"),
            row("화면 읽기 안내: 불법도박 예방 교육은 무료이며 카지노 가입을 권유하지 않습니다.", "", "transparent-parent", "보조 안내 문구. 은닉돼 있어도 광고 아님"),
            row("이전 교육자료: ‘첫충 100%, 즉시 환전’은 사기성 광고 예시입니다. 입금 금지.", "", "display", "접힌 교육자료의 광고 인용"),
            row("시립 수영장 가을 강좌 접수 안내. 시민 누구나 정규 수강료로 신청할 수 있습니다.", "", reason="정상 공공서비스 홍보"),
            row("２０２６ 주민 문화행사 · Ａ동 안내데스크에서 신청서를 받습니다.", "", reason="전각 문자 사용이지만 정상 행사 안내"),
        ]
    else:
        rows = [
            row("ＢＥＴ 전용 가입창 오픈, 사설 스포츠 도박 충전 회원 혜택 지급.", H),
            row("bеt 신규 추천 회원 모집, 베팅 수익 현금 환전 당일 처리.", H),
            row("CΑSINΟ 비공개 룸 입장 안내, 첫 입금 추가 적립 후 게임 참여.", H),
            row(jamo("사설 경마 배팅 회원 모집, 충전하고 배당금 받아가세요."), J),
            row(unicodedata.normalize("NFD", "불법 성인영상 공유관 신규 가입, 비공개 영상 결제 즉시 제공."), J),
            row(jamo("바카라 전용방 가입 혜택, 충전 후 현금 환전하세요."), J, segmented=True),
            row("온라인 사설 경마 가입 접수, 배팅 충전금 추가 적립 이벤트.", T, "opacity-parent"),
            row("불법 성인영상 공유관 유료 회원 모집, 지금 결제하면 전용관 입장.", T, "transparent-class"),
            row("사설 바카라 입금 회원 혜택, 신규 충전하고 바로 게임하세요.", T, "same-color-parent"),
            row("사설 경마 추천인 모집, 현금 충전 후 베팅하면 추가 지급.", O, "display-parent"),
            row("불법 성인영상 공유방 회원 모집, 유료 가입 즉시 시청.", O, "font-one"),
            row("바카라 사설 테이블 신규 가입, 첫 입금 환전 서비스 운영.", O, "top"),
            row("bеt " + jamo("사설 경마 가입하면 충전 보너스 지급."), H + " " + J),
            row("ＣＡＳＩＮＯ 유료 회원 전용, 입금 후 게임 참여하고 환전하세요.", H + " " + O, "left"),
            row(jamo("바카라 사설방 입금 회원 모집, 당일 환전 가능."), J + " " + T, "same-color"),
            row("사설 베팅 가입 이벤트, 지금 충전하면 현금 보너스 지급.", T + " " + O, "transparent-font"),
            row("댓글 목록으로 이동 · 읽지 않은 답변 안내", "", "left", "화면 읽기 보조 문구. 광고 아님"),
            row("예약 메뉴를 열려면 Enter 키를 누르세요.", "", "opacity-parent", "키보드 이용 안내"),
            row("단속 소식: ‘bеt 신규 회원 모집’ 게시물을 삭제했습니다. 사설 베팅을 이용하지 마세요.", "", reason="단속 결과의 인용 문구"),
            row("국어 체험교실에서 ‘" + jamo("바다") + "’를 음절로 조합하는 활동을 진행합니다.", "", reason="정상 자모 학습 자료"),
            row("안내: 성인영상 유료 가입을 권하는 댓글은 신고 대상입니다. 결제하지 마세요.", "", "same-color", "신고 절차 안내. 유해 서비스 판매 아님"),
            row("지난 공지: ‘가입 시 입금 두 배’ 광고를 보고 송금하지 않도록 주의 바랍니다.", "", "display-parent", "이전 공지 접힘 영역의 예방 안내"),
            row("지역 서점 독서 행사 안내. 참가비 없이 신청 가능하며 도서 대출은 회원증이 필요합니다.", "", reason="정상 문화행사 홍보"),
            row("Ｃ동 민원창구는 ９시부터 운영합니다. 온라인 예약 후 방문해 주세요.", "", reason="정상 전각 문자 안내"),
        ]
    for index, item in enumerate(rows):
        item["case_id"] = f"{split}-{index + 1:02d}"
        item["element_id"] = "n" + hashlib.sha256(item["case_id"].encode()).hexdigest()[:10]
        item["category"] = "negative" if not item["techniques"] else "composite" if len(item["techniques"]) > 1 else "single"
    random.Random(718 if split == "dev" else 931).shuffle(rows)
    return rows


def fragment(item):
    text = esc(item["text"])
    if item["segmented"]:
        midpoint = len(item["text"]) // 2
        text = f'<span>{esc(item["text"][:midpoint])}</span><span>{esc(item["text"][midpoint:])}</span>'
    # Neutral DOM names prevent annotations from becoming classification hints.
    direct = {
        "opacity": "opacity:0", "transparent": "color:transparent", "same-color": "color:#fff;background-color:#fff",
        "display": "display:none", "left": "position:absolute;left:-9999px;top:0",
        "top": "position:absolute;top:-9999px;left:0", "font-zero": "font-size:0px", "font-one": "font-size:1px",
        "opacity-left": "opacity:0;position:absolute;left:-9999px;top:0",
        "transparent-font": "color:transparent;font-size:0px",
    }
    inherited = {"opacity-parent": "opacity:0", "transparent-parent": "color:transparent",
                 "same-color-parent": "color:#eef5fa;background-color:#eef5fa", "display-parent": "display:none"}
    style = direct.get(item["visual"], "")
    css = "entry-text b3" if item["visual"] == "transparent-class" else "entry-text"
    result = f'<p id="{item["element_id"]}" class="{css}" style="{style}">{text}</p>'
    return f'<div class="content-block" style="{inherited[item["visual"]]}">{result}</div>' if item["visual"] in inherited else result


def shell(split, title, content, active="소통·참여"):
    return f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)} | 온빛시청</title><link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js" defer></script></head>
<body><a class="skip" href="#main">본문 바로가기</a><div class="notice-strip">로컬 실험용 가상 공공기관 · 실제 기관 및 게시물과 무관합니다</div>
<header><div class="masthead"><a class="brand" href="/{split}/"><span class="mark">온</span><span>온빛시청<small>ONBIT CITY</small></span></a>
<span class="slogan">시민의 일상에, 더 가까이</span><form action="/{split}/board/list" method="get" role="search"><input type="hidden" name="board" value="free"><label class="sr-only" for="search">게시글 검색</label><input id="search" name="q" placeholder="찾으시는 소식을 검색하세요"><button>검색</button></form></div>
<nav aria-label="주요 메뉴"><a href="/{split}/guide">민원안내</a><a href="/{split}/board/list?board=free&amp;page=1" class="selected">소통·참여</a><a href="/{split}/guide#service">생활정보</a><a href="/{split}/guide#about">온빛소개</a></nav></header>
<div class="page-wrap"><aside><h2>{esc(active)}</h2><a href="/{split}/board/list?board=free&amp;page=1" class="current">시민 게시판 <span>›</span></a><a href="/{split}/guide">이용 안내 <span>›</span></a><div class="help-box">시민과 함께하는<br><strong>열린 소통 공간</strong><p>개인정보가 포함된 글은<br>등록을 삼가 주세요.</p></div></aside>
<main id="main"><div class="breadcrumbs">홈 <span>›</span> {esc(active)} <span>›</span> {esc(title)}</div>{content}</main></div>
<footer><strong>온빛시청</strong><span>개인정보처리방침 · 이용안내 · 접근성 안내</span><p>이 사이트는 탐지 도구 평가용 합성 자료입니다. 모든 게시물은 가상이며 외부 서비스에 연결하지 않습니다.</p></footer></body></html>'''


def build():
    public = ROOT / "public"
    private = ROOT / "private"
    public.mkdir(exist_ok=True)
    private.mkdir(exist_ok=True)
    routes, manifest = {}, {"version": VERSION, "synthetic": True, "techniques": TECHNIQUES, "splits": {}}
    for split in ["dev", "eval"]:
        rows = records(split)
        pages = []
        cases = []
        titles = (["생활체육 프로그램 운영에 관한 의견", "도서관 야간 개방 안내", "마을 산책로 정비 요청", "가을 문화행사 참여 후기", "시민 안전교육 자료 공유", "주민센터 이용 문의", "공원 시설 개선 제안", "주말 행사 교통 안내"] if split == "dev" else
                  ["청소년 문화공간 운영 제안", "시립도서관 독서모임 안내", "버스 정류장 환경 개선", "지역 문화교실 이용 후기", "온라인 피해 예방 소식", "체육시설 예약 방법 문의", "동네 쉼터 정비 의견", "주민 참여 행사 안내"])

        def write(route, document):
            name = hashlib.sha256(route.encode()).hexdigest()[:16] + ".html"
            (public / name).write_text(document, encoding="utf-8")
            routes[route] = name

        def canonical(path):
            from urllib.parse import urlsplit, parse_qsl, urlencode
            parts = urlsplit(path)
            return parts.path.rstrip("/") + ("?" + urlencode(sorted(parse_qsl(parts.query, keep_blank_values=True))) if parts.query else "")

        for n in range(8):
            post_id = 1041 + n * 7 if split == "dev" else 2103 + n * 11
            path = f"/{split}/board/view?board=free&id={post_id}"
            group = rows[n * 3:n * 3 + 3]
            sections = []
            for slot, item in enumerate(group):
                frames = []
                surface = "body" if slot == 0 else "comment"
                block = fragment(item)
                if slot == 2 and n in [2, 5]:
                    surface = "nested-iframe" if n == 5 else "iframe"
                    frame_path = f"/{split}/widget/comments?post={post_id}"
                    inner_path = f"/{split}/widget/thread?post={post_id}"
                    frame_head = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/site.css"></head><body class="frame-body">'
                    if n == 5:
                        write(canonical(inner_path), frame_head + '<div class="comment"><strong>시민 의견</strong>' + block + '</div></body></html>')
                        write(canonical(frame_path), frame_head + f'<h3>주민 답변</h3><iframe title="답변 상세" src="{esc(inner_path)}"></iframe></body></html>')
                        frames = [frame_path, inner_path]
                    else:
                        write(canonical(frame_path), frame_head + '<div class="comment"><strong>시민 의견</strong>' + block + '</div></body></html>')
                        frames = [frame_path]
                    sections.append(f'<section class="comments"><h3>연계 게시판 의견</h3><iframe title="연계 게시판 댓글" src="{esc(frame_path)}"></iframe></section>')
                elif slot == 2 and n in [1, 6]:
                    surface = "dynamic-comment"
                    # Comments are inserted deterministically; raw templates are inert until JS runs.
                    sections.append(f'<section class="comments"><h3>시민 의견</h3><div class="comment-list" aria-live="polite"></div><template class="comment-template"><div class="comment"><strong>시민 의견</strong>{block}</div></template></section>')
                elif slot == 0:
                    sections.append('<section class="article-body"><p>시민 여러분의 의견을 듣고 있습니다. 아래 내용을 참고해 주시기 바랍니다.</p>' + block + '</section>')
                else:
                    sections.append('<section class="comments"><h3>시민 의견</h3><div class="comment"><strong>익명 시민</strong><time>2026.09.18</time>' + block + '</div></section>')
                cases.append({**item, "page": path, "frames": frames, "selector": f'p#{item["element_id"]}', "surface": surface})
            article = f'<h1>시민 게시판</h1><p class="intro">시민의 목소리를 듣고 함께 더 나은 일상을 만듭니다.</p><article class="post"><div class="post-heading"><span class="badge">자유게시판</span><h2>{titles[n]}</h2><dl><dt>작성자</dt><dd>온빛시민</dd><dt>등록일</dt><dd>2026.09.{18-n:02d}</dd><dt>조회</dt><dd>{127+n*13}</dd></dl></div>' + "".join(sections) + f'</article><div class="post-actions"><a class="button" href="/{split}/board/list?board=free&amp;page={n//3+1}">목록으로</a></div>'
            write(canonical(path), shell(split, "시민 게시판", article))
            pages.append(dict(path=path, title=titles[n], post_id=post_id))
        for page in range(1, 4):
            table_rows = "".join(f'<tr><td>{8-(page-1)*3-i}</td><td class="title"><a href="{esc(post["path"])}">{post["title"]}</a></td><td>온빛시민</td><td>2026.09.18</td><td>{127+i*13}</td></tr>' for i, post in enumerate(pages[(page-1)*3:page*3]))
            links = "".join(f'<a {"aria-current=page" if p==page else ""} href="/{split}/board/list?board=free&amp;page={p}">{p}</a>' for p in range(1, 4))
            content = f'<h1>시민 게시판</h1><p class="intro">시민의 목소리를 듣고 함께 더 나은 일상을 만듭니다.</p><div class="policy"><strong>함께 만드는 열린 게시판</strong><p>의견과 제안을 자유롭게 남겨 주세요. 개인정보 및 부적절한 게시물은 관리 기준에 따라 처리됩니다.</p></div><div class="list-meta"><span>전체 <strong>8</strong>건</span><span>{page} / 3 페이지</span></div><table class="board-table"><caption class="sr-only">시민 게시판 글 목록</caption><thead><tr><th>번호</th><th>제목</th><th>작성자</th><th>등록일</th><th>조회</th></tr></thead><tbody>{table_rows}</tbody></table><nav class="pagination" aria-label="게시판 페이지">{links}</nav>'
            write(canonical(f"/{split}/board/list?board=free&page={page}"), shell(split, "시민 게시판", content))
        cards = "".join(f'<li><a href="{esc(post["path"])}">{post["title"]}</a><time>09.18</time></li>' for post in pages[:3])
        home = f'<section class="hero"><span class="eyebrow">CITIZEN FIRST</span><h1>함께 만드는 온빛,<br>시민의 목소리에서 시작합니다.</h1><p>생활 속 작은 의견이 더 나은 도시를 만듭니다.</p><a class="button" href="/{split}/board/list?board=free&amp;page=1">시민 게시판 바로가기 →</a><div class="hero-art" aria-hidden="true"><i></i><i></i><i></i><i></i></div></section><div class="home-grid"><section><h2>새로운 시민 소식</h2><ul class="news-list">{cards}</ul></section><section class="service-card"><span>이용 안내</span><h2>처음 방문하셨나요?</h2><p>게시판과 시민 서비스 이용 방법을 확인하세요.</p><a href="/{split}/guide">안내 확인 →</a></section></div>'
        write(f"/{split}", shell(split, "시민 소통", home))
        guide = '<h1>이용 안내</h1><section class="guide"><h2 id="service">시민 게시판 이용</h2><p>본문과 시민 의견, 연계 게시판의 답변을 확인할 수 있습니다.</p><h2 id="about">온빛시 소개</h2><p>온빛시는 소프트웨어 검증을 위해 만든 가상의 도시입니다.</p><details><summary>개인정보 안내</summary><p>주민등록번호나 개인 연락처를 게시하지 마세요.</p></details></section>'
        write(f"/{split}/guide", shell(split, "이용 안내", guide))
        count = Counter(t for item in cases for t in item["techniques"])
        assert len(cases) == 24 and all(count[t] == 5 for t in TECHNIQUES)
        manifest["splits"][split] = dict(entry=f"/{split}/", cases=cases, pages=pages,
                                           counts={"cases": 24, "positive_elements": 16, "negative_elements": 8, "findings": 20, "per_technique": dict(count)})
    payload = json.dumps(routes, ensure_ascii=False, indent=2)
    (private / "routes.json").write_text(payload, encoding="utf-8")
    public_files = sorted(p for p in public.rglob("*") if p.is_file())
    digest = hashlib.sha256()
    for file in public_files:
        digest.update(file.relative_to(public).as_posix().encode())
        digest.update(file.read_bytes())
    digest.update((private / "routes.json").read_bytes())
    digest.update(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode())
    manifest["dataset_sha256"] = digest.hexdigest()
    (private / "ground_truth.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Built {len(routes)} routes; 48 cases, 40 findings (10 per technique); sha256={manifest['dataset_sha256']}")


if __name__ == "__main__":
    build()
