# V22.9.30 검증 기록

Node.js v22.23.1에서 합성 메모리 DB만 사용했습니다. 실제 금융 데이터나 운영 계정은 생성하지 않았습니다.

## 신규 동적 회귀

| 검사 | 확인 내용 | 결과 |
|---|---|---|
| audit-corrections | 금액·종류·직렬화·날짜·본문, 목적별 증명, 실제 OAuth 라우터와 자격 변경, 보안 버전, IP admission, 실제 홈·카카오·분석 렌더러 | 378개 통과 |
| startup-budget | 최초 1·3·25건, warm 재전송, 같은 문장 2건, 무인증 신규 생성 거부, 수집한 NLU background 완료 | 40개 통과 |
| import-cron | 원화·취소·연도·120건 원자적 가져오기, 정기 수정, 1,001 가계부 cursor, blocked 보류, July→August 원래 날짜 유지 | 477개 통과 |

최초 입력 1·3·25건은 외부 Supabase 호출을 50회에서 실제로 거절하는 모사에서 각각 총 47·46·47회로 처리했습니다. 25건 검사에서는 NLU aggregate와 failure-sample 설정을 켜고 `ctx.waitUntil`에 전달한 작업을 수집하여 완료까지 기다렸습니다. 실제 엣지 CPU·카카오 5초 응답 또는 운영 네트워크 지연의 증명은 아닙니다.

기존 직렬 깊이 보호는 홈 8회/3단계, 카카오 기록 cold/warm 12회/6단계를 유지했습니다. 기존 보안·수정·그룹·개인 첫 기록·가져오기·성능·AdSense·UX 검사를 보존했습니다. 새 자산 주소에 대해 바이트 pin을 갱신했고 이전 자산의 pin은 유지했습니다. 분석의 기존 구조 pin은 예산 범위·KST 보정 후 갱신했으며 실제 렌더러의 예산 숫자를 새 회귀로 확인했습니다.

SQLite 관제 통합 검사는 Node.js v22.23.1에서 별도로 45개 통과했습니다. SQLite 실험 기능 안내는 런타임이 출력하는 경고이며 운영 PostgreSQL 검증과 구분합니다. GitHub의 Node 22 Ubuntu·Windows CI에서도 전체 하네스와 SQLite 통합 검사가 통과했습니다. 아래 GitHub 기록과 운영 미확인 항목을 구분합니다.

historical manifest를 고치지 않고 V22.9.30의 완전한 manifest를 생성했습니다. 최종 전체 결과는 아래 기록을 따릅니다.

## 독립 검토 후 보완

단위가 붙은 명사의 잘못된 금액 분할과 기존 수입 어휘, 통화 열·외화 fallback, 실제 서버 날짜 문법, quick-input의 stale AUTO값·invalid 날짜·수동 수정·submit/POST 거부와 실제 예산 범위를 직접 검증했습니다. 첫 가계부20개 항목과 월말 report3개, unknown 결과·최초 preference 읽기 장애는 다음날에도 원래 범위로 이어 처리했습니다. launch-hardening52개는 인증 snapshot 장애와 business 장애를 구분하며 HTTP500 catch·303 fail-closed·0write를 함께 보호합니다.

root가 별도로 실행한 합성 Chrome UIUX 감사는 동결한 `ae7e4671…c948300` 소스에서 320개 통과했습니다. 독립 검토는 후속 서버 결함 8개와 실제 IIFE 결함 3개의 보완을 확인했으며, 독립 verifier의 38개 검증도 통과했습니다. 실기기/OAuth 완료로 확대하지 않습니다.

최종 보완에서는 `3일 전/후`를 월의 일자보다 먼저 해석하고 `2주 전/후`를 동일한 공유 문법으로 처리했습니다. 고정된 2026-07-15 시각에서 helper·실제 서버·배포 IIFE·`/skill` 저장 날짜를 확인했습니다. 공유 입력 검사는 일부 함수만 자르지 않고 실제 IIFE의 전체 의존 함수를 실행하며 기존 44개 단언을 유지했습니다.

현재 검증 대상 source SHA-256은 `d2b31eeef01167fa0ab25f660b0cc91437d6630ac1f98177f6e8a725a49c2a6c`입니다. 위 Chrome320·독립38은 상대 날짜 helper의 마지막 보완 전 소스에 관한 증거이며, 마지막 보완의 회귀378개와 구분합니다.

## 수동 확인

- 실제 신규 가입/로그인의 오류 문구·상태와 Cloudflare Exceeded CPU, PBKDF2 상한, 현재 플랜.
- 카카오 신규 사용자, 1:1·그룹 payload, OAuth 동일 계정/다른 계정 및 카카오 인앱에서 외부 브라우저 안내.
- iOS·Android·접근성, 오래된 인앱 브라우저의 CSRF 신호.
- 정기 SQL 함수 적용·정의/ACL 대조, 배포 후 전체 소스 해시와 100% 트래픽.
- 실제 backup/export/off-site/restore drill, 기존 legacy-only 계정 수와 복구.
- 현재 Cron 빈도와 cursor 소진 지연. DB 직접 writer 또는 임대 만료 이후 이미 시작한 commit까지 완전히 fence하는 보장은 하지 않습니다.

## 최종 저장소 검증

2026-10-08 KST에 Node.js v22.23.1에서 `node .codex/scripts/verify-repository.mjs`가 종료 코드 0으로 끝났습니다. 자동 검사 7,079개, 배포 체크섬 195개, ESM `default.fetch`, 작업 트리와 스테이징 공백 검사 모두 통과했습니다. 검사 하한도 실측 7,079개로 올렸습니다.

최종 `src/index.js` SHA-256은 `d2b31eeef01167fa0ab25f660b0cc91437d6630ac1f98177f6e8a725a49c2a6c`입니다. 같은 소스의 합성 Chrome UIUX 감사 320개도 종료 코드 0으로 통과했습니다. 운영 금융 데이터·실제 가입·OAuth·실기기·배포를 수행했다는 뜻은 아닙니다. SQLite45는 위에 기록한 별도 Node.js v22.23.1 검사입니다.

독립 검토에서 보완을 확인한 상대 날짜와 공유 입력 의존성은 실제 저장 경로와 전체 IIFE 회귀를 유지합니다. 최종 독립 재검토의 감사378·공유44·추가 날짜92개도 통과했으며 마지막 두 항목에서 추가 조치가 필요한 문제를 찾지 못했습니다.

## GitHub 통합 기록

구현 커밋 `e71c2a360861076c919f414aa7d0d20baa5d4829`를 `codex/v22930-claude-audit-fixes`에 push했고, [PR #54](https://github.com/dlsska1014-ops/my/pull/54)를 main에 병합했습니다. 구현 병합 커밋은 `cc628d7fe8ba906c3423715b13a53f4b0a46a741`입니다. 커밋된 배포 파일195개와 검증한 작업본의 바이트 일치를 확인했습니다.

[브랜치 CI](https://github.com/dlsska1014-ops/my/actions/runs/37700736878)와 [PR CI](https://github.com/dlsska1014-ops/my/actions/runs/37700983722)의 Ubuntu·Windows 네 작업이 모두 통과했습니다. 각 작업에는 전체7,079개와 SQLite45가 포함됩니다. 이 GitHub 통합은 Worker·SQL·외부 설정의 운영 적용을 포함하지 않습니다. 최종 기록 문서의 커밋과 원격 일치는 Git 로그에서 별도로 확인합니다.
