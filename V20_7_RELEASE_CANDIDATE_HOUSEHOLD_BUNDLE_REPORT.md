# V20.7 RELEASE CANDIDATE HOUSEHOLD BUNDLE REPORT

## 목적
베타/심사/운영 후보판으로 넘어가기 전에 실제 사용자가 반드시 써야 하는 “여러 가계부 생성·참여·전환” 흐름을 명확히 보강했습니다. 기존 안내에는 `/my/households` 링크가 있었지만 실제 라우트가 없어 사용자 경험이 끊길 수 있었으므로, 이번 버전에서 실제 사용자 화면과 점검 화면을 함께 추가했습니다.

## 추가/수정 경로
- `/my/households`: 사용자 전용 가계부 전환·추가·참여 화면
- `/release-candidate`, `/rc-check`, `/release-candidate-check`: 릴리스 후보 점검 화면
- `/household-create-join`, `/household-start`, `/invite-code-guide`, `/join-household-guide`: 생성·참여 안내 화면

## `/my/households` 기능
- 내가 참여한 가계부만 표시
- 현재 선택 가계부 열기/선택
- 새 가계부 만들기
- 초대코드로 다른 가계부 참여
- 선택 가계부 초대 문구 표시
- 권한 기준 안내

## `/households` 보강
기존 사용자 참여자 관리 화면에도 “새 가계부 만들기 / 초대코드 참여” 폼을 추가했습니다.

## 서버 흐름 보강
- `/my/create`, `/my/join`에서 `return_to` 복귀 흐름을 사용하도록 보강
- 생성/참여 후 `/my/households` 또는 원래 화면에 `household_id`, `msg`, `err`를 붙여 복귀

## 유지한 것
- `/my`, `/app`, `/skill` 핵심 저장 로직
- 권한 체크와 household scope
- Supabase 테이블 구조
- 스마트 입력, 예산 알림, 중복 방어, 카카오 그룹 흐름, 사업자 푸터

## 검증 결과
- node --check src/index.js: PASS
- ES module import: PASS
- /health smoke: PASS
- /household-create-join smoke: PASS
- /my/households 비로그인 redirect: PASS
- /release-candidate 관리자 smoke: PASS
- /operation-center 관리자 smoke: PASS
- ZIP integrity: PASS
