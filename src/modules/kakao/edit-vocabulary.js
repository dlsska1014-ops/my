// V22.9.93 Q-24·Q-30: 고치는 말의 끝맺음과 금액 꼴. 세션 답(edit-state-machine)·한 줄 명령(edit-session-v4)·저장 전 가드(request-guards)가 같은 표를 쓴다.
// 표가 흩어져 있어 ‘바꿔줘요’·‘수정 부탁해’·‘1만 2천원’ 이 새 기록이 됐다. 두 모듈이 불러올 때 곧바로 정규식을 만들므로 MANIFEST 에서 그 둘보다 앞에 둔다.
// 모든 카카오 말이 이 표를 지난다. 되풀이 안에 되풀이를 두지 않는다(‘1만만만…’ 28자가 4초 걸렸다. Workers Free 는 요청당 CPU 10ms).
const KAKAO_EDIT_PLEASE_V4 = String.raw`\s*(?:줘요?|주세요|주라|줄래요?|주실래요?|주시겠어요|주십시오|줘\s*봐요?|부탁(?:해요?|합니다|드려요|드립니다)?)`;
const KAKAO_EDIT_VERB_V4 = String.raw`(?:(?:바꿔|고쳐)(?:요|${KAKAO_EDIT_PLEASE_V4})?|(?:바꿀|고칠)(?:게요?|래요?)|(?:변경|수정|정정)(?:요|\s*(?:해요?|합니다|하자|하기|할게요?|할래요?))?(?:${KAKAO_EDIT_PLEASE_V4})?|해${KAKAO_EDIT_PLEASE_V4}|부탁(?:해요?|합니다|드려요|드립니다))`;
const KAKAO_EDIT_AMOUNT_V4 = String.raw`(?:\d[\d,.]*(?:\s*[억만천백십](?:\s*\d[\d,.]*)?)*\s*원?|[일이삼사오육칠팔구십백천만억](?:[일이삼사오육칠팔구십백천만억\s]*[일이삼사오육칠팔구십백천만억])?\s*원)`;
// @build:exports-start
export { KAKAO_EDIT_AMOUNT_V4, KAKAO_EDIT_PLEASE_V4, KAKAO_EDIT_VERB_V4 };
// @build:exports-end
