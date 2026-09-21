# 브랜치 작업 규칙

모든 개발 브랜치는 동일한 웹 실행 기준선에서 출발합니다. Frontend는 frontend/, Backend는 backend/, Agent_core는 agent/, Test_set은 local-benchmark/를 담당합니다. main은 실험·평가·개발 도구를 제외한 최소 실행 트리를 유지합니다.

브랜치 간 이동으로 실행 중 파일이 바뀌지 않도록 별도 worktree를 권장합니다. 다른 폴더에서 checkout한 테스트 사이트는 HTTP URL로 Agent와 연결하고 정답 파일은 채점 단계에서만 읽습니다.

```powershell
git fetch origin
# 원하는 작업 하나에 해당하는 명령만 실행
git worktree add ../spam-ad-frontend Frontend
git worktree add ../spam-ad-backend Backend
git worktree add ../spam-ad-agent Agent_core
git worktree add ../spam-ad-test Test_set
```

역할별 실행 코드 변경과 실험/문서 변경을 별도 커밋으로 만드세요. main에는 검증된 실행 코드 커밋만 cherry-pick하거나, 허용된 실행 경로만 포함한 통합 커밋을 만듭니다. 개발 브랜치 전체를 main에 무조건 병합하면 테스트 정답이나 실험 코드까지 들어갈 수 있습니다. 공통 실행 기준선은 main에서 개발 브랜치로 병합하여 동기화합니다.

기존 eval은 이미 오류 분석과 재측정에 사용된 자료입니다. 새 홀드아웃으로 보고하지 않습니다. 새 평가 자료는 개발용 자료와 분리하고, 별도 고정·검증 전에는 일반화 개선을 확정하지 않습니다. 키, .env, 실행 로그, outputs/, artifacts/, .runtime/, .tools/, node_modules/, 빌드 산출물은 올리지 않습니다.
