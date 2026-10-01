# 동결 후보의 기존4종 광고 의도 보존 검사

2026-09-29. 204개 HCX 비교를 마친 뒤, 새 훈련이나 재선택 없이 기존4종2000개에서 손실을 확인한다. 새 Kc의 문맥F1 향상만으로 과거 Nuri1.0의 다른 강점까지 보존한다고 주장하지 않기 위해 시행한다.

모델은 `semantic-encoder-v1/regression/selected-before-regression.json`에 이미 고정된 세개와 Nuri1.0이다. 기존 `.runtime/klue-contest-v1/inputs.json`와 `test-set-contest-v1/data/private/gold.json`을 사용한다. 정규화 동일 훈련 입력은 제외하고 수를 보고한다. 이 자료는 이미 관찰된 합성 회귀이며 새 최종 평가가 아니다.

각 모델을 CPU8threads/FP32/batch8에서1회 평가한다. 전체 및 HOMOGLYPH/JAMO/TRANSPARENT/OFFSCREEN 별 의미 F1, 정상FP, Nuri1.0 정탐 손실/회복을 계산한다. CSS 기법을 모델이 검출한 성능으로 해석하지 않는다. 참조 Nuri1.0의 기존2000예측과 비교해 입력/환경 회귀도 확인한다.

이 결과로 임계값·모델 선택·데이터를 바꾸지 않는다. 실패 유형은 후속 데이터와 독립 검수의 과제로 기록한다. 추가 학습0/API0/운영변경0이다.
