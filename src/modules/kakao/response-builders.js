
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
    ["가계부 만들기", "새 가계부 만들기"],
    ["초대코드 참여", "초대코드로 참여"],
    ["예산 설정", "예산 설정"],
    ["내 이름 설정", "내 이름 설정"],
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
  return ["선택하려면 아래 문구를 그대로 입력해 주세요.", ...lines].join("\n");
}

async function kakaoGroupCompatibleResponse(response, payload = {}, origin = "") {
  if (!getKakaoBotGroupKey(payload)) return response;
  try {
    const raw = await response.clone().text();
    const data = JSON.parse(raw || "{}");
    const template = data?.template && typeof data.template === "object" ? { ...data.template } : {};
    const textChoices = kakaoGroupTextChoices(template.quickReplies);
    delete template.quickReplies;

    const outputs = (Array.isArray(template.outputs) ? template.outputs : []).map((output) => {
      if (!output || typeof output !== "object") return null;
      const supportedKey = Object.keys(output).find((key) => KAKAO_GROUP_SUPPORTED_OUTPUTS.has(key));
      return supportedKey ? { [supportedKey]: output[supportedKey] } : null;
    }).filter(Boolean).slice(0, 3);

    if (!outputs.length) return kakaoText(kakaoSkillSafeFallbackText(origin));
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
