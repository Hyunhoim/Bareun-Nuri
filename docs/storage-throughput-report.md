# 저장·후처리 병목 분리 재생

2026-10-01. API0, Phase2 미접근, 운영 파일 미수정. 실제 Phase1 동시3 실행의 95페이지·375요청·3811판정·48격리를 저장 근거와 최종 응답으로 재생했다. 브라우저/API/AntiSpoof 지연을 제거한 **오프라인 저장 경로 측정**이다. 다음 속도 차이를 실제25분 개선율로 간주하지 않는다.

## 사전 가설과 후보

`storage-throughput-plan.md`에 따라 lifecycle별 checkpoint, 불변 요청 outcome, 페이지별 출력, progress 이벤트를 모두 유지하고 wave 중간의 전체 publish만 생략했다. 수집 및 wave종료·실행종료 출력은 유지한다. 운영 소스 `bounded-scan.cjs` SHA256 `6fa35477e81faace1242635d8393685ab5ef803adad761c4ab63490ec2b5316e`를 복제·계측했다.

## 3회 교차 결과

| API0 재생 | 기준 | wave 출력 |
|---|---:|---:|
| 1회 |108.999초|62.151초|
| 2회(역순실행) |91.838초|57.392초|
| 3회 |103.068초|60.885초|
| 중앙값 |103.068초|60.885초|
| 전체 publish 중앙값 |77.641초|35.663초|
| checkpoint persist 중앙값 |11.065초|11.228초|
| account 중앙값 |1.692초|1.615초|
| 페이지 output 중앙값 |1.734초|1.594초|
| 저장소 read 횟수 |107365|54196|
| 누적 전체/페이지 출력 bytes |약295.05MB|약138.95MB|
| 누적 checkpoint bytes |약405.56MB|약405.56MB|

재생 경과 중앙값 **40.93% 감소**, 42.18초 절약. request 안전 기록 축소 없이 반복 전체 출력이 유의미한 비용이라는 가설을 지지한다. read/write 계측은 publish/persist 내부와 겹치므로 중복 합산하지 않는다. 실제 서비스 wall-time 절감값이나 디스크 순수 I/O 시간이 아니며 해시검사·JSON파싱/직렬화도 포함한다.

모든 6조건 batch history 및 최종 result/diagnostics/technique-diagnostics/unjudged가 시간 메타데이터를 제외하고 동일하다. 별도 소형 검사에서 역순응답·격리·durable재개 추가호출0·미확인거부·서명거부를 통과했다. OS 강제종료 시험은 아니다.

처음 재생은 297요청에서 checkpoint rename EPERM으로 중단되어 제외했다. 진행확인 PowerShell 읽기와 겹친 Windows 파일잠금 가능성이 있으나 원인을 확정하지 않았다. 재실행6조건은 완주했다. 최초 마지막 비교 assert는 finished_at 차이를 제외하지 않아 실패했으며 별도 감사기로 시각메타데이터 제외 후 전부 통과했다. 원본실행 로그와 실패도 보존한다.

## 조기 커밋 통합 후보

wave만 기다리는 후보를 그대로 독립커밋에 결합하면 완료결과 UI가 늦을 수 있다. 상위 에이전트가 만든 earlycommit + 최대5초 전체출력 후보를 추가1회 재생했다: **63.953초**, publish37.228초/persist12.518초. 같은375요청의 모든 최종 결과와 batch history가 기준선과 같다. API 대기를 제거한 재생은 timer의 실서비스 빈도를 재현하지 않으므로 최종 채택은 실제25분 비교로 결정한다.

근거: `.runtime/storage-throughput-1790793972958/{timing-summary,output-audit}.json`, `.runtime/storage-throughput-check-1790793887635/result.json`, `.runtime/storage-throughput-1790794513702/{result,output-audit}.json`. 실행기 `local-benchmark/storage-throughput-replay.cjs`, 독립감사 `storage-output-audit.cjs`.

## CPU AntiSpoof 별도 실측

다른 벤치와 겹치지 않게 저장재생 종료 뒤 운영 CPU 모델로 기존 HCX양성 1404후보/326배치를 재생했다. 합계 **98.085초**, 첫 양성배치 **6.903초**(모델 초기화 포함), 이후 합계91.182초다. 실제25분에서의 기법지연과 동일한 값은 아니며 네트워크 대기와 중첩 가능한 서비스 시간을 분리 측정한 것이다. `storage-antispoof-replay-1790794719999.json` 참고.

1402후보의 AntiSpoof 객체는 저장값과 완전히 같고 2후보는 달라 전체일치 assertion은 실패했다. 두 후보는 모두 마지막 느린 q372-0 요청에 속하며 원래 기록은 각각 `antispoof_timeout` 및 그 뒤 `antispoof_unavailable`이다. 재생에는25분 마감이 없으므로 해당 운영 실패가 재현되지 않았다. 이를 모델 정확도 변화나 개선 효과로 집계하지 않는다. 원본판정에 붙은 안전한 보류를 보존하며 새로운 판정으로 덮어쓰지 않았다.

CPU모델 자체는 이번 작업에서 변경하지 않았다. 전체출력 절감의 정확도 검증에는 원래 저장된 AntiSpoof 결과를 그대로 주입했으므로 위2건 차이는 저장후보 비교에 섞이지 않았다. API0/학습0, CPU subprocess 종료 확인.
