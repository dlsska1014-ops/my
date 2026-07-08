# ChatGPT 웹 업로드 사용법

## 가장 간단한 방법

1. `KAKAO_GROUP_CHATBOT_MASTER_KNOWLEDGE.txt` 파일을 ChatGPT 대화에 첨부합니다.
2. `05_CHATGPT_WEB_INSTRUCTIONS.txt` 내용을 첫 메시지에 붙여 넣습니다.
3. 이후 카카오 연동 가계부의 설계, 코드, 심사 문구와 테스트를 요청합니다.

## Custom GPT에 넣는 방법

1. Knowledge에 `KAKAO_GROUP_CHATBOT_MASTER_KNOWLEDGE.txt`와 `03_KAKAO_CANONICAL_RULES_AND_CONFLICTS.md`를 추가합니다.
2. Instructions에 `05_CHATGPT_WEB_INSTRUCTIONS.txt` 내용을 넣습니다.
3. 답변에서 슬라이드 번호 또는 개발 가이드 섹션명을 근거로 표시하도록 유지합니다.

## 파일 설명

- `01...48_SLIDES_COMPLETE.md`: 48장 전부를 슬라이드 번호별로 정제한 학습본.
- `02...39P_COMPLETE.md`: 39쪽 개발 문서 전체 텍스트. 두 번 추출해 동일함을 확인함.
- `03...CANONICAL...md`: 두 자료의 충돌을 정리하고 실제 구현에서 사용할 정본 규칙을 지정.
- `04...ACCOUNTBOOK...md`: 공동 가계부 프로젝트 적용 명세.
- `05...INSTRUCTIONS.txt`: ChatGPT가 자료를 잘 쓰도록 하는 지시문.
- `06...VERIFICATION.json`: 페이지·슬라이드 수, 문자 수, 해시와 검증 상태.
- `MASTER_KNOWLEDGE.txt/.docx`: 위 내용을 한 번에 올릴 수 있도록 합친 파일.

## 정확성 주의

- ChatGPT 웹에 파일을 올리는 것은 모델 자체를 재학습시키는 것이 아니라 해당 대화 또는 Custom GPT가 파일을 참고하도록 만드는 방식입니다.
- beta 정책은 변경될 수 있으므로 실제 출시 직전 최신 카카오 공식 문서와 심사 답변을 다시 확인해야 합니다.
- 39쪽 Google Docs는 전체 텍스트를 빠짐없이 추출했지만 페이지 나눔 정보는 보존되지 않아 섹션 순서로 제공합니다.
