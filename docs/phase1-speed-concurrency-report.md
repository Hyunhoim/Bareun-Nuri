# Phase1 동시2 저장시간 재생

운영 소스 변경과 외부 API 호출 없이, 최신 Phase1의 516개 실제 요청 본문·후보 순서·응답시간을 고정했다. 58,000 TPM / 61초 창 / 전송 간격 1초 / 출력512 / 최대12개 조건이다.

| 재생 조건 | 순차 | 동시2 | 차이 |
|---|---:|---:|---:|
| 관측된 요청 전 작업간격 보존 | 2785.973초 | 1951.911초 | -29.94% |
| 작업간격 제거, API와 quota만 | 2262.570초 | 1920.551초 | -15.12% |

첫 요청부터 마지막 응답까지 실제 시간2786.096초와 순차재생 차이는0.123초다. 25분내 응답완료 요청은285→402개, 해당 요청 후보는2946→4127개다. 이 수치는 격리응답 후보까지 포함한 **스케줄 투영**이며 판정완료수·새 재현율이 아니다. 기존 실제 첫구간2898판정과의 차이는 격리48개다.

동시화하면 순차에서 작았던 토큰 제한 대기가 새로운 병목이 된다. 관측 service를 고정한 낙관적 작업간격 제거에서도 약32분이므로 25분 완주를 보장하지 않는다. 실제 동시 HCX 서비스지연, FIFO 수집 의존성, CPU 경쟁은 구현하지 않았으며 live 비교가 필요하다. 작업간격에는 수집·후처리·저장이 섞여 있으므로 전체 간격 감소를 순수 API동시성 효과로 해석하지 않는다.

## 안전 계약

`local-benchmark/phase1-speed-concurrency-stub.cjs`는 최대12개×2/58k의 역순 불완전 응답을 주입했다. 후보 ID는 올바르게 귀속됐지만 첫 요청의 quarantine.call_number가2로 잘못 붙었다. 현재 `llm.cjs`가 `calls.at(-1).number`를 사용하기 때문이다. 기존 순차 운영의 오류라는 뜻은 아니며 그대로 Promise.all로 운영 변경할 수 없다는 검증이다. 또한 bounded-scan은 단일 inflight를 사용하므로 요청별 영속 상태가 필요하다.

실험용 공통 harness는 고정 요청마다 불변 global ordinal과 body SHA를 부여하고 요청별 prepared/sent/responded/committed 또는 quarantine 상태를 저장해야 한다. 최신 Phase1는 재개시 call_number가1부터 다시 시작하므로 원래 call_number 단독 키는 중복된다. 재생기는516개의 global ordinal로 구분한다. 미확인 전송은 자동재호출하지 않는다. 공유quota와 전송간격을 유지하며 응답 완료 순서와 원래 요청 순서를 분리한다.

운영판정 변환은 동일 contract validator를 재사용하고, 요청 본문은 저장 body와 byte-level SHA로 대조해야 한다. 같은 후보를 재구성하는 것만으로 동일 요청이라고 가정하면 안 된다. 유료 live는 부모 실행기에서 공용 예산으로 관리한다.

## 파일

- `local-benchmark/phase1-speed-concurrency-replay.cjs`
- `local-benchmark/phase1-speed-concurrency-stub.cjs`
- `.runtime/phase1-speed-concurrency-v1/replay.json`
- `.runtime/phase1-speed-concurrency-v1/partial-stub.json`

API0, 운영 변경0. 실측 속도개선이나 채택 완료가 아니다.
