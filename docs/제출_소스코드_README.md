# 바른누리 실행 소스

이 폴더는 제출 프로그램의 소스입니다. **일반 검사는 상위 `01_실행/바른누리_실행기.exe`를 실행**하면 됩니다. 아래 절차는 소스 확인과 재빌드용입니다.

## 구성

|폴더|역할|
|---|---|
|`frontend`|React·TypeScript 화면, 검사 현황·결과·이력·키 관리|
|`backend`|Java 21·Spring Boot, 작업 API·Agent 실행·결과 저장|
|`agent/src`|Node.js 탐색·수집·광고 판정·기법 분석·저장/재개|
|`agent/antispoof/infer.py`|KcElectra-AntiSpoof v1.0 CPU 추론|
|`scripts/Launcher.cs`|Windows 실행기·서버 시작·화면 열기·종료|
|`scripts`|빌드·배포·오프라인 검증|
|`licenses`|외부 구성요소 출처·이용 조건|

광고 의도만 **OpenAI Responses API / `gpt-6-luna` / reasoning `none`**으로 판단합니다. 대상과 연결된 연속 문맥을 입력하고 Structured Outputs로 응답을 검증합니다. 기법은 문자·DOM·스타일·좌표 분석 코드와 KcELECTRA를 별도 파인튜닝한 AntiSpoof 모델이 판단합니다. 학습 코드·개발 실험 자료는 포함하지 않습니다. 가중치와 Unicode 대응 자료는 `../01_실행/app/agent/models/kcelectra-antispoof-v1`에 있습니다.

## 소스에서 빌드

Windows 11 x64, **Node.js 24 LTS와 npm**이 필요합니다. `run.ps1`은 Java 21·Maven 3.9.11을 `.tools`에 준비하고 npm 의존성을 설치합니다. 처음에는 다운로드를 위한 인터넷이 필요합니다.

PowerShell에서 이 README가 있는 `02_소스코드` 폴더로 이동한 뒤 실행합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run.ps1 -Action build
```

결과는 `frontend/dist`와 `backend/target/public-ad-backend.jar`입니다. JAR에 화면이 포함되므로 일반 실행에서는 Vite 개발 서버가 필요하지 않습니다.

## 소스에서 검사 실행

제출본의 모델을 복사하고 CPU Python 경로를 지정합니다. 재학습·모델 다운로드는 필요하지 않습니다.

```powershell
Copy-Item -LiteralPath '..\01_실행\app\agent\models' -Destination '.\agent\models' -Recurse
$env:ANTISPOOF_PYTHON = (Resolve-Path '..\01_실행\runtime\python\python.exe').Path
$env:PLAYWRIGHT_BROWSERS_PATH = (Resolve-Path '..\01_실행\runtime\chromium').Path
$env:BROWSER_CHANNEL = 'chromium'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run.ps1 -NoBrowser
```

모델을 이미 복사했다면 첫 명령은 생략합니다. `http://127.0.0.1:8766`을 열어 키를 등록합니다. 소스 실행은 `agent/.env`의 `OPENAI_API_KEY`를 읽고 `.runtime/jobs/<작업 ID>/artifacts`에 저장합니다. 터미널 `Ctrl+C`로 종료합니다. 배포 EXE의 `01_실행/config/.env`·`01_실행/state/jobs`와는 별도 경로입니다.

## Windows 배포본 재구성

위 빌드와 모델 복사를 완료한 뒤 기존 배포본의 CPU Python을 재사용할 수 있습니다.

```powershell
New-Item -ItemType Directory -Force '.\Bareun-Nuri 제출\01_실행\runtime' | Out-Null
Copy-Item -LiteralPath '..\01_실행\runtime\python' -Destination '.\Bareun-Nuri 제출\01_실행\runtime\python' -Recurse
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-windows.ps1 -SkipBuild
```

새 배포본은 **현재 소스 폴더 안의 `Bareun-Nuri 제출`**에 생성됩니다. 원본 제출 폴더를 덮어쓰지 않습니다. 신청 서류는 자동 복사하지 않습니다. 실행기 컴파일에는 Windows .NET Framework 4.x C# 컴파일러와 포함된 `scripts/brand-logo.ico`를 사용합니다.

CPU Python을 새로 준비할 때만 Windows Python 3.12와 pip가 필요합니다.

```powershell
python .\scripts\prepare-portable-python.py
```

PyTorch CPU 2.6.0과 `scripts/requirements-windows.txt`의 의존성을 설치합니다. 일반 EXE 실행에는 Python 설치가 필요하지 않습니다.

## API 비용 없는 검증

```powershell
# 소스 구문·JSON 계약
node .\scripts\verify-submission.cjs --source
# 포함 런타임·모델 무결성·수집·CPU 추론·백엔드 화면·키 오류
node .\scripts\verify-submission.cjs --smoke
```

두 번째 명령은 상위 `01_실행`을 검사합니다. 다른 배포본은 `--run "C:\경로\01_실행"`으로 지정합니다. 임시 기록은 `.runtime/submission-check-*`에 생성하며 실제 키·제출 이력을 변경하지 않습니다. 외부 모델 API는 호출하지 않습니다. 광고 정확도나 새 PC 동작을 보증하는 검사는 아닙니다.

## 실행 계약과 확인 위치

- 수집은 FIFO·브라우저 재사용·최대 5개, 의도 판정은 최대 12후보·동시 5요청·출력 512·로컬 130kTPM입니다. 제공사 한도가 낮으면 예산을 하향합니다.
- 검사 구간 25분·최대 200페이지·600호출, 누적 후보 제한은 해제합니다. 페이지당 수집 한도·메모리 보호·접근 실패는 별도입니다.
- JSON은 `meta`·`findings`, UTF-8(BOM 없음)입니다. `(url, location, technique)`별 한 항목을 생성하고 원문을 보존합니다.
- 사용자 재개는 남은 구간 시간, 시간 초과 재개는 새 25분입니다. 완료 판정은 재사용하고 코드·모델 불일치와 미확인 전송은 자동 재개하지 않습니다.
- `agent/src/core/luna*.cjs`: API·연속 문맥·출력 검증. `collect.cjs`: 수집. `bounded-scan*.cjs`: 배분·저장·재개. `techniques.cjs`·`antispoof.cjs`: 기법. `output.cjs`: JSON.
- `backend/src/main/java/kr/publicad/Api.java`·`Jobs.java`: 작업 API·실행 제어. `backend/scripts/env-key.cjs`: 키 파일·마스킹.

로그인·폼 제출·무한 스크롤 등 모든 상호작용은 지원하지 않습니다. 의도·기법의 미확정과 오판 가능성은 남아 있습니다. 부분 결과를 사이트 전체 정상 판정으로 해석하지 않습니다. 사용자 안내와 결과 경로는 상위 `사용설명서.md`를 확인합니다.
