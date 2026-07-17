import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

const fixture = await createV2265QaFixture();
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

const routes = [
  ["app", "/app?month=2026-07&household_id=house-home"],
  ["households", "/my/households?month=2026-07&household_id=house-home&manage=house-home#manage"],
  ["members", "/my/members?month=2026-07&household_id=house-home"],
  ["menu", "/menu?month=2026-07&household_id=house-home"],
  ["smart-tools", "/smart-tools?month=2026-07&household_id=house-home"],
  ["receipts", "/receipts?month=2026-07&household_id=house-home"],
  ["reports", "/reports?month=2026-07&household_id=house-home"],
  ["settlement-equal", "/settlement-summary?month=2026-07&household_id=house-home&mode=equal"],
  ["settlement-ratio", "/settlement-summary?month=2026-07&household_id=house-home&mode=ratio"],
  ["settlement-headcount", "/settlement-summary?month=2026-07&household_id=house-home&mode=headcount"],
  ["settlement-item", "/settlement-summary?month=2026-07&household_id=house-home&mode=item"],
  ["analysis", "/my/analysis?month=2026-07&household_id=house-home"],
  ["budgets", "/budgets?month=2026-07&household_id=house-home"],
  ["settings", "/my/settings?month=2026-07&household_id=house-home"],
  ["backup", "/my/backup?month=2026-07&household_id=house-home"],
  ["payment-methods", "/payment-methods?month=2026-07&household_id=house-home"],
  ["reserve-plans", "/reserve-plans?month=2026-07&household_id=house-home"],
  ["personal-password", "/my/backup-login?return_to=%2Fmenu%3Fmonth%3D2026-07%26household_id%3Dhouse-home"],
  ["profile", "/my/profile"],
  ["keyword-guide", "/keyword-guide?month=2026-07&household_id=house-home"],
  ["start-guide", "/start-guide?month=2026-07&household_id=house-home"],
  ["household-templates", "/meeting-households?month=2026-07&household_id=house-home"],
  ["budget-alerts", "/budget-alerts?month=2026-07&household_id=house-home"],
];

function tagAttributes(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, "gi"))].map((match) => match[1] || "");
}

function visibleText(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertControlNames(name, html) {
  for (const tagName of ["input", "select", "textarea"]) {
    for (const attrs of tagAttributes(html, tagName)) {
      const type = String(attrs.match(/\btype=["']?([^"'\s>]+)/i)?.[1] || "").toLowerCase();
      if (["hidden", "radio", "checkbox", "submit", "button", "image"].includes(type)) continue;
      const hasName = /\baria-label(?:ledby)?\s*=|\btitle\s*=/i.test(attrs);
      assert(hasName, `${name}: 이름표가 없는 ${tagName} 컨트롤: ${attrs.slice(0, 120)}`);
    }
  }
}

async function routeHtml(path) {
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    headers: {
      cookie: fixture.cookie,
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    },
    redirect: "manual",
  }), fixture.env, {});
  assert(response.status === 200, `${path}: ${response.status}, location=${response.headers.get("location") || ""}`);
  return response.text();
}

const report = [];
try {
  for (const [name, path] of routes) {
    const html = await routeHtml(path);
    const text = visibleText(html);
    const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const hiddenLinks = [...html.matchAll(/\b(?:href|action)=["']([^"']+)["']/gi)]
      .map((match) => match[1])
      .filter((value) => /\/(?:meme(?:-|\/|$)|share(?:\/|$)|card-benefits(?:\?|$))/.test(value));

    assert(/<meta\s+name=["']viewport["'][^>]*width=device-width/i.test(html), `${name}: 모바일 viewport 누락`);
    assert(duplicateIds.length === 0, `${name}: 중복 ID ${duplicateIds.join(",")}`);
    assert(hiddenLinks.length === 0, `${name}: 미완성 기능 링크 ${hiddenLinks.join(",")}`);
    assert(!/<footer\b[^>]*\babBusinessFooter\b/i.test(html), `${name}: 인증 화면에 사업자 푸터 노출`);
    assert(!/좋은 기능은 참고하되|브랜드 표현을 복제하지 않고/.test(text), `${name}: 삭제 대상 안내 문구 노출`);
    assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(text), `${name}: 화면 본문에 사용자 고유 ID 노출`);
    assert(!/member_alias_updated|backup_login_saved|password_updated/.test(text), `${name}: 내부 상태 코드 노출`);
    assertControlNames(name, html);

    if (name === "households") {
      for (const token of ["가계부 이름", "내 표시 이름", "내 개인 비밀번호", "초대", "참여자·초대", "가계부 영구 삭제"]) {
        assert(text.includes(token), `${name}: 생성·관리 필수 항목 누락: ${token}`);
      }
      assert(text.indexOf("이름과 내 표시 이름") < text.indexOf("생성이 끝나면 바로 초대 단계"), `${name}: 생성 후 초대 순서 안내가 불명확함`);
    }
    if (name === "household-templates") {
      assert(/가계부 이름/.test(text), `${name}: 템플릿 생성 전 이름 확인 단계 누락`);
      assert(!/onclick=["'][^"']*(?:create|template)/i.test(html), `${name}: 이름 확인 없이 즉시 생성하는 템플릿 동작 노출`);
    }

    const hasAppBottom = /<nav\s+class=["'][^"']*\bbottom\b/i.test(html);
    const hasUnifiedBottom = /<nav\s+class=["'][^"']*\babNavBottom\b/i.test(html);
    const hasLegacyMenu = /class=["'][^"']*\bappMenu\b/i.test(html);
    if (name !== "personal-password" && (hasAppBottom || hasLegacyMenu) && !hasUnifiedBottom) {
      assert(/function canonicalBottomItems\(\)/.test(html), `${name}: 하단 메뉴 표준화 런타임 누락`);
      assert(/key: "settlement"/.test(html) && /key: "menu"/.test(html), `${name}: 정산·메뉴 하단 항목 누락`);
      assert(/overflow-x:hidden/.test(html), `${name}: 가로 넘침 방지 CSS 누락`);
      assert(/min-height:44px/.test(html), `${name}: 모바일 터치 영역 기준 누락`);
    } else if (name !== "personal-password") {
      assert(hasUnifiedBottom, `${name}: 모바일 하단 메뉴 누락`);
      for (const key of ["home", "records", "add", "settlement", "menu"]) {
        assert(new RegExp(`data-key=["']${key}["']`).test(html), `${name}: 하단 메뉴 ${key} 누락`);
      }
      assert(/height:calc\(72px \+ var\(--abSafeBottom\)\)/.test(html), `${name}: 하단 메뉴 높이 안정화 CSS 누락`);
      assert(/padding-bottom:calc\(82px \+ var\(--abSafeBottom\)\)/.test(html), `${name}: 본문 하단 안전 여백 누락`);
      assert(/overflow-x:hidden!important/.test(html), `${name}: 가로 넘침 방지 CSS 누락`);
      assert(/min-height:48px/.test(html), `${name}: 모바일 터치 영역 기준 누락`);
    } else {
      assert(/name=["']return_to["'][^>]*value=["']\/menu\?month=2026-07&amp;household_id=house-home["']/.test(html), `${name}: 보안 설정 복귀 경로 유실`);
      assert(/저장하고 이전 화면으로/.test(text), `${name}: 복귀 동작 안내 누락`);
    }

    report.push({ name, path, bytes: Buffer.byteLength(html), controls: tagAttributes(html, "input").length + tagAttributes(html, "select").length + tagAttributes(html, "textarea").length });
  }
  console.log(JSON.stringify({ ok: true, mode: "server-html-dom-css", targetWidths: [390, 360, 320], screens: report.length, assertions, report }, null, 2));
} finally {
  fixture.restore();
}
