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
| `POST /api/jobs/{id}/resume` | 같은 작업의 다음 구간 실행. 미확인 전송·다른 실행 중·닫힌 작업은 409 |
| `POST /api/jobs/{id}/finish` | 부분 결과를 보존하고 사용자가 여기서 종료. 이후 재개 불가 |
| `GET /api/jobs/{id}/result` | 확정 판정이 저장된 `result.json` 다운로드. 파일이 없으면 409 |
| `GET /api/jobs/{id}/segments/{n}/result` | 해당 구간 종료 때 보존한 결과. 첫 구간 결과를 재개 결과로 덮지 않음 |

작업 요청 예시:

```json
{"url":"http://127.0.0.1:8767/demo/","provider":"mock","maxPages":200,"maxNodes":0,"maxCalls":300,"timeoutSeconds":1500}
```

provider는 `mock` 또는 `hcx`. URL은 인증정보 없는 HTTP(S)만 허용합니다. 범위: maxPages 1–200, maxNodes 0–10000(0은 누적 제한 해제), maxCalls 1–300, timeoutSeconds 1–1500. 웹은 maxNodes=0을 사용합니다. 페이지·호출 상한은 구간별이며 재개 시 완료 판정과 누적 카운터를 보존합니다. 잘못된 입력 400, 없는 작업 404, 저장 실패 500. 오류 본문은 `{"error":"..."}`입니다.

상태는 `queued → running → completed | completed_with_warnings | partial | failed | cancelled`. 백엔드 재시작 시 미완료 작업은 `interrupted`가 됩니다. phase는 `queued | collecting | scanning | judging | finished`. 카운터는 `pages`, `candidates`, `processed`, `calls`; 종료 정보는 `elapsedSec`(최초 시작부터의 경과), `segmentElapsedSec`, `activeElapsedSec`, `segmentNumber`, `totalTokens`, `exceeded30Minutes`입니다. `canResume`은 현재 안전한 재개 가능 여부이며 `closed`는 사용자 종료 선택입니다. 구간별 대기/실행 이력은 segments.json에 보존합니다. 미수집 토큰 수는 null이며 0으로 추정하지 않습니다. `unstablePages`는 제한된 관찰 시간 안에 DOM·네트워크 안정화를 확인하지 못한 페이지 수입니다.

완료 응답의 result는 기존 대회용 `meta`와 `findings` 형식을 유지합니다. 각 finding의 `evidence_text`는 수집 원문이고 `url`, `location`, `technique`로 위치와 기법을 표시합니다. diagnostics는 보류/계약 검토 대상이며 정상 판정으로 합치지 않습니다. Mock 결과는 도구 버전에 MOCK 표시가 있습니다.

## Spring Boot ↔ Node

백엔드가 `node agent/src/worker.cjs`를 자식 프로세스로 실행합니다. 별도 Agent HTTP 서버는 없습니다.

- stdin: 줄 단위 UTF-8 JSON. 첫 줄은 위 작업 요청 + 서버가 지정하는 절대경로 `jobDir`, `envFile`, 최초 시작 `firstStartedAt`, 이번 구간 시작 `segmentStartedAt`.
- stdin 추가 줄: `{"action":"cancel"}`.
- stdout: JSON 한 줄당 이벤트 하나. `type`은 `progress`, `done`, `fatal`.
- progress/done은 작업 카운터·상태를 담습니다. 백엔드는 수신 즉시 이력을 저장합니다.
- worker는 API 키를 서버 환경/파일에서 읽습니다. API 요청이나 이벤트에 키를 싣지 않습니다.
- stderr는 작업별 로그. 백엔드는 완료 이벤트와 프로세스 종료를 확인하며, 비정상 종료를 완료로 간주하지 않습니다.
- 검사 마감에는 새 요청을 중단합니다. core는 진행 중 작업에 최대210초 정리 여유를 두며 worker 정리 취소/브라우저 close 제한도 적용합니다. 백엔드 watchdog은 구간 시작+검사 제한+300초에 프로세스 트리를 종료합니다. 기본은25분 검사/30분 최종 상한입니다. 사용자 중단 요청에 응답하지 않으면10초 후 종료합니다.

작업별 `.runtime/jobs/<uuid>/job.json`은 백엔드 소유입니다. `artifacts/` 내부 checkpoint.json, coverage.json, result.json, diagnostics.json, run.json, trace.jsonl, segments.json 및 segments/ 구간별 결과는 Agent 소유입니다. 이 파일은 실행 데이터이며 Git에 올리지 않습니다. 미확인 전송은 자동 재호출하지 않고, 전송 전 대기/명시적429 거절과 구분합니다.

## 2단계 수집 근거와 실험 계약

3단계의 추가 관찰 계약은 아래 별도 절을 참고하세요. 2단계의 미해결 의미 판정과 구분하며 웹 worker 계약은 유지합니다.

후보의 `context_evidence`는 DOM 범위(`scope`), 대상 태그와 인용 태그 여부, 앞뒤/대상/대상을 포함한 문장으로 구분한 `units`, 잘림 여부(`truncated`)를 담습니다. 앞뒤 최대 3개 요소, 주변 요소별 최대 600자를 보존합니다. 원문·선택자·frame 위치는 기존과 동일합니다. 이 범위는 문맥 후보이며 동일 작성자나 의미적 귀속을 보장하지 않습니다.

웹 worker의 판정 계약은 기존 `ad_verdict / observed_techniques / needs_review / reason`입니다. 수집 범위만 추가했고 실험 판정기를 기본값으로 활성화하지 않았습니다.

실험 계약은 `context_source / context_summary / author_purpose / needs_review / reason`을 받습니다. `context` 실험만 `observed_techniques`도 받습니다. 근거 위치는 후보별 enum으로 제한하며 실제 근거 문자열은 해당 입력에서 코드가 복사합니다. 존재하는 근거를 선택했다는 사실이 그 내용과 판정의 의미적 일치까지 보장하지는 않습니다. `uncertain`, 검토 요청, 빈 이유는 검토 대상으로 유지합니다. `intent`는 광고 의도 진단 전용이며 대회용 findings를 출력하지 않습니다.

후속 `isolated` 실험은 대상만 읽는 `author_purpose / context_source=target / reason`, 연결된 `reason / service_relation`(불법대상/정상대상/제안없음/근거부족), 주변 설명의 `relation`(긍정/부정/언급없음/판단불가)을 별도 요청으로 받습니다. 첫 단계의 `is_violation`은 대상 자체의 잠정 판단이며 최종 불법광고 판정으로 사용하면 안 됩니다. 서비스 확인과 인용 귀속을 마친 `decisions.json`만 의미 판정 결과입니다.

각 역할의 정의된 필드 이외의 값·외부 ID·누락·중복은 거부합니다. 첫 단계 이유는 모델의 짧은 설명이며 빈 이유는 허용하지 않습니다. 서비스 확인에도 짧은 이유를 받으며 정상·불법 모두 구체적인 서비스 근거가 필요합니다. 제안 자체가 없는 정보와 서비스가 불명확한 제안을 구분합니다. 최초 판단을 뒤집으면 최초 이유는 target_judgment로 보존하고 최종 이유를 교체합니다. 인용 주장 결과는 범주값과 실제 입력 근거를 코드가 결합합니다. 불확실·귀속 모호성은 `needs_review`로 남깁니다. 정순·역순 설명 판정이 충돌하면 해당 설명을 단독 재확인합니다. 중간 응답·재확인·실패·사용량을 저장하고, 단계 전체에 호출·시간 상한을 적용합니다. `isolated`도 기법을 결합하지 않으므로 대회용 result.json을 생성하지 않습니다. 웹 worker의 계약은 바뀌지 않습니다.

## 3단계 관찰 계약 (실험 전용)

`collect(url, {observeTechniques:true})`는 기존 `candidates`를 유지하고 스냅샷 최상위에 `technique_observations`를 추가합니다. 기본값은 비활성입니다. 모델 프롬프트·입력에 이 필드를 추가하지 않습니다.

각 관찰에는 원래의 `node_id / url / location / raw_text`, 확정된 `observations`, 미확정 `unresolved`, 수집 근거 `evidence`가 있습니다. 근거는 텍스트 노드의 UTF-16 원문 범위 `[start,end)`, 실제 소유 요소, 스타일 조상 경로와 프레임 밖 조상의 문서 URL을 보존합니다. 프레임 내부 후보의 `location`에는 기존 `>>>` 경로가 그대로 유지됩니다.

확정은 **표현·렌더링 기법이 관찰됐다는 의미**이며 불법광고 의도나 고의적인 필터 회피를 확정하지 않습니다. 정상 교육·접근성 문구에도 확정 관찰이 있을 수 있습니다. 숫자 혼합·단독 외국 문자·불완전 자모, 복잡한 페인트나 클리핑 등은 별도 미확정 기록으로 남습니다. 오래된 스냅샷은 텍스트별 스타일 근거가 없어 스타일 기법을 추정하지 않습니다.

`agent/experiments/observe.cjs EVIDENCE_JSON DECISIONS_JSON NEW_OUTPUT_DIR`는 저장된 의미 판정과 관찰을 결합하는 API 없는 비교 도구입니다. 광고 여부·검토 상태·이유 등 의미 필드는 유지하며 `techniques / observed_techniques`만 관찰 결과로 만듭니다. 정상의 기법 관찰은 저장하지만 findings에 넣지 않습니다. 일부 텍스트에만 적용된 스타일은 의미 귀속이 미검증이므로 자동 findings로 만들지 않습니다. 텍스트 문자 변형은 수집된 의미 단위의 기법으로 연결하므로, 서로 다른 발화를 한 후보로 합친 수집 오류까지 해결하는 계약은 아닙니다.

관찰이 미확정이면 `technique-diagnostics.json`에 `technique_needs_review:true`를 남깁니다. 이는 기존 의미 판정의 `needs_review`와 별개입니다. 확정된 다른 기법은 유지할 수 있지만, 없는 기법을 추정해서 채우지 않습니다. 광고 의도가 있어도 기법이 없거나 의미 판정이 보류된 경우 기존 `diagnostics.json`에도 보존됩니다. 이 실험 결과를 제출 완료나 실제 사이트 일반화 검증으로 해석하지 않습니다.
