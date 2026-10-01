# INT8 수치 원인 진단

2026-09-29. 이전 turn은 새 원문/재수집/후보 주석을 추가한 진행이다. 사람 검수는 대기 중이며 이번에는 그와 독립적인 배포 수치 문제를 조사한다.

가설H1: CPU U8S8 정수 곱셈의 중간 포화가 큰 판정 변화를 만들었다. 공식 ONNX Runtime quantization 문서는 비VNNI x64의 포화 위험과 reduce_range를 설명한다. 실제 장비는 AMD Ryzen7 8845HS이나 명칭만으로 실행 커널/원인을 확정하지 않는다. 설치 ORT1.23.2/ONNX1.17을 그대로 사용한다.

먼저 문장·광고 라벨 없는 극값/난수 uint8×int8 행렬을 NumPy int64 기준과 비교한다. MatMulInteger와 DynamicQuantizeLinear→MatMulInteger→scale 경로를 graph optimization 비활성/전체활성에서 각각 실행한다. 작은/encoder크기 행렬과 양수/음수/혼합을 포함한다. 오차가 재현되지 않으면 이 검사 범위에서 포화 가설을 지지하지 않는다고 기록한다. 전체 모델까지 포화가 없다고 일반화하지 않는다.

가설H2: ORT graph fusion이 FP32/INT8의 수치 변화를 확대했다. 광고 자료 대신 의미 정답이 없는 고정 seed42 token-ID 입력(길이16/64,배치1/8)을 사용해 세 동결 모델의 FP32/INT8을 ORT_DISABLE_ALL/ORT_ENABLE_ALL로 비교한다. 동일 입력·가중치 해시를 유지하고 raw logits와 최대오차를 기록한다. 이 무의미 입력의 예측을 광고 성능으로 해석하지 않는다.

H1/H2 확인 전 재양자화·threshold조정·추가학습·개발/평가 점수 재탐색은0이다. 어느 가설도 지지되지 않으면 결과를 보존하고 원본FP32를 유지한다. 충분한 증거가 있을 때만 별도 교정 가설을 사전 고정한다. 운영/유료API0.
