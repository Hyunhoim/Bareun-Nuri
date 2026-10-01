# Qwen CPU 전용 속도 측정

운영 Agent/HCX 호출부와 분리된 로컬 진단이다. 파인튜닝 전 Qwen3.5-2B Q4_K_M을 사용하며 의미 정확도·최종 F1·주최측 장비 성능을 보장하지 않는다.

## 위치

- `qwen-cpu-setup.cjs`: 고정 버전 다운로드 및 SHA-256 검증. 전역 설치 없음.
- `qwen-cpu.cjs`: CPU 전용 서버 시작 → 저장 후보 기반 10회 요청 → 측정 저장 → 서버 종료.
- `../.runtime/qwen-cpu/`: 모델, CPU 실행 파일, 원본 응답·로그. Git 제외.
- `../.runtime/qwen-cpu/latest-run.txt`: 최근 실행 결과 폴더.

프로젝트 루트에서 실행한다.

```powershell
node local-benchmark/qwen-cpu-setup.cjs
# 최초 한 번만 압축 해제한다. 이미 설치돼 있으면 생략한다.
Expand-Archive -LiteralPath .runtime/qwen-cpu/llama-b11217-bin-win-cpu-x64.zip -DestinationPath .runtime/qwen-cpu/bin
node local-benchmark/qwen-cpu.cjs
```

## 측정 조건

8 CPU 스레드, 1개 실행 슬롯, 컨텍스트 16,384, 출력 최대 512, 추론 off, temperature 0, seed 42. CPU 전용 바이너리에 `--device none --n-gpu-layers 0 --no-kv-offload --no-op-offload`를 함께 사용한다. localhost:18967만 열며 실험 종료 후 자체 서버를 종료한다. 외부 LLM 호출·키 사용 없음.

기존 137개 저장 후보에서 직렬화 입력 길이 기준 짧은/중간/최장 단일 후보와 중간/최장 12개 묶음을 선택한다. HCX의 기존 요청 생성기를 외부 호출 없이 재사용해 system/user 메시지를 그대로 전달한다. 전체 모집단의 최장 웹 문맥을 대표하지 않으며 이번 저장 자료 안에서의 길이다.

각 조건을 정순/역순 각 1회 실행한다. `cache_prompt:false`로 매번 전체 입력을 처리하고 응답의 cache_n=0을 검사한다. 모델은 메모리에 유지하므로 매 요청이 모델 재시작을 뜻하지 않는다. 콜드 시작 시간은 별도 기록한다. 요청 시간에 메모리 조회용 PowerShell 시간은 포함하지 않는다.

메모리는 llama-server의 working set/peak working set/private bytes다. 브라우저·Spring·Node 전체 애플리케이션 메모리가 아니며 최소 RAM 사양으로 해석하지 않는다. 전원 모드·발열·다른 프로그램 부하는 통제하지 않았다. 주최측 CPU 사양으로 제한한 측정도 아니다.

JSON 형식 검사는 현재 운영 계약을 사용한다. 형식 성공은 의미 정답을 뜻하지 않으며, 실패 응답의 속도 역시 성공적인 판정 처리량으로 계산하지 않는다. 자동 형식 수선·재호출·속도에 맞춘 프롬프트 변경은 하지 않는다.

## 출처

- 기본 모델: https://huggingface.co/Qwen/Qwen3.5-2B
- 양자화 배포: https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/tree/f6d5376be1edb4d416d56da11e5397a961aca8ae
- CPU 엔진: https://github.com/ggml-org/llama.cpp/releases/tag/b11217

이는 기존 공개 양자화 모델 다운로드이며 직접 파인튜닝하거나 새로 양자화한 결과가 아니다. 실측 결과는 `../docs/qwen-cpu-report.md`를 참고한다.

## HCX와 기존 137개 전체 비교

`qwen-hcx.cjs`는 동일 메시지·12개 묶음으로 정순/역순을 비교한다. `node local-benchmark/qwen-hcx.cjs`는 API0 사전 점검이며, `--live`를 붙이면 HCX24회와 로컬24회 호출한다. HCX 키는 기존 `agent/.env`를 읽고 출력하지 않는다. 결과는 `.runtime/qwen-hcx-v1/`에 보존하며 같은 경로의 자동 재실행은 거부한다.

`node local-benchmark/qwen-hcx-audit.cjs`로 외부 호출 없이 원본 요청·응답·지표를 재검증할 수 있다. 비교 계획은 `docs/qwen-hcx-plan.md`, 결과 보고서는 `docs/qwen-hcx-report.md`를 참고한다. 이 비교에서도 파인튜닝·운영 연결·자동 채택은 하지 않는다.
