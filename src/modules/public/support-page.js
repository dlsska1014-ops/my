// @build:imports-start
import { safeArray } from "../admin/backup-compare.js";
// @build:imports-end
// V22.9.95 후원: 공개 후원 안내 페이지(/support). 결제 연동·금액 입력·영수증은 없다. 비용 표·예정 금액은 싣지 않는다(E-18, 사용자 결정) — 받는 길(카카오페이 송금 링크·계좌이체·토스 송금 링크)과
// 오픈채팅 주소는 운영 변수로만 받고, 값이 없거나 http(s) 주소가 아니면 그 줄을 숨긴다. 이 변수들은 /ready·/health 에 내보내지 않는다.
// 후원자 오픈채팅 주소는 공개 페이지에 싣지 않는다 — 후원을 확인한 분의 전체 메뉴(화면 설정)에만 보인다(누구나 들어오면 후원자 방이 아니다).
const SUPPORT_CONTACT_EMAIL_V22995 = "admin@malhaebook.com";

function supportUrlV22995(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 500 || /[\s<>"'`]/.test(text)) return "";
  try {
    const parsed = new URL(text);
    if (!["https:", "http:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return "";
    return parsed.href;
  } catch (_) {
    return "";
  }
}

function supportBankLineV22995(value) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= 100 ? text : "";
}

// 운영 변수는 여기 한 곳에서만 읽는다.
function supportConfigV22995(env = {}) {
  return {
    kakaopay: supportUrlV22995(env.SUPPORT_KAKAOPAY_URL),
    bank: supportBankLineV22995(env.SUPPORT_BANK_ACCOUNT),
    toss: supportUrlV22995(env.SUPPORT_TOSS_URL),
    community: supportUrlV22995(env.COMMUNITY_OPENCHAT_URL),
    supporterChat: supportUrlV22995(env.SUPPORTER_OPENCHAT_URL),
  };
}

// 후원하는 방법 절. 우선순위는 카카오페이 → 계좌이체 → 토스. 셋 다 없으면 준비 중 한 줄만 둔다.
function publicSupportWaysSectionV22995(config, email) {
  const ways = [
    config.kakaopay ? "카카오페이 송금: 아래 ‘카카오페이로 송금하기’ 를 누르면 송금 화면이 열려요." : "",
    config.bank ? `계좌이체: ${config.bank}` : "",
    config.toss ? "토스 송금: 아래 ‘토스로 송금하기’ 를 누르면 송금 화면이 열려요." : "",
  ].filter(Boolean);
  if (!ways.length) return { title: "후원하는 방법", paragraphs: ["후원 창구를 준비하고 있어요(출시 뒤 안내)."] };
  const links = [config.kakaopay ? ["카카오페이로 송금하기", config.kakaopay] : null, config.toss ? ["토스로 송금하기", config.toss] : null].filter(Boolean);
  return {
    title: "후원하는 방법",
    paragraphs: [`정해진 금액은 없어요. 편한 방법으로 보내 주신 뒤 보낸 분 이름·보낸 날짜·말해가계부 로그인 이름을 ${email} 로 알려 주시면 확인하고 후원자 표시를 켜 드려요.`],
    bullets: ways,
    note: "말해가계부 후원은 연말정산 공제 대상이 아니고 영수증을 발행하지 않아요. 잘못 보냈다면 같은 이메일로 알려 주세요.",
    ...(links.length ? { links } : {}),
  };
}

function publicSupportPageV22995(env = {}, supporters = []) {
  const config = supportConfigV22995(env);
  const email = SUPPORT_CONTACT_EMAIL_V22995;
  const names = safeArray(supporters).map((name) => String(name || "").trim()).filter(Boolean);
  const sections = [
    {
      title: "왜 후원이 필요한가요",
      paragraphs: [
        "말해가계부의 기록·요약·공동 가계부·리포트는 누구나 무료로 써요. 그래도 서비스를 돌리는 서버와 데이터베이스, 도메인에는 매달 운영 비용이 들고, 기능을 고치고 더하는 유지보수·업데이트에도 꾸준히 시간이 들어요.",
        "보내 주시는 후원은 이렇게 발생하는 서버 운영 비용과 유지보수·업데이트에 큰 도움이 됩니다. 금액은 정해져 있지 않고, 후원하지 않아도 쓸 수 있는 기능은 똑같아요.",
      ],
    },
    {
      title: "후원금은 이렇게 써요",
      bullets: ["서버(Cloudflare Workers)와 데이터베이스(Supabase) 요금", "도메인 갱신과 관제(장애 알림·사용량 확인)", "운영비를 넘는 몫은 새 기능 개발과 개선"],
      note: "약속: 로그인 화면과 카카오톡 봇 답장에는 광고를 넣지 않아요. 기록·요약·공동 가계부·리포트 같은 핵심 기능은 후원과 관계없이 계속 무료예요.",
    },
    publicSupportWaysSectionV22995(config, email),
    {
      title: "후원자에게 드리는 것",
      bullets: ["웹 가계부에 보이는 ‘후원자’ 배지", "후원자만 고를 수 있는 포인트 색 3가지(코랄·민트·라벤더)", "후원자 오픈채팅방 초대(운영 소식을 먼저 듣고 의견을 나누는 곳)", "이 페이지 후원자 명단에 이름 올리기(원하는 분만, 원하는 이름으로)"],
      note: "보상은 보이는 표시와 이야기 나누는 곳뿐이에요. 후원하지 않아도 쓸 수 있는 기능은 똑같아요.",
    },
    {
      title: "함께 이야기하는 곳",
      paragraphs: [
        config.community
          ? "누구나 들어올 수 있는 말해가계부 오픈채팅방이 있어요. 쓰는 방법을 묻거나 고쳐 줬으면 하는 점을 나눠 주세요."
          : `누구나 들어올 수 있는 오픈채팅방을 준비하고 있어요. 그동안은 ${email} 로 의견을 보내 주세요.`,
        config.supporterChat
          ? "후원자 오픈채팅방은 후원을 확인한 분께 웹 가계부 ‘전체 메뉴’ 의 화면 설정에서 들어가는 단추로 안내해요."
          : "후원자 오픈채팅방도 준비하고 있어요. 열리면 후원자께 웹 가계부에서 안내해 드려요.",
      ],
      ...(config.community ? { links: [["말해가계부 오픈채팅 들어가기", config.community]] } : {}),
    },
    ...(names.length ? [{
      title: "고마운 후원자",
      paragraphs: ["명단에 이름을 올려도 된다고 알려 주신 분만 적었어요. 먼저 후원해 주신 순서예요.", names.join(" · ")],
    }] : []),
    {
      title: "문의",
      paragraphs: [`후원 확인, 후원자 표시, 명단 이름 바꾸기와 빼기는 ${email} 로 알려 주세요. 보낸 분 이름·보낸 날짜·로그인 이름을 함께 적어 주시면 빨리 확인할 수 있어요.`],
      links: [[`${email} 로 메일 보내기`, `mailto:${email}`], ["문의 안내", "/contact"]],
    },
  ];
  return {
    title: "말해가계부 후원 안내",
    description: "말해가계부 후원이 서버 운영 비용과 유지보수·업데이트에 쓰이는 곳, 후원하는 방법, 후원자에게 드리는 배지·포인트 색·오픈채팅과 문의 방법을 안내합니다.",
    eyebrow: "핵심 기능은 계속 무료",
    intro: "말해가계부는 누구나 무료로 쓰는 가계부예요. 후원은 서버 운영 비용과 유지보수·업데이트에 큰 도움이 되고, 그만큼 더 오래 안정적으로 운영할 수 있어요. 후원은 선택이고, 후원하지 않아도 모든 핵심 기능을 똑같이 쓸 수 있어요.",
    sections,
    type: "WebPage",
    updated: "2026-11-02",
    primary: ["후원하는 방법 보기", "#section-3"],
    secondary: ["문의 안내", "/contact"],
  };
}
// @build:exports-start
export { publicSupportPageV22995, supportConfigV22995 };
// @build:exports-end
