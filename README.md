# spam-ad-detector

공공 웹사이트 불법광고 탐지 도구. **React → Spring Boot → Node.js Pipeline → HCX-007**으로 URL 탐색, 광고 판정, 원문 근거 확인 및 결과 다운로드를 제공합니다.

`main`은 제출용 통합 기준선입니다. 현재는 로컬 웹 실행을 검증한 베이스라인이며, 최종 대회 제출물 완성을 의미하지 않습니다. 빌드·실행에 필요한 소스와 설정만 관리하며 테스트 사이트, 평가 정답, 실험 기록은 개발 브랜치에서 관리합니다.

## 첫 고도화 테스트셋

`Test_set` 브랜치에는 [test-set-v2](test-set-v2/README.md)를 추가했습니다. `test-set-v2/start.cmd`를 실행하고 **http://127.0.0.1:8780/advanced/** 에 접속하세요. 시작 화면과 하위 100페이지, 광고 120개·정상 180개를 포함한 개발·진단 세트입니다. [검증 기록](test-set-v2/VALIDATION.md)을 함께 확인하세요. 기존 `local-benchmark/`도 유지합니다.

## 실행

Windows x64, Node.js 22.12 이상 또는 24, Microsoft Edge가 필요합니다.

1. 이 저장소를 clone합니다.
2. `agent/.env.example`을 `agent/.env`로 복사하고 `CLOVASTUDIO_API_KEY`를 입력합니다. Mock 연결 확인만 할 때는 키가 필요 없습니다.
3. `start.cmd`를 실행합니다. 최초 실행 시 Java 21, Maven, npm 의존성을 프로젝트 내부에 다운로드하므로 인터넷이 필요합니다.
4. 자동으로 열리는 **http://127.0.0.1:8766**에서 검사할 URL을 입력합니다. 기본 모드는 **Mock**이며, 실제 판정은 **HCX-007** 모드를 선택합니다.
5. 실행 터미널에서 Ctrl+C로 종료합니다.

화면의 초기 로컬 URL은 테스트 사이트가 별도로 실행 중일 때만 사용할 수 있습니다. 테스트 사이트가 필요하면 `Test_set` 브랜치를 별도 폴더에 checkout하고 그 안의 `local-benchmark/start.cmd`를 실행하세요.

API 키는 서버의 `agent/.env` 또는 환경변수에서만 읽습니다. 키 파일·실행 데이터·다운로드된 도구·빌드 산출물은 Git에 포함하지 않습니다.

## 구성과 브랜치

| 브랜치 | 담당 범위 |
|---|---|
| [main](https://github.com/Hyunhoim/spam-ad-detector/tree/main) | 최소 실행 구성과 README. 검증된 변경만 통합 |
| [Frontend](https://github.com/Hyunhoim/spam-ad-detector/tree/Frontend) | `frontend/`: React 화면, 진행 상태, 결과 표시 |
| [Backend](https://github.com/Hyunhoim/spam-ad-detector/tree/Backend) | `backend/`: 작업 API, 프로세스 제어, 결과 저장 및 웹 통합 검증 |
| [Agent_core](https://github.com/Hyunhoim/spam-ad-detector/tree/Agent_core) | `agent/`: 채택한 Pipeline의 수집·정규화·HCX 판정과 회귀 검사 |
| [Test_set](https://github.com/Hyunhoim/spam-ad-detector/tree/Test_set) | `local-benchmark/`: 합성 사이트·채점기·평가 자료 및 연결용 사이트 |

개발 브랜치들도 독립적으로 웹 앱을 실행할 수 있도록 공통 실행 기반을 포함합니다. 담당 범위는 폴더로 구분합니다. `main`으로 반영할 때는 담당 실행 코드의 커밋만 선택하며, 실험·평가 자료까지 브랜치 전체를 무조건 병합하지 않습니다. 특히 평가 정답은 Agent 입력으로 전달하지 않습니다.

```text
start.cmd             전체 앱 실행
scripts/              실행 준비·빌드·브라우저 열기
frontend/             React + TypeScript + Vite
backend/              Java 21 + Spring Boot 3.5
agent/                Node.js Pipeline + HCX-007 어댑터
```

## 빌드와 동작 확인

```powershell
# 빌드만
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run.ps1 -Action build
# 브라우저 자동 열기 없이 실행
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run.ps1 -NoBrowser
# Agent 자모 처리 및 Pipeline 판정 계약 검사
npm.cmd test --prefix agent
```

웹 통합 검증은 `Backend` 브랜치의 `scripts/verify-web.cjs`에서 실행합니다. `--live` 옵션은 실제 HCX API 비용이 발생합니다.

2026-09-22 연결 검증: 웹에서 2페이지·5후보를 수집하고 HCX-007 API 1회, 2,513토큰, 약 8.1초로 완료했습니다. 검사 취소, 동시 실행 제한, 한도 초과 오류, JSON 다운로드 및 재시작 후 이력 보존도 확인했습니다. 이는 전체 정확도나 새로운 홀드아웃 일반화 성능의 증거가 아닙니다.

## 현재 실행 범위

- 로컬 `127.0.0.1` 전용, 동시 검사 1개. 진행 상태는 1초 간격으로 조회합니다.
- 같은 origin과 시작 URL의 첫 경로 구간을 탐색합니다. 모든 하위 페이지 발견을 보장하지 않으며 로그인·폼 제출·무한 스크롤은 지원하지 않습니다.
- 최대 200페이지, 10,000후보, 300 API 호출, 1,800초. 한도 초과는 실패이며 중단 지점에서 이어서 검사는 지원하지 않습니다.
- 결과와 이력은 `.runtime/jobs/`에 저장합니다. 판정 보류는 정상으로 합치지 않고, 원문 근거와 함께 검토하도록 표시합니다.
- 이 저장소는 소스 기반 실행 구성입니다. 단일 실행 파일 배포, 다중 사용자 인증 및 공개 서버 배포는 아직 포함하지 않습니다.
