# HCX-007 / Qwen 실험용 baseline 3종

## v0.3.3 자모 복원 보조 입력

공통 수집 단계가 `jamo.cjs`의 문자 조합 규칙으로 `normalized_text`를 만듭니다. 원문·위치·기법 근거와 광고 판정 프롬프트는 그대로 보존합니다. 현대 호환 자모의 초성/종성 구분, 결합 자모, 혼합 표기, 복합 모음·받침을 처리하며 광고 키워드 사전이나 평가 ID를 사용하지 않습니다. 불완전한 자모와 구분자는 유지하고 단어 경계의 모호성을 추측으로 해결하지 않습니다.

누락 사례를 포함한 동일 16개 후보 묶음에서 HCX-007을 seed 42/43/44로 호출했습니다. 기존 정규화 A는 **0/3**, 수동 복원 B와 자동 복원 C는 각각 **3/3** 탐지했습니다. API 요청 본문을 비교하여 보조 정규화 텍스트 이외의 차이가 없음을 확인했습니다. 이 반복은 같은 사례의 재현성 확인이며 독립 표본 3개가 아닙니다.

[검증 보고서](outputs/jamo-restoration/JAMO_RESTORATION_REPORT.md)와 [요청·회귀 대조 결과](outputs/jamo-restoration/audit.json)에 전체 결과를 기록합니다. 기존 eval 재검사는 새로운 홀드아웃 평가가 아닙니다. 아래 v0.3.2의 정확한 요청 재현 명령은 **당시 보관된 소스용**입니다. 현재 버전은 정규화 입력이 달라 이전 snapshot과의 비교에서 중단되는 것이 정상입니다.

문자 조합 자체는 `node agent-experiments/jamo.cjs`로 검사합니다(프로젝트 루트 기준). 현대 한글 11,172자 × 두 표기 방식과 경계·보존 사례 18개를 확인합니다. 공통 수집/Agent 회귀 검사는 기존 `run.ps1 test`를 사용합니다. 모두 실제 API를 호출하지 않습니다.

## v0.3.2 최초 판정 프롬프트 통일

Pipeline의 최초 요청을 `phase=initial`로 통일했습니다. Adaptive는 같은 Pipeline 함수를 호출한 뒤 필요한 후보만 재검토합니다. 공통 시스템 프롬프트·입력·스키마·모델 설정을 중복 정의하지 않습니다. 최초 판정이 미해결이면 Pipeline은 이를 그대로 보존합니다. 자모 전처리, 광고 판정 기준, 추가 조사 조건은 이번 변경에 포함하지 않았습니다.

**실제 재측정 완료:** 동일 eval 226개 후보를 3회 실행해 모두 TP 19 / FP 0 / FN 1, F1 **97.44%**를 기록했습니다. 정밀도 100%, 재현율 95%, 전체 시간 중앙값 **226.09초**, 회당 15회 호출입니다. 실제 요청 45개와 확정 검출 목록이 이전 Adaptive 최초 단계와 일치했습니다. 매 실행 미해결 14건(빈 근거 13건 포함)을 보존했으며 자모 광고 `eval-04`의 누락은 남아 있습니다. 이후 개선의 기준은 이 Pipeline 결과입니다.

[프롬프트 통일 분석 보고서](outputs/prompt-control-1790000217406/PROMPT_ALIGNMENT_REPORT.md), [반복별 CSV](outputs/prompt-control-1790000217406/comparison.csv), [요청 대조 및 검사 결과](outputs/prompt-control-1790000217406/comparison.json)에 근거를 보존했습니다. 동일 합성 eval의 확인 실험이며 새로운 홀드아웃 검증은 아닙니다.

로컬 회귀 검사 31개가 통과했으며 HCX 요청 본문이 두 구조에서 동일함을 검사합니다. 이전 Adaptive의 최초 요청과 동일한 조건으로 Pipeline만 3회 재측정하려면 프로젝트 루트에서 실행합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\agent-experiments\run.ps1 benchmark --pipeline-control outputs/accuracy-1789986830545
```

실제 API를 호출합니다. 참조 경로는 실행기가 이동하는 `agent-experiments/` 기준이며 절대 경로도 사용할 수 있습니다. 입력·설정·정답 파일 해시를 참조 실험과 비교하고, 각 실행의 실제 요청 본문이 이전 Adaptive 최초 요청과 완전히 같은지 확인합니다. 세 실행이 모두 끝난 후 채점합니다. 결과는 `outputs/prompt-control-*/`에 저장합니다. 이미 분석한 eval을 재사용하는 확인 실험으로, 새로운 홀드아웃 검증은 아닙니다.

## v0.3.1 비교 실험 — 프롬프트 통일 전, 2026-09-21

v0.3.1로 eval 전체 226개 후보를 구조별 3회 처리해 9/9 완주했습니다. 현재 구현의 추천은 **Adaptive → Pipeline → Specialists**입니다. 평균 F1 / 전체 시간 중앙값은 Adaptive **95.85% / 248.60초**, Pipeline **92.68% / 231.57초**, Specialists **71.23% / 1,107.84초**입니다. 형식 오류·중복·원문 불일치·재시도는 모두 0입니다.

다만 Adaptive의 최초 판정만 재채점하면 세 번 모두 F1 97.44%였고, 추가 조사에서 한 번 오탐이 증가했습니다. Pipeline과 최초 단계의 `phase` 프롬프트도 달랐으므로 추가 조사가 성능 우위의 원인이라고 볼 수 없습니다. 다음 비교 대상으로는 같은 최초 프롬프트를 쓰는 단일 패스가 타당하며, 별도 실행 지연은 아직 측정하지 않았습니다.

[최종 분석 보고서](outputs/accuracy-1789986830545/ACCURACY_REPORT.md), [반복별 CSV](outputs/accuracy-1789986830545/comparison.csv), [실행 검증](outputs/accuracy-1789986830545/audit.json), [추가 조사 전후 재채점](outputs/accuracy-1789986830545/adaptive-ablation.json)을 확인하세요. 작은 합성 세트의 탐색 실험이며 실제 공공 사이트 전체에 대한 성능 보장은 아닙니다. 이후 변경의 검증에는 새로운 평가 세트를 사용해야 합니다.

## v0.3 정확도 실험

전문가의 관찰 결과와 광고 판정을 분리했습니다. 문자·스타일 전문가는 `observed_techniques`, 문맥 전문가는 `ad_verdict`를 반환합니다. 최종 판정자는 두 필드를 함께 반환하며, 코드는 `ad_verdict=violation`인 경우에만 관찰 기법을 제출용 검출 결과에 반영합니다. 정상 요소의 숨김 관찰은 진단 자료에 남지만 광고 검출이 되지 않습니다. 전문가에게 가짜 `is_violation=false`를 부여하지 않습니다.

같은 후보·도구의 조회 결과는 실행 내 공통 캐시에서 재사용합니다. 후보별 2회 예산은 서로 다른 실제 조회에만 차감하며, 캐시 응답에도 `cached`를 기록합니다. 모델의 광고 판단 자체를 정답표나 코드로 교정하지 않습니다.

v0.3.1에서는 문자 전문가에게 이미 전체 원문을 제공하므로 도구 단계를 생략하고, 스타일 전문가는 조상 스타일, 문맥 전문가는 주변 문맥 조회만 사용합니다. 판정자는 광고와 관찰 기법을 분리해 통합합니다. 평가에서는 공통 도구 라운드를 1회로 고정하여 조회 결과 다음에 바로 구조화 판정합니다. 후보당 서로 다른 근거 조회는 여전히 최대 2회입니다.

프로젝트 루트에서 다음 명령은 **실제 API를 호출하는 평가 실험**입니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\agent-experiments\run.ps1 benchmark
```

- `eval` 전체 DOM 후보를 제외 없이 처리하고, 구조별 3회씩 실행합니다. 구조 순서는 반복마다 순환합니다.
- 반복별 seed는 42/43/44이며 같은 반복의 세 구조는 같은 seed를 사용합니다. HCX-007, 추론 none, temperature 0, 배치 16, 출력 상한 3072토큰, 요청 제한 180초, 구조별 최대 220회/30분을 공통 적용합니다.
- 구조 내 공통 FIFO 대기열에서 61초당 토큰 예약 목표 52,000개와 최소 시작 간격 1초를 적용합니다. 요청 전에는 본문 문자 수 기반으로 보수적으로 추정하고, 응답 후에는 실제 입력 토큰+출력 상한으로 예약량을 수정합니다. 추정 토크나이저이므로 공급자 제한을 완벽히 보장하지는 않습니다. 429가 발생하면 해당 전문가만이 아니라 전체 대기열을 잠시 멈춥니다.
- 구조별 실행 사이에는 61초간 쿼터를 비워 같은 출발 조건을 맞춥니다. 이 작업 간 휴지는 한 사이트 검사 지연에서 제외하며, 실행 내부의 쿼터 대기·재시도는 지연에 포함합니다.
- 코드·정답 파일 바이트 해시와 실험 조건을 먼저 저장합니다. 최초 수집 해시를 기준으로 매 실행에 브라우저를 다시 띄워 수집하고, 입력이 달라지면 중단합니다. 모델에 정답을 보내지 않으며 9회 예측이 모두 끝난 후 별도 채점기를 실행합니다.
- 평가 실행에서는 HTTP 429 또는 응답을 받지 못한 fetch 연결 실패에 한해 최소 60초 대기 후 한 번 재시도합니다. 연결 오류 코드를 남기며, 실패 요청이 서버에서 처리됐는지 알 수 없는 경우 사용량을 추정하지 않습니다. 형식 보정도 한 번만 허용합니다. 모든 시도와 대기는 호출 상한·실행 시간에 포함됩니다. 일반 `run`은 이 재시도 옵션을 기본 활성화하지 않습니다.
- 지연은 실제 수집부터 최종 결과까지의 전체 시간입니다. API 처리 구간의 합집합, API 요청별 p50/p95, 429 횟수도 별도로 남깁니다. 병렬 전문가의 개별 대기 시간을 단순 합산해 전체 시간에서 빼지 않습니다.
- 결과는 `outputs/accuracy-*/protocol.json`, `reference-input.json`, `progress.json`, `summary.json`과 반복/구조별 폴더에 저장합니다. 미해결 항목은 검출에서 제외되므로 정답 광고를 놓치면 채점에서 FN으로 반영됩니다. 실패한 실행은 정상 0건으로 바꾸지 않습니다. 한 구조가 재시도 후에도 실패하면 실험을 중단하며, 9회 전체가 완료되지 않은 실험은 채점하지 않습니다.

완료한 결과를 집계하려면 `node agent-experiments/report-benchmark.cjs <결과 폴더>`를 실행합니다. `comparison.json`, `comparison.csv`, `ACCURACY_REPORT.md`를 생성합니다.

추천 기준은 정상 완주·형식/원문 보존을 전제로 평균 F1 우선, 차이가 0.01 이내이면 전체 지연 중앙값 우선입니다. 정밀도·재현율·기법별 결과와 반복 변동을 함께 제시합니다. 대회 공식 점수 환산식은 아닙니다. 같은 합성 사이트의 작은 평가 세트이므로 실제 공공 웹사이트 전체로 일반화할 수 없습니다.

## HCX-007 실행 (현재 권장)

기존 `.env`의 `CLOVASTUDIO_API_KEY`, `CLOVASTUDIO_MODEL=HCX-007`을 사용합니다. 키 파일을 덮어쓰지 마세요. 나머지 선택 설정은 `.env.example`에 있습니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run.ps1 run --architecture all --provider hcx --url http://127.0.0.1:8765/dev/
```

- HCX 공식 v3 API를 사용합니다. 기본 설정은 thinking=none, temperature=0, 최대 출력 2048토큰, 요청 제한시간 60초, 구조별 최대 300회입니다. 기존 `.env`의 `MAX_LLM_CALLS`가 있으면 우선합니다.
- 도구 선택과 최종 JSON 판정은 분리합니다. 도구 단계에는 조회 지시만 전달하며, 최종 단계에는 최초 입력과 실제 도구 결과를 데이터로 전달하고 JSON 스키마 출력을 요구합니다. HCX는 구조화 출력에 도구 호출 이력을 함께 전달하는 요청도 거절하므로 이 변환이 필요합니다.
- HCX의 최종 JSON은 입력 요소 ID를 필수 키로 하는 객체입니다. 배열에서 ID를 누락·중복 생성하는 문제를 줄이고, 수신 후 공통 판정 배열로 변환하여 다시 검증합니다. 제출용 result.json 형식은 그대로입니다.
- 세 구조의 모델·설정·호출 상한은 같고, 실제 호출 횟수는 구조에 따라 다릅니다. 최초 입력 해시가 첫 구조와 다르면 이후 구조의 API 호출을 중단합니다.
- 전문가 요청도 공통 시작 간격(기본 8초)을 공유합니다. `CLOVASTUDIO_MIN_INTERVAL_MS`로 변경할 수 있습니다. 입력 크기에 따른 TPM까지 보장하지 않으므로 계정 한도에 맞게 조절하세요. 대기 시간은 실행 시간에 포함됩니다. HTTP 오류의 자동 재시도는 없습니다. JSON/판정 형식 오류는 동일 입력으로 한 번만 보정하고, 호출 수와 사용량에 포함합니다.
- 근거(reason)가 빈 판정은 정상으로 확정하지 않고 needs_review=true로 처리하여 diagnostics.json에 남깁니다. 타입·ID·개수 오류는 한 번 보정 후에도 실패하면 실행을 중단합니다.
- 키는 헤더로만 전송하며 보고서·로그에 저장하지 않습니다. 기본 실행은 계속 mock이고, 실제 호출에는 `--provider hcx`가 필요합니다.
- `run.ps1 verify-flow`는 공통 호출부로 실제 도구 조회→근거 전달→JSON 판정을 확인합니다. 첫 도구를 지정하는 합성 연결 검사이며 정확도 측정은 아닙니다. 본 실험의 도구 선택은 auto입니다.

작은 실제 API 연동 검증은 이 폴더에서 다음 명령으로 실행합니다. 로컬 사이트가 실행 중이어야 합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run.ps1 verify
```

`verify`는 공개 DOM 힌트로 4종 기법별 서로 다른 후보 2개씩과 힌트 없는 후보 4개를 골라 총 12개를 고정합니다. 세 구조가 동일한 수집 스냅샷을 공유하며, HCX-007 / thinking=none / temperature=0 / 출력 2048토큰 / 요청 60초 / 구조당 최대 40회 / 구조당 10분 / 요청 시작 간격 30초로 실행합니다. 전문가도 이 간격을 공유합니다. 8초 간격의 실제 검증에서 429가 발생하여 보수적으로 늘린 값이며, 다른 프로세스의 API 사용량까지 제어하지는 않습니다. `verify` 설정은 일반 `run`의 환경변수 기본값과 구분됩니다.

결과는 `outputs/hcx-validation-*/`에 저장됩니다. `same_input`, `same_configuration`을 확인하세요. **12개 후보는 정답 라벨을 보고 선택하지 않았으며, 정상/광고의 정답 균형이나 전체 탐지율을 보장하지 않습니다.** 재검토가 남아도 프로토콜 완료일 수 있으므로 `passed`와 `needs_review`를 함께 확인하세요. 한 번 수집한 스냅샷을 재사용하므로 구조별 시간에는 최초 수집 시간이 포함되지 않습니다. 전체 개발셋 채점 결과로 해석하면 안 됩니다.

[HCX Function calling](https://api.ncloud-docs.com/docs/clovastudio-chatcompletionsv3-fc), [Structured Outputs](https://api.ncloud-docs.com/docs/clovastudio-chatcompletionsv3-so), [이용량 제한](https://guide.ncloud-docs.com/docs/clovastudio-ratelimiting).

테스트 사이트와 **별도 폴더**에 있는 최소 실험 구현입니다. 운영용 앱이나 제출용 실행 파일을 생성하지 않으며, `local-benchmark/`의 파일을 수정하거나 정답표를 읽지 않습니다.

```text
프로젝트/
├─ local-benchmark/             테스트 사이트 + 별도 정답 채점기 (기존 유지)
└─ agent-experiments/           이번 실험 구현
   ├─ architectures/
   │  ├─ adaptive.cjs           추천 1위 / B1: 선택적 추가 조사
   │  ├─ pipeline.cjs           추천 2위 / B0: 고정 파이프라인
   │  └─ specialists.cjs        추천 3위 / B2: 전문가 분업
   ├─ collect.cjs               공통 브라우저 수집기
   ├─ llm.cjs                   HCX/Qwen HTTP 연결부 + 모의 응답 + 읽기 도구
   ├─ run.cjs                   실행·기록·result.json·결과 화면
   ├─ test.cjs                  독립 로컬 서버로 연결/오류/브라우저 검사
   └─ outputs/                 실행별 결과 (웹사이트로 제공하지 않음)
```

## 키 없이 실행

1. `local-benchmark/start.cmd`로 테스트 사이트를 실행합니다. 이미 8765 포트에서 실행 중이면 다시 실행할 필요가 없습니다.
2. 이 폴더의 `demo.cmd`를 실행합니다. 세 구조를 **mock 모드**로 순서대로 실행합니다.
3. 콘솔에 나온 각 결과 폴더의 `report.html`을 열어 확인합니다.

PowerShell에서는 이 폴더에서:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run.ps1 run --architecture all --provider mock --url http://127.0.0.1:8765/dev/
```

한 구조만 실행하려면 `all` 대신 `adaptive`, `pipeline`, `specialists`를 지정합니다. 기본값은 `all`, `mock`, 개발 사이트 URL입니다. 평가 사이트는 URL을 `/eval/`로 바꿉니다. `all` 실행 순서는 단순한 B0 → B1 → B2이며 추천 순위와는 다릅니다.

**mock은 키워드와 수집된 힌트로 HTTP/Agent 응답 형태를 흉내 낼 뿐입니다. 검출 건수·점수·시간으로 Qwen의 정확도나 세 구조의 우열을 판단하면 안 됩니다.** API 호출 비용은 없고, 출력 버전에 `MOCK-NOT-QWEN`을 표시합니다. API 토큰·비용을 추정하여 채우지 않고 null로 기록합니다.

현재 PC에서는 Codex의 Node.js/Playwright와 설치된 Edge를 사용합니다. 다른 PC에서는 Node.js 22 이상, Edge를 설치한 뒤 이 폴더에서 `npm.cmd install`을 실행합니다. 로컬 테스트 사이트에는 별도로 Python이 필요합니다. `BROWSER_CHANNEL=chrome`도 가능하며, `chromium`은 해당 Playwright 브라우저 설치가 필요합니다.

## 세 구조의 구현 차이

| 구조 | 실제 구현 흐름 |
|---|---|
| **1위 adaptive / B1** | 공통 초기 증거로 판단 → `needs_review`, 증거와 기법의 충돌, 기법 없는 양성을 선별 → 모델이 읽기 도구 선택 → 추가 증거로 재판정 |
| **2위 pipeline / B0** | 공통 초기 증거를 문단 묶음으로 전달 → 묶음당 한 번 판단 → 결과 검증 |
| **3위 specialists / B2** | 문자·스타일·광고 문맥 전문가를 독립 호출 → 각자 필요한 증거 조회 → 같은 요소 ID의 의견을 통합 판정 |

세 구조 모두 같은 선택 모델·설정·브라우저 수집기를 사용합니다. 전문가 분업은 별도 프로세스를 띄우는 대신 **독립된 프롬프트/대화 이력을 가진 API 요청을 병렬 실행**하는 최소 구현입니다. 통합 단계가 전문가의 정답 수를 세는 다수결은 아닙니다.

공통 추가 조회 도구는 `get_context(node_id)`, `get_ancestor_styles(node_id)`, `get_frame_context(node_id)`입니다. **도구는 이미 수집된 스냅샷에서 더 자세한 증거를 꺼냅니다. 브라우저를 재방문하거나 임의 코드·파일·외부 URL을 실행하지 않습니다.** Agent가 선택할 수 있는 것은 현재 묶음에 있는 요소 ID뿐입니다.

후보당 서로 다른 추가 조회는 전체 실행의 전문가 역할을 합쳐 최대 2회입니다. 이미 조회한 같은 도구 결과는 캐시로 재사용하며 추가 예산을 소모하지 않습니다. 초과한 새 조회에는 한도 소진 오류를 도구 결과로 전달합니다. 일반 실행의 대화당 도구 라운드는 최대 2회이며, v0.3.1 정확도 실험은 1회로 고정합니다. 세 구조의 최초 증거는 같습니다. Adaptive 판정자는 세 도구를 선택할 수 있지만 Specialists는 역할별로 문자 전문가의 도구를 생략하고 스타일 전문가에 조상 스타일, 문맥 전문가에 주변 문맥만 허용합니다. 따라서 역할별 도구 권한까지 동일한 실험은 아닙니다.

## 대회 요강과 연결되는 최소 기능

- 진입 URL 하나에서 동일 출처·지정 경로 범위의 링크/페이지네이션을 탐색합니다. query ID를 보존하고 query 순서/fragment 중복은 정리합니다.
- 렌더링 후 300ms 대기하여 로컬 테스트셋의 동적 댓글을 읽습니다. 중첩 iframe을 재귀적으로 식별합니다.
- 본문·댓글 등 의미 있는 텍스트 요소를 읽습니다. 키워드 일치만으로 수집 대상을 버리지 않고, 정상 후보도 모델에 전달합니다.
- 문자 정규화 후보와 4종 기법의 **가능성 힌트**를 계산합니다. 원문, 실제 적용 스타일, 상위 요소, 좌표, 주변 문맥, frame 경로를 함께 보존합니다.
- 스크린샷만 분석하지 않습니다. 투명 글씨와 display:none도 DOM에서 읽습니다.
- CSS 선택자는 코드가 생성하고 유일성을 확인합니다. iframe 경로는 절대 src를 사용하며, 같은 src가 중복되면 요소 순서 경로를 사용합니다.
- 모델은 알려진 node_id와 판정만 반환합니다. 원문·URL·위치는 모델에게 생성시키지 않습니다.
- 복합 기법은 `(url, location, technique)`별 검출 객체로 분리하고 중복 제거합니다.
- UTF-8 BOM 없는 `result.json`과 사용자 확인용 `report.html`을 생성합니다. 원문은 정규화 전 textContent를 그대로 사용합니다.
- `.env`에서 실행 시점에 키·서비스 주소·모델을 읽습니다. 재컴파일하지 않아도 교체할 수 있습니다.

문자 정규화는 NFKC/NFC에 한정했습니다. 모든 호환 자모를 완벽하게 음절로 복원하는 전용 알고리즘이나 완전한 confusable 사전은 아직 없습니다. 원문과 자모/닮은꼴 후보 힌트를 모델이 함께 판단하는 baseline입니다. DOM 기법 힌트 자체는 불법광고 판정이나 정답이 아닙니다.

수집 범위는 기본적으로 시작 URL의 첫 경로 구간입니다(`/dev/` 또는 `/eval/`). `--scope /`처럼 직접 변경할 수 있습니다. 다른 출처의 iframe·리소스, POST 요청은 차단합니다. 공공 사이트 전체를 대상으로 하는 최종 크롤러는 아닙니다.

## 기존 Qwen 연결 (선택)

소켓이라는 표현은 **Qwen의 HTTP Chat Completions 연결 인터페이스**로 구현했습니다. 별도 WebSocket 서버는 필요하지 않습니다. 표준 Node `fetch`를 사용하며 추가 AI SDK는 없습니다.

1. `.env.example`을 `.env`로 복사합니다(이미 파일이 있으면 덮어쓰지 말고 편집).
2. `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL`을 입력합니다. BASE_URL은 제공업체·리전·워크스페이스에 맞는 `/v1` 기본 주소이며 `/chat/completions`를 붙이지 않습니다.
3. 명시적으로 `--provider qwen`을 지정해야 실제 API를 호출합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run.ps1 run --architecture pipeline --provider qwen --url http://127.0.0.1:8765/dev/
```

키나 주소가 없으면 수집 전에 실패하며 mock으로 자동 전환하지 않습니다. 이 구현에서는 실제 Qwen 호출을 아직 검증하지 않았습니다. **키 발급 후 짧은 실제 API 요청으로 모델 ID, 리전, JSON 및 tool calling 지원을 확인하는 단계가 남아 있습니다.**

기본 설정은 `qwen3.7-plus`, thinking=false, temperature=0, 응답 상한 4096 토큰입니다. 최종 판정은 JSON Object 모드로 요청하고, 도구 사용 중에는 function calling을 요청합니다. 공급자의 JSON 모드만 믿지 않고 요소 ID·필드·기법·누락·중복을 로컬에서 검증합니다. API의 길이 제한 종료·거절·비정상 JSON·잘못된 도구 호출은 실패로 처리합니다.

지원 문서(구현 시 확인): [Qwen Function Calling](https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling), [구조화 출력](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output).

## 출력 파일

| 파일 | 용도 |
|---|---|
| `result.json` | 요강 형식의 확정된 검출 결과. 실패한 실행에서는 생성하지 않음 |
| `report.html` | 사용자 결과 화면. mock/실제 호출, 실패·재검토 상태를 명시 |
| `run.json` | 모델 설정, 실제 시간, 요청별 usage, 호출·도구 횟수, 상태·오류 |
| `evidence.json` | 공개 DOM에서 수집한 공통 증거와 스냅샷 해시 |
| `decisions.json` | 정상 판정 포함 전체 모델 판정과 짧은 근거 |
| `diagnostics.json` | 미해결 재검토·필수 4종 밖의 양성 판단 |
| `trace.jsonl` | API 요청 본문·응답·도구 출력. Authorization 헤더와 키는 기록하지 않음 |
| `partial-decisions.json` | 중간 실패 전에 받은 판정이 있는 경우만 생성 |
| 상위 폴더 `summary.json` | 세 실행의 상태 및 같은 수집 스냅샷인지 여부 |

`completed_with_warnings`는 재검토 항목이나 차단된 리소스가 남았음을 뜻합니다. 재검토 항목을 정상으로 확정하지 않고 별도로 남깁니다. 각 결과는 모의/실제 모드·미해결 수·실패 여부를 함께 보고 비교하세요.

매 실행마다 별도 폴더를 생성하며 기존 결과를 덮어쓰지 않습니다. `--out`을 지정하면 그 아래 구조 이름별 폴더를 사용하므로 반복 실행 시 새로운 경로를 지정하세요. 각 구조는 실제로 다시 수집하며 수집·판정 시간을 모두 측정합니다. `same_snapshot=false`이면 페이지 증거가 달라졌으므로 직접적인 비교 전에 차이를 확인하세요.

현재 비용은 단가/할인을 임의로 추정하지 않아 null입니다. 실제 API의 usage는 원본 그대로 남기고 모든 요청에 유효한 total_tokens가 있을 때만 합산합니다. 최대 호출 수(HCX 기본 300, Qwen 기본 200), 출력 토큰 상한, 전체 제한시간(최대 30분)은 적용하지만 모델별 토크나이저가 없으므로 **정확한 전체 토큰 예산을 사전에 강제하지는 않습니다.** HTTP 자동 재시도는 없으며 JSON/판정 형식 보정은 한 번만 수행합니다.

## 기존 채점기와 연결

아래에서 `<실행 폴더>`를 실제 출력 경로로 바꿉니다. `local-benchmark` 폴더에서 실행합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run.ps1 score "..\agent-experiments\outputs\<실행 폴더>\pipeline\result.json" --split dev --report "..\agent-experiments\outputs\<실행 폴더>\pipeline\score.json"
```

정답 내용은 **채점기만** 읽습니다. 평가 실행기는 변경 감지용으로 파일 바이트의 SHA-256만 계산하며, 모델에는 전달하지 않습니다. 키 발급 전 mock 결과의 채점은 형식·위치 연결 검사용일 뿐 모델 성능 측정이 아닙니다. 세 구조 간 정확도 비교는 실제 API로 같은 모델 버전과 설정을 고정한 후 수행하세요. v0.2 연동 검증 당시 Specialists 실패 기록은 VALIDATION.md에 보존했습니다. v0.3에서는 계약을 분리했으며 실제 12개 개발 후보 사전 검사에서 Specialists가 완료됐습니다.

## 재현 가능한 검사

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run.ps1 test
```

외부 API 없이 임시 로컬 HTTP 서버로 인증 헤더·요청/응답 구조·JSON 파싱·401·시간 초과·리다이렉트 차단·잘못된 도구/요소 ID·출력 검증을 검사합니다. 브라우저로 쿼리 구분, 동적 댓글, 중첩 iframe, 4종 기법 증거와 수집 한도 초과 시 실패 처리를 검사합니다. 이 검사는 기존 사이트를 실행하지 않아도 동작합니다.

## 이번 단계에서 제외한 것

모델 파인튜닝, 외부 cross-origin iframe, 로그인·CAPTCHA·Shadow DOM, 임의 클릭 탐색, OCR/이미지 광고, 지속 운영 DB, 최종 Windows 실행 파일 패키징은 제외했습니다. 현재 HTML 보고서는 최소 결과 확인 화면이며 최종 제출용 UI가 아닙니다. 추가 탐지 유형을 구현하지 않았으므로 result_extra.json도 생성하지 않습니다.
