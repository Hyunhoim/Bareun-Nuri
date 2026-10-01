# 독립 페이지 완료 반영 후보 — API0 사전 검증

운영 수정·API·Phase2 접근 0. `agent/experiments/hcx-throughput-rolling/`은 이름과 달리 rolling dispatch를 구현하지 않은 **동일 3요청 wave + 독립 페이지 조기 commit** 후보다. 프롬프트·요청 내용·batch·quota·AntiSpoof를 바꾸지 않는다. 계획은 `docs/rolling-wave-plan.md`.

## 관찰과 효과 범위

기존 실제 375요청/125wave 중 여러 페이지가 있는 wave는123개, 세 페이지가 모두 다른 wave는109개. 마지막 느린 요청도 000092/000090/000088로 서로 다른 페이지다. 따라서 같은 페이지 prefix 계약을 깨지 않고 먼저 끝난24후보를 먼저 commit할 수 있는 조건이다. 실제 조기 commit을 적용한 25분 API 측정은 아직 하지 않았으므로 24개 회복/F1 증가는 예측일 뿐 확정 결과가 아니다.

후보는 각 응답을 기존과 같이 불변 outcome으로 저장한 후, 같은 페이지의 앞 offset이 완료된 응답만 commit한다. 다른 페이지는 독립적으로 commit한다. 모든 wave가 끝나면 원래 예약했던 turn·last_turn·active 순서를 복구해 다음 요청 선택이 완료 순서에 좌우되지 않게 한다. 중간 checkpoint에도 예약 스케줄을 보존한다. batch_history는 실제 commit 순서를 불변 보존한다. 마지막 commit은 스케줄 확정 및 inflight=null 전이 후 저장하므로 빈 wave checkpoint를 노출하지 않는다.

이 후보는 다음 wave 발송을 앞당기는 rolling 슬롯이 아니다. 주된 효과는 결과 공개 지연 및 마감 직전 유효 결과 보존이며 총 API 처리량 개선이라고 설명하지 않는다.

## API0 검증

`node local-benchmark/rolling-check.cjs`

최종 결과 `.runtime/rolling-check-1790794111182/result.json`. 운영/후보 같은 요청과 최종 판정, multiwave aging 이후 batch 순서, 같은 페이지 prefix, 일부 ID 누락 격리, durable 재개(API0), 빈 wave checkpoint 비노출, sent 미확인 재개 거부, call limit, deadline, cancellation 모두 assert 통과. 중단 재개는 checkpoint injection이며 실제 process kill 실험은 아니다. 후보 worker는 syntax 검증했으며 실제 HCX/CPU worker live 연결은 미실행이다.

controlled delay(한 요청300ms/나머지15ms)에서 두 번째 독립 commit은963.16→328.14ms. 전체 wall1063.01→643.65ms는 소규모 파일I/O/JIT 변동이 섞인 smoke 관측으로 처리속도 개선 근거로 삼지 않는다. 숫자 대신 느린 요청이 아직 active인 동안 다른 페이지 commit이 공개되는지를 assert로 검증했다. 실제 commit 순서의 중간 history가 최종 history prefix와 같으므로 기존 첫25분 평가 계약을 보존한다.

## rolling의 별도 처리량 가능성

`node local-benchmark/rolling-simulation.cjs`

실제375응답의 service 시간·예약량·prompt 사용량을 고정한 API-only 이산 모사:

|조건|wave3|rolling3|
|---|---:|---:|
|TPM 제한 없음|929.208초|674.540초|
|58k TPM/61초 창/1초 발송 간격·대기 확인|1457.346초|1427.251초|

현재 quota에서는30.095초(2.065%) 감소에 그친다. 브라우저·AntiSpoof·저장·새 API 변동·25분 미완료 이후 전체 요청을 제외한 고정 stream 모사여서 실제 완료시간이나 상한의 엄밀한 증명이 아니다. 이 결과만으로 rolling 구현 확대나 운영 채택하지 않는다. 실제 서비스 시간을 고정할 때만 quota가 이득을 크게 줄이는 관측이다.

## 통합 주의

저장 최적화와 결합할 때 조기 commit은 checkpoint·요청 outcome을 즉시 보존해야 한다. 전체 public output을 wave 종료만 기다리게 하면 UI/결과 공개 지연은 남는다. 주기적인 publish 및 종료·deadline 강제 publish를 따로 검증할 필요가 있다. 모듈명은 실험 경로이며 운영 code signature와 호환되지 않는다.

## 핀

- 운영 bounded-scan SHA256: `6fa35477e81faace1242635d8393685ab5ef803adad761c4ab63490ec2b5316e`
- 후보 bounded-scan SHA256: `78c94d3150def1e0c2718be6770224482f5f149a8b75cbf3dde6481d528272a3`

고정 입력의 구조·스케줄 재생이며 새 일반화 평가나 의미 정확도 개선이 아니다. 운영 채택 전 worker 연결과 동일25분 검증이 남는다.
