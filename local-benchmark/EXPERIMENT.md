# HCX-007 Pipeline 평가 조건

현재 채택한 구조는 수집 → 정규화 → 후보 16개 단위 판정 → JSON 결과 생성입니다. 이 문서는 같은 Pipeline의 개선 전후를 비교하기 위한 조건입니다.

## 실행

1. 이 브랜치의 local-benchmark/start.cmd로 테스트 사이트를 실행합니다.
2. 앱의 start.cmd를 실행하고 웹 화면에서 dev 또는 eval URL을 입력합니다.
3. 실제 평가에는 HCX-007 모드를 사용합니다. Mock은 연결 확인용입니다.
4. 내려받은 result.json을 아래 채점기에 전달합니다. 파일 경로는 실제 저장 위치로 바꾸세요.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File local-benchmark/run.ps1 score C:/results/result.json --split eval --report C:/results/score.json
```

## 통제 조건

- 모델 HCX-007, thinking none, temperature 기본값 0, 출력 상한 3072토큰, 배치 16후보를 기준으로 합니다. 실제 환경설정과 버전을 함께 기록합니다.
- 시작 URL, 데이터 해시, 브라우저/viewport, 수집 범위, 페이지·후보·호출·시간 한도를 통일합니다.
- 한 번에 개선 요인 하나를 비교하며 프롬프트나 전처리를 바꾸면 변경점을 명시합니다.
- 반복 실행의 정확도(precision/recall/F1), 정상 사례 오탐, 기법별 누락, 판정 보류, 전체 지연, 실제 호출·토큰 사용량을 함께 보고합니다.
- 실행 실패·한도 초과·보류를 정상 0건으로 취급하지 않습니다. 보고서의 토큰 수를 화폐 비용으로 해석하지 않습니다.

## 평가 분리

기존 dev와 eval은 이미 오류 분석과 재측정에 사용됐으므로 회귀 검사 자료입니다. 새 홀드아웃이 아닙니다. 새로운 일반화 성능은 별도 고정 평가 자료로 확인해야 합니다.

Agent에는 시작 URL과 웹에서 수집한 증거만 전달합니다. build.py, private/, oracle, 정답 라벨 및 채점 상세 결과를 모델 입력이나 판정 로직에 넣지 않습니다. 채점기는 별도 단계에서 정답과 결과를 비교합니다.

합성 사이트와 채점기는 현재 Pipeline과 별도 폴더/브랜치로 유지합니다. 이 작은 세트의 점수를 실제 공공 사이트나 대회 최종 점수로 일반화하지 않습니다.
