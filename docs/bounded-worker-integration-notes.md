# Bounded scanner 운영 연결 시 확인할 사항

2026-09-25 읽기 전용 분석. 아직 운영 채택이나 연결을 시행하지 않았다. 아래 내용은 실제 호출부에 근거하며 production·실험 소스 변경은 없다.

## 필수 연결 변경

| 위치 | 현재 의존성 | 연결 시 필요한 변경 |
|---|---|---|
| `agent/src/worker.cjs:7,46` | 기존 `scan.run` | 채택된 scanner와 고정 정책·창 크기 연결 |
| `agent/src/worker.cjs:69` | `s.candidates.length`, `s.decisions.length` | 페이지 메타 `candidates` 합계와 `offset` 합계 사용. 기존 processed는 장문 분할 work 수이므로 단위를 암묵적으로 변경하지 않는다. |
| `agent/src/worker.cjs:74` | `pages[].readiness.settled` | bounded 메타에 없는 readiness를 작게 보존하거나 동일 정보를 집계. 현재 그대로 연결하면 미안정 페이지가 항상 0으로 표시된다. |
| `agent/src/worker.cjs:45` | 명시된 파일 목록의 source identity | 새 scanner/store와 실제 재사용하는 기존 scan helper까지 해시에 포함 |
| `backend/src/main/java/kr/publicad/Jobs.java:80` | pending 또는 work/decisions 배열 크기로 재개 판단 | bounded의 `pages[].offset < work` 검사 포함. pending이 0이고 미판정만 남은 작업도 재개 가능해야 한다. |
| `Jobs.java:79` | prepared/rejected 외 inflight 차단 | sent/responded 미확인 자동 재개 금지를 그대로 유지 |

worker의 구간별 attempts/calls/elapsed 누적, 최초 시작 시각, 결과 구간 보관은 같은 필드로 유지할 수 있다. 수집기 재사용·네트워크 경계·모델 프롬프트를 함께 변경할 이유는 없다.

## 기존 작업 파일 보호

scanner가 source identity 불일치를 거부해도 wrapper 파일이 그대로 보존되는 것은 아니다. 현재 `worker.cjs:33–38`은 scanner 호출 전에 `segments.json`을 쓰며, `:93–101`은 segment가 만들어졌다면 실패 때도 기존 result meta 및 구간 보관을 수행한다. `:104`의 `worker-run.json` 저장도 finally에 있다. 기존 검증은 주로 scanner 체크포인트 불변을 확인했다.

운영 전환 시에는 **동일한 공통 signature 계산·검증을 segment 생성 이전에 수행**하고, 이 사전검증 실패 경로에서 finally의 기존 `result.json`, `worker-run.json`, segment 쓰기까지 막아야 한다. 체크포인트·기존 결과·기존 구간의 원본 파일 불변을 함께 검증한다. 자동 migration, 오래된 판정기 fallback, signature 초기화로 강제 재개하지 않는다. backend의 canResume는 현재 source identity를 확인하지 않으므로 최종 보호는 worker가 반드시 수행해야 한다.

## 출력·다운로드 계약

`Jobs.java:67–72`는 result/diagnostics/coverage를 그대로 전달한다. `frontend/src/App.tsx:48,51,59–60`은 coverage의 배열과 findings/diagnostics 배열을 사용한다. `Api.java:33–40`은 저장된 result를 그대로 내려준다. 최신 bounded 출력은 이 형식을 보강했고 tiny schema 및 양성/검토/장문 결과 비교를 통과했다.

실제 `core/output.cjs`의 meta 필드는 `topic`, `entry_url`, `started_at`, `finished_at`, `elapsed_sec`, `tool_version`이다. 독립 model/provider 필드를 요구하는 기존 계약은 없으며 provider는 tool_version에 포함된다. 이 형식을 유지하면 frontend/API 구조 변경은 필요하지 않다.

## 회귀 검사 영향

- `test:submission` → `experiments/priority-zero.test.cjs:11–18`: 기존 core 직접 호출과 16개 배치를 가정한다. 이 테스트만 통과해도 새로운 운영 경로를 검증한 것은 아니다. 4개 배치와 메타 기반 상태·시간 경계·재개를 별도로 확인한다.
- `test:collector` → `experiments/collector-reuse.test.cjs:75–76`: 실제 worker 체크포인트의 candidates/decisions 배열을 비교한다. 이 부분은 감사용 복원/per-page 파일 비교로 바꾸되 브라우저 1회 시작, context 격리, 브라우저 종료 시 대기 보존 검사는 유지한다.
- `test:judgment` → `experiments/semantic-adoption.test.cjs:35–48,63`: 상태 배열, 전체 관찰 배열, combine(state), Mock 관찰 파일 부재를 가정한다. 판정 계약·토큰 추정·4개 prefix 검사는 유지하고 저장 구조 관련 검증만 맞춘다.
- `scripts/verify-web.cjs:55`: 두 페이지 Mock을 1회 호출로 고정한다. 페이지를 섞지 않는 새 runner에서는 최소 2회다. `:108`의 실제 HCX 최대 2회 조건도 실제 후보·배치 수를 확인해야 한다.
- 웹 재개 검사는 현재 대기 URL이 있는 경우를 다룬다. pending=0/미판정만 남은 경우, 미확인 전송 차단, source identity 불일치 후 기존 산출물 불변, 최초 구간 다운로드 불변을 추가 검증한다.

실제 API0 재개 테스트의 다음 실행 범위는 별도로 결정한다. 이 문서는 추가 실행이나 운영 변경의 완료를 뜻하지 않는다.
