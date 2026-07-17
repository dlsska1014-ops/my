# V19.9-REVIEW-OPS-TRAFFIC-BUNDLE 패치 리포트

## 목적
V19.8.4-BIZ-FOOTER-ONLY-HOTFIX를 기준으로 기능을 무리하게 바꾸지 않고, 심사/베타/운영/트래픽 대응을 한 번에 묶어 다음 단계로 이동합니다.

## 반영 범위

### 1. 심사/베타 준비센터
- `/review-ready`
- `/beta-ready`
- 카카오 비즈니스 심사와 베타 운영 전 확인 항목을 한 화면에 정리
- `/my`, `/privacy`, `/terms`, `/openbuilder-report` 진입 링크 제공

### 2. 이용안내 화면
- `/terms`
- `/service-policy`
- 서비스 목적, 공동 가계부 권한, 데이터 관리, 장애 대응 안내 추가
- 하단 사업자 정보 푸터는 기존 전역 자동 삽입 구조 유지

### 3. 트래픽 가드 Lite
- 쓰기성 요청과 `/skill`에 1차 메모리 기반 rate guard 추가
- 기본값: `TRAFFIC_GUARD_LIMIT` 미설정 시 90회/분
- 기본값: `TRAFFIC_GUARD_WINDOW_MS` 미설정 시 60초
- 제한 시 HTML/API/카카오 응답 형식에 맞춰 안내

### 4. 트래픽 운영센터
- `/ops-traffic`
- `/traffic-ops`
- 관리자 또는 `CRON_SECRET` key 접근
- 최근 과도 요청 제한 이벤트, 활성 버킷, 카카오 스킬 이벤트 요약 확인

### 5. 운영센터 메뉴 보강
- `/operation-center`에 심사·베타 준비, 트래픽 가드, 약관/서비스 안내 카드 추가

## 유지한 것
- 사업자 정보는 하단 푸터만 유지
- `/my`, `/app`, `/skill`, 예산 알림, 여러 가계부, 권한 체크, 스마트 입력 로직 유지
- Supabase 테이블 구조 변경 없음
- 카카오 스킬 응답 구조 유지

## 검증
- `node --check src/index.js`: PASS
- ES module import: PASS
- `/health`: PASS
- `/terms`: PASS
- `/review-ready`: PASS
- `/ops-traffic` 관리자 접근: PASS
- ZIP 무결성 검사: PASS
