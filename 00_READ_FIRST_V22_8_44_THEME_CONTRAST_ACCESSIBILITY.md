# V22.8.44 테마 대비·접근성 적용 안내

## 적용 파일

- Cloudflare Worker의 `src/index.js`를 ZIP의 파일 전체로 교체합니다.
- 부분 복사·부분 병합은 하지 않습니다.

## SQL과 외부 설정

- 신규 SQL: 없음
- 기존 SQL: 운영 `/ready`가 정상이라면 재실행하지 않음
- 환경변수·Secret: 변경 없음
- Kakao Developers·OpenBuilder: 변경 없음

## 개선 내용

- 라이트 페이지·카드·raised 표면의 보조 텍스트 대비를 최소 4.92:1로 보정
- 라이트·다크와 블루·그린·바이올렛·앰버 강조색 조합을 4.5:1 이상으로 보호
- 모바일 전체 메뉴 버튼을 44×44px 이상으로 보장
- 고대비 선호, Windows 강제 색상, 동작 줄이기 환경 대응
- 변경된 공통 셸을 `/assets/accountbook-shell-v22844.css` 새 immutable 경로로 제공
- V22.8.43 정산·목표 데이터 보존과 기존 URL·API·권한 계약 유지
- 사용자 화면·홈 버튼·테마·성능 144개, 전체 자동검사 872개

## 적용 순서

1. 현재 운영 V22.8.43 Worker 소스 전체를 백업합니다.
2. ZIP의 `src/index.js` 전체를 Cloudflare Worker에 붙여넣습니다.
3. 저장·배포합니다.
4. `10_VERIFY_AFTER_DEPLOY_V22_8_44.ps1`을 실행합니다.
5. `11_THEME_CONTRAST_SMOKE_GUIDE_V22_8_44.md`의 화면 확인을 진행합니다.

## 완료 기준

- `/health`: HTTP 200, `V22.8.44-THEME-CONTRAST-ACCESSIBILITY`
- `/ready`: HTTP 200, `ready:true`, 빈 `failed_tables`, 빈 `missing_rpcs`
- `/assets/accountbook-shell-v22844.css`: CSS MIME, immutable, 새 ETag
- 390px·768px·1024px·1440px에서 가로 넘침 없음
- 라이트·다크와 네 컬러톤에서 보조 텍스트·메뉴·입력 안내가 읽힘

문제가 있으면 배포 전에 백업한 V22.8.43 Worker 소스로 전체 롤백합니다. DB SQL은 되돌리거나 재실행하지 않습니다.
