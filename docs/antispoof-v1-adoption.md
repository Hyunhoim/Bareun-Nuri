# KcElectra-AntiSpoof (v.1.0) 운영 채택

2026-09-30 사용자 지정 채택. 기존 `kc-density-role-calibrated` 후보를 **KcElectra-AntiSpoof (v.1.0)**으로 명명했다. 추가 학습 없이 가중치와 tokenizer를 그대로 패키징했다. 이는 기존 일반화·속도 관문 통과나 미완료 Goal 달성을 뜻하지 않는다.

## 동작

FIFO 수집 → 기존 HCX-007 광고 의도 판정(최대12개 순차/none/512/58k TPM) → 광고 확정 대상의 문자 구간을 AntiSpoof CPU 판정 → 기존 코드 관찰과 합집합 → 저장 및 결과 출력.

HCX 정상·판단불가 대상은 모델에 보내지 않는다. 모델은 광고 의도를 변경하지 않는다. JAMO/HOMOGLYPH를 각 present/absent/uncertain으로 판단한다. H present 확률 0.20 보정을 포함하며 J는 argmax를 사용한다. 기존 코드가 확정한 기법은 모델의 부정 판정으로 제거하지 않는다. TRANSPARENT/OFFSCREEN은 계속 코드가 담당한다. 모델의 확정은 정확한 원문 구간과 함께 보관하며 스타일 부분 귀속 규칙은 유지한다.

자모 연속 구간(공백 포함)과 문자·숫자 토큰 중 순수 완성형 한글 이외의 구간을 전달한다. 일반 영문·숫자도 포함하므로 특정 광고 단어 목록에 의존하지 않는다. 전체 원문 안에 대상 표기를 표시하고 실제 제목·수집 문맥 및 Unicode16 근거를 제공한다. 원래 입력과 UTF-16 위치는 변경하지 않는다. 이 자동 구간 선택과 운영 문맥 포장은 실험의 사전 지정 구간 평가와 다르므로 종단 F1 개선이 입증됐다고 주장하지 않는다.

모델은 작업당 Python 프로세스 하나에서 재사용한다. CPU8threads/최대8개 내부 배치이며 HCX12묶음과 별개다. 512토큰 초과·수집 문맥 잘림·장문 분할 후보는 기법을 확정하지 않고 검토 사유를 보존한다. 추론은 남은 검사시간과 최대120초 중 짧은 한도를 적용한다. 실행 실패·시간 초과 역시 HCX의 광고 판정을 보존하고 기법 진단으로 남긴다. 실패한 프로세스를 같은 작업에서 자동 재시작하지 않는다. 프로세스 종료 시 모델도 종료한다.

모델 판정은 HCX 판정과 같은 batch 파일에 저장한다. 저장 완료한 구간은 재개 시 재추론하지 않는다. 모델/토크나이저/Unicode 표/판정 설정/서비스 코드 해시를 실행 서명에 포함한다. 따라서 과거 체크포인트는 자동 이행하지 않는다. 미확인 HCX 전송의 자동 재호출 금지도 유지한다.

## 설치·파일

- 운영 서비스: `agent/antispoof/infer.py`, 연결: `agent/src/core/antispoof.cjs`.
- 모델 패키지: `agent/models/kcelectra-antispoof-v1/`. `manifest.json`에 자산별 SHA256과 판정 설정을 고정한다. 가중치 SHA256: `33cd744afda7e5a2128fb918ae659fceb01f3e4f9abf7f2eaa23ec397a678807`.
- 원본 후보는 `.runtime/dual-technique-v1/kc-density-role/model`에 보존했다. `python agent/antispoof/package-model.py`로 동일 로컬 원본을 패키징한다. 다운로드나 재학습은 수행하지 않는다.
- 현재 설치된 `.runtime/klue-venv` Python을 기본 사용한다. 다른 설치에서는 `agent/.env`의 `ANTISPOOF_PYTHON`에 실행 파일 절대경로를 지정하고 requirements의 버전을 사용한다. CPU 전용 배포에서는 PyTorch CPU 배포본을 설치한다. GPU는 요구하지 않는다.
- 511MB 가중치는 Git 제외 대상이다. 다른 PC에는 모델 폴더 전체를 별도 배포해야 한다. 코드만 복제하면 모델이 자동 다운로드되지 않는다. 없는/변조된 자산은 HCX 실행 전에 오류 처리한다.

## 검증 및 남은 한계

`node agent/antispoof.test.cjs`는 저장된 개발300개와 패키징 모델의 판정 일치, 광고 양성에만 적용, 긴 입력 보호, 원문 위치, 코드 관찰 유지, 결과 저장·재개 보존, 변경 서명 거부 및 런타임 실패 진단을 검사한다. 실제 worker 연결에서는 수집기와 HCX 응답만 로컬 모의 처리하고 실제 CPU 모델을 실행한다. 기존 `semantic-adoption.test.cjs`와 `bounded-worker.test.cjs`도 함께 확인한다. 추가 유료 API나 새로운 최종 평가를 시행하지 않는다.

알려진 기존112 기법회귀 정탐7개 손실/오확정4개, 저장 HCX 연결 회귀 F1 80.39%, 한글 H F1 64%는 그대로 남는다. 합성 최종 J100/H90.12%를 운영 F1로 소개하지 않는다. 실제 페이지에서 자동 구간 선택까지 연결한 새25분 F1·전체 메모리 최대치는 미측정이다. 기존 Node 메모리 보호는 별도 Python 프로세스의 메모리를 합산하지 않으므로 배포 사양을 그 한도만으로 판단하지 않는다. 이번 변경은 사용자가 명시한 운영 탑재이며 성능 개선의 추가 증명은 아니다.

실제 worker 모의 HCX 양성 문구 `ㅎㅏㄱㄱㅛ c0ral`에서는 순수 자모 구간을 모델이 JAMO/HOMOGLYPH 둘 다 확정했고 c0ral의 H는 보류했다. 원문에는 순수 자모의 문자 치환 근거가 없으므로 H 오확정 사례로 기록한다. 사용자에게 즉시 보고했고 해당 단어 예외나 재학습을 추가하지 않았다. 연결 테스트 성공은 이 판정의 정확성을 뜻하지 않는다.

검증 기록: `.runtime/antispoof-adoption-1790703681917/verification.json` (개발300일치/실제worker+CPU/저장재개), `.runtime/semantic-adoption-check-1790703588952` (HCX 기존입력1845일치), `.runtime/bounded-worker-check-1790703591588` (중단재개/옛서명·미확인전송 거부). Python 서비스는 torch2.6.0/transformers4.57.3 외 버전 실행을 거부한다. 모든 테스트의 HCX 유료 호출은 0이다.
