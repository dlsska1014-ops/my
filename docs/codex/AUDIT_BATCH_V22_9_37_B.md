# V22.9.37 감사 묶음 B — 카카오 챗봇·가계부 수명주기

기준: `docs/codex/AUDIT_FINDINGS_V22_9_33.md` §4·§5, `AUDIT_FINDINGS_V22_9_34.md` §2 이월분. 검증: `validation/validate-audit-batch-b-v22937.mjs`(102 checks). 모든 재현은 메모리 픽스처로 했고, 고치기 전 번들(66f22de)에서는 같은 검사가 67건 실패했다.

## 고친 것

| ID | 원인 | 고친 곳 |
|---|---|---|
| NEW-4 | 카카오 "삭제 NN번"·메뉴 7번이 `transactions` 에 직접 DELETE 를 보내 `accountbook_transaction_audit` 에 남지 않았다. | `kakao/edit-session-v4.js` `deleteKakaoRowWithUndoV4` → `deleteTransactionWithAudit`(감사 RPC, 행위자 = 요청 사용자, 종류 `kakao`). 복구 버퍼·"복구 NN번"·결과 모름("먼저 확인") 보호는 그대로. RPC 거절(4xx) 문구 추가. |
| NEW-9 | 카카오 수정은 감사 RPC 를 탔지만 행위자 없이 `system` 으로 남아 누가 고쳤는지 알 수 없었다. | `kakao/edit-flow-v4.js` `applyKakaoEditFieldV4` 에 `actorUserId`(세션 사용자)·`actorKind: "kakao"`. 바뀐 칸만 보내는 규칙은 그대로. |
| NEW-8 | 수정 메뉴의 "50억"은 내용으로 추론해 "내용을 '50억'으로 바꾸는 건가요?"라고 되물었고, 예산 단계·"예산 50억"은 상한 없이 5,000,000,000원 예산을 저장했다. | `kakao/edit-state-machine.js` `inferFieldFromValue`: 단위 붙은 금액 표기는 금액(상한은 반영 단계가 거절). `kakao/guided-flows.js` 예산 금액·확인 단계, `kakao/skill-handler.js` 한 줄 예산에 20억 상한(`kakaoBudgetAmountTooLargeText`). 맨 금액("4500","5억")의 기록 저장 규칙은 바꾸지 않았다. |
| H2 | 단톡방에서 보낸 참여(명령·흐름)가 1:1 개인 선택을 바꿨다. | `kakao/skill-handler.js`·`kakao/guided-flows.js`: `botGroupKey` 가 있으면 `setKakaoSelectedHousehold` 를 호출하지 않는다. |
| H3 | "가계부 참여 CODE" 가 카카오에서는 참여 흐름 안내로 빠지고(코드를 다시 묻음), 웹은 문구 전체를 코드로 조회했다. | `kakao/skill-handler.js`: 코드가 들어 있으면 흐름 안내 대신 바로 참여. `my/households-lifecycle.js` `handleMyJoin`: `parseJoinCode`·`parseBareInviteCode` 로 코드만 읽는다. |
| H5 | 삭제가 참여자마다 사용자 잠금(claim+release)과 표식 쓰기, 선택 상태 읽기·지우기를 반복해 하위 요청이 참여자 수에 비례했다(20명: 72회 → 50회 한도에서 표식 18/20, 잠금 21개 잔존, purge 미도달). | `my/households-lifecycle.js` `purgeHouseholdData`: 표식은 `markKakaoChatFirstHistoryBatch` 한 번(upsert 배열), 사용자 잠금은 자동 준비 후보(개인 첫 기록 표식 사용자·방 표식 소유자)에만, 선택 상태 정리는 조회 1회+upsert 1회. 가계부 잠금 하나와 방 잠금은 그대로. 20명 삭제가 50회 안에서 끝난다. |
| H6 | 준비 단계 표식을 POST 전에 남기는데 확정 실패(4xx) 뒤에도 단계가 남아 다음 메시지가 영구히 "결과를 확정하지 못했어요"가 됐다. | `kakao/group-links-first-record.js`: 생성·소유자·연결 단계는 확정 실패에서 이전 단계로 되돌리고, 참여자 단계는 시도 표식을 지운다. 결과 모름(5xx·전송 실패)은 예전처럼 단계를 유지한다(새 UUID·보상 삭제 없음). 409(이미 있음)는 되돌리지 않는다. |
| H7 | 같은 이름 비교가 참여만 한 가계부까지 봤다. | `kakao/household-budget-commands.js` `findExistingKakaoHouseholdByNameV2254`: `owner` 역할만 비교. |
| H10 | 카카오가 일반 참여자에게도 초대코드를 보여 줬다. | `skill-handler.js`(초대 명령), `household-budget-commands.js`(초대 후보 = 관리 가능 가계부), `guided-flows.js`(선택 뒤 권한 확인): 소유자·관리자만, 아니면 `kakaoInviteNotAllowedText`. |
| H13 | 이름이 금액 표기용 `normalizeText`("원정"→"원", 기호 제거)를 거쳐 "원정대"가 "원대"로 저장됐다. | `kakao/intent-nlu.js` `normalizeHouseholdNameText`(공백만 고름) + 글자·숫자 2개 이상 규칙(`hasMeaningfulHouseholdName`, V22.9.30 의 `A"` 거절 유지). 만들기 명령·단계형 입력·웹 만들기·이름 변경 모두 적용. |
| H14 | 만들기 폼의 표시 이름이 `users.nickname` 을 PATCH 했다. | `handleMyCreate`: 새 가계부의 `member_aliases` 만 `saveMemberAlias` 로 저장. 기존 가계부가 선택된 경우는 바꾸지 않는다. |
| H15 | 승인 대기 중인 사람이 요청을 거둘 수 없었다. | `domain/users-households.js` `cancelPendingHouseholdJoin`(내 pending 행만 DELETE, 재조회로 확인). 웹: 가계부 목록 카드의 "참여 요청 취소"(POST `/my/household/leave`, pending 은 확인 항목 없이). 카카오: "참여 취소"·"참여 요청 취소"(`isJoinCancelCommand`). |

## 함께 바꾼 검증

- `validation/validate-kakao-edit-safety-v22934.mjs` T2 "응답을 잃은 삭제" 주입 조건에 감사 RPC 경로를 추가했다(한 줄). 카카오 삭제가 더는 `DELETE /rest/v1/transactions` 를 보내지 않으므로 같은 보호를 실제 요청에 건 것이다.

## 남은 확인

- 운영 `accountbook_transaction_audit.actor_kind` 에 새 값 `kakao` 가 쌓인다(제약 없음, 기존 조사 SQL 의 `system` 설명은 예전 기록에만 해당).
- 삭제의 일반 참여자 사용자 잠금을 뺐다. 진행 중인 개인 첫 기록(후보 표식)·방 기록(방·가계부 잠금)과의 직렬화는 기존 검증(`validate-chat-first-v22928`, `validate-group-first-v22931`)이 그대로 통과한다.
