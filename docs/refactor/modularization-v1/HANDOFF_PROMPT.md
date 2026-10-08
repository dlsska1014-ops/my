# Opus 5.5 (max) 구현 세션 시작 프롬프트

아래 블록을 새 세션의 첫 메시지로 붙여 넣는다. 세션 시작 전 `/model`에서 Opus 5.5, effort max를 고른다. 결정이 필요한 항목은 `PLAN.md` 10장에 추천으로 확정돼 있으므로 구현 세션은 묻지 않고 따른다.

```text
말해가계부 Worker 모듈 분리 작업의 Phase 0과 Phase 1을 수행해 주세요. 추론 강도는 High로 진행합니다.

먼저 읽을 것: AGENTS.md, VERSION.txt, BASELINE.md, KNOWN-ISSUES.md, 그리고
docs/refactor/modularization-v1/PLAN.md (특히 2장 제약, 3장 구조, 6장 Phase 0·1, 7장 T1, 10장 확정 결정).
10장의 결정은 이미 확정된 것이니 다시 묻지 말고 따르세요.

목표
1. Phase 0: docs/refactor/modularization-v1/scripts/build-worker.mjs 와 split-worker.mjs 를 tools/ 로 복사하고,
   validation/validate-build-identity-v22932.mjs 를 추가해 .codex/scripts/verify-repository.mjs 목록과
   EXPECTED_MINIMUM_CHECKS 에 반영합니다. package.json 에 "build:worker": "node tools/build-worker.mjs",
   "validate:build-identity" 를 추가합니다. 검사는 src/modules/MANIFEST.txt 가 있으면 재조립 SHA-256 을
   src/index.js 와 비교하고, 모든 src/modules/**/*.js 가 manifest 에 정확히 한 번 있는지, 모듈이 LF 이고
   줄바꿈 하나로 끝나는지 확인합니다. manifest 가 없으면 같은 개수의 검사를 통과 처리합니다.
2. Phase 1: node tools/split-worker.mjs --manifest docs/refactor/modularization-v1/split-manifest.txt 로
   src/modules/ 108개와 MANIFEST.txt 를 만듭니다. src/index.js 는 1바이트도 바뀌면 안 됩니다
   (SHA-256 bbcd1756a622e4892c2811644c503fb28f2091aac19cbf89f0261daeac6d4c15). 바뀌면 중단하고 보고하세요.
3. AGENTS.md 의 "저장소 구조"와 "변경 원칙"에 소스는 src/modules/, src/index.js 는 npm run build:worker 가
   만드는 생성 파일이며 직접 수정하지 않는다는 규칙을 추가합니다. 그 외 문서는 바꾸지 않습니다.

제약
- src/index.js 의 내용, 라우트, API, Supabase 스키마·RPC, 권한, 카카오 응답, 환경변수, 배포 설정은 변경하지 않습니다.
- 번들러·minify·트랜스파일을 도입하지 않습니다. 새 파일 확장자는 .mjs/.js/.txt/.md 만 씁니다(LF).
- 커밋·푸시·배포·SQL·외부 콘솔 변경은 제 승인 뒤에만 합니다. 브랜치 이름은 codex/v22932-modular-source 를 제안하되 만들기 전에 물어보세요.

검증
- node tools/build-worker.mjs --check 가 동일을 보고하는지
- npm run validate:build-identity, 그리고 마지막에 node .codex/scripts/verify-repository.mjs 전체 (검사 8,000개 이상,
  체크섬 199개, ESM default.fetch, git diff --check)
- 실제 검사 개수·체크섬 개수·src/index.js SHA-256 을 보고에 적으세요.

보고 형식은 AGENTS.md 완료 기준을 따르고, 못 한 항목과 남은 위험을 숨기지 마세요.
```

## 다음 세션용 요약 프롬프트

- Phase 6(배포 자동화, High): "PLAN.md 8.3의 A안대로 `tools/deploy-worker-version.mjs`를 구현하세요. Versions API에 현재 바인딩 전부를 inherit(strict)로 넘겨 업로드하고, 저장된 버전의 바인딩·compat 설정을 현재 배포와 대조한 뒤에만 `--promote`로 Deployments API 100% 승격을 합니다. 토큰은 환경변수에서만 읽고, 이번 세션에서는 `--dry-run`과 대조 로직 검증까지만 하며 실제 API 호출은 하지 않습니다."
- Phase 2(긴 줄 정리, High): "`src/modules/assets/historical-runtime-assets.js`의 객체 리터럴을 항목마다 줄바꿈하고, 생성 파일 안내는 `src/modules/runtime/global-state.js`의 1~29행 머리 주석 블록 안에 한 줄로 넣으세요. `scripts/analyze-worker-structure.mjs`로 문자열 값과 최상위 문장 수가 동일함을 증명하고 자산 바이트 검사와 전체 하네스를 통과해야 합니다. 판은 V22.9.32-MODULAR-SOURCE 로 올리고 VERSION.txt·package.json·APP_VERSION·CHANGELOG·DEPLOYMENT_MATRIX·새 체크섬 manifest를 갱신하되 배포는 하지 않습니다."
- Phase 3(import/export 명시, High): "`tools/vendor/acorn.mjs`를 벤더링(판·SHA-256 기록)하고, module-edges.txt·module-members.txt로 각 모듈에 마커 블록을 생성하는 `tools/annotate-modules.mjs`(`--strip` 포함)를 만드세요. 빌드 결과가 바이트 동일함, 모듈별 `node --check`(T2), T7 자체 완결, T8 초기화 순서 검사를 추가해 통과시키세요."
- Phase 4(재배치, Extra High): 반드시 T3·T4·T5·T6 추가 후, PLAN 4.3·4.6 순서대로 한 묶음씩.
