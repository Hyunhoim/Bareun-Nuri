# 공공기관형 탐색 정책 측정 사이트 v5

가상의 온누리시 포털 8개, 합계 **1,213페이지**. 광고 **256위치**, 정상 **6,990위치**를 정답으로 기록했다. 링크 순서만 바꾸는 네 정책을 비교하기 위한 합성 자료다. 실제 기관의 광고 현황이나 유병률을 나타내지 않는다.

## 열기

프로젝트 루트에서 `node test-set-v5/server.cjs`를 실행한다. 하나만 열려면 `node test-set-v5/server.cjs dev-a`처럼 지정한다. 서버는 loopback에만 바인딩한다.

| 사이트 | 페이지 | 주소 |
|---|---:|---|
| dev-a | 139 | http://127.0.0.1:19010/ |
| dev-b | 146 | http://127.0.0.1:19011/ |
| dev-c | 139 | http://127.0.0.1:19012/ |
| dev-d | 150 | http://127.0.0.1:19013/ |
| check-e | 160 | http://127.0.0.1:19014/ |
| check-f | 155 | http://127.0.0.1:19015/ |
| check-g | 163 | http://127.0.0.1:19016/ |
| check-h | 161 | http://127.0.0.1:19017/ |

사이트마다 별도 출처를 사용한다. 다른 사이트 링크를 홈페이지에 삽입하지 않아 동일 출처 탐색 계약에서 자료가 섞이지 않는다. `public/`에는 HTML/CSS만 있고 `private/labels.json`은 정답, `private/catalog.json`은 서버의 URL 매핑이다. 서버는 등록된 HTML/CSS만 제공한다. `.env`, 소스, 정답은 제공하지 않는다.

## 배치

사이트당 광고32위치: 얕은4, 동일 게시판 템플릿 집중12, 서로 다른 구조 분산8, 깊은 경로8. 깊이는 생성기 의도와 실제 DOM 링크의 최단 거리를 각각 계산해 대조했다. 정상 깊은 경로, 정상 글만 있는 게시판, 긴 본문, 인라인 분할, 반복 헤더/사이드바, 목록/상세/이전/다음, 쿼리·경로형 URL, 교차 링크, 외부 링크, srcdoc 댓글 프레임을 포함한다.

광고/정상 대상은 제목·본문·댓글·작성자·서명·링크 문구에 있다. HOMOGLYPH/JAMO/TRANSPARENT/OFFSCREEN 표현은 광고와 정상 모두에 존재한다. 각 사이트의 광고8위치(25%)는 현재 `detail` 감지기가 false로 보는 페이지에 있어 기존 detail=광고 편향을 완화한다. 스타일로 숨긴 정상 대조군도 있으므로 화면에 빈 공간이 보일 수 있다.

## 참고한 실제 페이지

2026-09-24 실제 브라우저로 다음4페이지를 확인했다. 개인 글·이름·로고·디자인 파일을 복제하지 않고 구조를 재구성했다.

- 부산 홈페이지: https://www.busan.go.kr/index.html — 실제 렌더링 anchor653개, 중복 주 메뉴와 분야별 링크, 공지 바로가기. 합성 사이트는 크기를 축소했다.
- 부산 시민생각: https://www.busan.go.kr/siminopen/siminthink01 — anchor72개, 표1개, 검색 form3개, 번호/분야/제목/작성자/참여기간/공감수/댓글수/상태, `curPage` 목록 이동.
- 대전 홈페이지: https://daejeon.go.kr/drh/daejeon/index.do — anchor635개, 참여/공지/자료 메뉴, `menuSeq`·`boardId` 경로.
- 대전 시험공고: https://www.daejeon.go.kr/exa/ExaExamNoticeList.do?menuSeq=307 — anchor58개, 표1개, 검색 form3개, 일부 페이지 이동은 `#this` 기반 스크립트 동작.

실제 확인 기록은 `.runtime/balanced-source-structure.json`이다. 합성 페이지는 재현 가능한 정적 href를 사용한다. JS 클릭 전용 목록 이동, 로그인, 자동 스크롤, 지연 댓글, 외부 프레임 네트워크 동작을 이번 측정으로 검증했다고 주장하지 않는다. srcdoc는 부모 방문으로 열리는 내장 문서이며 별도 HTTP 요청이 없다.

## 재현

최초 생성: `node test-set-v5/build.cjs`. 성능 자료를 고정한 후에는 생성기나 HTML을 수정하지 않는다.

검사: `node agent/experiments/frontier-balanced.test.cjs`

브라우저 자료 준비: `node agent/experiments/frontier-balanced-run.cjs prepare .runtime/frontier-balanced-new`

오프라인 비교: `node agent/experiments/frontier-balanced-run.cjs run .runtime/frontier-balanced-new`

기존 결과 디렉터리는 덮어쓰지 않는다. 결과를 재현할 때는 서버 포트를 비우고 새로운 디렉터리를 사용한다. 유효 결과는 `.runtime/frontier-balanced-v2/`에 있다. v1은 집계 변수 참조 오류로 점수 산출 전에 종료됐고, 원본과 중단 이유를 보존했다. 비교 계획과 결과는 `docs/frontier-balanced-plan.md`, `docs/frontier-balanced-report.md`를 참고한다.

`check-*`는 정책을 고정한 뒤 확인하는 별도 구성이다. 같은 작성자와 생성 코드를 공유하므로 독립 실사이트 홀드아웃이 아니다. 공개한 이후의 재측정은 회귀 검사다. 스케줄러는 정답이나 아직 방문하지 않은 본문을 읽지 않는다. 도달률은 잠재적 검사 범위이며 수집 성공률·광고 판정 F1과 다르다.
