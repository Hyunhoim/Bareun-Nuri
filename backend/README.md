# Backend

Java 21 + Spring Boot 3.5입니다. localhost REST API에서 작업 시작/일시 중지/재개/취소, 결과와 검사 이력, 마스킹된 OpenAI API 키 관리를 제공합니다. `scripts/env-key.cjs`가 키 파일을 갱신하므로 함께 배포합니다.

루트 `start.cmd` 또는 `scripts/run.ps1`로 빌드·실행합니다. 기본 포트는 8766이고 EXE는 빈 로컬 포트를 선택합니다. 제출 설정을 서버에서 제한하며 프론트에서 판정 설정을 변경하지 않습니다. 키와 검사 데이터는 Git에서 제외합니다.
