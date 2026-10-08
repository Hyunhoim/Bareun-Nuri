<div align="center">
  <img src="frontend/public/brand-logo.png" alt="바른누리 로고" width="112" />
  <h1>바른누리 · Bareun-Nuri</h1>
  <p>LLM 기반 공공 웹사이트 불법광고 탐지 Agent</p>
  <p><a href="docs/사용설명서.md">사용설명서</a> · <a href="#소스에서-실행">소스 실행</a> · <a href="docs/최종_감사.md">최종 감사</a></p>
</div>

공공 웹사이트의 연결 페이지를 탐색하고 본문·제목·댓글·iframe에서 불법광고와 4종 위장·은닉 기법을 검사합니다. 발견한 광고의 원문·URL·요소 위치·기법을 화면과 JSON으로 제공합니다.

이 `main`은 **2026년 10월 8일 최종 감사한 운영 소스의 개인 보관본**입니다. 모델은 Git LFS로 보관합니다. EXE·포함 런타임·API 키·검사 이력·신청 서류는 저장소에 포함하지 않습니다.

## 구성

|단계|구현|
|---|---|
|페이지 탐색·웹 요소 수집|FIFO, Playwright·Chromium, 브라우저 재사용|
|광고 의도 판단|OpenAI GPT-6 Luna API, 대상 문구와 연결된 연속 문맥|
|닮은꼴 문자·자모 분해|문자 분석, Unicode 대응 자료, KcELECTRA를 파인튜닝한 AntiSpoof v1.0|
|투명 텍스트·화면 밖 은닉|DOM·계산된 스타일·좌표 분석|
|화면·실행 제어|React, Java 21·Spring Boot, Node.js, Windows EXE 실행기|

**광고 의도와 기법을 나누어 판단합니다.** Luna가 광고 의도를 판단한 요소에 코드·CPU AntiSpoof의 기법 관찰을 통합합니다. 기법이 불확실한 항목은 검토 기록에 남깁니다.

연속 문맥은 대상 문구에 연결된 앞뒤 설명을 순서대로 전달하는 입력입니다. 문맥 경계와 연결 관계도 함께 제공하며, 다른 작성자의 설명을 대상의 의도로 가져오지 않도록 구분합니다. 이 구조에서도 신고·인용·혼합 의도의 오판 가능성은 남아 있습니다.

## 주요 기능

- URL 검사 현황, 탐지 건수·그래프, 원문과 위치 확인
- JSON 저장, 검사 이력 조회·기간 필터·삭제
- API 키 마스킹 등록·삭제, 인증·네트워크 등 오류 안내
- 25분 구간 검사, 저장 후 일시 중지, 이어서 검사·종료
- 대기 페이지·제외 링크·수집 실패·미판정 범위 기록

## 소스에서 실행

**Windows 11 x64 · Git LFS · Node.js 24 · Python 3.12**가 필요합니다. 기법 모델은 CPU에서 실행하며 GPU는 필요하지 않습니다. Java 21·Maven은 실행 스크립트가 프로젝트 내부에 준비합니다.

```powershell
# 저장소와 동결 모델
git lfs install
git clone https://github.com/Hyunhoim/Bareun-Nuri.git
cd Bareun-Nuri
git lfs pull

# CPU 추론 환경
py -3.12 -m venv .runtime/klue-venv
.runtime/klue-venv/Scripts/python.exe -m pip install torch==2.6.0+cpu --no-deps --index-url https://download.pytorch.org/whl/cpu
.runtime/klue-venv/Scripts/python.exe -m pip install --no-deps -r scripts/requirements-windows.txt

# 브라우저와 외부 설정
npm.cmd ci --prefix agent --no-fund --no-audit
node agent/node_modules/playwright/cli.js install chromium --only-shell
Copy-Item agent/.env.example agent/.env
.\start.cmd
```

브라우저에서 **http://127.0.0.1:8766**이 열리면 **API 키 관리**에서 OpenAI 키를 등록하고 검사 URL을 입력합니다. 최초 설치와 사이트·API 접속에는 인터넷이 필요합니다. 터미널 `Ctrl+C`로 종료합니다.

|API 설정|값|
|---|---|
|서비스|OpenAI Responses API|
|모델|`gpt-6-luna`|
|환경변수|`OPENAI_API_KEY`|
|소스 실행의 키 파일|`agent/.env`|

키는 해당 모델의 접근 권한과 API 잔액이 필요하며 호출 비용은 키 계정에 부과됩니다. 키 등록 성공은 파일 저장을 뜻합니다. 실제 제공사 인증은 검사 요청에서 확인합니다. ChatGPT·Codex 구독과 API 결제는 별개입니다.

수집한 대상 문구와 연결된 문맥은 광고 의도 판단을 위해 OpenAI API로 전송됩니다. 기관의 외부 전송 정책을 확인한 뒤 사용하세요.

## 빌드·검증·EXE 패키징

```powershell
# 프론트와 백엔드 빌드
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run.ps1 -Action build

# 모델 해시·JSON·API 응답 계약·실제 브라우저 수집 검사, 모델 API 호출 없음
npm.cmd test --prefix agent

# 위 빌드 후 Windows 배포 폴더 생성
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/package-windows.ps1 -SkipBuild
```

배포본은 `Bareun-Nuri 제출/01_실행`에 생성됩니다. **실행기와 `app`·`runtime`·`config`를 포함한 폴더 전체**를 옮겨야 합니다. 패키징 시 사용설명서와 실행 소스도 포함합니다. 신청 서류는 자동으로 생성·복사하지 않습니다.

```powershell
# 포함 런타임·CPU 추론·화면 연결 검사, 모델 API 호출 없음
node scripts/verify-submission.cjs --smoke
```

신규 배포본은 키가 비어 있습니다. 재패키징 시 기존 `.env`는 보존하므로 다른 사람에게 전달하기 전 키를 삭제하세요. `--smoke` 검사는 키가 비어 있는 배포본을 대상으로 합니다.

## 결과와 실행 범위

소스 실행의 원본 결과는 `.runtime/jobs/<작업 ID>/artifacts/result.json`입니다. 화면의 **결과 JSON 저장**으로 같은 결과를 내려받을 수 있습니다. EXE의 경로·재개·오류 안내는 [사용설명서](docs/사용설명서.md)를 확인하세요.

JSON은 `meta`·`findings`, UTF-8(BOM 없음)이며 `(url, location, technique)`마다 한 객체를 생성합니다. 같은 요소에 여러 기법이 있으면 기법별로 기록합니다. 기법 코드는 `HOMOGLYPH`·`JAMO`·`TRANSPARENT`·`OFFSCREEN`입니다.

|고정 운영 설정|값|
|---|---|
|수집|FIFO, 브라우저 재사용, 최대 동시 5개|
|의도 API|reasoning `none`, 최대 12후보/요청, 출력 512, 동시 5요청|
|로컬 요청 예약|130k TPM, 제공사 한도가 낮으면 하향|
|응답|Strict Structured Outputs와 로컬 필수 ID 검증|
|검사|한 작업, 25분 구간, 구간당 최대 200페이지·600호출|
|재개|완료 판정 재사용, 불명확한 전송 자동 재호출 금지|

누적 후보 수로 일괄 중단하지 않지만 페이지당 수집 한도·메모리 보호·접근 제한은 있습니다. 같은 출처의 연결 페이지를 탐색하고 삽입 iframe은 별도로 검사합니다. 로그인·폼 제출·모든 무한 스크롤을 지원하거나 사이트 전체 발견을 보장하지 않습니다. 부분 결과를 사이트 전체의 정상 판정으로 해석하지 않습니다.

## 문서와 폴더

|경로|내용|
|---|---|
|[`docs/사용설명서.md`](docs/사용설명서.md)|EXE 실행, 키 등록, 중단·재개, JSON·이력·오류 안내|
|[`docs/최종_감사.md`](docs/최종_감사.md)|제출 폴더의 요강 대조·정리·빌드 및 실행 확인 범위|
|`docs/제출_소스코드_README.md`|배포본의 `02_소스코드/README.md` 생성용 안내|
|`frontend/`|사용자 화면과 글꼴·로고|
|`backend/`|작업·키·이력 API, Agent 실행 제어|
|`agent/src/`|탐색·수집·광고 의도·기법·저장/재개|
|`agent/antispoof/`, `agent/models/`|CPU 추론 서비스와 동결 모델·manifest|
|`scripts/`|소스 실행·빌드·EXE 패키징·검증|
|`licenses/`, `frontend/licenses/`|모델·Unicode·글꼴·화면 구성요소 출처 및 이용 조건|

AntiSpoof 가중치 약 511MB는 Git LFS로 관리합니다. `git lfs pull` 후 실제 가중치가 있어야 하며 manifest의 SHA-256과 일치해야 합니다. 실험 자료는 [Test_set](https://github.com/Hyunhoim/Bareun-Nuri/tree/Test_set)에서 보관합니다. 이 저장소의 공개 상태가 외부 모델·로고·글꼴의 이용 조건을 변경하지는 않습니다.
