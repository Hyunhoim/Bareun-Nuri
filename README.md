# Bareun-Nuri · Agent_core

현재 운영 Agent만 포함한 브랜치입니다. Node.js FIFO 수집·판정 실행기, Playwright 브라우저 수집, HCX-007 광고 의도 판정, CPU KcElectra-AntiSpoof 1.0 기법 판정을 포함합니다. 실험 데이터·연구 보고서는 `Test_set`, Spring 백엔드는 `Backend`에 있습니다. `main`은 아직 제출하지 않습니다.

## 설치 (Windows PowerShell, 저장소 루트)

Node.js 22 이상, Python 3.12, Git LFS가 필요합니다. 기본 브라우저는 Microsoft Edge입니다.

```powershell
git lfs install
git lfs pull
npm.cmd ci --prefix agent
py -3.12 -m venv .runtime/klue-venv
.runtime/klue-venv/Scripts/python.exe -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
.runtime/klue-venv/Scripts/python.exe -m pip install transformers==4.57.3
Copy-Item agent/.env.example agent/.env
npm.cmd test --prefix agent
```

`agent/.env`의 `CLOVASTUDIO_API_KEY`에 본인 키를 입력합니다. 키는 커밋하지 않습니다. Microsoft Edge가 없다면 `npm exec --prefix agent -- playwright install chromium` 실행 후 `.env`에 `BROWSER_CHANNEL=chromium`을 추가합니다. 다른 플랫폼은 동일 Python 가상환경의 `bin/python` 경로를 사용합니다.

모델 가중치 511,149,672바이트는 Git LFS 파일입니다. GitHub의 소스 ZIP만 받으면 가중치가 빠질 수 있으므로 `git lfs pull`과 모델 해시 검사를 완료해야 합니다. 원래 운영 가중치·토크나이저·Unicode 표·보정 임계값은 변경하지 않았습니다.

## 단독 실행

worker는 표준입력의 JSON 요청 한 개를 읽고 진행 이벤트를 JSON Lines로 출력합니다. 실제 HCX 호출에는 API 비용이 발생합니다.

```powershell
$request = @{
  url='https://검사할-공공기관-주소/'; provider='hcx'
  maxPages=200; maxNodes=0; maxCalls=600; timeoutSeconds=1500
  envFile=(Join-Path $PWD 'agent/.env')
  jobDir=(Join-Path $PWD '.runtime/jobs/example/artifacts')
}
$request | ConvertTo-Json -Compress | node agent/src/worker.cjs
```

실제 웹 사용 시에는 `Backend` 브랜치의 백엔드가 요청·취소·재개를 관리합니다. 별도 체크아웃에 백엔드를 실행하고 `APP_ROOT`를 이 체크아웃으로 지정할 수 있습니다. `provider=mock`은 실제 광고 성능을 측정하지 않습니다.

## 고정 운영 계약

- HCX-007, reasoning `none`, 출력 512, 페이지별 최대 12후보, 최대 동시 3요청, 로컬 예약 58,000 TPM. 제공사 계정 한도를 변경한 값이 아닙니다.
- 진입 URL과 동일 출처의 연결 페이지를 FIFO로 탐색합니다. 페이지 종류만으로 제외하지 않으며 댓글·삽입 iframe의 문맥과 위치를 수집합니다.
- 원문·위치·스타일을 보존하고 HCX는 광고 의도, 코드와 AntiSpoof는 관찰 기법을 담당합니다. `maxNodes=0`은 누적 후보 제한을 두지 않는 설정입니다. API 입력의 페이지·호출·시간 보호 한도는 남습니다.
- 25분 단위 중단·부분 결과·재개를 지원합니다. 확정 불완전 응답만 일반 검사 종료 후 최대 4개씩 한 차례 복구하며, 작업당 복구 최대 60소묶음입니다.
- 미확인 전송의 자동 재호출 및 이전 코드·모델 서명 체크포인트의 자동 이행을 거부합니다. R 프롬프트와 `bounded-evidence-v6-recovery4-once`를 사용합니다.

## 검증 범위

Phase 2 합성 회귀 1,000위치에서 첫25분 의도 F1 81.21%, 재개·복구 완료 후 90.05%, 정밀도 96.78%, 재현율 84.20%, 결합 기법 F1 87.90%였습니다. 전체 활성시간은29분19초였으며 기존 정탐12개 손실·61개 회복이 함께 있었습니다. 실사이트 전체 일반화나 모든 광고 탐지를 보장하지 않습니다. 상세 근거는 `Test_set` 브랜치 `docs/phase2-improvement-report.md`입니다.

## 제3자 자료

KcElectra-AntiSpoof는 [Beomi KcELECTRA-base-v2022](https://huggingface.co/beomi/KcELECTRA-base-v2022)를 기반으로 프로젝트에서 두 기법 판정을 학습한 모델입니다. 원 모델의 MIT 라이선스·출처 표기를 따릅니다. [Unicode 16.0 confusables](https://www.unicode.org/Public/security/16.0.0/confusables.txt)의 저작권·이용조건 표기는 배포 파일에 보존되어 있습니다. Python·Node 의존성은 각 배포물의 라이선스를 따릅니다.
