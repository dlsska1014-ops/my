# V22.9.43 검증 기록

기준은 운영 V22.9.42 브랜치 `aside/group-empty-mention`(`7b0cba6`, 운영 배포 `b9bf820c`)입니다. 미배포 V22.9.41 브랜치 `claude/v22941-admin-return`(`56a4c20`)을 합친 뒤(`6bc342b`) 작업했습니다. 작업 브랜치는 `claude/v22943-room-autojoin`이고 상태는 운영 적용 대기(`production-pending`)입니다.

## 바꾼 것과 근거

| 항목 | 내용 | 근거 |
|---|---|---|
| 실제 카카오 요청 모양 | `getExplicitKakaoBotGroupKey`·`getKakaoBotGroupKey`가 `userRequest.chat.properties.botGroupKey`와 type이 `botGroupKey`인 `chat.id`를 읽습니다. 값이 서로 다르면 명시적 키가 아니며, 타입 없는 `chat.id`는 전처럼 준비 근거가 아닙니다. | 2026-10-13 사용자가 운영(V22.9.42) 새 팀채팅에서 ‘@말해가계부 점심 5만원’을 보냈는데 "이 단톡방에 연결된 가계부가 없습니다"로 거절됐습니다. 공식 가이드 모양의 요청으로 V22.9.42(`7b0cba6`)와 이 브랜치에서 같은 문구가 재현됐고, 키를 `user.properties`에 넣은 요청(기존 검사들의 모양)은 준비됐습니다. 수정 뒤에는 공식 모양에서도 새 사람·기존 소유자 모두 방 가계부가 준비됩니다. |
| 승인 없는 방 참여 | `kakao/group-links-first-record.js`의 `tryKakaoGroupFirstRecord`는 연결된 방이면 방 종류와 관계없이 역할 없는 기록자를 `member`로 넣고, `pending`은 조건부 PATCH(`role=eq.pending`)로 `member`로 바꿉니다. 나간 이력(`kakao_group_departed_v22931:*`)이 있으면 넣지 않습니다. 참여 시도 표식은 `kakao_group_member_attempt_v22943:<방>:<사용자>:<가계부>`라서 방을 다른 가계부로 다시 연결해도 막히지 않습니다. | 사용자 요청(2026-10-13): 승인 단계를 없애고 방에서 기록하면 자동으로 구성원이 되게 해 달라. 전에는 첫 기록으로 준비한 방만 자동 참여했고 직접 연결한 방은 거절했습니다. |
| 구성원 권한 | `my/access-control.js`가 `household_member_policy_v22943:<가계부>`를 읽고 씁니다(`fetchHouseholdMemberPolicy`·`saveHouseholdMemberPolicy`). 저장은 소유자만 하며, 가계부 잠금 안에서 역할을 엄격하게 다시 읽습니다. 판정 함수는 `canChangeMyHouseholdRecords`·`memberRecordChangeError`입니다. | 사용자 요청: 최초 생성자가 수정까지 가능하게 할지 기록만 가능하게 할지 정하는 기준. DB 역할 제약(V22.8.46) 때문에 새 역할 대신 설정 한 줄로 저장합니다. |
| 카카오 | ‘구성원 권한’ 보기·바꾸기(`parseKakaoMemberPolicyCommand`·`kakaoMemberPolicyReply`), 수정·삭제·복구·방금 삭제와 수정 세션 반영 직전 차단(`kakaoRecordChangeRefusalTextV4`)을 넣었습니다. 기록만 구성원의 저장 안내에서는 수정·삭제 문구를 뺍니다(권한 값은 기존 입력 설정 조회에 함께 읽음). 연결 확인·완료·참여·시작·연결 상태 안내도 고쳤습니다. | 판정은 소유자·관리자일 때 정책을 읽지 않고, 구성원일 때만 한 번 읽습니다. |
| 웹 | 판정을 넣은 경로: `/admin/update`·`/admin/delete`·`/my/update`·`/my/delete`·`/transactions/edit`·`/u/api/day-transactions`·`/u/api/goals`·`/my/card-target/save`. 화면에서는 목표 화면, 리포트의 카드 실적 목표 폼, `/app` 수정 단추에 반영했습니다. 참여자·초대 화면에 구성원 권한 칸과 `POST /my/member-policy/save`를 더했고, 가계부를 삭제하면 권한 줄도 지웁니다. | 홈·리포트는 기존 설정 묶음 조회에 권한 키를 더해 추가 조회가 없습니다. 날짜 시트는 기존 병렬 단계에서 함께 읽습니다. |
| 안내 문구 | 공개 안내(역할 표·단톡방 첫 기록·공동 가계부 글·FAQ)와 카카오 시작 도움말을 새 규칙에 맞췄습니다. | 옛 문구는 "기존 수동 연결·승인 대기는 자동 참여로 우회하지 않는다"였습니다. |

## 검사

- 새 검사 `validation/validate-room-autojoin-v22943.mjs` 156개(`npm run validate:room-autojoin`). 공식 가이드 모양 요청(키가 `chat.properties`)으로 새 방 준비·두 번째 참여자·타입 없는 `chat.id`·서로 다른 키·인증 없는 요청을 따로 확인하는 17개가 들어 있습니다. 옛 판정으로 되돌린 결함 번들을 이 검사가 잡는 것도 확인했습니다.
- `validate-group-first-v22931`은 920개에서 921개가 됐습니다. 다음 단언을 새 규칙에 맞게 바꿨습니다.
  - 승인 대기의 기록 0건 → 승격하고 저장
  - 직접 연결한 방의 거절 → 참여하고 저장
  - 다시 연결한 방의 거절 → 참여하고 저장

  첫 기록 호출 수(44·43·43·43회)는 그대로입니다.
- 일반·분류 표 부재 모드가 각각 14,745개 검사·410개 체크섬을, SQLite 관제가 84개를 통과했습니다.
- `src/index.js`는 4,076,257바이트, SHA-256 `4002c6dc1bda4e3992f9d841b5dff60e25efb8bcf10ec7a24a53be9bb54383c1`, 모듈 111개입니다. 내보내기 문장 11개는 V22.9.42와 같아 `named_handlers` 대조가 바뀌지 않습니다.
- manifest `BUNDLE_FILE_CHECKSUMS_V22_9_43.sha256` 410개 = V22.9.41의 404개(V22.9.42의 399개를 모두 포함) + 새 검사기 1개 + 판 문서 3개 + 직전 manifest 2개(V22.9.41·V22.9.42).

## 실행하지 못한 검증

다음은 배포 뒤에 합니다(`docs/ASIDE_V22_9_43.md`).

- 실제 카카오 단톡방 확인: 봇 그룹 키와 스킬 Secret의 실제 전달, 두 사람의 참여, 권한 명령
- 운영 Worker 업로드·승격
- 운영 공개 검사
