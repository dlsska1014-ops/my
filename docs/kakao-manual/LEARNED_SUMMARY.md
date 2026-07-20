# 카카오 그룹 챗봇 매뉴얼 학습 요약 (이 프로젝트 적용 기준)

## ⚠️ 최상위 설계 가드레일 — "우리는 먼저 신호를 줄 수 없다"

카카오톡에서 우리 서버는 **응답만** 할 수 있다. 사용자가 보낸 메시지에 대한
**SkillResponse 안에서만** 답하며, 우리 타이밍에 카카오톡으로 메시지를 밀어넣는 것은 불가능하다.

- 저장/예산/정기지출 알림은 **사용자가 챗봇에 무언가를 보낸 그 응답에 함께 실어서** 전달한다. (현재 kakaoBudgetFeedback 방식 = 준수)
- "먼저 말 걸기(선톡)"는 전부 Event API를 거친다:
  - 일반 선톡 = **사전 심사 필요 + 월 2회 제한**. 광고·장문·저반응 메시지 금지.
  - 사용자가 직접 켠 정기 알림 = **알림 전용 블록**(일반/필수 파라미터 없음), 조건 불충족 시 `outputs:[]`로 미발송.
- 따라서 "실시간/자동 푸시 알림"류 기능은 **웹/앱 화면 안에서** 처리하거나, 위 Event API 제약 안에서만 설계한다.
  절대 임의 타이밍 카카오톡 푸시로 구현하지 않는다.

---


> 원자료: `kakao_chatgpt_training_pack/` (beta 가이드 48장 + 스킬 서버 개발 가이드 v1.11.1(2026-04-20) + 정본 규칙/충돌 정리 + 가계부 적용 명세)
> 자료 우선순위: ① 03_CANONICAL_RULES ② 개발 가이드 v1.11.1 ③ beta 48장 ④ 가계부 적용 명세.
> beta 정책이므로 출시 직전 chatbot@kakaocorp.com 또는 최신 공식 문서로 재확인 필수.

## 1. 이 프로젝트(/skill)에 직접 적용되는 기술 규칙

- SkillRequest: POST JSON. bot / intent(block) / action / userRequest / context.
  **알 수 없는 필드가 와도 실패하지 않게 파싱** (하위 호환 필드 추가됨).
- 식별자:
  - `botUserKey` = 봇 기준 사용자 비식별 키 (봇이 바뀌면 같은 사람도 값이 다름) → 우리의 kakao_user_key 계열.
  - `appUserId` = 카카오 로그인 연동 시 앱 사용자 연결용.
  - `botGroupKey` = 채팅방 비식별 키 → 단톡방-가계부 연결(chat_room_binding)에 사용.
  - **`plusfriendUserKey`는 v1.11.1에서 제거됨 — 신규 구현에서 사용 금지.**
  - 개발 채널에서는 botId 끝에 `!`가 붙음.
- SkillResponse 지원: SimpleText / SimpleImage / TextCard / BasicCard / ListCard / ItemCard.
  **미지원: QuickReplies, CommerceCard, Carousel — 의존 금지.**
  - SimpleText는 `extra.markdown=true` 지원. ListCard `listLayout=ranking` 지원.
  - 버튼: horizontal 최대 2개 / vertical 최대 5개.
  - 응답이 채팅창을 덮지 않게 짧게. 웹 랜딩 전에 챗봇 응답 자체로 핵심 정보 제공.
- 멘션: `@sys.user.mention` 활성화 + SimpleText에서만 응답 멘션 동작.
  **보수 기준: SkillResponse 전체 최대 15명** (48장의 45명 해석은 사용하지 않음).
- URL 버튼 랜딩: botUserKey/appUserId/botGroupKey가 쿼리로 자동 전달될 수 있음.
  **쿼리 값만으로 로그인/권한 확정 금지 — 서버에서 서명·만료·권한 검증** (현 프로젝트의 세션 검증 원칙과 일치).
- API 호스트: `https://bot-api.kakao.com`.
  - 사업자: `Authorization: KakaoAK {REST_API_KEY}` / 개인(제한 시): `Authorization: KakaoBK {신청 키}`.
  - 채팅방 목록: `GET /v3/bots/{botId}/group-chat-rooms` (pageSize 10/20/50/100, lastBotGroupKey 커서, isSubscribed=선톡 수신 여부).
  - 멤버 목록: `GET /v2/bots/{botId}/group-chat-rooms/{botGroupKey}/members`.
  - Event API 발송: `POST /v2/bots/{botId}/group` — 한 번에 최대 100개 방, 응답의 taskId로 `GET /v1/tasks/{taskId}` 결과 조회 (botId 아님 — 정본 정정).
- 알림(사용자 설정 정기 메시지) vs 일반 선톡(Event API):
  - 알림: 사용자가 켜고 시간 관리. **알림 전용 블록 분리**, 일반/필수 파라미터 설정 금지.
    조건 안 맞으면 `template.outputs=[]` 빈 응답으로 미발송 처리 (주말/공휴일 스킵 등).
  - 일반 선톡: **사전 심사 필요, 최대 월 2회**. 심사 시 내용·랜딩·발송시간·방 규모 전달. 1~2줄, 이미지 지양.
  - Event API 무료 요금제는 메일로 신청.
- Webhook: entrance / leave / inviteMember 이벤트. 신청 시 botId + HTTPS URL + Header.
  초대 링크: `https://pf.kakao.com/{encoded_profile_id}/chatbot/invite?referer={referer}` — 입장 이벤트에서 inviter botUserKey + referer 수신 가능.
- 생성형 AI 콜백 URL: 5분 유효, 1회 호출.
- 디버깅: `@{봇이름} .showmethebug` → chp로 시작하는 Footprint ID.

## 2. 비즈니스/심사 규칙 (출시 전 필수 체크)

- 그룹 챗봇은 **제휴·권한 부여 필요** (1:1 챗봇과 다름). 팀채팅/일반채팅만 지원, 오픈채팅·나와의채팅 미지원.
- 운영 채널과 개발 채널은 **반드시 별도 채널**. 개발 챗봇은 팀채팅방 1개 테스트, 마스터가 방장.
  채널 연결 해제/마스터 변경 시 개발 챗봇 강제 퇴장 가능.
- 비사업자 제약: 디벨로퍼스 앱 연결(사업자번호 필수) 기반 API·카카오싱크·Event API 제한, 채널 프로필 경고 문구 표시.
- 프로필: 채널명=봇 이름. 간결·직관·타이핑 쉬운 이름, `~봇` 단순 결합 지양, 이미지 내 글자 지양.
  봇 한 줄 설명 한글 14자 이내 권장. 웰컴 메시지는 채팅창 절반 이하 + `챗봇 멘션하기` 버튼.
- 심사 항목: 광고(랜딩 첫 화면 가림 = 오픈 불가), 기본 사용성, 편리한 UX, 연관 랜딩,
  앱 설치 여부 분기, 그룹 대화 맥락 적합성, **두 명 이상 상호작용 요소**, 지속 업데이트, 연령 적합성.
- 챗봇 응답 내 광고 금지. `결제` 등 직접 구매 유도 문구 회피. 사용 횟수 제한 안내는 가능.
- **개인정보 표현 규칙 (문구 그대로 준수)**:
  - 허용: "가계부적은 봇에게 직접 보낸 명령어만 처리합니다."
  - 허용: "기록 제공을 위해 명령어와 가계부 데이터를 저장하며 보관·삭제 기준은 도움말에서 확인."
  - 금지: "단톡방 대화를 읽어서 자동 분석" / "채팅 내용을 학습" 류 표현 전부.
  - 유저 발화를 AI 학습에 사용 금지 (beta는 동의 장치 없음 → 원칙적 불가).
  - 발화 저장 시 도움말에 저장 사실·보관 기간 명시.

## 3. 가계부 적용 명세의 원칙 (04 문서)

- 역할 분담: 카카오톡 = 기록·빠른 조회·공동 알림·초대·밈 공유 / 웹 = 전체 편집·예산·권한·분석·엑셀 / Cloudflare = 상시 처리.
- 식별자 매핑: botGroupKey→가계부(방 바인딩), botUserKey→카카오 봇 정체성, appUserId→서비스 계정 연결.
  **식별자를 재무 데이터 공개 URL에 노출 금지.**
- 발화 복구: 파악된 금액·날짜·메모 유지, **부족한 것 한 가지만** 되물음.
  삭제·전체 가져오기·가계부 해제는 실행 전 재확인. **멱등키로 중복 저장 방지**. 분류 신뢰도 낮으면 후보 제시.
- 예산 알림: 80% 도달 / 100% 최초 초과 / 초과액 증가 3단계 구분, 단계별 1회 또는 하루 묶음. 공동방 알림에 개인 메모 노출 금지.
- 밈 카드: 공유본에 메모·상호명·실명 기본 숨김. 챗봇엔 요약 1장+짧은 문구, 도감은 웹으로.
- 출시 우선순위: ①권한 모델 ②기록/수정/취소/중복방지 ③모바일 관리 화면 ④예산·고정지출·알림 ⑤엑셀 양방향 ⑥분석·소비몬.

## 4. 현 코드(V22.8.7) 적용 결과

| 매뉴얼 규칙 | 현 상태 | 필요 조치 |
|---|---|---|
| plusfriendUserKey 미사용 | ✅ `getKakaoUserKey`에서 botUserKey→appUserId 우선이며 plusfriendUserKey는 최후순위 레거시 폴백으로만 존재 | 제거 시 구키로 저장된 기존 사용자 매칭 파손 위험. 신규 로직에서 참조 금지 |
| SkillResponse 미지원 타입 회피 | ✅ `botGroupKey`가 있는 그룹 응답은 QuickReplies를 제거하고 번호형 SimpleText로 보존. 1:1 QuickReplies는 유지 | 그룹/1:1 분기와 지원 output 허용 목록을 자동 검증 |
| 개인정보 표현 | /privacy·도움말 문구 점검 필요 | 금지 표현 없는지, 저장·보관 기간 명시 여부 확인 |
| 선톡 월 2회 vs 알림 블록 분리 | 예산/정기지출 알림 설계 시 적용 | 알림 기능은 알림 전용 블록 + 빈 outputs 스킵 패턴 |
| 멱등키 중복 방지 | ✅ 기존 카카오 재전송·반복 발화·거래 중복 방어 유지 | 회귀 테스트 유지 |
| URL 랜딩 쿼리 신뢰 금지 | 세션 검증 준수 중 | 유지 |
| 웰컴/설명 문구 길이 | OpenBuilder 설정 영역 | 채널 설정 시 참고 |

### V22.8.7 프로젝트 메모

- 그룹 요청 판정은 `botGroupKey` 존재 여부를 단일 기준으로 사용한다.
- 그룹에서 QuickReplies를 조용히 버리지 않고 사용자가 입력할 수 있는 최대 5개 번호형 문장으로 변환한다.
- 1:1 채팅 QuickReplies까지 제거하지 않는다.
- 그룹 output 허용 목록은 SimpleText, SimpleImage, TextCard, BasicCard, ListCard, ItemCard다.
- Event API와 선톡은 이번 릴리스 범위 밖이며 명시 승인 없이 추가하지 않는다.
- 다음 배포에서도 beta 문서 최신성, SQL 필요 여부, `index.js` 교체 여부를 각각 다시 판정한다.
