# Agent_core 브랜치

현재 채택한 Pipeline 코드는 `agent/`에 있습니다. 페이지 수집 → 정규화 → 후보 16개 단위 HCX-007 판정 → 원문 근거가 있는 JSON 결과 순서입니다. 웹 worker의 표준입출력 계약은 `docs/contracts.md`에 있습니다.

루트 `start.cmd`로 웹에서 실행하거나 `npm.cmd test --prefix agent`로 자모 처리와 Pipeline 판정 계약 검사를 실행합니다. 검사는 실제 API를 호출하지 않습니다. worker는 백엔드가 stdin으로 실행 요청을 전달하므로 입력 없이 단독 실행하면 요청을 기다립니다.

테스트 사이트와 채점기는 `Test_set` 브랜치를 별도 worktree에 두고 실행합니다. 웹에서 테스트 URL을 검사한 후 내려받은 result.json을 채점기에 전달하세요. 정답 파일은 Agent 입력에 포함하지 않습니다. API 키는 `agent/.env`에 저장합니다.

`AGENTS.md`의 일반화 개선·평가 분리 원칙을 준수하세요. main에는 검증된 실행 코드와 필수 검사를 반영하고 실험 출력은 포함하지 않습니다.
