# 광고 의도 encoder 교체 제한 비교

2026-09-29 사용자 요청. 기법 분류가 아닌 광고 의도4분류를 비교한다. 기존 학습10,000개에서 seed42로200개 시나리오 그룹 전체(2,000행)를 추출하고 세 순정 모델 KLUE-base/KcELECTRA-base-v2022/KLUE-large에 동일하게 제공한다. 기존 A는 별도 참고 기준이다. 적은 자료의 제한 비교이며 두 모델의 최적 성능이나 사전학습 도메인의 단독 인과효과를 증명하지 않는다.

개발은 기존40/120/44개 패널, 선택은 패널 macro4 F1 평균→광고F1 평균. 기존2000개 공모전4종 자료는 모두 모델선택 종료 후 회귀에만 사용한다. train/dev 직접 입력 중복 금지. 반복 사용 자료의 편향과 합성자료 한계를 보고한다. 이번에는 새 최종평가를 만들거나 소비하지 않는다.

동일 seed42/lr2e-5/AdamW .01/3epoch/유효batch8/micro1/gradient accumulation8/BF16 autocast/gradient checkpointing/clip1, 최대512토큰. 모델별40분 안전상한, GPU직렬. 시간초과/메모리부족은 미완주로 기록하고 임의조건변경/재시작하지 않는다. 토크나이저 차이와 잘림을 각각 기록한다. 모델revision 및 자료/가중치 해시 보존. CPU8threads/batch8/FP32, 로딩·토큰화·추론 시간 구분. 미확정은 광고 FN, 근거부족 과도확정 별도다.

진전 후보는 동일조건base 대비 개발 평균광고F1과2000회귀 광고F1 모두+2%p 이상, 회귀정상FP 증가없음,4종별F1 하락2%p 이하일 때만 선정한다. A대비 손실/획득도 보고하며 한seed/관찰자료로 운영 채택하지 않는다. 실패 시 이번교체안은보류하고 반복튜닝하지 않는다. CPU지연·메모리 부담을함께보고한다. 운영/기존모델/HCX변경·유료API·push없음.

공식 근거 https://github.com/Beomi/KcELECTRA 및 https://huggingface.co/klue/roberta-large. KcELECTRA의댓글사전학습은가설근거이지광고판정우위증거가아니다. Transformers4.57.3 기존API와Context7공식문서를확인했다.
