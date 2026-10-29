// @build:imports-start
import { nluOpsConfig } from "../runtime/ops-telemetry.js";
import {
  BUSINESS_FOOTER_INFO, PUBLIC_CONTENT_PATHS, adSlotMarkup, adsHeadMarkup, adsHeaders,
  adsPolicyLinks, adsPolicyText, adsensePublisherIdForTxt, appName, kakaoLoginButtonHtml,
  publicAdsenseHead, publicBaseUrl, publicSiteFooter, publicSiteNav,
} from "./site-config.js";
import {
  publicDemoClient, publicDemoRows, publicDemoSummary, publicGuidePages,
} from "./guide-content.js";
import {
  publicArticleHangul, publicArticleIndex, publicArticleIsLiving, publicArticleReadingMinutes,
  publicArticleSiteMapLinks, publicArticlesHubPage, publicLivingCostArticlesV22974,
  publicNormalizeLivingArticles,
} from "./living-cost-articles-v22974.js";
import { headOnlyResponse, htmlResponse } from "../runtime/http.js";
import { safeArray } from "../admin/backup-compare.js";
import { inspectKakaoLoginConfig } from "../auth/user-session.js";
import {
  AB_CATEGORY_ICON_PATHS, AB_NAV_ICON_PATHS, AB_UI_ICON_PATHS,
} from "../assets/icon-paths.js";
import { iconMaskUrl } from "../assets/icon-mask-css.js";
import {
  AB_OG_IMAGE_ALT, AB_OG_IMAGE_HEIGHT, AB_OG_IMAGE_PATH, AB_OG_IMAGE_WIDTH,
} from "../assets/og-image.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

function publicPageCatalog(env = {}, url = null) {
  const catalog = {
    ...publicGuidePages(env),
    ...publicLivingCostArticlesV22974(),
    privacy: {
      title: "개인정보처리방침",
      description: "말해가계부가 처리하는 개인정보와 가계부 데이터, 처리 목적, 보관 기간, 광고 쿠키와 이용자 권리를 안내합니다.",
      eyebrow: "시행일 2026년 7월 13일",
      intro: "말해가계부는 서비스 제공에 필요한 범위에서 사용자와 가계부 데이터를 처리합니다. 처리 목적과 보유기간을 벗어나 임의로 이용하지 않으며, 사용자 발화를 AI 모델 학습에 자동 활용하지 않습니다.",
      sections: [
        { title: "1. 처리하는 항목과 목적", paragraphs: ["사용자 식별키와 로그인 정보는 사용자 구분과 세션 유지에 사용합니다. 가계부 이름, 참여자 권한, 초대코드, 표시 이름은 공동 가계부 운영에 사용합니다.", "수입·지출, 날짜, 분류, 결제수단, 메모, 예산과 설정값은 기록·조회·분석·백업 기능을 제공하기 위해 처리합니다. 카카오 거래 입력 원문은 거래 데이터와 함께 보관될 수 있습니다. 단톡방 연결키는 첫 기록으로 준비하거나 직접 연결한 공동 가계부와 해당 방을 구분하는 데 사용합니다."], bullets: ["회원 및 세션 관리", "가계부 생성·참여·권한 관리", "거래 기록·예산·요약·정산 제공", "중복 저장 방지와 장애 대응", "법적 의무와 분쟁 대응"] },
        { title: "2. 사용자 발화와 자연어 운영 로그", paragraphs: ["사용자 발화는 요청을 이해하고 응답하기 위해 사용합니다. 발화를 외부 AI 모델의 학습 데이터로 자동 전송하거나 자동 학습 데이터로 등록하지 않습니다.", "운영 통계는 의도, 처리 결과, 지연시간과 배포 버전을 집계합니다. 실패한 요청의 일부 문장은 URL·이메일·전화번호·코드·긴 숫자 등을 마스킹하여 임시 메모리에 보관할 수 있습니다. 마스킹이 모든 개인정보를 완전히 제거한다고 보장하지는 않습니다. 별도 실패 사례 저장은 운영 설정에 따르며 거래 데이터의 보관과 구분합니다."] },
        { title: "3. 보유기간과 삭제", paragraphs: ["가계부 거래와 설정은 사용자가 서비스를 이용하는 동안 보관하며 웹에서 직접 수정·삭제할 수 있습니다. 가계부 소유자가 영구 삭제를 완료하면 해당 가계부의 거래와 관련 설정을 삭제합니다. 가계부 나가기는 참여 권한을 종료하며 공동 거래 이력은 보존합니다. 현재 계정 자체를 탈퇴·삭제하는 온라인 기능은 제공하지 않으며 개인정보 삭제 요청은 서비스 문의 경로로 확인합니다.", "세션과 운영 로그는 목적에 필요한 기간만 보관합니다. 법령상 보존 의무가 있는 경우 해당 기간 동안 분리 보관할 수 있습니다."] },
        { title: "4. 제3자 광고와 쿠키", paragraphs: [adsPolicyText(env, "privacy") || "현재 공개 페이지에서는 Google 광고를 실행하지 않습니다. 향후 광고 기능이 활성화되면 Google을 포함한 제3자 광고 사업자가 쿠키를 사용해 사용자의 이전 방문 정보 등을 바탕으로 광고를 제공하고 성과를 측정할 수 있습니다.", "제3자는 광고 제공 과정에서 브라우저의 쿠키를 저장·조회하거나 웹 비콘과 IP 주소 같은 기술을 사용할 수 있습니다. 말해가계부는 거래 내용, 예산, 가계부 구성원 정보와 사용자 발화 원문을 광고주에게 판매하지 않습니다. 사용자는 Google 광고 설정과 브라우저 설정을 통해 광고 개인화와 쿠키를 관리할 수 있습니다."], links: [...adsPolicyLinks(env), ["Google 광고 및 데이터 이용 안내", "https://policies.google.com/technologies/ads?hl=ko"], ["Google 파트너 사이트 정보 이용 안내", "https://policies.google.com/technologies/partner-sites?hl=ko"], ["Google 개인정보처리방침", "https://policies.google.com/privacy?hl=ko"]] },
        { title: "5. 이용자의 권리", paragraphs: ["사용자는 자신의 기록과 설정을 열람·수정·삭제하고 백업할 수 있습니다. 개인정보 처리에 관한 문의와 권리 행사는 문의 안내에 표시된 경로로 요청할 수 있으며 본인과 권한 확인 후 처리합니다."] },
        { title: "6. 안전성 확보 조치", bullets: ["가계부별 권한 확인", "HTTPS 통신", "관리자 경로와 사용자 경로 분리", "중복 요청 방지", "민감 문자열 마스킹", "백업·복구 전 확인 절차"] },
      ],
    },
    terms: {
      title: "서비스 이용약관",
      description: "말해가계부의 서비스 목적, 사용자 책임, 공동 가계부 권한, 데이터 관리, 광고와 서비스 변경 기준을 안내합니다.",
      eyebrow: "시행일 2026년 7월 13일",
      intro: "본 약관은 말해가계부를 이용할 때 서비스와 사용자 사이의 기본 기준을 설명합니다. 사용자는 최신 약관과 개인정보처리방침을 확인한 뒤 서비스를 이용합니다.",
      sections: [
        { title: "1. 서비스 목적", paragraphs: ["말해가계부는 사용자가 직접 입력한 생활 수입·지출을 개인 또는 공동 가계부 단위로 기록하고 예산·요약·분석·백업 기능을 제공하는 서비스입니다.", "금융상품, 투자, 세무, 법률 자문을 제공하지 않으며 서비스의 계산값은 생활 기록을 돕는 참고자료입니다."] },
        { title: "2. 사용자 책임", paragraphs: ["사용자는 입력한 금액, 날짜, 결제수단, 메모와 분류의 정확성을 확인해야 합니다. 계정, 초대코드와 접근 수단을 안전하게 관리하고 다른 사람의 정보를 권한 없이 입력해서는 안 됩니다."] },
        { title: "3. 공동 가계부와 권한", paragraphs: ["가계부 소유자와 관리자는 참여자 초대, 승인, 역할과 표시 이름을 관리할 수 있습니다. 참여자는 부여된 권한 범위에서 조회·기록·수정 기능을 사용합니다.", "새 미연결 단톡방에서는 봇에게 명확한 첫 거래를 보내면 공동 가계부를 준비하고 첫 기록자가 소유자가 됩니다. 기존 가계부를 연결하려면 해당 가계부의 소유자 또는 관리자 권한이 필요합니다. 연결을 변경할 때에는 현재 연결된 가계부의 관리 권한도 확인합니다. 기록 전 가계부 이름과 공유 범위를 확인해야 합니다."] },
        { title: "4. 데이터 수정·삭제와 백업", paragraphs: ["사용자는 거래와 설정을 수정·삭제할 수 있으며 중요한 변경 전 백업을 권장합니다. 가져오기, 일괄 수정, 삭제와 복구는 확인 절차를 제공하지만 모든 실수를 자동 복원한다고 보장하지 않습니다."] },
        { title: "5. 서비스 제한과 장애", paragraphs: ["보안, 과도 요청, 점검, 외부 서비스 장애 또는 법적 필요가 있는 경우 일부 기능을 일시 제한할 수 있습니다. 중복 저장과 데이터 손상을 줄이는 것을 우선하며 장애가 발생하면 안전 안내와 재시도 방법을 제공합니다."] },
        { title: "6. 광고와 외부 링크", paragraphs: ["서비스 운영 과정에서 광고 또는 외부 링크가 표시될 수 있으며 광고는 서비스 콘텐츠와 구분합니다.", "외부 사이트의 내용과 거래에는 해당 제공자의 정책이 적용됩니다."] },
        { title: "7. 약관 변경", paragraphs: ["서비스 운영이나 법령 변경에 따라 약관을 변경할 수 있으며 중요한 변경은 적용 전에 서비스 화면을 통해 안내합니다."] },
      ],
    },
    cookies: {
      title: "쿠키 및 광고 기술 안내",
      description: "말해가계부의 필수 쿠키, 광고 쿠키, 브라우저 설정과 광고 개인화와 쿠키 관리 방법을 안내합니다.",
      eyebrow: "서비스 이용과 광고를 구분",
      intro: "쿠키는 웹사이트가 브라우저에 저장하는 작은 정보입니다. 말해가계부는 로그인과 보안에 필요한 쿠키를 사용할 수 있으며, 광고 기능을 활성화한 경우 제3자 광고 쿠키가 사용될 수 있습니다.",
      sections: [
        { title: "필수 쿠키", paragraphs: ["로그인 세션 유지, 요청 위조 방지, 사용자 화면 설정과 보안 기능에 필요한 쿠키입니다. 필수 쿠키를 차단하면 로그인이나 가계부 기능이 정상 작동하지 않을 수 있습니다."] },
        { title: "광고 및 측정 기술", paragraphs: [adsPolicyText(env, "cookies") || "현재 공개 페이지에서는 Google 광고 실행 코드와 광고 쿠키를 사용하지 않습니다. 향후 광고 기능을 활성화하면 Google과 제3자 광고 사업자가 쿠키와 유사 기술을 사용해 광고를 제공하고 성과를 측정할 수 있습니다.", "사용자는 Google 광고 설정과 브라우저의 사이트별 쿠키 설정을 통해 광고 개인화와 저장된 쿠키를 관리할 수 있습니다."], links: [...adsPolicyLinks(env), ["Google 쿠키 사용 안내", "https://policies.google.com/technologies/cookies?hl=ko"], ["Google 광고 및 데이터 이용 안내", "https://policies.google.com/technologies/ads?hl=ko"], ["Google 개인정보처리방침", "https://policies.google.com/privacy?hl=ko"]] },
        { title: "쿠키 관리", bullets: ["브라우저 설정에서 쿠키 확인·삭제", "사이트별 쿠키 허용 또는 차단", "Google 광고 및 개인정보 안내 확인", "공용 기기 사용 후 로그아웃"] },
        { title: "지역별 동의", paragraphs: ["유럽경제지역, 영국, 스위스 등 별도의 동의 요건이 적용되는 지역에 광고를 제공할 경우 Google이 요구하는 인증된 동의 관리 플랫폼과 관련 절차를 적용합니다."] },
      ],
    },
  };
  const config = nluOpsConfig(env);
  catalog.privacy.sections[1].paragraphs.push(config.failure_samples_enabled
    ? `현재 별도 실패 사례 저장은 활성화되어 있으며 설정된 보관 기준은 ${config.retention_days}일입니다. 문장 저장은 ${config.store_redacted_text ? "마스킹한 일부 문장을 포함하도록 설정되어 있습니다" : "비활성화되어 있습니다"}. 기간이 지난 사례는 정리 대상이며 실제 정리 완료 시점은 운영 작업에 따라 달라질 수 있습니다.`
    : "현재 별도 실패 사례의 영구 저장 기능은 비활성화되어 있습니다. 마스킹한 실패 문장의 임시 메모리 기록과 거래 입력 원문 보관은 이 설정과 별개입니다.");
  for (const key of ["privacy", "terms", "cookies"]) {
    catalog[key].type = "WebPage";
    catalog[key].updated = "2026-10-11";
  }
  // V22.9.74: 생활비 가이드 글(12편 + 20편)에 분류·작성일을 붙이고, 글 목록 허브와 사이트맵 절을 그 목록으로 만든다.
  publicNormalizeLivingArticles(catalog);
  const articleIndex = publicArticleIndex(catalog);
  catalog.articles = publicArticlesHubPage(articleIndex);
  const siteMapArticles = safeArray(catalog["site-map"]?.sections).find((section) => section.title === "생활비 가이드 글");
  if (siteMapArticles) siteMapArticles.links = publicArticleSiteMapLinks(articleIndex);
  return catalog;
}

function publicArticleCards(cards = []) {
  return `<ul class="pubCards">${safeArray(cards).map((item) => `<li><a href="${escapeHtml(item.path)}">${escapeHtml(item.title)}</a><p>${escapeHtml(item.description)}</p><small>작성 ${escapeHtml(item.published)}${item.updated !== item.published ? ` · 수정 ${escapeHtml(item.updated)}` : ""}</small></li>`).join("")}</ul>`;
}

function publicArticleExtras(page = {}, living = false) {
  const summary = living && safeArray(page.summary).length ? `<aside class="pubSummary" aria-label="핵심 요약"><b>핵심 요약</b><ul>${page.summary.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></aside>` : "";
  const sources = living && safeArray(page.sources).length ? `<section class="pubSection pubSources" id="sources"><h2>참고 자료</h2><ul>${page.sources.map(([label, href]) => `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a><span class="pubSourceHost">${escapeHtml(publicSourceHost(href))}</span></li>`).join("")}</ul><p>공식 자료는 개정될 수 있으므로 최신 기준은 각 기관의 안내를 우선합니다. 글의 수정일은 이 글을 마지막으로 고친 날입니다.</p></section>` : "";
  const service = living && safeArray(page.serviceNote).length ? `<aside class="pubService"><b>말해가계부에서는</b>${page.serviceNote.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</aside>` : "";
  const related = living && safeArray(page.related).length ? `<aside class="pubRelated"><b>함께 읽을 글</b>${publicContentLinks(page.related)}</aside>` : "";
  return { summary, sources, service, related };
}

function publicSourceHost(href = "") {
  try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function publicContentLinks(links = []) {
  return `<div class="pubLinks">${safeArray(links).map(([label, href]) => `<a href="${escapeHtml(href)}"${/^https?:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(label)}<span aria-hidden="true"> →</span></a>`).join("")}</div>`;
}

function publicContentTable(table, id) {
  if (!table) return "";
  return `<div class="pubTableWrap" role="region" aria-labelledby="${id}" tabindex="0"><table class="pubTable"><caption id="${id}">${escapeHtml(table.caption)}</caption><thead><tr>${table.headers.map((label) => `<th scope="col">${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${table.rows.map((row) => `<tr>${row.map((cell, index) => index === 0 ? `<th scope="row">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderPublicDemo() {
  const rows = publicDemoRows();
  const result = publicDemoSummary(rows, 300000, 100000);
  const metrics = [["total", "전체 지출"], ["budget", "분류 예산 합계"], ["covered", "예산 적용 사용액"], ["uncovered", "예산 밖 지출"], ["remaining", "남은 예산"], ["over", "초과액"]];
  return `<section class="pubDemo" id="example" aria-labelledby="demo-title"><div class="pubDemoHeading"><div><span class="pubEyebrow">가상 데이터 · 2026년 9월의 네 기록</span><h2 id="demo-title">예산을 바꾸면 어떻게 될까요?</h2></div><p>실제 가계부에는 저장되지 않습니다.</p></div>
<dl class="pubMetrics">${metrics.map(([key, label]) => `<div><dt>${label}</dt><dd id="demo-${key}">${result[key].toLocaleString("ko-KR")}원</dd></div>`).join("")}</dl><p class="pubDemoRate">예산 사용률 <strong id="demo-rate">${result.rate}%</strong></p>
<form id="public-demo-form" hidden><fieldset><legend>분류별 예산 바꿔 보기</legend><div class="pubDemoInputs"><label for="demo-food">식비 예산 (원)<input id="demo-food" inputmode="numeric" value="300,000" autocomplete="off" aria-describedby="demo-help"/></label><label for="demo-transport">교통 예산 (원)<input id="demo-transport" inputmode="numeric" value="100,000" autocomplete="off" aria-describedby="demo-help"/></label><button class="pubBtn" type="submit">예산 다시 계산</button><button class="pubBtn secondary" type="button" id="demo-reset">처음 예제로</button></div><p id="demo-help">0원부터 10억원까지 입력할 수 있습니다. 0원인 분류는 예산 비교에서 제외됩니다.</p></fieldset></form><p id="demo-status" role="status" aria-live="polite" aria-atomic="true">식비와 교통비만 예산과 비교합니다. 의료비 30,000원은 예산 밖 지출입니다.</p><noscript><p>현재 기본 예제와 계산 결과를 보고 있습니다. 예산 금액을 바꾸려면 브라우저의 JavaScript를 켜세요.</p></noscript>
${publicContentTable({ caption: "예제에 사용한 가상 거래 목록", headers: ["날짜", "분류", "내용", "지출액"], rows: rows.map((row) => [row.date, row.category, row.memo, `${row.amount.toLocaleString("ko-KR")}원`]) }, "demo-table")}</section><script>(${publicDemoClient.toString()})(${publicDemoSummary.toString()},${JSON.stringify(rows)});</script>`;
}

// V22.9.87 T-21: 공개 첫 화면과 /demo 위쪽의 앱 화면 미리보기(가상 데이터, 읽기 전용). 앱 홈 예산 카드(T-12, my/mobile-home.js)와
// 거래 행(T-13, my/home-sections.js 행 + V5 동그라미)과 같은 클래스·마크업이다. 링크·버튼·폼·스크립트가 없어 서버 요청·쿠키·저장이 없다.
// 숫자는 QA 픽스처 홈과 같은 예(전체 예산 1,230,000원·지출 248,600원 → 981,400원·20%)를 10월 12일(31일 중 39%)로 옮겼다.
// 하루 금액은 앱 규칙대로 981,400 ÷ 오늘 포함 남은 20일 = 49,070원. 문장 틀은 앱 속도 문장(T-12)과 같다 — 앱 문장이 바뀌면 함께 바꾼다
// (validate-public-brand-v22987 이 앱 문장 틀·계산과 대조한다).
// /demo 에서는 바로 아래 예산 계산 예제와 숫자가 달라, 위에 ‘홈 화면 예시’ 이름표를 달고 설명 문장에 그 점을 적는다.
function publicAppPreviewHtml(onDemo = false) {
  const row = (ck, type, title, line, amount) => `<article class="v8-tx" data-type="${type}"><div class="v8-tx-main"><span class="abCat" data-ck="${ck}" aria-hidden="true"><i class="abCatIcon"></i></span><div><b>${title}</b><span>${line}</span></div><strong class="${type}">${amount}</strong></div></article>`;
  return `<figure class="pubPreview">${onDemo ? `<p class="pubPreviewLabel">웹 가계부 홈 화면 예시 · 가상 데이터</p>` : ""}<div class="pubScreen"><section class="homeBudget"><div class="homeBudgetTop"><span>이번 달 쓸 수 있는 돈</span><em>예산 사용률 <span>20%</span></em></div><div class="homeBudgetAmount"><b>981,400</b><small>원</small></div><div class="homeProgress" style="--ab-today:39%"><i style="width:20%"></i></div><div class="homeBudgetFoot"><span>전체 예산 1,230,000원</span><span>지출 248,600원</span></div><div class="homeDailyPlan homePace"><p>이번 달의 39%가 지났고 예산은 20%만 썼어요. 하루 <span data-ab-num="49070">49,070</span>원씩 쓰면 돼요.</p></div></section>${row("food", "expense", "점심", "식비 · 국민카드", "-12,000원")}${row("cafe", "expense", "가족 카페", "카페/간식 · 카카오페이", "-28,600원")}${row("income", "income", "10월 월급", "급여 · 급여통장", "+3,200,000원")}</div><figcaption>가상 데이터로 그린 웹 가계부 홈 화면이에요. ${onDemo ? "아래 예산 계산 예제와는 다른 숫자이고, " : "실제 기록이 아니고, "}누르거나 고칠 수 없어요.</figcaption></figure>`;
}

// 미리보기 CSS: 공개 화면은 셸 CSS 를 싣지 않으므로 앱에서 잰 값(390px 라이트, 셸 토큰 라이트 값)을 .pubPreview 안에만 옮겨 둔다.
// 카테고리 바탕·잉크는 셸 CSS 의 --ab12-cat-<키>-bg/-ink 라이트 값, 아이콘은 같은 Lucide path(icon-paths.js)·같은 마스크 함수다.
function publicPreviewStyles() {
  const mask = (d) => `-webkit-mask:${iconMaskUrl(d)} center/contain no-repeat;mask:${iconMaskUrl(d)} center/contain no-repeat`;
  const cat = (key, bg, ink) => `.pubPreview .abCat[data-ck="${key}"]{--ab-ck-bg:${bg};--ab-ck-ink:${ink};--ab-ck-ico:${iconMaskUrl(AB_CATEGORY_ICON_PATHS[key])}}`;
  return `.pubPreview{margin:0;min-width:0}.pubScreen{display:grid;gap:9px;padding:14px;border:1px solid #e9ebee;border-radius:24px;background:#f2f4f6;color:#191f28;letter-spacing:-.01em}.pubPreview figcaption{margin:10px 4px 0;color:#5f6b7a;font-size:13px;line-height:1.6}.pubPreview .pubPreviewLabel{max-width:none;margin:0 0 8px;color:#5f6b7a;font-size:13px;font-weight:800;line-height:1.5}`
    + `.pubPreview .homeBudget{padding:22px;border:1px solid #e9ebee;border-radius:20px;background:#fff;box-shadow:0 4px 16px rgba(15,23,42,.045)}.pubPreview .homeBudgetTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.pubPreview .homeBudgetTop>span{color:#5f6b7a;font-size:13px;font-weight:800;line-height:1.55}.pubPreview .homeBudgetTop em{padding:6px 9px;border-radius:999px;background:#e8f3ff;color:#1b64da;font-size:12px;font-style:normal;font-weight:900;line-height:1.55;white-space:nowrap}`
    + `.pubPreview .homeBudgetAmount{margin:10px 0 12px}.pubPreview .homeBudgetAmount b{font-size:36px;font-weight:900;letter-spacing:-.05em;line-height:1.55;font-variant-numeric:tabular-nums}.pubPreview .homeBudgetAmount small{margin-left:4px;color:#5f6b7a;font-size:13px;font-weight:800}`
    + `.pubPreview .homeProgress{position:relative;height:12px;border-radius:999px;background:#edf0f3}.pubPreview .homeProgress i{display:block;height:100%;border-radius:999px;background:#1d4ed8}.pubPreview .homeProgress:after{content:"";position:absolute;top:50%;left:var(--ab-today);width:2px;height:22px;border-radius:1px;background:#191f28;transform:translate(-50%,-50%)}`
    + `.pubPreview .homeBudgetFoot{display:flex;justify-content:space-between;gap:8px;margin-top:10px;color:#5f6b7a;font-size:12px;font-weight:800;line-height:1.55}`
    + `.pubPreview .homePace{display:flex;align-items:flex-start;gap:10px;margin-top:12px;padding:12px 14px;border-radius:14px;background:#e8f3ff}.pubPreview .homePace:before{content:"";flex:none;width:20px;height:20px;margin-top:1px;background:#1d4ed8;${mask(AB_UI_ICON_PATHS.clock)}}.pubPreview .homePace p{flex:1 1 0;min-width:0;max-width:none;margin:0;color:#191f28;font-size:14px;font-weight:700;line-height:1.5}.pubPreview .homePace [data-ab-num]{font-weight:800;font-variant-numeric:tabular-nums}`
    + `.pubPreview .v8-tx{padding:13px;border:1px solid #e8edf4;border-radius:21px;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.04)}.pubPreview .v8-tx-main{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.pubPreview .v8-tx-main>div{flex:1 1 auto;min-width:0}.pubPreview .v8-tx-main b{display:block;font-size:16px;font-weight:700;line-height:1.55}.pubPreview .v8-tx-main>div>span{display:block;margin-top:4px;color:#687385;font-size:12px;line-height:1.55}.pubPreview .v8-tx-main strong{font-size:16px;font-weight:700;line-height:1.55;white-space:nowrap}.pubPreview strong.income{color:#087a55}`
    + `.pubPreview .abCat{display:inline-grid;place-items:center;flex:none;align-self:center;width:42px;height:42px;border-radius:50%;background:var(--ab-ck-bg,#eef1f4)}.pubPreview .abCatIcon{display:block;width:50%;height:50%;background:var(--ab-ck-ink,transparent);-webkit-mask:var(--ab-ck-ico) center/contain no-repeat;mask:var(--ab-ck-ico) center/contain no-repeat}`
    + cat("food", "#fff1e6", "#c2410c") + cat("cafe", "#f8efe2", "#8a4b0f") + cat("income", "#e2f4ec", "#087a55")
    + `.pubHero>.pubPreview{max-width:440px;margin:18px 0 6px}@media(min-width:900px){.pubHero:has(>.pubPreview){display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,420px);grid-template-rows:repeat(4,auto) 1fr;column-gap:48px;align-items:start}.pubHero:has(>.pubPreview)>*{grid-column:1}.pubHero:has(>.pubPreview)>p{margin:0 0 16px}.pubHero>.pubPreview{grid-column:2;grid-row:1/-1;margin:0}}`;
}

// V22.9.87 T-21: 공개 첫 화면(랜딩) 순서 — 히어로 → 앱 화면 미리보기 → 세 걸음 → 공동 가계부·정산 → 알아 둘 점(지금 문구) → (기존 안내 절) →
// 카카오 로그인 띠 → 바닥글. 승인 시안(Landing)의 문구다. ‘알아 둘 점’ 문장은 예전 ‘기록 이후에 필요한 도구’ 절에서 그대로 옮겼다.
function publicLandingHtml() {
  const ico = (name) => `<i class="pubIco pubIco-${name}" aria-hidden="true"></i>`;
  return `<section class="pubLand pubLandPreview" id="app-preview" aria-labelledby="land-preview"><div class="pubLandHead"><h2 id="land-preview">웹에서는 이렇게 보여요</h2><span class="pubLandTag">가상 데이터</span></div><p class="pubLandLead">카카오톡으로 남긴 기록이 웹 홈에서 남은 예산, 이번 달 속도, 최근 기록으로 정리돼요.</p>${publicAppPreviewHtml()}</section>`
    + `<section class="pubLand" aria-labelledby="land-steps"><h2 id="land-steps">기록은 세 걸음이면 끝나요</h2><ol class="pubSteps"><li>${ico("chat")}<div><b>카카오톡에 한 줄</b><p>1:1 채팅에 ‘점심 만원’이라고 보내면 웹 로그인 없이도 첫 기록이 시작돼요.</p></div></li><li>${ico("sparkle")}<div><b>금액·내용·결제수단 정리</b><p>한 줄에서 금액과 결제수단을 나눠 담고, 분류를 붙여 둬요.</p></div></li><li>${ico("stats")}<div><b>웹에서 예산 확인</b><p>남은 예산, 하루에 쓸 수 있는 돈, 분류별 흐름을 한 화면에서 봐요.</p></div></li></ol></section>`
    + `<section class="pubLand pubLandGroup" aria-labelledby="land-group"><h2 id="land-group">단톡방이면 공동 가계부가 돼요</h2><p>새 단톡방에서 봇을 부르고 ‘점심 12000원’이라고 적으면 그 방의 공동 가계부가 준비돼요. 함께 쓴 돈은 누가 얼마를 보내면 되는지까지 계산해 드려요.</p><p class="pubFlow"><span>민지</span><i aria-hidden="true">→</i><span>준호</span><b>42,500원 보내기</b></p><p class="pubLandFoot">가상 예시예요. 송금 금액은 제안만 하고, 실제 송금은 직접 해요.</p>${publicContentLinks([["공동 가계부와 정산 사례", "/group-accountbook"]])}</section>`
    + `<section class="pubLand pubLandNote" aria-labelledby="land-note">${ico("shield")}<div><h2 id="land-note">알아 둘 점</h2><p>말해가계부는 사용자가 입력한 생활비를 정리하는 독립 서비스입니다. 은행·카드사 계정을 자동으로 연결하거나 투자·세무 판단을 대신하지 않습니다. 카카오가 직접 제공하는 공식 가계부 서비스는 아닙니다.</p></div></section>`;
}

// 카카오 로그인 띠: 카카오 로그인이 준비된 서버에서는 /my 와 같은 카카오 버튼(/auth/kakao/start), 아니면 /my 로 가는 주 버튼.
function publicLandingBand(env = {}) {
  const start = inspectKakaoLoginConfig(env).ready ? kakaoLoginButtonHtml() : `<a class="pubBtn" href="/my">내 가계부 시작하기</a>`;
  return `<section class="pubBand" aria-labelledby="land-band"><h2 id="land-band">오늘 쓴 돈부터 적어 볼까요?</h2><div class="pubBandActions">${start}<a class="pubBtn secondary" href="/demo">가상 가계부 둘러보기</a></div></section>`;
}

function publicLandingStyles() {
  const ico = (name, d) => `.pubIco-${name}{--ab-ico:${iconMaskUrl(d)}}`;
  return `.pubHome .pubHero{padding:30px 0 26px;border-bottom:0}.pubHome .pubHero .pubEyebrow{display:inline-flex;padding:6px 11px;border-radius:999px;background:#e8f3ff;letter-spacing:0}.pubHome .pubHero h1{margin:14px 0;font-size:clamp(30px,4.4vw,44px);line-height:1.3}.pubHome .pubHero p{font-size:16px;line-height:1.75}`
    + `.pubLand{padding:30px 0;border-top:1px solid #e1e7f0}.pubHome .pubLand h2{margin:0 0 14px;font-size:22px;line-height:1.35}.pubLandHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.pubHome .pubLandHead h2{margin:0}.pubLandTag{color:#5f6b7a;font-size:12.5px;font-weight:700;white-space:nowrap}.pubLandLead{margin:6px 0 16px;color:#526075;font-size:15px;line-height:1.7}`
    + `.pubSteps{display:grid;gap:12px;margin:0;padding:0;list-style:none}.pubSteps li{display:flex;gap:14px;align-items:flex-start;padding:16px;border:1px solid #e9ebee;border-radius:16px;background:#fff}.pubHome .pubSteps b{display:block;font-size:16px;font-weight:800;line-height:1.5}.pubSteps p{margin:4px 0 0;color:#526075;font-size:14.5px;line-height:1.7}`
    + `.pubIco{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:14px;background:#e8f3ff}.pubIco:before{content:"";width:22px;height:22px;background:#1d4ed8;-webkit-mask:var(--ab-ico) center/contain no-repeat;mask:var(--ab-ico) center/contain no-repeat}`
    + ico("chat", AB_NAV_ICON_PATHS.chat) + ico("sparkle", AB_NAV_ICON_PATHS.sparkle) + ico("stats", AB_NAV_ICON_PATHS.stats) + ico("shield", AB_NAV_ICON_PATHS.shield)
    + `.pubLandGroup p{max-width:760px;margin:0;color:#43516a;font-size:15.5px;line-height:1.8}.pubLandGroup .pubFlow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:520px;margin:16px 0 8px;padding:12px 14px;border:1px solid #e9ebee;border-radius:14px;background:#fff;color:#191f28;font-size:15px;font-weight:800}.pubFlow span{padding:4px 12px;border-radius:999px;background:#f4f6f8}.pubFlow i{color:#5f6b7a;font-style:normal}.pubHome .pubFlow b{margin-left:auto;color:#087a55;font-weight:800}.pubLandGroup .pubLandFoot{color:#5f6b7a;font-size:13.5px}`
    + `.pubLandNote{display:flex;gap:14px;align-items:flex-start}.pubLandNote .pubIco{width:40px;height:40px;border-radius:12px}.pubHome .pubLandNote h2{margin:0 0 6px;font-size:18px}.pubLandNote p{max-width:760px;margin:0;color:#43516a;font-size:15px;line-height:1.8}`
    + `.pubBand{margin:12px 0 4px;padding:26px 20px;border-radius:24px;background:#e8f3ff;text-align:center}.pubHome .pubBand h2{margin:0 0 16px;font-size:21px}.pubBandActions{display:grid;gap:10px;max-width:420px;margin:0 auto}.pubBand .pubBtn{min-height:54px}.pubBand .pubBtn.secondary{background:#fff!important}`
    + `.kakaoBtn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:54px;border-radius:12px;background:#fee500;color:rgba(0,0,0,.85);font-size:16px;font-weight:800;text-decoration:none}.kakaoBtn svg{width:22px;height:22px;fill:#000}`
    + `@media(min-width:760px){.pubSteps{grid-template-columns:repeat(3,minmax(0,1fr))}.pubSteps li{flex-direction:column}}@media(min-width:860px){.pubLandPreview{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,440px);grid-template-rows:auto auto 1fr;column-gap:48px;align-items:start}.pubLandPreview>*{grid-column:1}.pubLandPreview>.pubPreview{grid-column:2;grid-row:1/-1}.pubLandHead{justify-content:flex-start}}@media(max-width:600px){.pubHome .pubHeroActions{flex-direction:column}.pubHome .pubHero h1{font-size:30px}}`;
}

function publicContentStyles() {
  return `
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:92px;scrollbar-gutter:stable}:is(h1,h2,h3){text-wrap-style:balance}p{text-wrap-style:pretty}body{margin:0;background:#f7f9fc;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.02em;word-break:keep-all;overflow-wrap:anywhere}a{color:#1d4ed8}a:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible,[tabindex]:focus-visible{outline:3px solid #1d4ed8;outline-offset:4px}.pubSkip{position:absolute;left:16px;top:-80px;z-index:100;background:#fff;padding:12px}.pubSkip:focus{top:8px}.pubHeader{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.97);border-bottom:1px solid #e8edf4}.pubHeaderInner{max-width:1180px;margin:auto;min-height:72px;padding:10px 24px;display:flex;align-items:center;gap:24px}.pubBrand{display:flex;align-items:center;gap:9px;text-decoration:none;color:#172033;white-space:nowrap}.pubMark{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:var(--ab12-brand,#3182f6)}.pubMark svg{width:19px;height:19px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.pubBrand b{font-size:18px}.pubDesktopNav{display:flex;align-items:center;gap:2px;flex:1}.pubHeader nav a{display:inline-flex;align-items:center;min-height:44px;color:#526075;text-decoration:none;font-size:14px;font-weight:700;padding:10px;border-radius:10px;white-space:nowrap}.pubHeader nav a:hover,.pubHeader nav a.active{background:#e8f3ff;color:#1d4ed8}.pubStart{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border-radius:12px;color:var(--ab12-accent,#1d4ed8);font-size:15px;font-weight:800;text-decoration:none;white-space:nowrap}.pubStart:hover{background:#e8f3ff}.pubMobileMenu{display:none;position:relative}.pubMobileMenu summary{display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;list-style:none;border-radius:12px;background:#f4f6f8;padding:0 12px;cursor:pointer}.pubMobileMenu summary::-webkit-details-marker{display:none}.pubMobileMenu nav{position:absolute;right:0;top:52px;width:min(86vw,320px);max-height:75vh;overflow:auto;display:grid;background:#fff;border:1px solid #dce3ef;border-radius:16px;padding:8px;box-shadow:0 18px 44px #17203320}.pubWrap{max-width:1040px;margin:auto;padding:26px 24px 56px}.pubBreadcrumb{font-size:14px;line-height:1.6;margin:6px 0 20px;color:#596579}.pubBreadcrumb a{display:inline-flex;align-items:center;min-height:44px}.pubHero{padding:38px 0 24px;border-bottom:1px solid #dce3ef}.pubEyebrow{font-size:13px;font-weight:800;letter-spacing:.04em;color:#1d4ed8}.pubHero h1{font-size:clamp(30px,4.2vw,46px);line-height:1.28;letter-spacing:-.045em;margin:14px 0 18px;max-width:800px}.pubHero p{max-width:780px;color:#526075;line-height:1.9;font-size:17px}.pubHeroActions{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}.pubBtn{border:0;display:inline-flex;align-items:center;justify-content:center;min-height:50px;border-radius:12px;background:var(--ab12-action,#1d4ed8);color:#fff;text-decoration:none;font-size:15px;font-weight:800;padding:10px 18px;cursor:pointer;font-family:inherit}.pubBtn.secondary{background:#fff;color:var(--ab12-action,#1d4ed8);border:1px solid #c8d9ff}.pubMeta{font-size:13px!important;color:#596579!important}.pubToc{display:flex;flex-wrap:wrap;gap:2px 18px;margin:18px 0 30px;padding:14px 0;border-bottom:1px solid #dce3ef}.pubToc b{flex-basis:100%;font-size:13px;color:#596579}.pubToc a{display:inline-flex;align-items:center;min-height:44px;font-size:14px;text-decoration:none}.pubSection{margin:0;padding:30px 0;border-bottom:1px solid #e1e7f0;max-width:100%}.pubSection h2,.pubDemo h2{font-size:26px;line-height:1.4;margin:0 0 18px;letter-spacing:-.035em}.pubSection p,.pubSection li{color:#43516a;line-height:1.9;font-size:16px}.pubSection p{max-width:820px}.pubSection ul,.pubSection ol{padding-left:25px}.pubSection li{padding:4px 0 4px 4px}.pubLinks{display:flex;flex-wrap:wrap;gap:8px 12px;margin:18px 0 4px}.pubLinks a{display:inline-flex;align-items:center;min-height:44px;line-height:1.5;border-radius:10px;background:#e8f3ff;color:#1d4ed8;text-decoration:none;padding:10px 14px;font-size:14px;font-weight:700}.pubLinks span{margin-left:6px}.pubNote{background:#eef6f1;border-left:3px solid #298064;color:#215842;padding:16px 18px;margin:18px 0;line-height:1.8}.pubTableWrap{max-width:100%;overflow-x:auto;margin:20px 0;border:1px solid #dce3ef;border-radius:14px;background:#fff}.pubTable{width:100%;border-collapse:collapse;font-size:14px;line-height:1.75}.pubTable caption{text-align:left;padding:16px 18px;font-weight:700;color:#526075}.pubTable th,.pubTable td{padding:15px 18px;border-top:1px solid #e1e7f0;text-align:left;vertical-align:top;min-width:110px}.pubTable thead th{background:#f1f5fb;color:#1e293b}.pubTable tbody th{font-weight:700;color:#172033}.pubTable td{color:#43516a}.pubFaq{display:grid;gap:10px}.pubFaq details{border:1px solid #dce3ef;border-radius:12px;padding:0 18px;background:#fff}.pubFaq summary{cursor:pointer;min-height:52px;padding:17px 0;font-weight:700;line-height:1.6}.pubFaq p{padding-bottom:4px}.pubDemo{padding:28px;border:1px solid #dce3ef;border-radius:20px;background:#fff;margin:24px 0}.pubDemoHeading p{color:#526075;line-height:1.6}.pubDemoHeading h2{margin:10px 0}.pubMetrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:24px 0}.pubMetrics div{border-top:2px solid #d6e4fb;padding:12px 0}.pubMetrics dt{font-size:13px;color:#596579;line-height:1.7}.pubMetrics dd{font-size:24px;font-weight:800;margin:6px 0;color:#172033;letter-spacing:-.03em}.pubDemoRate{font-size:16px}.pubDemoRate strong{margin-left:10px;font-size:23px;color:#1d4ed8}.pubDemo fieldset{margin:22px 0 12px;padding:18px;border:1px solid #dce3ef;border-radius:14px;min-width:0}.pubDemo legend{font-weight:700;padding:0 6px}.pubDemoInputs{display:flex;flex-wrap:wrap;align-items:end;gap:12px}.pubDemoInputs label{display:grid;gap:8px;font-size:14px;flex:1 1 180px;min-width:0;color:#43516a}.pubDemoInputs input{width:100%;min-height:46px;border:1px solid #9ca8bd;border-radius:10px;font-size:16px;padding:10px;color:#172033;background:#fff}.pubDemoInputs input[aria-invalid=true]{border-color:#b42318}.pubDemo fieldset p,#demo-status{font-size:14px;color:#526075;line-height:1.8}#demo-status{min-height:50px}.pubFooter{display:grid;grid-template-columns:1fr;gap:10px;margin-top:32px;padding:26px 0;border-top:1px solid #dce3ef;color:#596579}.pubFooter b{color:#263247}.pubFooter p{line-height:1.8;font-size:14px}.pubFooterLinks{display:flex;flex-wrap:wrap;gap:0 18px}.pubFooterLinks a{display:inline-flex;align-items:center;min-height:44px;color:#475569;font-size:13px}.pubReadingNext{padding:28px 0}.pubReadingNext a{display:inline-flex;min-height:44px;align-items:center;font-weight:700}
@media(max-width:960px){.pubDesktopNav{display:none}.pubMobileMenu{display:block}.pubHeaderInner{justify-content:space-between}.pubStart{margin-left:auto}}@media(max-width:600px){.pubWrap{padding:16px 18px 40px}.pubHeaderInner{padding:8px 16px;gap:12px;min-height:64px}.pubBrand b{font-size:16px}.pubStart{padding:0 10px}.pubBtn{min-height:54px;border-radius:14px}.pubHero{padding:20px 0}.pubHero h1{font-size:31px}.pubHero p{font-size:16px}.pubSection{padding:26px 0}.pubSection h2,.pubDemo h2{font-size:23px}.pubMetrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pubMetrics dd{font-size:21px}.pubDemo{padding:20px 16px}.pubTable th,.pubTable td{padding:12px;min-width:96px}.pubTable caption{padding:14px 12px}.pubDemoInputs .pubBtn{flex:1 1 auto}.pubToc{display:block}.pubToc b{display:block}.pubToc a{display:flex}.pubHeroActions .pubBtn{flex:1 1 auto}.pubMeta a{display:inline-block}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
.pubSummary{margin:22px 0 4px;padding:18px 20px;border:1px solid #d6e4fb;border-radius:16px;background:#f3f8ff}.pubSummary b{display:block;font-size:13px;letter-spacing:.04em;color:#1d4ed8;margin-bottom:8px}.pubSummary ul{margin:0;padding-left:22px}.pubSummary li{color:#1e293b;line-height:1.8;font-size:15px;padding:3px 0}.pubMeta .pubPublished{color:inherit}.pubService{margin:26px 0 0;padding:18px 20px;border-left:3px solid #1d4ed8;background:#f1f5fb;color:#1e293b;line-height:1.8}.pubService b{display:block;margin-bottom:6px}.pubService p{margin:6px 0;color:#43516a;font-size:15px}.pubRelated{margin:26px 0 0;padding-top:22px;border-top:1px solid #e1e7f0}.pubRelated b{display:block;font-size:15px;color:#263247}.pubSources ul{padding-left:22px}.pubSources li{line-height:1.9}.pubSources .pubSourceHost{color:#596579;font-size:13px;margin-left:8px}.pubCards{list-style:none;margin:0;padding:0;display:grid;gap:12px}.pubCards li{border:1px solid #dce3ef;border-radius:14px;background:#fff;padding:14px 18px 16px}.pubCards li a{display:inline-flex;align-items:center;min-height:44px;font-size:17px;font-weight:800;line-height:1.5;color:#172033;text-decoration:none}.pubCards li a:hover{text-decoration:underline}.pubCards li p{margin:2px 0 8px;color:#43516a;line-height:1.8;font-size:15px}.pubCards li small{color:#596579;font-size:13px}@media(min-width:720px){.pubCards{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
}

// V22.9.87 T-22: 공유 미리보기 이미지. 카카오톡·SNS 가 글자만 보여 주던 공개 페이지에 1200×630 카드(assets/og-image.js 생성 파일,
// 1년 캐시 주소)를 붙인다. 수집기는 절대 주소를 읽으므로 정본 출처를 앞에 붙인다. twitter:card 는 큰 이미지 카드다.
function publicOgImageMeta(origin) {
  return `<meta property="og:image" content="${escapeHtml(`${origin}${AB_OG_IMAGE_PATH}`)}"/><meta property="og:image:type" content="image/png"/><meta property="og:image:width" content="${AB_OG_IMAGE_WIDTH}"/><meta property="og:image:height" content="${AB_OG_IMAGE_HEIGHT}"/><meta property="og:image:alt" content="${escapeHtml(AB_OG_IMAGE_ALT)}"/><meta name="twitter:card" content="summary_large_image"/>`;
}

function renderPublicContentPage(env = {}, url = null, key = "home") {
  const catalog = publicPageCatalog(env, url);
  const page = Object.hasOwn(catalog, key) ? catalog[key] : catalog.home;
  const origin = publicBaseUrl(env, url);
  const canonical = `${origin}${key === "home" ? "/" : `/${key}`}`;
  const adKey = publicContentAdKey(key);
  const pageTitle = `${page.title} · ${appName(env)}`;
  const sectionList = safeArray(page.sections);
  const living = publicArticleIsLiving(page);
  const sections = sectionList.map((section, index) => `<section class="pubSection" id="section-${index + 1}"><h2>${escapeHtml(section.title)}</h2>${safeArray(section.paragraphs).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}${section.table ? publicContentTable(section.table, `table-${index + 1}`) : ""}${safeArray(section.steps).length ? `<ol>${section.steps.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ol>` : ""}${safeArray(section.bullets).length ? `<ul>${section.bullets.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}${section.cards ? publicArticleCards(section.cards) : ""}${section.note ? `<aside class="pubNote">${escapeHtml(section.note)}</aside>` : ""}${section.links ? publicContentLinks(section.links) : ""}</section>${page.demo && index === 0 ? renderPublicDemo() : ""}`).join("");
  const faqs = safeArray(page.faqs).length ? `<section class="pubSection" id="questions"><h2>자주 묻는 질문</h2><div class="pubFaq">${page.faqs.map(([q, a]) => `<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join("")}</div>${publicContentLinks(living ? [["다른 생활비 가이드 글 보기", "/articles"], ["틀린 내용 알려 주기", "/contact"]] : [["가이드에서 자세히 보기", "/guides"], ["해결되지 않았다면 문의하기", "/contact"]])}</section>` : "";
  const extras = publicArticleExtras(page, living);
  const type = page.type || "Article";
  const structured = JSON.stringify({
    "@context": "https://schema.org", "@type": type, name: page.title,
    description: page.description, url: canonical, inLanguage: "ko-KR", dateModified: page.updated,
    publisher: { "@type": "Organization", name: BUSINESS_FOOTER_INFO.company, url: origin },
    ...(type === "Article" ? { headline: page.title, author: { "@type": "Organization", name: BUSINESS_FOOTER_INFO.company, url: `${origin}/about` }, mainEntityOfPage: canonical } : {}),
    ...(living ? { datePublished: page.published || page.updated, articleSection: page.category, isAccessibleForFree: true, wordCount: publicArticleHangul(page) } : {}),
    ...(type === "SoftwareApplication" ? { applicationCategory: "FinanceApplication", operatingSystem: "Web" } : {}),
    ...(type === "FAQPage" ? { mainEntity: page.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) } : {}),
  }).replace(/</g, "\\u003c");
  const primary = page.primary || ["가상 예제로 확인하기", "/demo"];
  const secondary = page.secondary || ["전체 사용 가이드", "/guides"];
  // V22.9.87 T-21: 랜딩(홈)은 목차 대신 미리보기·세 걸음 묶음이 머리 바로 아래에 온다.
  const toc = !page.landing && sectionList.length >= 3 ? `<nav class="pubToc" aria-label="이 페이지 목차"><b>이 페이지에서</b>${sectionList.map((section, index) => `<a href="#section-${index + 1}">${escapeHtml(section.title)}</a>`).join("")}</nav>` : "";
  // V22.9.74: 생활비 가이드 글은 작성일·수정일·읽는 시간을 함께 적고 현재 위치는 글 목록 허브를 거친다. 수정일 <time> 이
  // 문서의 첫 <time datetime=…> 이어야 한다(validate-public-guides-v22939 가 JSON-LD dateModified 와 대조).
  const crumb = key === "home" ? "" : `<nav class="pubBreadcrumb" aria-label="현재 위치"><a href="/">말해가계부</a> / ${living ? `<a href="/articles">생활비 가이드 글</a> / ` : key === "articles" ? "" : `<a href="/guides">사용 가이드</a> / `}${escapeHtml(page.title)}</nav>`;
  const metaLine = living
    ? `작성·관리: <a href="/about">${escapeHtml(BUSINESS_FOOTER_INFO.company)} 운영팀</a> · 수정 <time datetime="${page.updated}">${page.updated}</time> · 작성 <time class="pubPublished" datetime="${page.published}">${page.published}</time> · 읽는 시간 약 ${publicArticleReadingMinutes(page)}분`
    : `${type === "Article" ? "작성·관리" : "운영"}: <a href="/about">${escapeHtml(BUSINESS_FOOTER_INFO.company)}${type === "Article" ? " 운영팀" : ""}</a> · 안내 수정 <time datetime="${page.updated}">${page.updated}</time>`;
  const readingNext = living ? `<a href="/articles">생활비 가이드 글 전체 목록 보기 →</a>` : `<a href="/guides">다른 사용 가이드 찾아보기 →</a>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(pageTitle)}</title><meta name="description" content="${escapeHtml(page.description)}"/><meta name="robots" content="index,follow,max-image-preview:large"/><meta name="theme-color" content="#3182f6"/><link rel="canonical" href="${escapeHtml(canonical)}"/><meta property="og:type" content="${type === "Article" ? "article" : "website"}"/><meta property="og:site_name" content="${escapeHtml(appName(env))}"/><meta property="og:locale" content="ko_KR"/><meta property="og:title" content="${escapeHtml(pageTitle)}"/><meta property="og:description" content="${escapeHtml(page.description)}"/><meta property="og:url" content="${escapeHtml(canonical)}"/>${publicOgImageMeta(origin)}${key === "home" ? '<meta name="naver-site-verification" content="7b69a98f38f2f22517982e0b6ed7da0a16160e98"/>' : ""}${publicAdsenseHead(env)}<script type="application/ld+json">${structured}</script><style>${publicContentStyles()}${page.landing || page.demo ? publicPreviewStyles() : ""}${page.landing ? publicLandingStyles() : ""}</style>${adsHeadMarkup(env, adKey)}</head><body${key === "home" ? ' class="pubHome"' : ""}><a class="pubSkip" href="#main">본문으로 건너뛰기</a>${publicSiteNav(key)}<main class="pubWrap" id="main">${crumb}<article><header class="pubHero"><span class="pubEyebrow">${escapeHtml(page.eyebrow || "말해가계부")}</span><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.intro)}</p>${page.demo ? publicAppPreviewHtml(true) : ""}<p class="pubMeta">${metaLine}</p><div class="pubHeroActions"><a class="pubBtn" href="${primary[1]}">${escapeHtml(primary[0])}</a><a class="pubBtn secondary" href="${secondary[1]}">${escapeHtml(secondary[0])}</a></div></header>${page.landing ? publicLandingHtml() : ""}${extras.summary}${toc}${sections}${extras.sources}${faqs}${extras.service}${extras.related}</article>${adSlotMarkup(env, adKey)}<div class="pubReadingNext">${readingNext}</div>${page.landing ? publicLandingBand(env) : ""}${publicSiteFooter()}</main></body></html>`;
}

// V22.9.40 (B): 광고 게이트가 쓰는 화면 키는 정본 경로다. 정책·신원 페이지는 게이트의 허용 목록에 없다.
function publicContentAdKey(key = "home") {
  return key === "home" ? "/" : `/${key}`;
}

async function handlePublicContentPage(request, env, url, key = "home") {
  return htmlResponse(renderPublicContentPage(env, url, key), 200, adsHeaders(env, publicContentAdKey(key), { "cache-control": "public, max-age=300, stale-while-revalidate=600", "x-robots-tag": "index, follow" }));
}

async function publicDocumentResponse(request, env, url) {
  if (!["GET", "HEAD"].includes(request.method) || url.pathname === "/") return null;
  const aliases = [
    ["/sitemap", "/site-map"], ["/service", "/service-guide"],
    ["/usage-guide", "/how-it-works"], ["/kakao-accountbook-guide", "/kakao-guide"],
    ["/budget-management-guide", "/budget-guide"], ["/family-accountbook", "/group-accountbook"],
    ["/data-security", "/security"], ["/about-service", "/about"],
    ["/support", "/contact"], ["/cookie-policy", "/cookies"],
    ["/data-policy", "/privacy"], ["/service-policy", "/terms"],
  ];
  const path = url.pathname.replace(/\/+$/, "");
  const alias = aliases.find(([from]) => from === path);
  if (alias || (path !== url.pathname && PUBLIC_CONTENT_PATHS.includes(path))) {
    return new Response(null, { status: 308, headers: {
      location: `${publicBaseUrl(env, url)}${alias ? alias[1] : path}${url.search}`,
      "cache-control": "public, max-age=3600",
    } });
  }
  let response = null;
  if (PUBLIC_CONTENT_PATHS.includes(path)) response = await handlePublicContentPage(request, env, url, path.slice(1));
  else if (path === "/robots.txt") response = handlePublicRobots(env, url);
  else if (path === "/sitemap.xml") response = handlePublicSitemap(env, url);
  else if (path === "/sitemap.xsl") response = handlePublicSitemapStylesheet(env, url);
  else if (path === "/ads.txt") response = handleAdsTxt(env);
  return response && request.method === "HEAD" ? headOnlyResponse(response) : response;
}

function handlePublicRobots(env = {}, url = null) {
  const origin = publicBaseUrl(env, url);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /admin-view",
    "Disallow: /manage",
    "Disallow: /app",
    "Disallow: /my",
    "Disallow: /api/",
    "Disallow: /skill",
    "Disallow: /nlu-ops",
    "Disallow: /operation-center",
    "Disallow: /u/",
    "Disallow: /auth/",
    "Disallow: /internal/",
    "Disallow: /ops-",
    "Disallow: /backup",
    "Disallow: /transactions/",
    "Disallow: /settings",
    "Disallow: /households",
    "Disallow: /diagnostics",
    "Disallow: /identity-audit",
    "Disallow: /kakao-recent",
    "Disallow: /kakao-login-check",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function handlePublicSitemap(env = {}, url = null) {
  const origin = publicBaseUrl(env, url);
  const catalog = publicPageCatalog(env, url);
  const items = PUBLIC_CONTENT_PATHS.map((path) => `  <url>
    <loc>${escapeHtml(`${origin}${path}`)}</loc>
    <lastmod>${catalog[path === "/" ? "home" : path.slice(1)].updated}</lastmod>
    <changefreq>${path === "/" ? "weekly" : "monthly"}</changefreq>
    <priority>${path === "/" ? "1.0" : "0.7"}</priority>
  </url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>
`;
  return new Response(xml, { status: 200, headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" } });
}

function handlePublicSitemapStylesheet(env = {}, url = null) {
  const origin = publicBaseUrl(env, url);
  const xsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
<xsl:output method="html" encoding="UTF-8" omit-xml-declaration="yes"/>
<xsl:template match="/">
<html lang="ko"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,follow"/><title>말해가계부 XML 사이트맵</title><style>body{margin:0;background:#f7f9fc;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif}.wrap{max-width:1040px;margin:0 auto;padding:28px 18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#312e81));color:#fff;border-radius:26px;padding:28px;margin-bottom:16px}.hero p{color:#e5e7eb;line-height:1.65}.card{background:#fff;border:1px solid #e4eaf2;border-radius:22px;overflow:auto;box-shadow:0 12px 32px rgba(15,23,42,.055)}table{width:100%;border-collapse:collapse;min-width:680px}th,td{padding:13px;text-align:left;border-bottom:1px solid #e8edf4}th{background:#f1f5f9}a{color:#3730a3}.note{color:#64748b;font-size:13px;margin-top:14px}</style></head><body><main class="wrap"><section class="hero"><h1>XML 사이트맵</h1><p>검색엔진이 공개 페이지를 찾도록 제공하는 표준 XML 문서입니다. 일반 사용자는 <a style="color:#FEE500" href="${escapeHtml(origin)}/site-map">웹 사이트맵</a>을 이용할 수 있습니다.</p></section><section class="card"><table><thead><tr><th>주소</th><th>최근 수정</th><th>갱신 주기</th></tr></thead><tbody><xsl:for-each select="s:urlset/s:url"><tr><td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td><td><xsl:value-of select="s:lastmod"/></td><td><xsl:value-of select="s:changefreq"/></td></tr></xsl:for-each></tbody></table></section><p class="note">브라우저에서 표로 보이도록 스타일을 적용했으며 XML 구조 자체는 검색엔진용 표준 형식을 유지합니다.</p></main></body></html>
</xsl:template></xsl:stylesheet>`;
  return new Response(xsl, { status: 200, headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
}

function handleAdsTxt(env = {}) {
  const publisher = adsensePublisherIdForTxt(env);
  if (!publisher) return new Response("# AdSense publisher ID is not configured.\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  return new Response(`google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function renderBusinessInfoReviewCard(variant = "") {
  // V19.8.4: 카카오 심사용 본문 카드는 제거하고, 하단 사업자 푸터만 유지합니다.
  return "";
}
// @build:exports-start
export { handlePublicContentPage, publicDocumentResponse };
// @build:exports-end
