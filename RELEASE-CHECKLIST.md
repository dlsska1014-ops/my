# V22.8.11 배포 검증표

## 저장소 판정

- [x] Worker `src/index.js` 전체 교체 필요
- [x] 신규 SQL·스키마·RLS·RPC·인덱스 없음
- [x] 환경변수·Secret 변경 없음
- [x] Kakao Developers 변경 없음
- [x] OpenBuilder 변경 없음
- [x] 분석 클라이언트·렌더러 해시 유지
- [x] 영수증 OCR, 백업 적용, 로그인·계정 보안 form 유지
- [x] V22.8.10 기본 CSS·JavaScript 바이트와 ETag 유지

## 자동 검증

- [x] `/my` DB 요청 4회 이하
- [x] `/app` DB 요청 9회 이하
- [x] 개인 홈 HTML 35KB 미만
- [x] 개인 HTML `no-store`
- [x] 새 CSS·JavaScript GET·HEAD·MIME·immutable·ETag·DB 0회
- [x] 홈은 기본 CSS + 새 셸 CSS + 새 셸 JavaScript 한 건
- [x] 주요 사용자 화면은 새 CSS를 마지막 cascade로 정확히 한 번 연결
- [x] 공개·운영·레거시 관리자·관리자 가계부·계정 감사 화면은 새 사용자 셸에서 제외
- [x] PC 통합 내비게이션 폭과 본문 offset을 238px로 일치시키고 접힌 상태 유지
- [x] 흰 글자 일반 form 동작은 대비가 확보된 `#2563eb` action token 사용
- [x] V22.8.10 CSS·JavaScript 바이트 해시 고정
- [x] 모든 정적 자원의 GET·HEAD 각각 DB 0회
- [x] 중간 개발 자원 경로 미제공
- [x] active alias와 월·가계부 문맥 보존
- [x] 모바일 입력 16px, 터치 44px, focus-visible, reduced-motion
- [x] 영수증 55개, 카카오 18개, 보안 43개, UX 55개, 홈 UX 셸 94개
- [x] 총 265개 자동 검사와 ESM `default.fetch`
- [x] 31개 V22.8.11 배포 파일 체크섬

## 운영 배포 전

- [ ] 현재 Worker 코드 백업
- [ ] 현재 환경변수 이름 목록 백업
- [ ] V22.8.11 체크섬 확인
- [ ] 배포 승인 확인

## 운영 적용

- [ ] 검증된 `src/index.js` 전체 교체
- [ ] SQL을 실행하지 않음
- [ ] 환경변수·Secret을 변경하지 않음
- [ ] Kakao Developers를 변경하지 않음
- [ ] OpenBuilder를 변경하지 않음

## 운영·실기기 확인

- [ ] `/health` 버전 확인
- [ ] PC Chrome `/my → /app`, 238px 사이드바, 주요 메뉴
- [ ] iPhone Safari 로그인·홈·입력·하단 메뉴
- [ ] Android Chrome 로그인·홈·입력·하단 메뉴
- [ ] `/assets/accountbook-shell-v22811.css` 200·CSS MIME·캐시
- [ ] `/assets/mobile-home-shell-v22811.js` 200·JavaScript MIME·캐시
- [ ] V22.8.10 기본 CSS·JavaScript 두 경로 200
- [ ] 가계부 전환, 기록 저장, 정산, 분석, 예산
- [ ] 내 계정·보안과 삭제 재인증
- [ ] 영수증 OCR·취소·저장
- [ ] 카카오 1:1·그룹 응답

## 실패 시

- [ ] 직전 V22.8.10 `src/index.js`로 전체 코드 롤백
- [ ] SQL·환경변수·외부 콘솔 롤백 없음
- [ ] 캐시 문제면 V22.8.10 코드 경로 복귀 확인

미완료 항목은 실제 운영 도메인과 기기가 필요한 수동 작업이며 자동 통과로 간주하지 않습니다.
