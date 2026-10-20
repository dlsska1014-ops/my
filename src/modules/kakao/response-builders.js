// @build:imports-start
import { safeError } from "../runtime/leases.js";
import { jsonResponse } from "../runtime/http.js";
import { kakaoSkillSafeFallbackText } from "./reply-texts.js";
import { getKakaoBotGroupKey } from "./group-links-first-record.js";
// @build:imports-end

// V22.9.26: 저장소가 상태 코드로 거절한 경우(Supabase 4xx·5xx)는 저장된 행이 없다.
function isUncertainStorageWrite(err) {
  // Alias/security wrappers must retain the transport outcome classification.
  for (let current = err, depth = 0; current && depth < 8; current = current.cause, depth += 1) {
    if (current.uncertain_write === true || current.code === "supabase_write_result_unknown") return true;
  }
  return false;
}

function isDefiniteStorageFailure(err) {
  if (isUncertainStorageWrite(err)) return false;
  return /^Supabase 4\d\d\b/.test(safeError(err) || "") && !/^Supabase 408\b/.test(safeError(err) || "");
}

function kakaoSaveFailedText(origin = "") {
  return [
    "저장하지 못했어요 😢",
    "",
    "가계부 저장소가 요청을 거절해 이번 내용은 기록되지 않았어요.",
    "잠시 후 같은 내용을 다시 보내 주세요.",
  ].join("\n");
}

function kakaoSafeText(text = "") {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  // Kakao simpleText는 길이가 과하면 스킬 테스트에서 응답 검증 실패로 처리될 수 있어 안전 길이로 자릅니다.
  return raw.length > 950 ? `${raw.slice(0, 930)}\n\n…자세한 내용은 메뉴를 눌러 확인해주세요.` : (raw || "잠시 후 다시 시도해주세요.");
}

function kakaoQr(label, messageText = label, extra = null) {
  const safeLabel = String(label || "").trim().slice(0, 14);
  const safeMessage = String(messageText || label || "").trim().slice(0, 80);
  if (!safeLabel || !safeMessage) return null;
  const out = { label: safeLabel, action: "message", messageText: safeMessage };
  // 오픈빌더 스킬 테스트 호환성을 위해 빈 extra 객체는 보내지 않습니다.
  if (extra && typeof extra === "object" && Object.keys(extra).length) out.extra = extra;
  return out;
}

function dedupeQuickReplies(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const q = item && item.label ? item : (Array.isArray(item) ? kakaoQr(item[0], item[1] || item[0]) : null);
    if (!q) continue;
    const key = `${q.label}|${q.messageText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= 10) break;
  }
  return out;
}

function kakaoDefaultQuickReplies() {
  // 문서/운영 화면에서 보여주는 단계형 바로연결 후보입니다.
  // 실제 일반 응답에는 자동 첨부하지 않습니다.
  return dedupeQuickReplies([
    ["시작", "시작"],
    ["가계부만들기", "가계부만들기"],
    ["초대코드참여", "초대코드참여"],
    ["예산설정", "예산설정"],
    ["이름설정", "이름설정"],
  ]);
}

function kakaoQuickRepliesForText(text = "") {
  // V21.5: 과거의 문구 기반 자동 바로연결은 사용하지 않습니다.
  // 단계형 흐름에서만 호출부가 quickReplies를 명시적으로 전달합니다.
  return [];
}

function kakaoText(text, quickReplies = null, status = 200) {
  const template = {
    outputs: [
      {
        simpleText: {
          text: kakaoSafeText(text),
        },
      },
    ],
  };
  const replies = Array.isArray(quickReplies) ? dedupeQuickReplies(quickReplies) : [];
  if (replies.length) template.quickReplies = replies;
  return jsonResponse({
    version: "2.0",
    template,
  }, status);
}

// 그룹 단톡방에서 봇만 멘션하고 내용 없이 보낸 경우(빈 발화)의 짧은 안내.
// 카카오 심사 요청: 문구는 기본 시작 안내의 절반 이하로 줄이고, 자세한 설명은
// 관리자센터 '도움말 블록'에 둔다. 버튼은 그룹 챗봇 스킬 응답 플러그인 액션
// guide(도움말 하단 창)와 mention(입력창에 챗봇 멘션 자동 입력)을 사용한다.
const KAKAO_GROUP_EMPTY_MENTION_TITLE = "안녕하세요 😊 말해가계부예요";
const KAKAO_GROUP_EMPTY_MENTION_DESCRIPTION = [
  "친구와 함께 말 한마디로 간단히 기록하는 가계부 챗봇이에요.",
  "예) @말해가계부 점심 12000원",
].join("\n");

function kakaoGroupEmptyMentionReply() {
  return jsonResponse({
    version: "2.0",
    template: {
      outputs: [
        {
          textCard: {
            title: KAKAO_GROUP_EMPTY_MENTION_TITLE,
            description: KAKAO_GROUP_EMPTY_MENTION_DESCRIPTION,
            buttons: [
              // V22.9.70: ‘도움말’ 발화는 OpenBuilder 기본 도움말 블록(고정 패턴, 글만 있는 하단 창)으로 가므로,
              // 버튼형 설명서는 ‘도움말 보기’로 연다(단톡방은 버튼 이름을 그대로 보낸다 → 스킬이 ‘도움말’로 읽는다).
              // V22.9.72: 디자이너 피드백(2026-10-20) — ‘챗봇 멘션하기’는 ‘기록하기’로, 맨 아래에 둔다.
              { label: KAKAO_MANUAL_HOME_GROUP_LABEL, action: "message", messageText: KAKAO_MANUAL_HOME_GROUP_LABEL },
              { ...KAKAO_RECORD_MENTION_BUTTON },
            ],
          },
        },
      ],
    },
  }, 200);
}

// V22.9.72: 버튼 이름 상수. 단톡방 메시지 버튼은 이름을 그대로 보내므로 이름 = 명령이다.
const KAKAO_MANUAL_HOME_GROUP_LABEL = "도움말 보기";
const KAKAO_RECORD_MENTION_BUTTON = Object.freeze({ label: "기록하기", action: "mention" });
const KAKAO_NEXT_STEP_CARD_TEXT_MAX = 400;

// V22.9.72: 다음 행동으로 이어지는 답(2026-10-20 디자이너 피드백: 빈 결과·참여 전·예산 없음 안내는 짧게 쓰고 버튼으로 잇는다).
// 단톡방은 textCard 세로 버튼(메시지 버튼 + 맨 아래 ‘기록하기’ 멘션 플러그인), 1:1 은 바로가기(quickReplies)로 보낸다.
function kakaoNextStepReply(text, payload = {}, quickReplies = [], { record = true } = {}) {
  const replies = dedupeQuickReplies(Array.isArray(quickReplies) ? quickReplies : []).map((q) => [q.label, q.messageText]);
  if (!getKakaoBotGroupKey(payload)) return kakaoText(text, record ? [...replies, ["기록방법", "기록방법"]] : replies);
  const buttons = replies.slice(0, record ? 4 : 5).map(([label, messageText]) => ({ label: messageText.length <= 14 ? messageText : label, action: "message", messageText }));
  if (record) buttons.push({ ...KAKAO_RECORD_MENTION_BUTTON });
  return jsonResponse({
    version: "2.0",
    template: {
      outputs: [{ textCard: { description: kakaoSafeText(text).slice(0, KAKAO_NEXT_STEP_CARD_TEXT_MAX), buttons, buttonLayout: "vertical" } }],
    },
  }, 200);
}

const KAKAO_GROUP_SUPPORTED_OUTPUTS = new Set([
  "simpleText",
  "simpleImage",
  "textCard",
  "basicCard",
  "listCard",
  "itemCard",
]);

function kakaoGroupTextChoices(quickReplies = []) {
  const replies = dedupeQuickReplies(Array.isArray(quickReplies) ? quickReplies : []).slice(0, 5);
  if (!replies.length) return "";
  const lines = replies.map((reply, index) => {
    const command = String(reply.messageText || reply.label || "").replace(/\s+/g, " ").trim().slice(0, 60);
    return command ? `${index + 1}. ${command}` : "";
  }).filter(Boolean);
  if (!lines.length) return "";
  return ["더 고르려면 아래 문구를 보내 주세요.", ...lines].join("\n");
}

// V22.9.65: 그룹 챗봇은 QuickReplies 를 지원하지 않으므로 textCard 의 세로 메시지 버튼(카드당 최대 5개)으로 바꾼다.
// V22.9.67: 단톡방 메시지 버튼은 messageText 가 아니라 버튼 이름을 그대로 보낸다. 그래서 버튼 이름을 보낼 명령과
// 똑같이 맞춘다(14자 이하일 때). 안내 글이 짧으면 글과 버튼을 한 말풍선에 담아 대화창이 길어지지 않게 한다.
const KAKAO_GROUP_CARD_TEXT_MAX = 400;

function kakaoGroupChoiceButtons(quickReplies = []) {
  return dedupeQuickReplies(Array.isArray(quickReplies) ? quickReplies : [])
    .filter((reply) => reply.action === "message" && reply.messageText)
    .map((reply) => ({ label: reply.messageText.length <= 14 ? reply.messageText : reply.label, action: "message", messageText: reply.messageText }));
}

function kakaoGroupChoiceCards(quickReplies = [], outputs = []) {
  const buttons = kakaoGroupChoiceButtons(quickReplies);
  if (!buttons.length) return { outputs, rest: [] };
  const merged = [...outputs];
  let used = 0;
  const lastIndex = merged.length - 1;
  const lastText = merged[lastIndex]?.simpleText?.text;
  if (typeof lastText === "string" && lastText.length <= KAKAO_GROUP_CARD_TEXT_MAX) {
    const chunk = buttons.slice(0, 5);
    merged[lastIndex] = { textCard: { description: lastText, buttons: chunk, buttonLayout: "vertical" } };
    used = chunk.length;
  }
  while (used < buttons.length && merged.length < 3) {
    const chunk = buttons.slice(used, used + 5);
    merged.push({ textCard: { title: used ? "더 보기" : "골라 주세요", buttons: chunk, buttonLayout: "vertical" } });
    used += chunk.length;
  }
  return { outputs: merged, rest: buttons.slice(used) };
}
async function kakaoGroupCompatibleResponse(response, payload = {}, origin = "") {
  if (!getKakaoBotGroupKey(payload)) return response;
  try {
    const raw = await response.clone().text();
    const data = JSON.parse(raw || "{}");
    const template = data?.template && typeof data.template === "object" ? { ...data.template } : {};
    const quickReplies = template.quickReplies;
    delete template.quickReplies;

    const outputs = (Array.isArray(template.outputs) ? template.outputs : []).map((output) => {
      if (!output || typeof output !== "object") return null;
      const supportedKey = Object.keys(output).find((key) => KAKAO_GROUP_SUPPORTED_OUTPUTS.has(key));
      return supportedKey ? { [supportedKey]: output[supportedKey] } : null;
    }).filter(Boolean).slice(0, 3);

    if (!outputs.length) return kakaoText(kakaoSkillSafeFallbackText(origin));
    const choice = kakaoGroupChoiceCards(quickReplies, outputs);
    outputs.splice(0, outputs.length, ...choice.outputs);
    const textChoices = kakaoGroupTextChoices(choice.rest);
    if (textChoices) {
      const simpleTextOutput = outputs.find((output) => output?.simpleText?.text);
      if (simpleTextOutput) {
        simpleTextOutput.simpleText = {
          ...simpleTextOutput.simpleText,
          text: kakaoSafeText(`${simpleTextOutput.simpleText.text}\n\n${textChoices}`),
        };
      } else if (outputs.length < 3) {
        outputs.push({ simpleText: { text: kakaoSafeText(textChoices) } });
      }
    }

    const headers = new Headers(response.headers || {});
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(JSON.stringify({ ...data, version: "2.0", template: { ...template, outputs } }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    return kakaoText(kakaoSkillSafeFallbackText(origin));
  }
}
// @build:exports-start
export {
  dedupeQuickReplies, isDefiniteStorageFailure, isUncertainStorageWrite, kakaoDefaultQuickReplies,
  kakaoGroupCompatibleResponse, kakaoGroupEmptyMentionReply, kakaoNextStepReply, kakaoQr,
  kakaoSaveFailedText, kakaoText,
};
// @build:exports-end
