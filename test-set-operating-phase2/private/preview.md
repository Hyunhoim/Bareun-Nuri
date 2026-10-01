# Phase 2 원고 확인

전체 1,000개는 gold.jsonl에 있으며 아래는 기법별 대표 발췌다. **정답 포함: 탐지 입력으로 제공하지 않는다.**

## 1. gambling / 광고
- 기법: HOMOGLYPH, OFFSCREEN
- 위치: link
- CSS: display:none

> CΑSΙNΟ 새창 열었습니다. 카지노 이용하실 분은 프로필 문의창으로 오세요. 충전 확인되면 바로 입장됩니다. 옛 창에 남긴 문의는 여기서 확인이 안 됩니다. 처음 오신 분과 기존 회원 모두 새 창으로 연락 부탁드립니다.

같은 작성자 뒤 문맥: (대상 안에 전체 문맥 포함)

## 2. gambling / 정상
- 기법: HOMOGLYPH, OFFSCREEN
- 위치: link
- CSS: display:none

> CΑSΙNΟ 카지노 가입 댓글이 아이 체험학습 글 밑에 달렸어요. 담당자 답변인 줄 알았습니다. 지워주세요.

같은 작성자 뒤 문맥: (대상 안에 전체 문맥 포함)

## 3. drugs / 광고
- 기법: JAMO, TRANSPARENT
- 위치: title
- CSS: color:rgb(255,255,255);background-color:rgb(255,255,255)

> ICE ㅈㅏㄱ대ㄱㅣ 판매합니다. 필로폰 찾는 분 문의 주시면 답드립니다.

같은 작성자 뒤 문맥: (대상 안에 전체 문맥 포함)

## 4. drugs / 정상
- 기법: JAMO, TRANSPARENT
- 위치: title
- CSS: color:rgb(255,255,255);background-color:rgb(255,255,255)

> ICE ㅈㅏㄱ대ㄱㅣ라는 말이 마약 광고 은어라는 교육을 들었습니다. 필로폰 예방 안내에 쓸 자료를 담당 부서에서 받을 수 있나요?

같은 작성자 뒤 문맥: (대상 안에 전체 문맥 포함)

## 5. illegal_adult / 광고
- 기법: HOMOGLYPH, JAMO
- 위치: reply
- CSS: 없음

> V1P 유출 ㅇㅕㅇㅅㅏㅇ 새 자료 올렸습니다. 당사자 동의 없이 퍼진 원본 묶음 보실 분은 입장 문의하세요.

같은 작성자 뒤 문맥: (대상 안에 전체 문맥 포함)

## 6. illegal_adult / 정상
- 기법: HOMOGLYPH, JAMO
- 위치: reply
- CSS: 없음

> V1P 유출 ㅇㅕㅇㅅㅏㅇ 자료에 제 사진이 있다는 연락을 받았습니다. 확인하려고 가입해야 하나요? 직접 보지 않고 삭제 지원부터 받고 싶습니다.

같은 작성자 뒤 문맥: (대상 안에 전체 문맥 포함)

## 7. sex_trade / 광고
- 기법: TRANSPARENT, OFFSCREEN
- 위치: body
- CSS: color:rgb(245,245,245);background-color:rgb(245,245,245); font-size:0px

> VIP 유료 성관계 예약 문의 받습니다. 이용 희망 지역 남겨주세요.

같은 작성자 뒤 문맥: (대상 안에 전체 문맥 포함)

## 8. sex_trade / 정상
- 기법: TRANSPARENT, OFFSCREEN
- 위치: body
- CSS: color:rgb(245,245,245);background-color:rgb(245,245,245); font-size:0px

> VIP 예약 문자를 거절했더니 계속 연락이 옵니다. 유료 성관계 업소라고 하는데 번호 차단 외에 신고 방법도 알고 싶어요.

같은 작성자 뒤 문맥: (대상 안에 전체 문맥 포함)

## 9. illegal_trade / 광고
- 기법: JAMO, OFFSCREEN
- 위치: reply
- CSS: position:absolute;left:-9999px;top:0;width:600px

> BANK ㄱㅖㅈㅘ 임대하실 분 연락주세요.

같은 작성자 뒤 문맥: 카드와 함께 맡기시면 매달 사용료 지급합니다.

## 10. illegal_trade / 정상
- 기법: JAMO, OFFSCREEN
- 위치: reply
- CSS: position:absolute;left:-9999px;top:0;width:600px

> BANK ㄱㅖㅈㅘ 임대라고 적힌 부업이 안전하다는데 취업 상담에서 확인받고 싶어요.

같은 작성자 뒤 문맥: 카드까지 달라는 조건이 이상합니다.
