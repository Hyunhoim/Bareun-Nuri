# Bareun-Nuri · Test_set

지금까지 사용한 합성 사이트, 학습·개발검증·회귀 자료와 핵심 검증 보고서를 보존하는 브랜치입니다. 운영 실행 코드는 `Agent_core`, 백엔드는 `Backend`에 있습니다. 모델 가중치·API 키·가상환경·반복 실행의 대용량 원응답 로그는 포함하지 않습니다.

## 자료 위치

|경로|내용|
|---|---|
|`local-benchmark/public`, `private`|초기 공공기관형 사이트와 분리된 정답|
|`test-set-v2` ~ `test-set-v5`|100페이지 진단, 혼합 사이트, 탐색 정책·깊이·영역 검증 자료|
|`test-set-contest-v1`|4종 위장 기법과 정상 대조 평가|
|`test-set-digit-v2`, `test-set-digit-v3`|숫자·닮은꼴 치환 대조 자료|
|`test-set-operating-phase1`|실제 공공웹 형식을 참고·보강한 운영 평가|
|`test-set-operating-phase2`|정상500/광고500, 단일·복합 기법 합성 평가|
|`local-benchmark/*data*`, `nuri-1.2`, `real-*`, `semantic-*`|분류기·SLM 학습 및 검수·문맥 검증 자료|
|`datasets/runtime`|과거 `.runtime`에 저장됐던 입력·정답·추가 학습 자료·복제본의 별도 보존|
|`docs`|실험 계획·결과·채택/미채택 판단 및 개발 계약|
|`agent/experiments`, `local-benchmark/*.{cjs,py}`|당시의 생성·검증·채점 도구(연구 이력)|

`dataset-inventory.json`에 원본 경로, 보존 경로, 크기, SHA-256을 기록했습니다. 파일명의 final/holdout 표기는 작성 당시 명칭이며, 현재 미사용 평가셋임을 뜻하지 않습니다. 이미 소비한 최종 자료는 재학습하지 않고 회귀 검사로 취급합니다. 문서의 `.runtime/...` 경로는 과거 실행 위치이며 보존 데이터는 `datasets/runtime/...`에서 찾습니다. 모델·원응답 로그를 요구하는 과거 스크립트는 이 브랜치만으로 모든 실험을 재실행할 수 없습니다.

## 먼저 읽을 검증 문서

- `docs/phase2-improvement-report.md`: 최신 R 프롬프트·격리 자동 복구 채택. 첫25분 F1 81.21%, 재개 후90.05%, 기존 정탐 손실12개도 포함.
- `docs/phase2-operating-report.md`: Phase2 최초 운영 기준선과 미판정·의미 누락.
- `docs/hcx-throughput-goal-report.md`: 동시 실행·결과 반영·저장 병목 개선.
- `docs/dual-technique-report.md`: JAMO/HOMOGLYPH 모델 비교와 일반화 한계.
- `docs/crawl-contract.md`: 탐색 경계·예산·재개 계약.

다른 모델과 필터·탐색 정책의 실패 기록도 함께 보존합니다. 예전 문서의 '현재 운영'은 작성 당시 상태입니다. 최신 운영은 `Agent_core` README와 최신 채택 보고서를 따릅니다.

## 사이트 실행

기존 각 폴더의 README를 따릅니다. 예: `node test-set-v5/server.cjs dev-a`. 정적 public 사이트를 간단히 확인할 때는:

```powershell
py -m http.server 8781 --bind 127.0.0.1 --directory test-set-operating-phase2/public
```

정답·검수 자료가 있는 상위 루트를 웹 서버로 공개하지 마세요. 기법 평가는 실제 브라우저의 DOM·스타일·좌표 수집을 거쳐야 하며, 문구만 읽은 결과와 구분합니다. 연구 도구의 API 실행 옵션은 비용을 발생시킬 수 있으므로 코드의 실행 조건을 확인한 뒤 사용합니다.

## 해석 범위

Phase2는 1,000독립 실게시물이 아니라200의미원고×5기법 변형입니다. 실수집·원문 인용·구조 참고 합성을 각 자료의 출처 기록대로 구분합니다. 광고 정답은 작성한 위치 기준이며 미라벨 주변 요소를 자동으로 정상 처리하지 않습니다. 자료 내 불법광고 문구·주소는 탐지 검증용 기록이며 실제 서비스 이용을 권하지 않습니다.

대형 수집 복제본 세 묶음은 `datasets/runtime/*.zip`으로 무손실 압축했습니다. `dataset-inventory.json`의 archive/entry와 원본 SHA-256으로 검증할 수 있습니다. 압축을 해당 runtime 폴더에 풀면 원래 디렉터리 구조가 복원됩니다.
