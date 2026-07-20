# V22.8.7 카카오 그룹 응답 매뉴얼 정합성 보고서

## 기준본

- 입력 기준: 올바른 V22.8.6 영수증 화면 최적화·안정화 누적본
- 입력 ZIP SHA-256: `f5febd77d4c32b30726046376bed99b1c97b363ece6a1f0bb3e53cf57f78e314`
- 기준 소스: 올바른 V22.8.6 ZIP의 `src/index.js`와 `worker/index.js`가 동일함을 확인한 뒤 `src/index.js`를 기준으로 적용
- 보호 대상: 영수증 OCR 최적화·취소·90초 제한, 로그인, 모바일 홈, 전체 메뉴, 분석 화면

## 매뉴얼에서 확인한 핵심

제공된 그룹 챗봇 beta 자료와 스킬 서버 개발 가이드 v1.11.1을 프로젝트 적용 우선순위에 따라 검토했습니다.

- 그룹 응답 지원: SimpleText, SimpleImage, TextCard, BasicCard, ListCard, ItemCard
- 그룹 응답 미지원: QuickReplies, CommerceCard, Carousel
- 요청 식별자: `botUserKey`, `appUserId`, `botGroupKey`
- `plusfriendUserKey`: 신규 구현에서 사용하지 않음
- SkillRequest에 새 필드가 추가될 수 있으므로 알 수 없는 필드 허용
- 챗봇이 그룹방 전체 대화를 읽거나 학습한다고 표현하지 않음
- Event API 선톡은 일반 응답과 별도 정책·심사 영역

원자료와 충돌 정리는 `docs/kakao-manual/`에 보존했습니다.

## 구현 결정

기존 코드에는 단계형 흐름에서 여러 QuickReplies가 사용되고 있었습니다. 이를 전부 삭제하면 1:1 사용성과 안내 흐름이 손상되므로 요청 컨텍스트별로 분리했습니다.

1. `/skill`의 최종 정상화 단계에서 `botGroupKey`를 확인합니다.
2. 1:1 요청은 기존 응답을 변경하지 않습니다.
3. 그룹 요청은 QuickReplies를 제거합니다.
4. 제거 전에 선택지의 `messageText`를 최대 5개 추출해 번호형 SimpleText 안내로 붙입니다.
5. 그룹 output은 매뉴얼 지원 타입만 남기고 최대 3개로 제한합니다.
6. 변환 실패 시 QuickReplies가 없는 안전한 SimpleText로 폴백합니다.

이 방식은 수십 개 응답 호출부를 각각 수정하지 않고 정상·제한·반복 방지·오류 응답에 같은 정책을 적용합니다.

## 데이터·배포 영향

- 새 테이블·컬럼·인덱스·RLS·RPC: 없음
- 신규 SQL: 없음
- 새 Cloudflare 환경변수·Secret: 없음
- OpenBuilder Skill URL·블록 변경: 없음
- 적용 파일: `src/index.js` 전체 교체
- 롤백: V22.8.6 `index.js`로 코드만 복원

## 자동 검증 범위

- 1:1 빠른 답장 유지
- 그룹 빠른 답장 미출력
- 번호형 선택지 보존
- 지원 output 타입과 출력 개수 제한
- 알 수 없는 요청 필드 허용
- 사용자 키 우선순위와 레거시 폴백 고정
- 기존 영수증·홈·메뉴·분석·로그인 회귀
- ESM 빌드 산출물과 ZIP 내부 체크섬

실제 결과는 `VALIDATION_REPORT_V22_8_7.md`에 기록합니다.
