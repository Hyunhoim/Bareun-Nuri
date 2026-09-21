# Agent_core 브랜치

현재 운영 연결 코드는 `agent/`, 구조 비교 실험은 `agent-experiments/`입니다. 실험 코드 변경만으로 웹 앱의 Agent 동작은 달라지지 않습니다. 웹 worker의 표준입출력 계약은 `docs/contracts.md`에 있습니다.

루트 `start.cmd`로 웹에서 실행하거나 `npm.cmd test --prefix agent`로 자모 처리 자체 검사를 실행합니다. worker는 백엔드가 stdin으로 실행 요청을 전달하므로 입력 없이 단독 실행하면 요청을 기다립니다.

구조 실험은 `agent-experiments/README.md`를 참고하세요. 테스트 사이트와 채점기는 `Test_set` 브랜치를 별도 worktree에 두고 실행합니다. 기존 실험 명령 중 형제 `local-benchmark/` 경로를 사용하는 통합 벤치마크는 테스트 자료를 가진 작업 폴더에서만 실행하세요. 실험 결과나 정답을 Agent 입력에 포함하지 않습니다.

`AGENTS.md`의 일반화 개선·평가 분리 원칙을 준수하세요. main에는 검증된 `agent/` 코드 변경만 반영하고 실험 코드·출력은 포함하지 않습니다.
