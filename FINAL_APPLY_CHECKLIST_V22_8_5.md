# V22.8.5 최종 적용 체크리스트

## 1. 적용 전

- [ ] 현재 Cloudflare Worker 코드와 Supabase 데이터를 백업
- [ ] 운영 환경변수와 Secret을 별도 보관
- [ ] PC에서 기존 계정으로 로그인 가능한지 확인
- [ ] 테스트 계정에서 `전체 메뉴 → 개인 비밀번호`를 설정

V22.8.5에는 새 SQL이 없습니다. 기존 스키마를 삭제하거나 다시 적용하지 마세요.

## 2. Worker 적용

- [ ] `src/index.js` 전체 교체 후 배포
- [ ] `/health`에서 `V22.8.5-MOBILE-ACCESS-MENU-HIERARCHY` 확인
- [ ] 캐시를 지운 뒤 PC와 모바일에서 `/my`, `/menu`, `/my/analysis` 확인
- [ ] 모바일 320·390px 및 PC 1365px 이상에서 가로 스크롤이 없는지 확인

## 3. 모바일 로그인

- [ ] 320×700에서 기존 계정 로그인 버튼이 첫 화면 안에 보이는지 확인
- [ ] PC에서 설정한 로그인 이름과 개인 비밀번호로 모바일 로그인
- [ ] 새 계정 만들기와 초대코드는 기본적으로 접혀 있는지 확인
- [ ] 잘못된 비밀번호가 새 계정을 만들지 않고 오류만 표시하는지 확인
- [ ] 기존 4자리 접속코드 사용자의 자동 보안 전환 확인

카카오 로그인이 준비되지 않은 동안에는 개인 비밀번호 로그인이 안전한 복구 경로입니다.

## 4. 카카오 로그인 설정

```text
PUBLIC_BASE_URL=https://ttokttok-accountbook.com
KAKAO_REDIRECT_URI=https://ttokttok-accountbook.com/auth/kakao/callback
KAKAO_LOGIN_ENABLED=1
KAKAO_REST_API_KEY=<같은 카카오 앱의 REST API 키>
```

- [ ] Kakao Developers Web domain에 `https://ttokttok-accountbook.com` 등록
- [ ] Redirect URI를 위 값과 글자 하나까지 동일하게 등록
- [ ] `www`, 끝 슬래시, `workers.dev`, 미리보기 주소가 섞이지 않았는지 확인
- [ ] Client Secret을 사용하는 앱이면 Worker Secret도 같은 앱 값으로 설정
- [ ] 설정이 맞기 전에는 `KAKAO_LOGIN_ENABLED=0` 유지
- [ ] 실제 모바일 카카오 로그인 후 기존 가계부로 복귀하는지 확인

`KOE006`은 Kakao Developers 등록값과 요청값이 다를 때 외부에서 반환됩니다. Worker 코드만으로 Kakao Developers 설정을 바꿀 수 없습니다.

## 5. 메뉴·UI 확인

- [ ] 전체 메뉴 상단에 `가계부 선택 → 첫 기록 → 결과 확인` 3단계 표시
- [ ] `기록 입력·최근 기록·정산·분석`만 큰 카드로 표시
- [ ] 계획·자산, 가계부 관리, 분석·자동화가 구분선 목록으로 표시
- [ ] 개인 설정과 도움말은 기본적으로 접힘
- [ ] 사이드바에서 새 그룹을 열면 이전 그룹이 닫힘
- [ ] 회색 아이콘·화살표·본문의 명암비가 충분한지 확인
- [ ] 분석 본문과 차트가 기존 V22.8.4와 동일한지 확인

## 6. 성능·회귀 확인

- [ ] 영수증 사진 선택 전 Tesseract 다운로드가 없는지 확인
- [ ] XLS/XLSX 선택 전 SheetJS 다운로드가 없는지 확인
- [ ] 홈·메뉴 첫 진입과 월 전환 응답을 운영 로그에서 확인
- [ ] 로그인, 기록 저장·수정·삭제, 정산, 예산, 백업을 테스트 계정으로 확인

```bash
bash validate_v2285.sh
```

- [ ] 모든 검증이 오류 없이 종료
- [ ] 장애 시 직전 Worker 버전으로 롤백하고 DB는 변경하지 않음
