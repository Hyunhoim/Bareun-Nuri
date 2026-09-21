# Front / Back / Agent 계약

## React ↔ Spring Boot

동일 origin의 `/api`를 사용합니다. 개발용 Vite만 5173 → 8766 프록시를 사용합니다. POST에는 `Content-Type: application/json`, `X-Local-Client: public-ad-ui`가 필요합니다.

| 요청 | 결과 |
|---|---|
| `GET /api/health` | 앱 식별자와 상태. LLM 연결 확인은 아님 |
| `GET /api/jobs` | 최근 순 작업 요약 목록 |
| `POST /api/jobs` | 202 + 신규 작업. 다른 작업 실행 중이면 409 |
| `GET /api/jobs/{id}` | 작업 진행 상태. 완료 시 result, diagnostics 포함 |
| `POST /api/jobs/{id}/cancel` | 중단 요청. 이미 종료된 작업이면 현재 상태 반환 |
| `GET /api/jobs/{id}/result` | 완료된 `result.json` 다운로드. 미완료는 409 |

작업 요청 예시:

```json
{"url":"http://127.0.0.1:8767/demo/","provider":"mock","maxPages":40,"maxNodes":1000,"maxCalls":220,"timeoutSeconds":1800}
```

provider는 `mock` 또는 `hcx`. URL은 인증정보 없는 HTTP(S)만 허용합니다. 범위: maxPages 1–200, maxNodes 1–10000, maxCalls 1–300, timeoutSeconds 1–1800. 잘못된 입력 400, 없는 작업 404, 저장 실패 500. 오류 본문은 `{"error":"..."}`입니다.

상태는 `queued → running → completed | completed_with_warnings | failed | cancelled`. 백엔드 재시작 시 미완료 작업은 `interrupted`가 됩니다. phase는 `queued | collecting | judging | finished`. 카운터는 `pages`, `candidates`, `processed`, `calls`; 종료 정보는 `elapsedSec`, `totalTokens`입니다. 미수집 토큰 수는 null이며 0으로 추정하지 않습니다.

완료 응답의 result는 기존 대회용 `meta`와 `findings` 형식을 유지합니다. 각 finding의 `evidence_text`는 수집 원문이고 `url`, `location`, `technique`로 위치와 기법을 표시합니다. diagnostics는 보류/계약 검토 대상이며 정상 판정으로 합치지 않습니다. Mock 결과는 도구 버전에 MOCK 표시가 있습니다.

## Spring Boot ↔ Node

백엔드가 `node agent/src/worker.cjs`를 자식 프로세스로 실행합니다. 별도 Agent HTTP 서버는 없습니다.

- stdin: 줄 단위 UTF-8 JSON. 첫 줄은 위 작업 요청 + 서버가 지정하는 절대경로 `jobDir`, `envFile`.
- stdin 추가 줄: `{"action":"cancel"}`.
- stdout: JSON 한 줄당 이벤트 하나. `type`은 `progress`, `done`, `fatal`.
- progress/done은 작업 카운터·상태를 담습니다. 백엔드는 수신 즉시 이력을 저장합니다.
- worker는 API 키를 서버 환경/파일에서 읽습니다. API 요청이나 이벤트에 키를 싣지 않습니다.
- stderr는 작업별 로그. 백엔드는 완료 이벤트와 프로세스 종료를 확인하며, 비정상 종료를 완료로 간주하지 않습니다.
- Agent 자체 시간 제한 외에 백엔드 watchdog이 15초 여유 후 프로세스 트리를 종료합니다. 중단 요청에 응답하지 않으면 10초 후 종료합니다.

작업별 `.runtime/jobs/<uuid>/job.json`은 백엔드 소유입니다. `artifacts/` 내부 evidence.json, partial-decisions.json, result.json, diagnostics.json, run.json, trace.jsonl은 Agent 소유입니다. 이 파일은 실행 데이터이며 Git에 올리지 않습니다.
