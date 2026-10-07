# 말해가계부 V22.9.27 적용 안내

로그인 전 `/my`를 가상 기능 미리보기 중심으로 바꿨습니다. 대화 기록, 구조화된 거래, 예산, 월간 리포트, 공동 정산을 먼저 보여 주고 기존 계정 로그인은 인증 영역의 주 동선, 새 계정 만들기는 보조 단계로 유지합니다.

1. 부모 작업에서 `node .codex/scripts/verify-repository.mjs`로 신규 체크섬 매니페스트와 전체 회귀 검사를 확인합니다.
2. `npm run validate:prelogin-preview`, `npm run validate:ux-principles`, `npm run validate:performance`, `npm run validate:kakao-group`, `npm run validate:household-security`, `npm run validate:adsense-v2`를 관련 집중 검사로 사용합니다.
3. 최종 검증 뒤 `src/index.js` 전체를 앱 Worker에 교체합니다. 관제 Worker, SQL, 환경변수, Secret, 바인딩, Cron, 도메인, 불변 자산 주소 변경은 없습니다.
4. 배포 후 `/health`의 `version`이 `V22.9.27-PRELOGIN-PREVIEW`인지, `/ready`가 정상인지, 운영 소스와 기존 설정이 보존됐는지 확인합니다. 추가 공개 기준 수는 부모 작업의 별도 확인 전에는 완료로 기록하지 않습니다.
5. 카카오톡에서 Help와 메뉴에 URL이 없는지, `웹 가계부 열기`와 기존 `링크`·`홈페이지`·`웹` 같은 명시적 웹 명령이 모두 실제 `/my` 주소 하나만 주는지, 그룹 응답에 QuickReplies가 없는지 확인합니다.
6. OpenBuilder PARTIAL v2.3은 2026-10-07 09:04 KST에 Help 블록과 봇 입장 블록 2개만 배포했습니다. 엔티티·스킬은 제외했고 첫 입장 Help와 기본 `챗봇 멘션하기` 플러그인, URL 없는 Help, 대표 명령어 13개의 `웹 가계부 열기`를 확인했습니다. 채널 홈 홍보는 남은 외부 수동 항목입니다.
7. 운영 수동 `accountbook_apply_recurring_v227`의 29~31일 SQL 복원은 이번 범위에서 하지 않습니다. 기존 쓰기 없는 차단을 유지합니다.

PARTIAL v2.3 이전의 v2.2는 2026-10-06 22:42 KST부터 이미 운영 중이었으며 이번 작업의 배포가 아닙니다. V22.9.26은 2026-10-07 07:53:17 KST에 버전 `599061e5-892f-4974-b1b5-2e7dc7f45932`, 배포 `c48ece5b-d8e6-4a05-83ca-e9d374bc40bd`로 100% 운영 적용했습니다. 배포 전 전체 소스 SHA-256은 `2312d8943e772df8bb71237c801487b601aa73a687b750cfd6cedbf74dccfeaa`와 일치했고 `/health` 200·V22.9.26·alive=true·missing=0, `/ready` 200·true, 바인딩과 런타임 설정의 깊은 일치를 확인했습니다. 직전 롤백 배포는 `5a0c7faa-a9a3-4b3f-9373-5b565e3d2bc7`입니다.

세부 검증과 남은 수동 항목은 `VERIFICATION_V22_9_27.md`, `RELEASE-CHECKLIST.md`, `DEPLOYMENT_MATRIX.md`를 따릅니다.
