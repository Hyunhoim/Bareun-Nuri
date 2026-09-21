# 관리자용 사례 목록

Agent에게 제공하지 마세요. 원문과 정확한 경로는 ground_truth.json에 있습니다.

| 사례 | 위치 유형 | 정답 기법 | 표현 방식 | 라벨 근거 |
|---|---|---|---|---|
| dev-23 | body | 정상 | 문자 분석 | 정상 공공서비스 홍보 |
| dev-19 | comment | 정상 | 문자 분석 | 교육용 인용. 실제 가입 유도 아님 |
| dev-04 | comment | JAMO | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-03 | body | HOMOGLYPH | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-17 | comment | 정상 | font-one | 접근성 보조 문구. 광고 아님 |
| dev-02 | dynamic-comment | HOMOGLYPH | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-01 | body | HOMOGLYPH | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-07 | comment | TRANSPARENT | opacity | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-15 | iframe | JAMO, OFFSCREEN | display-parent | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-06 | body | JAMO | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-24 | comment | 정상 | 문자 분석 | 전각 문자 사용이지만 정상 행사 안내 |
| dev-11 | comment | OFFSCREEN | left | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-12 | body | OFFSCREEN | font-zero | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-18 | comment | 정상 | opacity | 메뉴 상태 안내. 광고 아님 |
| dev-22 | comment | 정상 | display | 접힌 교육자료의 광고 인용 |
| dev-10 | body | OFFSCREEN | display | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-20 | comment | 정상 | 문자 분석 | 자모 분해 표현을 설명하는 예방 안내 |
| dev-13 | nested-iframe | HOMOGLYPH, JAMO | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-05 | body | JAMO | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-14 | comment | HOMOGLYPH, TRANSPARENT | opacity-parent | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-16 | dynamic-comment | TRANSPARENT, OFFSCREEN | opacity-left | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-08 | body | TRANSPARENT | transparent | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| dev-21 | comment | 정상 | transparent-parent | 보조 안내 문구. 은닉돼 있어도 광고 아님 |
| dev-09 | comment | TRANSPARENT | same-color | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-17 | body | 정상 | left | 화면 읽기 보조 문구. 광고 아님 |
| eval-02 | comment | HOMOGLYPH | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-20 | comment | 정상 | 문자 분석 | 정상 자모 학습 자료 |
| eval-01 | body | HOMOGLYPH | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-11 | comment | OFFSCREEN | font-one | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-21 | dynamic-comment | 정상 | same-color | 신고 절차 안내. 유해 서비스 판매 아님 |
| eval-16 | body | TRANSPARENT, OFFSCREEN | transparent-font | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-07 | comment | TRANSPARENT | opacity-parent | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-12 | iframe | OFFSCREEN | top | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-05 | body | JAMO | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-04 | comment | JAMO | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-06 | comment | JAMO | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-24 | body | 정상 | 문자 분석 | 정상 전각 문자 안내 |
| eval-09 | comment | TRANSPARENT | same-color-parent | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-03 | comment | HOMOGLYPH | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-23 | body | 정상 | 문자 분석 | 정상 문화행사 홍보 |
| eval-10 | comment | OFFSCREEN | display-parent | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-08 | nested-iframe | TRANSPARENT | transparent-class | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-15 | body | JAMO, TRANSPARENT | same-color | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-19 | comment | 정상 | 문자 분석 | 단속 결과의 인용 문구 |
| eval-18 | dynamic-comment | 정상 | opacity-parent | 키보드 이용 안내 |
| eval-22 | body | 정상 | display-parent | 이전 공지 접힘 영역의 예방 안내 |
| eval-13 | comment | HOMOGLYPH, JAMO | 문자 분석 | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
| eval-14 | comment | HOMOGLYPH, OFFSCREEN | left | 가입·입금 또는 유해 서비스 이용을 유도하는 합성 광고 |
