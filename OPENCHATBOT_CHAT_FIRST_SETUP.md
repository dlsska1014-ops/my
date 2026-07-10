# 오픈챗봇 채팅 우선 구성 기준

## 원칙
1. 사용자가 직관적으로 이해하는 명령어만 대표 명령어로 등록한다.
2. 설명이 필요한 명령어만 대표 명령어 설명을 사용한다.
3. 대부분의 다음 행동은 `/skill` 응답의 `quickReplies` 바로연결로 제공한다.
4. 자유 입력은 반드시 폴백을 통해 `/skill`로 보낸다.
5. 웹은 로그인, 상세 설정, 분석, 캘린더, 백업, 결제/수익화 지점에만 사용한다.

## 최소 블록
- `00_봇입장_시작안내`: 글쓰기 응답
- `90_가계부_통합스킬`: 대표 명령어를 `/skill`로 전달
- `99_폴백_통합스킬`: 모든 자유 입력을 `/skill`로 전달

## 대표 명령어 후보
- 메뉴
- 요약
- 오늘예산
- 오늘기록
- 초대코드
- 가계부전환
- 입력 예시
- 수정가이드
- 키워드 안내
- 밈

## 스킬 URL
`https://ttokttok-accountbook.com/skill`

## 테스트 JSON
```json
{
  "intent": { "id": "test-intent", "name": "90_가계부_통합스킬" },
  "userRequest": {
    "timezone": "Asia/Seoul",
    "params": {},
    "block": { "id": "test-block", "name": "90_가계부_통합스킬" },
    "utterance": "메뉴",
    "lang": "ko",
    "user": {
      "id": "test-bot-user-key",
      "type": "botUserKey",
      "properties": { "botUserKey": "test-bot-user-key" }
    }
  },
  "bot": { "id": "test-bot", "name": "똑똑한가계부" },
  "action": {
    "id": "test-action",
    "name": "똑똑한가계부_스킬_v21",
    "params": {},
    "detailParams": {},
    "clientExtra": {}
  },
  "contexts": []
}
```
