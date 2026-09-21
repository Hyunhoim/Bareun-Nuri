# Backend 브랜치

담당 코드는 `backend/`입니다. Java 21 + Spring Boot로 REST 작업 API, Node worker 실행·취소, 파일 기반 이력/결과 보존을 처리합니다. API 및 worker 계약은 `docs/contracts.md`를 따릅니다.

루트 `start.cmd`가 프런트 빌드와 JAR 패키징까지 처리합니다. `scripts/run.ps1 -Action build`는 빌드만 수행합니다. 별도 DB 없이 `.runtime/jobs/`를 사용하며 한 번에 작업 1개만 실행합니다.

빌드 후 루트에서 `node scripts/verify-web.cjs`를 실행하면 별도 18766 포트의 서버와 임시 테스트 사이트로 브라우저 통합 검증을 수행합니다. `--live`를 붙이면 실제 HCX 호출을 추가하므로 API 비용이 발생합니다. 키·로그·검증 산출물은 커밋하지 마세요.

main에는 검증된 실행 코드 커밋을 반영하고 통합 검증 스크립트·개발 문서는 이 브랜치에 유지합니다.
