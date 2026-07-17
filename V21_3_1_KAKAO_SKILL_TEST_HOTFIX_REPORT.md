# V21.3.1-KAKAO-SKILL-TEST-HOTFIX

## 목적
카카오 챗봇 관리자센터의 스킬 테스트에서 `400 BAD_REQUEST` 또는 `올바르지 않은 스킬 서버 응답`으로 표시되는 경우를 줄이기 위한 스킬 테스트 호환성 핫픽스입니다.

## 수정 내용
- `/skill` POST 처리에서 내부 재호출 시 원 요청의 `content-length` 헤더를 제거하고 `content-type: application/json; charset=utf-8`로 재설정했습니다.
- 스킬 응답을 반환하기 전 `version: "2.0"`, `template.outputs` 구조를 재검증하고, 이상한 경우에도 HTTP 200의 안전한 카카오 응답으로 변환합니다.
- quickReplies에서 빈 `extra: {}`를 제거해 오픈빌더 테스트 호환성을 높였습니다.
- simpleText가 과도하게 길어지는 경우 안전 길이로 정리합니다.
- `/kakao-skill-test-payload.json?q=메뉴` 경로를 추가해 카카오 스킬 테스트 창에 붙여넣을 공식 테스트 Payload를 바로 받을 수 있게 했습니다.
- `/skill` OPTIONS 요청을 204로 안전 처리합니다.

## 유지한 것
- `/my`, `/app`, `/skill` 핵심 저장 흐름
- 권한/가계부 범위
- 빠른입력 분류 보정
- 여러 가계부 생성/참여
- 중복 저장 방어
- 예산 알림
- 밈 콘텐츠센터
- 하단 사업자 푸터
- Supabase 테이블 구조

## 검증
- `node --check src/index.js`: PASS
- ES module import/smoke: PASS
- `/health`: PASS
- `/skill` GET 안내 화면: PASS
- `/kakao-skill-test-payload.json`: PASS
- `/skill` POST Kakao JSON payload: PASS
- `/skill` POST raw text payload: PASS
- ZIP 무결성 검사: PASS
