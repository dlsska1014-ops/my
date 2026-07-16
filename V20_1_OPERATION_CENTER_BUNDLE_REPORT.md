# V20.1 Operation Center Bundle Report

## Version
- `V20.1-OPERATION-CENTER-BUNDLE`
- Mode: `operation-center-bundle`

## 목적
V20.0 베타 시작 흐름 위에 실제 운영자가 확인할 수 있는 운영 대시보드와 이벤트 스냅샷을 추가했습니다. 핵심 저장 로직, 권한 체크, Supabase 테이블 구조는 변경하지 않았습니다.

## 추가 경로
- `/ops-dashboard`
- `/ops-events`
- `/ops-health`
- `/ops-snapshot.json`

## 주요 반영 내용
1. 운영 대시보드 추가
   - 최근 오류, 경고, 과도 요청 제한, 카카오 발화 이벤트를 한 화면에서 확인합니다.
2. 운영 이벤트 메모리 로그 추가
   - 안전모드 전환, 서버 오류, 예약 실행 오류, 과도 요청 제한을 인스턴스 메모리 안에서 최근 이벤트로 보관합니다.
3. JSON 스냅샷 추가
   - 운영자가 `/ops-snapshot.json`에서 현재 운영 상태를 JSON으로 확인할 수 있습니다.
4. 운영센터 메뉴 보강
   - `/operation-center`와 통합 메뉴에 운영 대시보드, 트래픽, 스킬 운영 진입점을 추가했습니다.
5. 운영센터 DB 장애 완충
   - `/operation-center`에서 Supabase 조회가 일시 실패해도 운영 메뉴 화면 자체는 열리도록 보완했습니다.

## 유지한 것
- `/my`, `/app`, `/skill` 저장 로직
- 가계부 범위 및 권한 체크
- 스마트 다중 입력 파서
- 예산 알림
- 여러 가계부 생성/참여 흐름
- V19.9 트래픽 가드
- V20.0 베타 온보딩 흐름
- 하단 사업자 정보 푸터

## 사업자 정보
- 상호: 도담 네트워크
- 사업자등록번호: 729-24-02288
- 사업장 소재지: 경기도 평택시 신촌3로 12
- 업태: 정보통신업
- 종목: 응용 소프트웨어 개발 및 공급업
- 서비스명: 똑똑한가계부

## 검증
- `node --check src/index.js`: PASS
- ES module import: PASS
- `/health` smoke test: PASS
- `/ops-dashboard` smoke test: PASS
- `/ops-snapshot.json` smoke test: PASS
- `/operation-center` smoke test: PASS
- ZIP 무결성 검사: PASS
