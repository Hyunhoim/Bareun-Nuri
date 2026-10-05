# 바른누리 (Bareun-Nuri)

공공 웹사이트의 불법광고와 위장 기법을 검사하는 로컬 웹 도구입니다. 이 `main` 브랜치는 현재 운영 소스와 필수 모델 자산을 통합합니다. EXE·Java·Python 등 완성된 실행 패키지와 실험 데이터는 이 브랜치에 포함하지 않습니다.

## 현재 구조

React 화면 → Spring Boot 백엔드 → Node.js Agent → OpenAI GPT-6 Luna

- 탐색·수집: FIFO, Playwright + Chromium/Edge, 브라우저 프로세스 재사용, 최대 수집 동시성 5.
- 광고 의도: GPT-6 Luna, 추론 none, 연속 문맥 V, 최대 12후보/요청, 출력 512, 동시 5요청, 로컬 130,000 TPM 예약 예산, Strict Structured Outputs.
- 기법: DOM·스타일·좌표 코드 판정과 CPU KcELECTRA-AntiSpoof v1.0. JAMO / HOMOGLYPH / TRANSPARENT / OFFSCREEN을 구분합니다.
- 실행: localhost 전용, 동시에 검사 1개, 25분 구간, 저장 후 일시 중지·이어서 검사·이력 삭제·JSON 저장·API 키 관리.
- 시간·페이지·호출 한도에 도달하면 부분 결과와 대기 작업을 저장합니다. 모든 하위 페이지 발견을 보장하지 않으며 검사 범위와 미판정은 별도 기록합니다.
- 응답이 불명확한 요청을 자동 재전송하지 않습니다. 확정 불완전 응답은 격리 후 일반 검사 종료 시 제한적으로 복구합니다.

## 소스에서 실행 (Windows x64)

준비: Git + Git LFS, Node.js 24, Python 3.12, Microsoft Edge. Java 21·Maven은 실행 스크립트가 프로젝트 폴더 안에 준비합니다. GPU는 필요 없습니다.

```powershell
git clone https://github.com/Hyunhoim/Bareun-Nuri.git
cd Bareun-Nuri
git lfs install
git lfs pull
py -3.12 -m venv .runtime/klue-venv
.runtime/klue-venv/Scripts/python.exe -m pip install torch==2.6.0+cpu --no-deps --index-url https://download.pytorch.org/whl/cpu
.runtime/klue-venv/Scripts/python.exe -m pip install --no-deps -r scripts/requirements-windows.txt
Copy-Item agent/.env.example agent/.env
.\start.cmd
```

화면이 열리면 **API 키 관리**에서 GPT-6 Luna 호출 권한이 있는 OpenAI API 키를 등록합니다. 웹 주소는 http://127.0.0.1:8766 입니다. 최초 준비와 API 호출에는 인터넷이 필요하며 호출 비용은 키 소유 계정에 발생합니다. 키 등록은 제공사 인증 테스트가 아닙니다.

AntiSpoof 모델은 약 511MB이며 Git LFS로 관리합니다. 모델이 Git LFS 포인터인 채로 남아 있으면 실행할 수 없습니다. 기법 모델 자산은 manifest의 SHA-256과 일치해야 합니다.

## 빌드·검증·EXE 패키징

```powershell
# 최초 실행 준비를 포함한 웹/백엔드 빌드
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run.ps1 -Action build
# 실제 API를 호출하지 않는 소스·응답 계약·수집 검사
npm.cmd test --prefix agent
# 포함 런타임을 갖춘 Windows 배포 폴더 생성
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/package-windows.ps1 -SkipBuild
```

EXE 패키징에는 위 Python CPU 환경이 필요합니다. 출력은 **Bareun-Nuri 제출/01_실행/** 입니다. 생성된 EXE와 같은 폴더의 app/runtime/config를 통째로 전달해야 합니다. 신규 패키지의 API 키는 비어 있습니다. 기존 config/.env가 있으면 보존하므로 다른 사람에게 전달하기 전에 앱에서 키를 삭제하세요.

## 폴더

| 경로 | 역할 |
|---|---|
| frontend/ | React 화면과 정적 자산 |
| backend/ | 작업 실행·진행·이력·결과·키 관리 API |
| agent/src/ | 현재 운영 탐색·수집·광고/기법 판정 |
| agent/antispoof/, agent/models/ | CPU 기법 판정 서비스와 동결 모델 |
| scripts/ | 빌드·실행·EXE 패키징·최소 검증 |
| licenses/ | 글꼴·로고·모델 출처와 이용 고지 |

테스트 사이트·평가셋·과거 실험은 [Test_set](https://github.com/Hyunhoim/Bareun-Nuri/tree/Test_set) 브랜치에서 관리합니다. API 키·실행 로그·검사 이력·실험 결과는 소스에 포함하지 않습니다. 수집된 원문과 문맥은 광고 의도 판단을 위해 OpenAI API로 전송됩니다.
