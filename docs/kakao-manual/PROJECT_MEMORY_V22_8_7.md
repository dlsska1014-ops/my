# 카카오 매뉴얼 프로젝트 메모 · V22.8.7

후속 버전에서 다시 추측하지 않도록 이번 검토 결론을 프로젝트 메모로 고정합니다.

## 응답

- 그룹 요청 기준은 `botGroupKey` 존재 여부다.
- 그룹 지원 output: SimpleText, SimpleImage, TextCard, BasicCard, ListCard, ItemCard.
- 그룹 미지원: QuickReplies, CommerceCard, Carousel.
- 1:1 QuickReplies까지 제거하지 않는다.
- 그룹 선택지는 최대 5개의 짧은 번호형 입력 문장으로 바꾼다.
- 그룹 응답은 최대 3개 output과 짧은 본문을 유지한다.

## 식별자와 보안

- `botUserKey`, `appUserId`, `botGroupKey`를 현재 기준으로 사용한다.
- `plusfriendUserKey`는 신규 로직에 사용하지 않는다. 기존 데이터 연결을 위한 최후순위 폴백만 유지한다.
- URL 쿼리의 식별자만으로 로그인·권한을 확정하지 않는다.
- 알 수 없는 SkillRequest 필드는 무시하고 정상 처리한다.

## 기능 경계

- 챗봇에게 직접 전달된 요청만 처리한다.
- 그룹방 전체 대화를 읽거나 학습한다고 표현하지 않는다.
- Event API·선톡·자동 푸시는 별도 심사·권한·최신 정책 확인과 명시 승인 전에는 추가하지 않는다.

## 배포 판단 습관

- 매 버전 시작 전에 SQL, `src/index.js`, 환경변수, OpenBuilder 변경을 각각 판정한다.
- DB 객체나 쿼리 필드가 늘지 않으면 SQL을 만들지 않는다.
- beta 문서는 출시 직전 최신 공식 정책과 다시 대조한다.
