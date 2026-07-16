# V20.4-MEETING-TRAVEL-HOUSEHOLD-BUNDLE Report

## 목적
V20.3 예산 알림 번들 위에 모임/여행/단발성 가계부 운영 흐름을 추가했습니다.

## 추가 경로
- `/meeting-households`, `/travel-households`, `/household-templates`: 모임/여행/단발성 가계부 템플릿과 생성 안내
- `/settlement-summary`, `/split-summary`, `/meeting-settlement`: 참여자별 지출과 1/N 정산 요약
- `/meeting-archive`, `/household-archive-guide`: 정산 완료 후 보관 운영 가이드

## 반영 내용
- 여행/모임비/단발성 정산/가족 행사 템플릿 제공
- 기존 `/my/create` 흐름을 활용한 새 가계부 생성 폼 제공
- 사용자가 참여한 household 범위 안에서만 정산 요약 조회
- 참여자별 낸 금액, 1/N 기준, 받을/보낼 금액 계산
- 송금 제안 테이블 생성
- 공유 문구 제공
- 종료 후 삭제 대신 백업 + viewer 권한 전환 + 이름 보관 운영 가이드 제공

## 유지한 것
- `/my`, `/app`, `/skill` 핵심 저장 로직 미변경
- owner/admin/member/viewer 권한 체크 구조 유지
- 여러 가계부 생성/참여 기존 구조 유지
- V20.2 중복 저장 방어와 트래픽 안전 구조 유지
- V20.3 예산 알림 유지
- 하단 사업자 푸터 유지
- Supabase 테이블 구조 변경 없음

## 검증 기준
- `node --check src/index.js`
- ES module import
- `/health` smoke test
- `/meeting-households` smoke test
- `/settlement-summary` 비로그인 redirect test
- `/meeting-archive` smoke test
- ZIP 무결성 검사
