# V22.7.3 WebView CSRF·사용자 메뉴 핫픽스

## 확인된 원인

기존 CSRF 검사는 `Sec-Fetch-Site`, `Origin`, `Referer` 중 하나라도 현재 도메인과 다르면 요청을 거부했습니다. 카카오 인앱 브라우저와 일부 WebView는 OAuth 복귀 뒤 `Origin: null`, `android-app://...` 또는 카카오 로그인 주소 Referer를 남길 수 있어, 같은 가계부 화면에서 보낸 기록 수정·삭제까지 403으로 오판했습니다.

일반 사용자 메뉴에는 관리자용 `/settings` 링크도 섞여 있어, 사용자 기능을 누른 뒤 전역 관리자 비밀번호 화면이 나타날 가능성이 있었습니다.

## 반영 내용

- 실제 HTTP(S) 외부 Origin과 `Sec-Fetch-Site: cross-site`는 계속 차단
- 같은 Origin 또는 same-origin/same-site Fetch Metadata는 정상 처리
- Fetch Metadata가 없는 구형 WebView의 opaque 출처는 로그인 세션이 있을 때만 허용
- `Origin: null` + 카카오 OAuth Referer는 로그인 세션이 있을 때만 허용
- 외부 일반 HTTP Referer는 세션이 있어도 계속 차단
- 사용자 메뉴의 전환·참여·설정·비밀번호 경로를 `/my/*`로 통일
- 사용자 세션으로 `/settings` 진입 시 개인 비밀번호 화면으로 복구
- CSRF 차단 신호를 값 없이 `same/different/opaque/missing`으로 운영 로그에 남김

## 배포 후 실사용 확인

1. `/health`에서 `V22.7.3-WEBVIEW-CSRF-USER-NAV-HOTFIX` 확인
2. 카카오 로그인 후 전체 메뉴 → 가계부 전환·추가 진입
3. 기록 목록 → 수정·삭제 열기 → 지출자 포함 수정 저장
4. 새 가계부 생성 또는 초대코드 참여 POST 확인
5. 개인 비밀번호 메뉴 진입 후 저장·복귀 확인
6. 외부 Origin을 사용한 POST가 403으로 차단되는지 보안 테스트

DB 마이그레이션은 없습니다. 배포 직후 기존 탭은 새로고침해야 새 화면과 판정 기준이 적용됩니다.
