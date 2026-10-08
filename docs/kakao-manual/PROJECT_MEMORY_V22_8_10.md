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
- 삭제·연결 해제 이력이 있는 방의 기록형 입력은 저장 0건으로 끝내고 어디에도 저장하지 않았다고 명시합니다.
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

## V22.9.31 승인된 공동방 첫 기록

- 처음 사용하는 미연결 방은 실제 스킬 Secret, botUserKey/appUserId, 명시적인 botGroupKey와 명확한 거래 입력을 확인하여 공동 가계부 하나를 자동 준비합니다. 처음 기록한 사용자에게 소유자 역할을 안내합니다.
- 같은 방의 다음 기록 caller는 완료 auto 표식과 현재 연결 ID가 같을 때에만 absent 역할을 member로 준비합니다. 조회·Help·일반 대화는 참여하지 않으며 수동 연결·pending·blocked·viewer·나가기 이력을 우회하지 않습니다.
- A·B·C 방마다 별도 가계부를 준비하고 같은 사용자의 ID와 개인 선택 상태를 보존합니다. 이름·예산은 기존 관리 경로에서 같은 ID에 설정합니다. 직접 재연결한 뒤에도 이전 거래는 원래 가계부에 남습니다.
- 개인 거래·1회용 웹 코드는 그룹 응답에 노출하지 않습니다. QuickReplies·CommerceCard·Carousel 금지를 유지합니다. 완성된 자동방의 조회·예산·기록 명령도 실제 스킬 인증을 요구합니다.
- 단계별 영속 표식과 user → room → household 임대를 사용하고 저장·응답까지 scope를 유지합니다. 불명확한 POST는 고정 ID 결과만 재조회합니다. retired/나가기 표식은 purge 이후에도 보존합니다.
- SQL·Secret·환경변수·Kakao Developers·OpenBuilder 신규 변경은 없습니다. V22.9.29 정기 RPC의 기존 SQL-first 배포 순서는 유지합니다. 실제 botGroupKey payload·5초 응답·실기기와 도입 전 무표식 해제 방의 구분 한계는 운영 확인 항목입니다.
