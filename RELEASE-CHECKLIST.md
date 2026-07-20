# V22.8.12 배포 검증표

## 저장소 판정

- [x] Worker `src/index.js` 전체 교체 필요
- [x] 신규 SQL·스키마·RLS·RPC·인덱스 없음
- [x] 환경변수·Secret 변경 없음
- [x] Kakao Developers 변경 없음
- [x] OpenBuilder 변경 없음
- [x] 분석 클라이언트·렌더러 해시 유지
- [x] 영수증 OCR, 백업 적용, 로그인·계정 보안 form 유지
- [x] V22.8.11·V22.8.10 정적 자원 바이트와 ETag 유지

## 자동 검증

- [x] 시스템·라이트·다크 선택과 시스템 모드 변경 동기화
- [x] 블루·그린·바이올렛·앰버 컬러톤 저장
- [x] 홈 `SMART NOTICE` 제목·본문 대비 토큰
- [x] 분석 보조 텍스트와 inline `#8B95A1` 교정
- [x] placeholder와 모바일 활성·비활성 메뉴 대비 토큰
- [x] 새 CSS·JavaScript GET·HEAD·MIME·immutable·ETag·DB 0회
- [x] 사용자 화면에 새 CSS·JavaScript를 정확히 한 번 연결
- [x] 공개·운영·레거시 관리자·계정 감사 화면에서 새 셸 제외
- [x] `/my` DB 요청 4회 이하
- [x] `/app` DB 요청 9회 이하
- [x] 개인 홈 HTML 35KB 미만과 `no-store`
- [x] 모바일 입력 16px, 터치 44px, focus-visible, reduced-motion
- [x] 영수증 55개, 카카오 18개, 보안 43개, UX 55개, 접근성 테마 112개
- [x] 총 283개 자동 검사와 ESM `default.fetch`

## 운영 배포 전

- [ ] 현재 Worker 코드 백업
- [ ] 현재 환경변수 이름 목록 백업
- [ ] V22.8.12 체크섬 확인
- [ ] 배포 승인 확인

## 운영 적용

- [ ] 검증된 `src/index.js` 전체 교체
- [ ] SQL을 실행하지 않음
- [ ] 환경변수·Secret을 변경하지 않음
- [ ] Kakao Developers를 변경하지 않음
- [ ] OpenBuilder를 변경하지 않음

## 운영·실기기 확인

- [ ] `/health` 버전 확인
- [ ] 새 CSS·JavaScript 두 경로의 200·MIME·immutable·ETag
- [ ] 보존된 V22.8.11·V22.8.10 네 경로의 200
- [ ] 전체 메뉴에서 시스템·라이트·다크 선택
- [ ] 네 가지 컬러톤 선택과 새로고침 후 유지
- [ ] PC Chrome 홈·분석·설정·정산 화면 대비
- [ ] iPhone Safari 홈·입력·하단 메뉴·다크 모드
- [ ] Android Chrome 홈·입력·하단 메뉴·다크 모드
- [ ] 운영체제 모드 변경 시 시스템 모드 자동 전환
- [ ] 가계부 전환, 기록 저장, 정산, 분석, 예산
- [ ] 내 계정·보안과 삭제 재인증
- [ ] 영수증 OCR·취소·저장
- [ ] 카카오 1:1·그룹 응답

## 실패 시

- [ ] 직전 V22.8.11 `src/index.js`로 전체 코드 롤백
- [ ] SQL·환경변수·외부 콘솔 롤백 없음
- [ ] 캐시 문제면 V22.8.11 자원 경로 복귀 확인

미완료 항목은 실제 운영 도메인과 기기가 필요한 수동 작업이며 자동 통과로 간주하지 않습니다.
