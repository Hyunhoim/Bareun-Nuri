# Frontend 브랜치

담당 코드는 `frontend/`입니다. React + TypeScript + Vite로 URL 입력, 진행 상태, 이력, 탐지 근거와 다운로드를 구현합니다. API 계약은 `docs/contracts.md`를 따릅니다. API 키와 판정 로직은 프런트에 넣지 않습니다.

프로젝트 루트에서 `start.cmd`로 백엔드를 실행한 뒤 `npm.cmd run dev --prefix frontend`를 실행하면 http://127.0.0.1:5173 에서 개발할 수 있습니다. `/api`는 8766으로 프록시됩니다. `npm.cmd run build --prefix frontend`로 타입 검사와 배포 빌드를 확인합니다.

다른 구성요소는 연결 확인용 공통 기준선입니다. 화면 변경은 이 폴더에 집중하고, main에는 검증된 실행 코드 커밋만 반영하세요.
