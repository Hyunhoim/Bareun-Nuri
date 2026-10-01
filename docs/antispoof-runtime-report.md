# typed 실험 런타임 검증 및 운영조건 비교 시작

2026-09-30. `.runtime/antispoof-typed-runtime-v1/`에가중치/토크나이저/Unicode표/typed입력서비스를별도패키징했다. 기존추론서비스의evidence함수만동결실험구현으로교체하고자산checksum검증·CPU8threads/8묶음/512길이보호/JSONL프로토콜을유지했다. 기존브리지알고리즘은Module격리로재사용하며경로/버전만정확히1곳씩교체했는지검사한다. 운영파일수정0.

실제패키지CPU216예측은실험예측과완전히일치,양성대상추론·저장재개무재호출·서명변경거부통과. 실제worker+통제HCX응답+통제수집의양쪽smoke도통과했다. 정상대상에는AntiSpoof호출이없고양성의실제예측2개가저장됐음을검사했다. 단지완료status만검사하지않는다.

초기실행기는stdin.end로부모연결을닫아worker가모델을취소했다. 모델버전만저장된빈결과를초기검사가허용한문제를확인하고,stdin.write연결유지와예측개수/보호상태/프로세스실패진단검사를추가했다. 기존취소기록은보존했다. timeout360초smoke는25분검증대체가아니며짧은종단연결검사다. 최종smoke `.runtime/antispoof-smoke-1790709089718/`,worker검증서에실행기hash저장. 그hash와일치해야--live를허용한다.

`docs/antispoof-live-plan.md`에따라운영→typed실제worker/HCX25분비교를시작했다. 기존복제본닫힌20페이지/1500초/600호출상한/12묶음/58kTPM/FIFO/SRPT8이다. 시작시61초한도대기후API호출하며재시도용으로실행을중복시작하지않는다. 실행기로그/worker체크포인트의실제상태를확인해야하고이문서는완료증거가아니다. 자연탐색/독립평가로보고하지않는다. 결과는초기25분과마감유예/재개를구분해분석한다. Goal active.

진행중인 실행은 `.runtime/antispoof-live-1790709109240/`, exec session46314다. 평가 도구 `local-benchmark/antispoof-live-evaluate.cjs`를 준비하고 미판정FN/미라벨제외/1500초 이전 commit경계 selftest를 통과했다. 실행 완료 전 물질화/평가하지 않는다. 호출 `node local-benchmark/antispoof-live-evaluate.cjs .runtime/antispoof-live-1790709109240`.

HCX 변동 분리를 위해 `local-benchmark/antispoof-live-replay.cjs`도 준비했다(문법검사만통과,아직미실행). 양쪽실행완료를확인해야실행되며각각의저장HCX양성작업을두CPU모델에재생한다. API0이고 live속도측정과분리하며부분결과를덮어쓰거나자동재실행하지않는다. 새최종이나실제25분결과를대체하지않는다.
