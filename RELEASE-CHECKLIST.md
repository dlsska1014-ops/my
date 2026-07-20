# V22.8.10 배포 검증표

## 변경 영향 판정

- [x] 누적 기준본: V22.8.9 계정·가계부 보안 분리본
- [x] Worker `src/index.js` 전체 교체 필요
- [x] 신규 SQL 없음
- [x] 기존 SQL 재실행 불필요
- [x] 환경변수·Secret 변경 없음
- [x] Kakao Developers 변경 없음
- [x] OpenBuilder 변경 없음
- [x] 분석 클라이언트·렌더러 해시 변경 없음
- [x] 영수증 구현 변경 없음
- [x] 코드 롤백 대상: V22.8.9 `src/index.js`

## 홈 성능 자동 검증

- [x] `/my` 데이터 요청 4회 이하
- [x] `/app` 데이터 요청 9회 이하
- [x] 가계부 목록 `id=in.(...)` 묶음 조회
- [x] 참여자 프로필 `id=in.(...)` 묶음 조회
- [x] 홈 `accountbook_settings` 한 번 조회
- [x] 짧은 거래 목록 뒤 빈 페이지 재요청 없음
- [x] 개인 홈 HTML 35KB 이하
- [x] 공통 CSS·JavaScript가 개인 HTML에 반복 삽입되지 않음
- [x] CSS·JavaScript 정적 경로가 DB 조회 없이 200 응답
- [x] 정적 경로 Content-Type 정확함
- [x] 정적 경로 `max-age=31536000, immutable`
- [x] 개인 HTML `no-store` 유지
- [x] 가계부 이름·월 금액·참여자 정보 렌더링 유지

## 누적 자동 검증

- [x] Worker JavaScript 문법 검사
- [x] 영수증 화면·파서·저장·중복 차단 55개
- [x] 카카오 1:1·그룹 응답·식별키 18개
- [x] 가계부·계정 보안 분리 43개
- [x] UX 원칙·행동 피드백·분석 고정 55개
- [x] 홈 성능·경량 자원 32개
- [x] 총 203개 자동 확인
- [x] 빌드 산출물 ESM 및 `default.fetch`
- [x] 분석 보호 해시 일치
- [x] 배포 ZIP 체크섬·내부 소스 해시 재검증
- [x] ZIP에 PNG·빌드 폴더·Secret·원본 학습 ZIP 없음

## 경량 ZIP 확인

- [x] 현재 배포 코드는 `src/index.js` 하나
- [x] `CHANGELOG.md`에 버전별 이력 누적
- [x] `HISTORY_INDEX.md`에 과거 자료 보관 방식 기록
- [x] `SQL_HISTORY.md`에 이번 버전 SQL 없음 명시
- [x] 과거 개별 검증 로그·반복 체크섬 제외
- [x] 카카오 매뉴얼은 프로젝트 메모·적용 체크리스트만 포함
- [x] 최상위 폴더 한 개와 읽기 쉬운 하위 폴더 구조

## 운영 환경 수동 확인

- [ ] PC Chrome에서 `/my`→`/app` 진입과 가계부 전환 확인
- [ ] iPhone Safari에서 홈 첫 진입·재진입 확인
- [ ] Android Chrome에서 홈 첫 진입·재진입 확인
- [ ] `/assets/mobile-home-v22810.css` 200·CSS Content-Type 확인
- [ ] `/assets/mobile-home-v22810.js` 200·JavaScript Content-Type 확인
- [ ] 두 정적 자원의 반복 요청이 memory/disk cache로 표시되는지 확인
- [ ] 홈 금액·예산·오늘 지출·최근 기록 값 확인
- [ ] 빠른 입력 자동 채우기와 기록 저장 확인
- [ ] 참여자 표시 이름과 지출자 선택 확인
- [ ] 가계부 생성·나가기·영구 삭제 보안 흐름 확인
- [ ] 삭제·연결해제 단톡방 저장 0건 확인
- [ ] 카카오 1:1·그룹 응답 확인
- [ ] 영수증 OCR·취소·저장 확인
- [ ] 운영 배포 전후 Cloudflare 응답시간과 Supabase 느린 쿼리 비교

수동 항목은 실제 운영 도메인과 기기가 필요합니다. 문제가 생기면 V22.8.9 코드로만 롤백하며 SQL 롤백은 하지 않습니다.
