// @build:imports-start
import { AB_REAL_SCREENS_IMAGES_V229146 } from "../assets/real-screens-images-v229146.js";
import {
  REAL_SCREENS_CLOCK_V229146, REAL_SCREENS_PERSONAL_V229146, REAL_SCREENS_ROOM_V229146,
  REAL_SCREENS_SHOTS_V229146,
} from "./real-screens-scenario-v229146.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end
// V22.9.146 애드센스 B4(마지막 신청 계획 §B — 실제 화면): 예시 데이터로 찍은 실제 웹 가계부 화면과 그 화면을 만든 카카오톡 문장.
// 사진은 tools/build-real-screens.mjs 가 이 시나리오의 문장을 QA 픽스처(운영 DB·망 없음)의 실제 봇 경로(/skill)로 보내고,
// 봇 답의 웹 링크(카카오가 붙이는 사용자 키 포함)로 연 웹 가계부를 127.0.0.1 중계 + 머리 없는 Chrome 으로 찍은 것이다.
// 사진 바이트는 생성 파일 assets/real-screens-images-v229146.js 에 있고, 이 파일은 시나리오(보낸 날·문장·저장 기대값)와 공개 화면 조각을 둔다.
// 공개 화면은 사진 옆에 이 문장을 그대로 싣는다. validate-v229146-real-screens 가 지금 코드로 문장을 다시 보내 저장 값·정산 숫자를 대조한다
// (사진의 픽셀은 다시 그리지 않는다 — 봇이나 화면 글이 바뀌어 검사가 떨어지면 도구로 사진을 다시 찍는다).

// 사진(생성 파일의 주소·크기)과 설명(시나리오의 이름·alt)을 합친다. 한쪽에만 있는 사진은 싣지 않는다.
const REAL_SCREENS_BY_KEY_V229146 = new Map(REAL_SCREENS_SHOTS_V229146.map((meta) => [meta.key, AB_REAL_SCREENS_IMAGES_V229146.find((image) => image.key === meta.key)]).filter(([, image]) => image).map(([key, image]) => [key, { ...image, ...REAL_SCREENS_SHOTS_V229146.find((meta) => meta.key === key) }]));

// 사진 한 장: 휴대폰 폭(390px)으로 찍은 사진을 그 절반 크기(CSS px)로 싣는다. 크기를 적어 두어 읽는 동안 자리가 밀리지 않게 하고,
// 첫 화면 밖이라 늦게 읽는다(loading=lazy). 설명(alt)은 사진에 보이는 숫자와 글을 그대로 적은 것이다.
function realScreenImgHtml(key) {
  const shot = REAL_SCREENS_BY_KEY_V229146.get(key);
  if (!shot) return "";
  return `<img src="${shot.path}" width="${shot.cssWidth}" height="${shot.cssHeight}" alt="${escapeHtml(shot.alt)}" loading="lazy" decoding="async"/>`;
}

// 사진 여러 장을 한 줄로(휴대폰에서는 옆으로 밀어 본다). 캡션 끝에 찍은 방법을 늘 붙인다.
function realScreensFigureHtml(keys, caption, id = "") {
  const items = keys.map((key) => {
    const shot = REAL_SCREENS_BY_KEY_V229146.get(key);
    return shot ? `<li>${realScreenImgHtml(key)}<span>${escapeHtml(shot.label)}</span></li>` : "";
  }).join("");
  return `<figure class="pubShots"${id ? ` id="${escapeHtml(id)}"` : ""}><ul>${items}</ul><figcaption>${escapeHtml(caption)} ${REAL_SCREENS_METHOD_V229146}</figcaption></figure>`;
}

// 찍은 날은 시나리오의 시계(REAL_SCREENS_CLOCK_V229146)에서 만든다 — tools/build-real-screens.mjs 도 그 값을 읽으므로 둘이 어긋나지 않는다.
const REAL_SCREENS_METHOD_V229146 = (() => {
  const [year, month, day] = REAL_SCREENS_CLOCK_V229146.split("-").map(Number);
  return `예시 데이터로 찍은 실제 웹 가계부 화면이에요(휴대폰 화면 폭 390px, ${year}년 ${month}월 ${day}일 정오 기준).`;
})();

// 문장 목록 앞 한 줄. 사진의 기록은 실제 이용자의 대화가 아니라, 예시 문장을 카카오톡 1:1 채팅·단톡방 요청 모양으로 말해가계부 봇과 같은 코드에 보내
// 만든 것이다(tools/build-real-screens.mjs — QA 픽스처, 날짜는 문장마다 정한 날). 그렇게 적는다(독립 검토 — 사진 출처를 부풀리지 않는다).
const REAL_SCREENS_PERSONAL_LEAD_V229146 = "이 화면의 기록은 아래 예시 문장을 1:1 채팅에서 보낸 것처럼 말해가계부 카카오톡 봇과 같은 코드에 보내 만들었어요. 날짜는 문장마다 정한 보낸 날이에요.";
const REAL_SCREENS_ROOM_LEAD_V229146 = "이 화면의 기록은 아래 예시 문장을 단톡방의 네 사람이 보낸 것처럼 말해가계부 카카오톡 봇과 같은 코드에 보내 만들었어요. 이름은 예시이고, 날짜는 문장마다 정한 보낸 날이에요.";

// 글 쪽(카톡 안내·공동 가계부·체험)의 절: 사진 + 그 기록을 만든 예시 문장 목록.
function realScreensSectionHtml(shots = {}) {
  const keys = Array.isArray(shots.keys) ? shots.keys : [];
  if (shots.log === "none") return realScreensFigureHtml(keys, String(shots.caption || ""), shots.id || "");
  return `${realScreensFigureHtml(keys, String(shots.caption || ""), shots.id || "")}<p class="pubShotLead">${shots.log === "room" ? REAL_SCREENS_ROOM_LEAD_V229146 : REAL_SCREENS_PERSONAL_LEAD_V229146}</p>${realScreensMessagesHtml(shots.log === "room" ? "room" : "personal")}`;
}

// 사진을 만든 문장 목록(보낸 날 · 보낸 문장 · 저장된 값). 기록이 아닌 문장(예산·이름·정산)은 봇이 한 일을 적는다.
function realScreensMessagesHtml(which) {
  const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
  const dayLabel = (ymd) => { const [, m, d] = ymd.split("-").map(Number); return `${m}월 ${d}일`; };
  if (which === "room") {
    const { members, messages } = REAL_SCREENS_ROOM_V229146;
    const rows = messages.map((msg) => {
      const done = msg.expect ? `${members[msg.who]} 지출 ${won(msg.expect.amount)}` : /정산$/.test(msg.text) ? "이번 달 정산 답" : `${members[msg.who]} 이름 정하기`;
      return `<li><span>${dayLabel(msg.day)} · ${escapeHtml(members[msg.who])}</span><code>${escapeHtml(msg.text)}</code><em>${escapeHtml(done)}</em></li>`;
    }).join("");
    return `<ol class="pubShotLog">${rows}</ol>`;
  }
  const { messages } = REAL_SCREENS_PERSONAL_V229146;
  const rows = messages.map((msg) => {
    const done = msg.expect ? `${msg.expect.category} · ${won(msg.expect.amount)}` : /예산/.test(msg.text) ? "예산 설정" : "이름 정하기";
    return `<li><span>${dayLabel(msg.day)}</span><code>${escapeHtml(msg.text)}</code><em>${escapeHtml(done)}</em></li>`;
  }).join("");
  return `<ol class="pubShotLog">${rows}</ol>`;
}

// 공개 화면 CSS(사진 줄·문장 목록). 공개 화면은 셸 CSS 를 싣지 않으므로 여기서 다 정한다.
const REAL_SCREENS_CSS_V229146 = ".pubShots{margin:18px 0 8px;min-width:0}.pubSection .pubShots ul,.pubShots ul{display:flex;gap:14px;margin:0;padding:2px 2px 12px;list-style:none;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}"
  + ".pubSection .pubShots li,.pubShots li{flex:0 0 auto;display:grid;gap:8px;justify-items:center;margin:0;padding:0;scroll-snap-align:start}.pubShots img{display:block;width:min(64vw,236px);height:auto;border:1px solid #d9dee5;border-radius:18px;background:#f2f4f6;box-shadow:0 6px 18px rgba(15,23,42,.08)}"
  + ".pubShots li span{color:#4e5968;font-size:13px;font-weight:600;line-height:1.5;text-align:center}.pubShots figcaption{margin:4px 2px 0;color:#5f6b7a;font-size:13px;line-height:1.6}"
  + ".pubSection .pubShotLead,.pubShotLead{margin:14px 0 0;color:#4e5968;font-size:14px;line-height:1.6}.pubSection .pubShotLog,.pubShotLog{display:grid;gap:6px;margin:10px 0 0;padding:0;list-style:none;font-size:14px;line-height:1.55}.pubSection .pubShotLog li,.pubShotLog li{color:#191f28;font-size:14px;line-height:1.55;display:grid;grid-template-columns:minmax(76px,auto) minmax(0,1fr);column-gap:10px;row-gap:2px;margin:0;padding:8px 10px;border-radius:12px;background:#f6f7f9}"
  + ".pubShotLog span{color:#5f6b7a;font-size:13px}.pubShotLog code{font:inherit;font-weight:600;color:#191f28;word-break:keep-all;overflow-wrap:anywhere}.pubShotLog em{grid-column:2;color:#4e5968;font-style:normal;font-size:13px}"
  + "@media(min-width:900px){.pubShots ul{flex-wrap:wrap;overflow-x:visible}.pubShots img{width:220px}}";

// @build:exports-start
export { REAL_SCREENS_CSS_V229146, realScreensFigureHtml, realScreensSectionHtml };
// @build:exports-end
