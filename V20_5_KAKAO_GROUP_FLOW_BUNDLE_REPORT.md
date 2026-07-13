# V20.5-KAKAO-GROUP-FLOW-BUNDLE Report

## 목적

V20.4의 모임/여행/단발성 가계부 흐름 위에 카카오 단톡방 연결, 그룹방별 가계부 연결 점검, OpenBuilder 최종 발화 기준, 카카오 로그인 실패 시 백업 로그인 안내를 묶어 반영했습니다.

## 주요 추가 내용

1. `/kakao-group-flow` 계열 경로 추가
   - 그룹방별 가계부 연결 순서 안내
   - 가계부 초대코드 기준 연결 명령어 표시
   - `단톡방 연결 초대코드` 명령 기준 정리

2. `/group-household-links` 계열 경로 추가
   - 관리자 전용 그룹방-가계부 연결 점검 화면
   - 그룹키는 일부 마스킹 표시
   - `accountbook_settings.kakao_group_links` 기준 조회

3. `/kakao-login-recovery` 계열 경로 추가
   - 카카오 로그인 실패 시 백업 로그인 안내
   - 기존 접속코드 계정과 카카오 계정 연결 흐름 안내
   - Redirect URI/Web domain 확인 문구 제공

4. `/openbuilder-final` 계열 경로 추가
   - 필수 대표 발화 목록
   - 폴백 블록 `/skill` 연결 기준
   - 단톡방, 예산, 수정/삭제, 개인정보/브랜드/심사 발화 정리

5. `/operation-center` 메뉴 보강
   - 단톡방 연결 흐름
   - 단톡방 연결 점검
   - 카카오 로그인 복구
   - 오픈빌더 최종 발화 메뉴 추가

## 변경하지 않은 것

- `/my`, `/app`, `/skill` 핵심 저장 로직
- 가계부 권한 체크 구조
- 여러 가계부 생성/참여 구조
- 예산 알림/중복 방어/트래픽 가드
- 하단 사업자 푸터
- Supabase 테이블 구조

## 검증 결과

- `node --check src/index.js`: PASS
- ES module import: PASS
- `/health`: PASS
- `/kakao-group-flow`: PASS
- `/kakao-login-recovery`: PASS
- `/openbuilder-final`: PASS
- `/group-household-links` 관리자 접근: PASS
- `/operation-center`: PASS
- ZIP 무결성: PASS
