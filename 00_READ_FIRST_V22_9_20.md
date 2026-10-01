# V22.9.20 전체 교체 순서

배포 파일은 `src/index.js` 전체입니다. 현재 Cloudflare Worker와 기존 계정·가계부 DB를
그대로 사용합니다. 신규 SQL과 신규 Secret은 필요하지 않습니다.

## 2026-10-01 운영 적용 기록

새 도메인 구매와 기존 Worker의 전체 교체, 공개 주소·콜백·브랜드·문의 설정 전환을
완료했습니다. 새 도메인에서 기존 카카오 계정과 가계부 조회를 확인한 뒤 GET 이동을
활성화했습니다. OpenBuilder 채널 봇 v1.7과 그룹 봇 v2.0에 새 URL을 배포했습니다.
문의 주소는 `admin@malhaebook.com`이며 수신 주소의 인증을 확인했습니다.

Search Console DNS 인증과 사이트맵 처리를 완료했습니다. AdSense는 기존 게시자
`ca-pub-3546469870344416`으로 사이트 소유권을 인증했으며 승인 전 광고 실행은 꺼져 있습니다.
비즈니스 채널 표시 이름은 카카오 관리 화면의 제한으로 기존 이름을 유지합니다.
상세 상태와 미실행 항목은 `VERIFICATION_V22_9_20.md`, `RELEASE-CHECKLIST.md`를 확인합니다.
아래 절차는 재적용과 복구할 때 사용할 기준입니다.

## 적용 전

1. 저장소 루트에서 `node .codex/scripts/verify-repository.mjs`가 통과하는지 확인합니다.
   교체용 묶음에서는 `Verify-Package.ps1`로 전달된 파일의 체크섬을 확인합니다.
   전체 회귀 검사 하네스는 저장소에서 실행합니다.
2. 현재 운영 Worker 소스와 환경변수 설정을 안전한 위치에 백업하고 되돌릴 배포 버전을 기록합니다.
3. 기존 Worker에 `malhaebook.com` 커스텀 도메인을 추가합니다. 옛 도메인은 계속 연결해 둡니다.
4. Kakao Developers에 `https://malhaebook.com` 사이트 도메인과
   `https://malhaebook.com/auth/kakao/callback` Redirect URI를 먼저 추가합니다.
   전환 확인 전에는 기존 콜백을 제거하지 않습니다.

## 전체 교체와 설정

Worker의 전체 소스를 검증된 `src/index.js`로 교체하고 다음 변수를 함께 적용합니다.

```text
PUBLIC_BASE_URL=https://malhaebook.com
KAKAO_REDIRECT_URI=https://malhaebook.com/auth/kakao/callback
APP_NAME=말해가계부
PUBLIC_SUPPORT_EMAIL=admin@malhaebook.com
ADSENSE_PUBLISHER_ID=ca-pub-3546469870344416
```

`APP_NAME`을 명시하면 옛 `BRAND_NAME` 값이 새 이름을 덮어쓰지 않습니다.
기존 Secret, 로그인 활성화 값, DB 연결, 바인딩, 런타임 호환 날짜는 유지합니다.
로그인 점검 전에는 `CANONICAL_REDIRECT`를 켜지 않습니다.

새 도메인에서 아래 점검을 통과하고 카카오 로그인 왕복까지 확인한 뒤
`CANONICAL_REDIRECT=1`을 적용합니다.

```powershell
node tools/verify-deployment-v22920.mjs
node tools/verify-deployment-v22920.mjs --legacy-origin https://ttokttok-accountbook.com
```

두 번째 명령은 옛 GET 링크의 308 이동과 `/health` 예외를 확인합니다.
기존 구현은 POST를 리디렉션하지 않으므로 옛 OpenBuilder `/skill` 호출도 처리합니다.
모든 요청을 일괄 이동하는 Cloudflare 301 규칙을 추가하면 카카오 POST가 끊길 수 있습니다.

## 외부 서비스와 사용자 확인

- OpenBuilder 스킬 URL을 `https://malhaebook.com/skill`로 바꾸고 테스트한 뒤 봇에 반영합니다.
- Kakao Developers 앱 이름, OpenBuilder 봇 이름, 카카오톡 채널 표시 이름을 말해가계부로 바꿉니다.
- 새 도메인은 옛 도메인의 로그인 쿠키를 공유하지 않으므로 기존 계정으로 다시 로그인합니다.
- 로컬 계정·카카오 로그인, 기존 가계부 선택, 기록·조회·수정, 카드사 파일 미리보기를 확인합니다.
- AdSense와 Search Console에 새 사이트를 등록하고 실제 인증·심사 상태를 확인합니다.
  소스의 광고 식별자는 그대로 유지하며 등록·승인을 완료했다고 간주하지 않습니다.
- 옛 도메인 유지 기간은 최소 1년을 계획하며 운영 등록 상태를 별도로 관리합니다.

## 되돌리기

문제가 생기면 기존 Worker 배포 버전과 백업한 공개 주소·콜백·브랜드 변수를 함께 복원합니다.
옛 도메인과 콜백은 전환 확인 전까지 유지하므로 기존 주소로 로그인을 재개할 수 있습니다.
새 도메인에서 만든 계정도 같은 DB를 사용하므로 DB를 되돌리거나 데이터를 지우지 않습니다.

운영 적용 결과와 실기기 확인은 `RELEASE-CHECKLIST.md`에 기록합니다.

Cloudflare CLI로 배포할 때는 운영 바인딩을 먼저 가져와 검토하고, 대시보드 변수를
유지하는 `--keep-vars` 동작을 확인합니다. 저장소에는 운영 Worker 설정이 없으므로
새 설정 파일이나 임의 Worker 이름으로 바로 배포하지 않습니다.
[Cloudflare 배포 명령 문서](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
