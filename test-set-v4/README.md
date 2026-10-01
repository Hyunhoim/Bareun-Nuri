# 탐색 정책과 URL 발견 방식 검증 사이트

개발 3개(각 127페이지), 확인 3개(각 135페이지)의 합성 사이트다. 각 사이트는 광고 24개·정상 168개의 제목/본문/댓글 라벨을 가지며, 목록·정상 게시판·관리자 공지 댓글·깊은 메뉴·공유 경유·교차 링크를 포함한다.

`public/`에는 HTML과 Sitemap/robots fixture, `private/`에는 파일 대응표와 평가 정답을 둔다. HTML 링크는 `http://dev-101.fixture.test/` 같은 가상 호스트를 사용한다. 오프라인 실행기가 브라우저에 문서를 로드해 해석하며 해당 호스트로 네트워크 요청하지 않는다. 더블클릭하거나 기존 v3 서버로 바로 탐색하는 배포용 사이트가 아니다.

루트에서 `node test-set-v4/build.cjs`로 동일 seed 자료를 생성하고, `node agent/experiments/navigation-run.cjs .runtime/navigation-trial-new`로 두 실험을 실행한다. 이미 존재하는 출력 디렉터리는 거부한다. 기능 검사는 `node agent/experiments/navigation.test.cjs`다. 기존 Playwright와 설치된 Edge를 사용한다.

Sitemap은 없음/전체/일부/오래됨 조건이 있으며, 오래됨은 존재하지 않는 URL을 의도적으로 포함한 반례다. 정답은 탐색 정책·Bandit 보상에 제공하지 않는다. 실제 LLM 판정이나 네트워크 지연 실험은 아니다.

두 분할 모두 현재 관찰을 완료한 진단 자료다. 같은 제작자의 합성 자료이므로 일반화 홀드아웃으로 재사용하지 않는다. 계획과 결과는 `docs/navigation-experiments-plan.md`, `docs/navigation-experiments-report.md`를 참고한다.
