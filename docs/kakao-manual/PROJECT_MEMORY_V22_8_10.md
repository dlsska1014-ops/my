# 카카오·가계부 프로젝트 메모리 V22.8.10

## 계속 보호할 카카오 매뉴얼 기준

- `botGroupKey`가 있으면 그룹 요청입니다.
- 그룹 응답에는 QuickReplies, CommerceCard, Carousel을 보내지 않습니다.
- 그룹 선택지는 짧은 번호형 입력 문장으로 제공합니다.
- 그룹 output은 SimpleText, SimpleImage, TextCard, BasicCard, ListCard, ItemCard 범위와 최대 개수를 지킵니다.
- 1:1 QuickReplies는 별도 동작으로 유지합니다.
- 사용자 식별은 botUserKey, appUserId 우선이며 plusfriendUserKey는 레거시 폴백입니다.
- 챗봇이 단톡방 전체 대화를 읽거나 학습한다고 표현하지 않습니다.
- Event API 선톡·자동 푸시는 권한·심사·정책 확인 없이 추가하지 않습니다.

## 가계부 수명주기

- 가계부에는 별도 비밀번호가 없습니다.
- 초대코드는 참여와 단톡방 연결에만 사용합니다.
- 삭제·연결해제된 그룹 입력은 다른 가계부로 fallback하지 않습니다.
- 기록형 입력은 저장 0건으로 끝내고 어디에도 저장하지 않았다고 명시합니다.
- 오래된 그룹 연결은 다음 요청에서 정리합니다.
- 영구 삭제 본인 확인은 로컬 계정 비밀번호 또는 동일 카카오 ID 재로그인입니다.

## V22.8.10 성능 변경과 카카오 영향

- `/skill` 요청·응답 규격은 변경하지 않았습니다.
- OpenBuilder Skill URL·블록·엔티티·파라미터 변경이 없습니다.
- 홈 CSS·JavaScript 정적 분리는 웹 `/app`에만 적용됩니다.
- 가계부·사용자 묶음 조회는 동일한 권한 범위 안에서만 수행합니다.
- 카카오 그룹 18개 회귀 검증을 그대로 통과해야 배포합니다.

## 배포 메모리

- Worker `src/index.js` 전체 교체
- SQL 없음
- 새 환경변수 없음
- Kakao Developers 변경 없음
- OpenBuilder 변경 없음
