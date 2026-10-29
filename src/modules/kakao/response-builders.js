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
  if (raw.length <= 950) return raw || "잠시 후 다시 시도해주세요.";
  // V22.9.77 감사 A-14: 자를 때는 줄 경계에서 자른다(예전에는 930자에서 줄 중간이 잘렸다). 줄바꿈이 앞쪽 절반에만 있으면
  // 낱말 경계에서, 그것도 없으면 예전처럼 930자에서 자른다.
  const head = raw.slice(0, 930);
  const line = head.lastIndexOf("\n");
  const space = head.lastIndexOf(" ");
  const cut = line >= 465 ? line : space >= 465 ? space : head.length;
  return `${head.slice(0, cut).trimEnd()}\n\n…자세한 내용은 메뉴를 눌러 확인해주세요.`;
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

// V22.9.88(Y-7): 링크 버튼(leadButtons)은 메시지 버튼보다 앞에 둔다. 그래서 늘 첫 카드에 들어가고, 글로 늘어놓는 나머지(rest)에는 오지 않는다.
function kakaoGroupChoiceCards(quickReplies = [], outputs = [], leadButtons = []) {
  const buttons = [...leadButtons, ...kakaoGroupChoiceButtons(quickReplies)];
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
    const title = used ? "더 보기" : chunk.every((button) => button.action === "webLink") ? "바로 열기" : "골라 주세요";
    merged.push({ textCard: { title, buttons: chunk, buttonLayout: "vertical" } });
    used += chunk.length;
  }
  return { outputs: merged, rest: buttons.slice(used).filter((button) => button.action === "message") };
}

// V22.9.88(Y-7): 카카오 그룹 챗봇 심사 의견(2026-10-29) — 챗봇 답의 글에 http(s) 주소를 그대로 넣지 말고, 버튼을 누르면 그 페이지가
// 열리게 한다. 우리 사이트 주소는 링크 버튼(webLink)으로 옮긴다(주소만 있는 줄 바로 앞의 짧은 줄이 버튼 이름). 다른 곳 주소(사용자가
// 쓴 메모 등)는 버튼으로 만들지 않고 글에서 ‘(링크)’로 바꾼다. 단톡방의 ‘웹가계부’ 메시지 버튼도 바로 열리는 링크 버튼으로 바꾼다
// (1:1 의 ‘웹가계부’ 답은 웹 연결 코드를 주므로 메시지 버튼으로 둔다).
// 버튼을 누르면 카카오가 주소 뒤에 botUserKey·appUserId·botGroupKey 를 붙인다. 웹은 그 값으로 로그인하거나 권한을 정하지 않는다.
const KAKAO_TEXT_URL = /https?:\/\/[^\s<>"'`]+/gi;
const KAKAO_LINK_LABEL_MAX = 14;
const KAKAO_LINK_BUTTON_MAX = 3;
const KAKAO_WEB_LEDGER_COMMANDS = new Set(["웹가계부", "웹 가계부 열기"]);

function kakaoLinkButton(label, webLinkUrl) {
  return { label: String(label || "").trim().slice(0, KAKAO_LINK_LABEL_MAX) || "웹에서 보기", action: "webLink", webLinkUrl: String(webLinkUrl) };
}

function kakaoLinkDefaultLabel(pathname = "") {
  if (pathname === "/my" || pathname === "/app") return "웹 가계부 열기";
  if (pathname.startsWith("/my/households")) return "가계부 관리";
  if (pathname.startsWith("/my/settings")) return "설정 열기";
  if (pathname.startsWith("/my/analysis")) return "분석 보기";
  return "웹에서 보기";
}

function kakaoOwnLinkUrl(raw = "", origin = "") {
  try {
    const url = new URL(String(raw).replace(/[)\].,;:!?'"’”」』…]+$/u, ""));
    return origin && url.origin === new URL(origin).origin ? url : null;
  } catch (_) {
    return null;
  }
}

function kakaoTextLinks(text, origin = "") {
  if (typeof text !== "string" || !/https?:\/\//i.test(text)) return { text, links: [] };
  const lines = [];
  const links = [];
  for (const line of text.split("\n")) {
    const found = line.match(KAKAO_TEXT_URL);
    if (!found) {
      lines.push(line);
      continue;
    }
    let rest = line;
    const own = [];
    for (const raw of found) {
      const url = kakaoOwnLinkUrl(raw, origin);
      rest = rest.replace(raw, url ? "" : "(링크)");
      if (url) own.push(url);
    }
    rest = rest.replace(/\s*[:：→-]\s*$/u, "").replace(/\s{2,}/g, " ").trim();
    let label = "";
    if (own.length === 1 && !rest) {
      const previous = String(lines.at(-1) || "").trim();
      if (previous && previous.length <= KAKAO_LINK_LABEL_MAX && !/[.!?。…]$/u.test(previous)) {
        label = previous;
        lines.pop();
      }
    } else if (own.length === 1 && rest.length <= KAKAO_LINK_LABEL_MAX) {
      label = rest;
      rest = "";
    }
    for (const url of own) links.push(kakaoLinkButton(label || kakaoLinkDefaultLabel(url.pathname), url.href));
    if (rest) lines.push(rest);
  }
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), links };
}

function kakaoUniqueLinks(links = []) {
  const seen = new Set();
  return links.filter((button) => !seen.has(button.webLinkUrl) && seen.add(button.webLinkUrl)).slice(0, KAKAO_LINK_BUTTON_MAX);
}

// 카드 안의 주소는 그 카드의 버튼 앞쪽에 넣는다. ‘기록하기’(멘션)는 맨 아래에 남기고 모두 5개까지.
function kakaoLinkCardOutput(kind, card, origin) {
  const next = { ...card };
  const own = [];
  for (const field of ["title", "description"]) {
    if (typeof next[field] !== "string") continue;
    const result = kakaoTextLinks(next[field], origin);
    own.push(...result.links);
    if (result.text) next[field] = result.text;
    else delete next[field];
  }
  let buttons = Array.isArray(next.buttons) ? next.buttons : [];
  if (own.length) {
    const mention = buttons.filter((button) => button?.action === "mention");
    const others = buttons.filter((button) => button?.action !== "mention");
    buttons = [...kakaoUniqueLinks(own), ...others].slice(0, 5 - mention.length).concat(mention);
  }
  if (buttons.length) next.buttons = buttons;
  if (!next.title && !next.description) next.title = "바로 열기";
  return { [kind]: next };
}

function kakaoLinkOutputs(outputs = [], origin = "") {
  const links = [];
  const result = [];
  for (const output of outputs) {
    if (typeof output?.simpleText?.text === "string") {
      const { text, links: found } = kakaoTextLinks(output.simpleText.text, origin);
      links.push(...found);
      if (text) result.push(text === output.simpleText.text ? output : { simpleText: { ...output.simpleText, text } });
      continue;
    }
    const kind = output?.textCard ? "textCard" : output?.basicCard ? "basicCard" : "";
    result.push(kind ? kakaoLinkCardOutput(kind, output[kind], origin) : output);
  }
  return { outputs: result, links: kakaoUniqueLinks(links) };
}

// 단톡방의 ‘웹가계부’ 메시지 버튼(설명서 카드·바꾼 바로가기 모두)은 누르면 웹 가계부가 바로 열리는 링크 버튼으로 바꾼다.
function kakaoWebLedgerLinkButtons(outputs = [], origin = "") {
  if (!origin) return outputs;
  return outputs.map((output) => {
    const kind = output?.textCard ? "textCard" : output?.basicCard ? "basicCard" : "";
    const buttons = kind && Array.isArray(output[kind].buttons) ? output[kind].buttons : null;
    if (!buttons?.some((button) => button?.action === "message" && KAKAO_WEB_LEDGER_COMMANDS.has(String(button.messageText || "").trim()))) return output;
    return { [kind]: { ...output[kind], buttons: buttons.map((button) => (button?.action === "message" && KAKAO_WEB_LEDGER_COMMANDS.has(String(button.messageText || "").trim())
      ? kakaoLinkButton(button.label, `${origin}/my`) : button)) } };
  });
}

// 1:1 은 바로가기(quickReplies)를 그대로 두고 글 속 주소만 링크 버튼으로 옮긴다. 글 말풍선은 그대로 두고(웹 연결 코드처럼 복사할
// 글이 있다) 버튼은 뒤의 ‘바로 열기’ 카드에 둔다. 말풍선이 이미 3개면 마지막 짧은 글에 붙인다.
async function kakaoDirectLinkResponse(response, origin = "") {
  try {
    const raw = await response.clone().text();
    if (!/https?:\/\//i.test(raw)) return response;
    const data = JSON.parse(raw || "{}");
    const template = data?.template && typeof data.template === "object" ? { ...data.template } : null;
    if (!template || !Array.isArray(template.outputs)) return response;
    const linked = kakaoLinkOutputs(template.outputs, origin);
    let outputs = linked.outputs.slice(0, 3);
    if (linked.links.length && outputs.length < 3) outputs.push({ textCard: { title: "바로 열기", buttons: linked.links, buttonLayout: "vertical" } });
    else if (linked.links.length) outputs = kakaoGroupChoiceCards([], outputs, linked.links).outputs;
    if (!outputs.length) return response;
    const headers = new Headers(response.headers || {});
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ ...data, template: { ...template, outputs } }), { status: response.status, statusText: response.statusText, headers });
  } catch (_) {
    return response;
  }
}

// V22.9.88(Y-7): ‘웹가계부’ 답(단톡방). 주소 글 대신 웹 가계부를 여는 버튼 하나를 단다. 로그인돼 있으면 바로 열리고, 아니면
// 로그인 화면이 먼저 나온다(웹은 카카오가 붙이는 값으로 로그인하지 않는다).
// 이 방 가계부 번호(household_id)는 넣지 않는다. 단톡방 기록 계정과 웹 로그인 계정은 아직 이어지지 않아(챗봇에 앱이 연결되지 않아
// appUserId 가 없다), 웹 계정이 그 가계부 구성원이 아니면 /my?household_id= 는 ‘가계부를 찾을 수 없어요’(404)가 된다.
function kakaoWebLedgerReply(origin = "") {
  if (!origin) return kakaoText("웹 가계부는 말해가계부 웹사이트에서 로그인한 뒤 볼 수 있어요.");
  return jsonResponse({
    version: "2.0",
    template: {
      outputs: [{
        textCard: {
          title: "웹 가계부",
          description: "전체 기록과 분석을 웹에서 크게 볼 수 있어요.\n아래 버튼을 누르면 바로 열려요(처음에는 로그인).",
          buttons: [kakaoLinkButton("웹 가계부 열기", `${origin}/my`)],
          buttonLayout: "vertical",
        },
      }],
    },
  }, 200);
}

async function kakaoGroupCompatibleResponse(response, payload = {}, origin = "") {
  if (!getKakaoBotGroupKey(payload)) return kakaoDirectLinkResponse(response, origin);
  try {
    const raw = await response.clone().text();
    const data = JSON.parse(raw || "{}");
    const template = data?.template && typeof data.template === "object" ? { ...data.template } : {};
    const quickReplies = template.quickReplies;
    delete template.quickReplies;

    const supported = (Array.isArray(template.outputs) ? template.outputs : []).map((output) => {
      if (!output || typeof output !== "object") return null;
      const supportedKey = Object.keys(output).find((key) => KAKAO_GROUP_SUPPORTED_OUTPUTS.has(key));
      return supportedKey ? { [supportedKey]: output[supportedKey] } : null;
    }).filter(Boolean).slice(0, 3);

    if (!supported.length) return kakaoText(kakaoSkillSafeFallbackText(origin));
    const linked = kakaoLinkOutputs(supported, origin);
    const choice = kakaoGroupChoiceCards(quickReplies, linked.outputs, linked.links);
    const outputs = kakaoWebLedgerLinkButtons(choice.outputs, origin);
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
  kakaoSaveFailedText, kakaoText, kakaoWebLedgerReply,
};
// @build:exports-end
