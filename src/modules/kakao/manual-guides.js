// @build:imports-start
import { jsonResponse } from "../runtime/http.js";
// @build:imports-end

// V22.9.65: 버튼으로 따라 하는 사용 설명서.
// 카카오 승인권자 요청 — 기록·예산·리포트·정기지출·웹 관리 사용법을 버튼별로 나누고,
// 초등학생도 따라 할 수 있는 짧은 단계와 예시로 안내한다. 그룹 챗봇은 QuickReplies·Carousel 을
// 지원하지 않으므로 textCard 의 세로 버튼(최대 5개)과 message·mention·inviteMember 액션을 쓴다.
// 설명서는 읽기 전용이다. 사용자·가계부 행을 만들거나 기록을 저장하지 않는다.
// 버튼이 보내는 문장은 모두 아래 KAKAO_MANUAL_TRIGGERS 또는 기존 명령으로 다시 처리된다.
const KAKAO_MANUAL_CARD_DESCRIPTION_MAX = 400;
const KAKAO_MANUAL_BUTTON_LABEL_MAX = 14;

const KAKAO_MANUAL_HOME = { label: "사용 설명서", messageText: "사용 설명서" };

// 토픽별 진입 문장. 공백·물음표 등을 뺀 형태로 비교한다.
// 기존 동작 명령(예산 설정·남은 예산·오늘 기록 보기·웹 가계부 열기 등)은 여기에 넣지 않는다.
const KAKAO_MANUAL_TRIGGERS = Object.freeze({
  home: ["사용설명서", "설명서", "사용설명서보기", "설명서보기", "매뉴얼", "메뉴얼", "사용매뉴얼", "사용메뉴얼", "사용가이드", "가이드보기", "전체가이드", "전체사용법", "처음사용하는법", "처음사용법", "멍령어"],
  record: ["기록하는법", "기록하는방법", "기록방법", "기록방법알려줘", "기록하는법알려줘", "입력방법", "입력하는법", "입력하는방법", "입력예시", "기록예시", "가계부입력예시", "지출입력예시", "수입입력예시", "어떻게입력해", "어떻게입력", "어떻게기록해", "어떻게기록", "카톡입력", "수입입력", "지출입력", "입력하기", "예시", "예제"],
  budget: ["예산정하는법", "예산정하는방법", "예산설정방법", "예산설정하는법", "예산설정하는방법", "예산가이드", "예산사용법", "예산사용방법", "예산방법", "예산안내", "예산설명"],
  report: ["리포트보는법", "리포트보는방법", "리포트", "리포트보기방법", "보고서보는법", "보고서", "통계보는법", "통계보는방법", "요약보는법", "요약보는방법", "조회방법", "조회하는법", "쓴돈보는법"],
  recurring: ["정기지출", "정기지출설정방법", "정기지출설정하는법", "정기지출방법", "정기지출등록방법", "정기지출등록", "정기지출설정", "정기예산", "정기예산설정", "정기예산설정방법", "정기예산설정하는법", "고정지출", "고정지출설정", "고정지출등록", "고정지출방법", "매달나가는돈", "매달나가는돈등록", "정기결제", "정기수입", "정기수입지출", "구독료등록", "월세등록"],
  web: ["웹관리방법", "웹에서관리하기", "웹에서관리하는법", "웹관리", "웹사용법", "웹사용방법", "웹가계부사용법", "웹가계부사용방법", "웹이용방법", "웹으로관리하기", "웹가계부관리방법", "웹에서보는법"],
  together: ["함께쓰는법", "함께쓰는방법", "같이쓰는법", "같이쓰는방법", "함께쓰기", "같이쓰기", "친구와함께쓰기", "가족과함께쓰기", "공유방법", "단톡방사용법", "단톡방에서쓰는법", "공동가계부방법"],
  edit: ["고치는법", "고치는방법", "고치기지우기", "수정하는법", "지우는법", "삭제하는법", "기록고치는법", "기록지우는법", "수정가이드", "수정방법", "삭제방법", "기록수정방법", "기록삭제방법"],
});

function kakaoManualCompact(text = "") {
  return String(text || "")
    .normalize("NFC")
    .replace(/[\u200b-\u200d\ufeff\u{fe0f}\u{20e3}]/gu, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/^@\S+\s*/, "")
    .replace(/^\/+/, "")
    .replace(/[\s?？!！.。~·ㆍ,'"‘’“”]/g, "")
    .replace(/(?:좀)?(?:알려줘|알려주세요|보여줘|보여주세요|가르쳐줘|가르쳐주세요)$/, "")
    .toLowerCase();
}

function kakaoManualTopic(text = "") {
  const compact = kakaoManualCompact(text);
  if (!compact || compact.length > 30) return "";
  for (const [topic, words] of Object.entries(KAKAO_MANUAL_TRIGGERS)) {
    if (words.includes(compact)) return topic;
  }
  return "";
}

function kakaoManualMessageButton(label, messageText) {
  return { label: String(label).slice(0, KAKAO_MANUAL_BUTTON_LABEL_MAX), action: "message", messageText: String(messageText) };
}

function kakaoManualButtons(items = [], { group = false } = {}) {
  const out = [];
  for (const item of items) {
    if (!item) continue;
    if (item.plugin) {
      // mention·inviteMember 는 그룹 챗봇 전용 플러그인이다. 1:1 에서는 같은 뜻의 메시지 버튼으로 바꾸거나 뺀다.
      if (group) out.push({ label: String(item.label).slice(0, KAKAO_MANUAL_BUTTON_LABEL_MAX), action: item.plugin });
      else if (item.fallback) out.push(kakaoManualMessageButton(item.fallback.messageText, item.fallback.messageText));
      continue;
    }
    out.push(kakaoManualMessageButton(item.messageText, item.messageText));
    if (out.length >= 5) break;
  }
  const seen = new Set();
  return out.filter((button) => {
    const key = button.messageText ? `m:${button.messageText}` : `p:${button.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

const KAKAO_MANUAL_PAGES = Object.freeze({
  home: {
    // V22.9.68: 시작·도움말·메뉴가 모두 이 화면으로 온다. 버튼 두 번이면 모든 기능에 닿는다.
    title: "말해가계부 사용 설명서",
    description: "하고 싶은 것을 눌러 보세요.",
    buttons: [
      { messageText: "기록하는 법" },
      { messageText: "리포트 보는 법" },
      { messageText: "예산 정하는 법" },
      { messageText: "함께 쓰는 법" },
      { messageText: "웹 관리 방법" },
    ],
  },
  record: {
    title: "기록하는 법",
    description: [
      "@말해가계부 점심 12000원",
      "처럼 보내면 바로 기록돼요.",
      "예) 어제 병원 15000원 국민카드",
    ].join("\n"),
    buttons: [
      { label: "지금 기록하기", plugin: "mention" },
      { messageText: "오늘 기록 보기" },
      { messageText: "고치는 법" },
      KAKAO_MANUAL_HOME,
    ],
  },
  budget: {
    title: "예산 정하는 법",
    description: [
      "‘예산 설정’을 누르고 버튼을 차례로 고르면 끝!",
      "한 번에: 외식 예산설정 30만원",
      "(가계부 주인·관리자만 가능)",
    ].join("\n"),
    buttons: [
      { messageText: "예산 설정" },
      { messageText: "남은 예산" },
      { messageText: "정기지출 방법" },
      KAKAO_MANUAL_HOME,
    ],
  },
  report: {
    title: "리포트 보는 법",
    description: [
      "버튼을 누르면 바로 보여 드려요.",
      "다른 기간: 어제 요약 · 지난 달 요약",
    ].join("\n"),
    buttons: [
      { messageText: "이번 달 요약" },
      { messageText: "오늘 기록 보기" },
      { messageText: "남은 예산" },
      { messageText: "정산" },
      KAKAO_MANUAL_HOME,
    ],
  },
  recurring: {
    title: "정기지출 방법",
    description: [
      "월세·통신비처럼 매달 나가는 돈은",
      "웹 > 예산 > 정기 수입·지출에 한 번 등록하면",
      "매월 정한 날 자동으로 기록돼요.",
    ].join("\n"),
    buttons: [
      { messageText: "웹 가계부 열기" },
      KAKAO_MANUAL_HOME,
    ],
  },
  web: {
    title: "가계부·웹 관리",
    description: [
      "‘웹 가계부 열기’로 주소를 받아 로그인하면",
      "내역 수정·통계·예산을 크게 볼 수 있어요.",
    ].join("\n"),
    buttons: [
      { messageText: "웹 가계부 열기" },
      { messageText: "새 가계부 만들기" },
      { messageText: "초대코드로 참여" },
      { messageText: "가계부 전환" },
      KAKAO_MANUAL_HOME,
    ],
  },
  together: {
    title: "함께 쓰는 법",
    description: [
      "같은 단톡방에서 기록하면",
      "모두 한 가계부를 함께 써요.",
    ].join("\n"),
    buttons: [
      { label: "친구 초대하기", plugin: "inviteMember" },
      { messageText: "내 이름 설정" },
      { messageText: "단톡방 연결" },
      { messageText: "초대코드" },
      KAKAO_MANUAL_HOME,
    ],
  },
  edit: {
    title: "고치는 법",
    description: [
      "‘오늘 기록 보기’로 번호를 보고",
      "수정 01번 금액 13000",
      "삭제 01번 처럼 보내요.",
    ].join("\n"),
    buttons: [
      { messageText: "오늘 기록 보기" },
      KAKAO_MANUAL_HOME,
    ],
  },
});
function kakaoManualCard(page, { group = false, prefix = "" } = {}) {
  const description = [prefix, page.description].filter(Boolean).join("\n\n").slice(0, KAKAO_MANUAL_CARD_DESCRIPTION_MAX);
  return {
    textCard: {
      title: page.title,
      description,
      buttons: kakaoManualButtons(page.buttons, { group }),
      buttonLayout: "vertical",
    },
  };
}

function kakaoManualOutputs(topic = "home", { group = false, statusLine = "" } = {}) {
  const page = KAKAO_MANUAL_PAGES[topic] || KAKAO_MANUAL_PAGES.home;
  const outputs = [kakaoManualCard(page, { group, prefix: topic === "home" ? statusLine : "" })];
  if (page.more) {
    const more = kakaoManualCard(page.more, { group });
    if (more.textCard.buttons.length) outputs.push(more);
  }
  return outputs;
}

function kakaoManualReply(topic = "home", options = {}) {
  return jsonResponse({ version: "2.0", template: { outputs: kakaoManualOutputs(topic, options) } }, 200);
}

// @build:exports-start
export { kakaoManualReply, kakaoManualTopic };
// @build:exports-end
