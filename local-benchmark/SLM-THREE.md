# 추가 학습 없는 한국어 SLM CPU 비교

운영 HCX와 분리된 실험이다. GGUF 가중치는 `.runtime/slm-three/{exaone,kanana,bllossom}`에 저장한다. EXAONE/Bllossom은 개발팀 배포 Q4_K_M, Kanana는 mradermacher의 Q4_K_M 변환본이다. 양자화 전 원본 가중치나 학습 환경을 설치한 것은 아니다.

- 다운로드/크기/SHA256 확인: `node local-benchmark/slm-three-setup.cjs`
- 입력·공식 템플릿 준비: `slm-three-inputs.py`, `slm-three-render.py` (기존 KLUE Python 환경)
- CPU 실행: `node local-benchmark/slm-three.cjs`
- 완료 후 원응답/입력/캐시/잘림 감사 및 집계: `slm-three-report.py`

실행기는 기존 `.runtime/qwen-cpu/bin/llama-server.exe` b11217을 재사용한다. 서버는127.0.0.1:18969에만 바인딩하고 종료 시 정리한다. GPU offload0, CPU8threads, context4096, 단일후보, greedy, 비추론, 출력최대32, 동일GBNF라벨제약이다. 공식모델별Jinja를먼저렌더링하고 공통지시문·대상·문맥이보존됐는지검사한다. 평가라벨/ID/패널이 프롬프트에 들어가지 않는다.

`comparison-v1`은 경로오류, `comparison-v2`는 API/템플릿 연결 진단 후 중단 이력이다. `comparison-v3`는 원응답 감사에서 자동 BOS 추가/중복을 발견한 진단 이력이다. 최종비교는 `comparison-v4`만 사용한다. 실행기는 기존 결과 덮어쓰기를 거부한다. 재측정이 필요하면 새 결과 버전을 명시적으로 정하고 사전 계획을 기록한다. 기존 모델/결과를 지우지 않는다.

자료204개는 이미관찰한개발패널이고17개는3개공개페이지의사용자검수정상요소다. 새로운홀드아웃이나광고4종전체종단성능이아니다. 최종봉인평가/추가학습/유료API/운영승격은하지않는다. 모델파일은`.runtime/`의기존gitignore로원격저장소에올리지않는다.

계획: `docs/slm-three-plan.md`. 결과: `docs/slm-three-report.md`.
