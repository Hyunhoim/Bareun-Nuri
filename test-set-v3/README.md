# 혼합 페이지 탐색 진단 세트

개발(dev) 40페이지, 최종 확인(confirmation) 40페이지. 사용자 게시판, 정상 게시판, 일반 안내, 기관 공지, 공지의 이용자 댓글, 깊은 불투명 경로, 긴 본문과 인라인 분할을 포함합니다. 같은 제작자의 합성 자료이며 독립 실사이트 홀드아웃이 아닙니다.

`node test-set-v3/build.cjs`로 생성합니다. `local-benchmark/serve.py --dataset-root test-set-v3 --entry /dev/ --port 8787`로 서버를 실행합니다. 시작 URL은 `http://127.0.0.1:8787/dev/`, `http://127.0.0.1:8787/confirmation/`입니다.

`public/`만 HTTP로 제공됩니다. `private/labels.json`은 평가 전용이며 Agent 또는 LLM 입력으로 제공하지 않습니다. 경로와 요소 ID는 라벨 의미가 없는 해시입니다. 사례를 본 뒤 규칙·프롬프트를 조정하면 해당 자료는 이후 회귀·진단용입니다. 결과는 전체 정답을 분모로 계산하며 미방문 광고도 FN입니다.

긴 본문 분할은 의미 보존을 보장하지 않습니다. 원문 offset 보존, 인용 문맥, 부분 판정 상태와 요소별 통합을 별도로 검증합니다. 실제 탐지 성능과 수집 도달률을 구분하세요. 실험 조건은 `docs/progressive-mixed-plan.md`에 있습니다.

실제 비교를 완료했습니다. 두 분할 모두 이미 관찰한 진단 자료이며 새로운 홀드아웃이 아닙니다. FIFO/우선순위/필터의 동일 예산 결과와 과적합 우려는 `docs/progressive-mixed-report.md`를 참고하세요. 각 분할은 광고 20개·정상 40개, 전체 수집 후보 326개입니다. 관리자 권한 안내와 동일한 생성 규칙에 대한 의존이 있어 실사이트 일반화 자료로 충분하지 않습니다.

프로젝트 루트에서 `node agent/experiments/progressive-trial.cjs dry .runtime/progressive-dry-new`로 무과금 수집·계약 검사를 실행합니다. `live`는 HCX 실제 비용이 발생합니다. 결과 폴더는 새 경로를 지정해야 합니다. 기존 8787 서버가 있으면 먼저 충돌을 해결하세요. Python 경로는 필요하면 `PYTHON_EXE` 환경변수로 지정합니다.
