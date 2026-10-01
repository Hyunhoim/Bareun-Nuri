# Bareun-Nuri · Backend

Java 21 / Spring Boot 3.5.16 백엔드 전용 브랜치입니다. `backend/src`, `backend/pom.xml` 및 이 README만 두며 Agent와 프런트 구현·실험 데이터는 포함하지 않습니다.

## 빌드와 실행

Java 21과 Maven을 설치하고 저장소 루트에서 실행합니다.

```powershell
mvn -f backend/pom.xml '-Dmaven.compiler.useIncrementalCompilation=false' -DskipTests package
$env:APP_ROOT='C:\경로\Bareun-Nuri-Agent_core'
$env:NODE_EXECUTABLE='node'
java -Dfile.encoding=UTF-8 -jar backend/target/public-ad-backend.jar
```

PowerShell이 Maven의 점(.) 포함 인수를 분리하면 `'-Dmaven.compiler.useIncrementalCompilation=false'`처럼 따옴표로 감쌉니다. `APP_ROOT`에는 `Agent_core`를 체크아웃하고 해당 README에 따라 설치한 루트를 지정합니다. 백엔드는 `$APP_ROOT/agent/src/worker.cjs`를 실행하고 `$APP_ROOT/.runtime/jobs`에 작업을 저장합니다. 기본 주소는 `http://127.0.0.1:8766`입니다.

이 브랜치에는 프런트 화면이 없습니다. `../frontend/dist`가 존재할 때만 기존 Maven 리소스 설정으로 함께 패키징됩니다. 프런트 없이도 REST API를 실행할 수 있습니다.

## API

|메서드·경로|역할|
|---|---|
|GET `/api/health`|상태 확인|
|GET `/api/jobs` · `/api/jobs/{id}`|작업 목록·진행 상태|
|POST `/api/jobs`|검사 시작|
|POST `/api/jobs/{id}/cancel`|중단 요청|
|POST `/api/jobs/{id}/resume`|검증된 체크포인트에서 재개|
|POST `/api/jobs/{id}/finish`|사용자가 검사 종료|
|GET `/api/jobs/{id}/result`|누적 결과|
|GET `/api/jobs/{id}/segments/{segment}/result`|구간별 결과|

```powershell
$body=@{url='https://검사할-공공기관-주소/';provider='hcx';maxPages=200;maxNodes=0;maxCalls=600;timeoutSeconds=1500}|ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8766/api/jobs -Method Post -ContentType application/json -Headers @{'X-Local-Client'='public-ad-ui'} -Body $body
```

실제 HCX 호출에는 비용이 발생합니다. 키는 Agent 체크아웃의 `agent/.env`에만 저장합니다. 한 번에 한 작업을 실행하며, 진행 중 결과 파일을 불안정하게 읽지 않고 완료·부분 결과를 구분합니다. 미확인 전송 상태의 재개는409로 거부하며 준비된 요청과 영속 저장된 복구 결과는 안전하게 이어갑니다. 25분 상한은 이 API에서 강제합니다.

## 검증

2026-10-01 기준 패키징 및 실제 로컬 HTTP를 통한 작업 상태·재개·409 거부를 검증했습니다. 운영 실험 근거는 `Test_set` 브랜치의 `docs/phase2-improvement-report.md`입니다. 모델·데이터·API 키·빌드 산출물은 이 브랜치에 두지 않습니다.
