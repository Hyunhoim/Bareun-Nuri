# Project agent instructions

## Optional coding tools

- Apply Ponytail principles to coding tasks: implement the requested scope, reuse existing code and standard facilities, and preserve necessary validation, error handling, security, and accessibility.
- Use Context7 when external library or SDK documentation is needed. Check the project's installed version first; use official documentation if Context7 lacks the required material.
- Use Graphify for substantial codebase structure, call-flow, dependency, or change-impact analysis. Check graph freshness and generate or update it when needed. Do not require a graph for trivial edits. Verify findings against source code.
- Use the connected GitHub plugin for remote repository, Issue, and PR tasks. Keep external changes within the user's requested scope; use local tools for local file and Git operations.
- Do not invoke these tools for unrelated conversation or force all four tools on every prompt.

## 오류 수정 및 성능 개선의 기준

- 특정 유형의 오류나 성능을 개선할 때는 **전체 일반화 성능 개선**을 목표로 한다. 발견된 문제 하나를 해결하는 데 그치지 않고, 같은 원인으로 실패할 수 있는 다른 문구·표현·페이지 구조에도 적용되는 개선을 우선한다.
- 발견된 사례는 공통 실패 원인을 찾는 단서로 사용한다. 특정 문구, case_id, URL 또는 정답 라벨을 맞추기 위한 하드코딩이나 평가 사례 전용 예외 처리를 추가하지 않는다.
- 수정 전에 관측된 사실과 원인 가설을 구분한다. 전처리·수집·모델 판정·결과 통합 중 어느 단계가 문제인지 확인하고, 가능한 한 한 번에 하나의 개선 요인을 비교하여 효과를 구분한다.
- 변경에 적합한 검증 범위에서 해당 유형의 누락 감소뿐 아니라 정상 사례의 오탐, 기존에 탐지하던 사례의 성능, 다른 유형에 대한 회귀, 지연 및 호출·토큰·비용의 변화도 함께 확인한다. 한 사례의 정답 여부만으로 개선을 판단하지 않는다.
- 개선에 사용한 사례와 최종 평가 자료를 구분한다. 이미 오류를 분석하거나 수정에 사용한 평가 세트의 재측정은 확인·회귀 검사로 보고하며, 새로운 홀드아웃 검증으로 취급하지 않는다. 정답 라벨을 탐지 입력이나 판정 로직에 유출하지 않는다.
- 결과 보고에서는 **해당 사례의 해결 여부**, **기존 성능의 회귀 여부**, **별도 평가에서 확인한 일반화 성능**, **지연·비용 변화**를 구분한다. 별도 평가가 없거나 표본이 부족하면 일반화 성능이 개선됐다고 확정하지 않고 미검증 범위를 명시한다.
- 자모 처리 등의 전처리도 특정 광고 문장의 복원이 아니라 다양한 표현의 안정적인 해석과 정상 문구의 보존을 기준으로 설계한다. 복원 성공 자체를 불법광고 판정으로 간주하지 않는다.
