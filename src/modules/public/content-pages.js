// @build:imports-start
import { nluOpsConfig } from "../runtime/ops-telemetry.js";
import {
  BUSINESS_FOOTER_INFO, PUBLIC_CONTENT_PATHS, adsensePublisherIdForTxt, appName, publicAdsenseHead,
  publicBaseUrl, publicSiteFooter, publicSiteNav,
} from "./site-config.js";
import {
  publicDemoClient, publicDemoRows, publicDemoSummary, publicGuidePages,
} from "./guide-content.js";
import { headOnlyResponse, htmlResponse } from "../runtime/http.js";
import { safeArray } from "../admin/backup-compare.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

function publicPageCatalog(env = {}, url = null) {
  const catalog = {
    ...publicGuidePages(env),
    privacy: {
      title: "개인정보처리방침",
      description: "말해가계부가 처리하는 개인정보와 가계부 데이터, 처리 목적, 보관 기간, 광고 쿠키와 이용자 권리를 안내합니다.",
      eyebrow: "시행일 2026년 7월 13일",
      intro: "말해가계부는 서비스 제공에 필요한 범위에서 사용자와 가계부 데이터를 처리합니다. 처리 목적과 보유기간을 벗어나 임의로 이용하지 않으며, 사용자 발화를 AI 모델 학습에 자동 활용하지 않습니다.",
      sections: [
        { title: "1. 처리하는 항목과 목적", paragraphs: ["사용자 식별키와 로그인 정보는 사용자 구분과 세션 유지에 사용합니다. 가계부 이름, 참여자 권한, 초대코드, 표시 이름은 공동 가계부 운영에 사용합니다.", "수입·지출, 날짜, 분류, 결제수단, 메모, 예산과 설정값은 기록·조회·분석·백업 기능을 제공하기 위해 처리합니다. 카카오 거래 입력 원문은 거래 데이터와 함께 보관될 수 있습니다. 단톡방 연결키는 첫 기록으로 준비하거나 직접 연결한 공동 가계부와 해당 방을 구분하는 데 사용합니다."], bullets: ["회원 및 세션 관리", "가계부 생성·참여·권한 관리", "거래 기록·예산·요약·정산 제공", "중복 저장 방지와 장애 대응", "법적 의무와 분쟁 대응"] },
        { title: "2. 사용자 발화와 자연어 운영 로그", paragraphs: ["사용자 발화는 요청을 이해하고 응답하기 위해 사용합니다. 발화를 외부 AI 모델의 학습 데이터로 자동 전송하거나 자동 학습 데이터로 등록하지 않습니다.", "운영 통계는 의도, 처리 결과, 지연시간과 배포 버전을 집계합니다. 실패한 요청의 일부 문장은 URL·이메일·전화번호·코드·긴 숫자 등을 마스킹하여 임시 메모리에 보관할 수 있습니다. 마스킹이 모든 개인정보를 완전히 제거한다고 보장하지는 않습니다. 별도 실패 사례 저장은 운영 설정에 따르며 거래 데이터의 보관과 구분합니다."] },
        { title: "3. 보유기간과 삭제", paragraphs: ["가계부 거래와 설정은 사용자가 서비스를 이용하는 동안 보관하며 웹에서 직접 수정·삭제할 수 있습니다. 가계부 소유자가 영구 삭제를 완료하면 해당 가계부의 거래와 관련 설정을 삭제합니다. 가계부 나가기는 참여 권한을 종료하며 공동 거래 이력은 보존합니다. 현재 계정 자체를 탈퇴·삭제하는 온라인 기능은 제공하지 않으며 개인정보 삭제 요청은 서비스 문의 경로로 확인합니다.", "세션과 운영 로그는 목적에 필요한 기간만 보관합니다. 법령상 보존 의무가 있는 경우 해당 기간 동안 분리 보관할 수 있습니다."] },
        { title: "4. 제3자 광고와 쿠키", paragraphs: ["현재 공개 페이지에서는 Google 광고를 실행하지 않습니다. 향후 광고 기능이 활성화되면 Google을 포함한 제3자 광고 사업자가 쿠키를 사용해 사용자의 이전 방문 정보 등을 바탕으로 광고를 제공하고 성과를 측정할 수 있습니다.", "제3자는 광고 제공 과정에서 브라우저의 쿠키를 저장·조회하거나 웹 비콘과 IP 주소 같은 기술을 사용할 수 있습니다. 말해가계부는 거래 내용, 예산, 가계부 구성원 정보와 사용자 발화 원문을 광고주에게 판매하지 않습니다. 사용자는 Google 광고 설정과 브라우저 설정을 통해 광고 개인화와 쿠키를 관리할 수 있습니다."], links: [["Google 광고 및 데이터 이용 안내", "https://policies.google.com/technologies/ads?hl=ko"], ["Google 파트너 사이트 정보 이용 안내", "https://policies.google.com/technologies/partner-sites?hl=ko"], ["Google 개인정보처리방침", "https://policies.google.com/privacy?hl=ko"]] },
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
        { title: "광고 및 측정 기술", paragraphs: ["현재 공개 페이지에서는 Google 광고 실행 코드와 광고 쿠키를 사용하지 않습니다. 향후 광고 기능을 활성화하면 Google과 제3자 광고 사업자가 쿠키와 유사 기술을 사용해 광고를 제공하고 성과를 측정할 수 있습니다.", "사용자는 Google 광고 설정과 브라우저의 사이트별 쿠키 설정을 통해 광고 개인화와 저장된 쿠키를 관리할 수 있습니다."], links: [["Google 쿠키 사용 안내", "https://policies.google.com/technologies/cookies?hl=ko"], ["Google 광고 및 데이터 이용 안내", "https://policies.google.com/technologies/ads?hl=ko"], ["Google 개인정보처리방침", "https://policies.google.com/privacy?hl=ko"]] },
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
  return catalog;
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

function publicContentStyles() {
  return `
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:92px}body{margin:0;background:#f7f9fc;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.02em;word-break:keep-all;overflow-wrap:anywhere}a{color:#3730a3}a:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible,[tabindex]:focus-visible{outline:3px solid #7554d9;outline-offset:4px}.pubSkip{position:absolute;left:16px;top:-80px;z-index:100;background:#fff;padding:12px}.pubSkip:focus{top:8px}.pubHeader{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.97);border-bottom:1px solid #e8edf4}.pubHeaderInner{max-width:1180px;margin:auto;min-height:72px;padding:10px 24px;display:flex;align-items:center;gap:24px}.pubBrand{display:flex;align-items:center;gap:9px;text-decoration:none;color:#172033;white-space:nowrap}.pubBrand span{width:36px;height:36px;border-radius:12px;background:#FEE500;display:flex;align-items:center;justify-content:center;font-weight:900}.pubBrand b{font-size:18px}.pubDesktopNav{display:flex;align-items:center;gap:2px;flex:1}.pubHeader nav a{display:inline-flex;align-items:center;min-height:44px;color:#526075;text-decoration:none;font-size:14px;font-weight:700;padding:10px;border-radius:10px;white-space:nowrap}.pubHeader nav a:hover,.pubHeader nav a.active{background:#eef2ff;color:#312e81}.pubStart{display:inline-flex;align-items:center;justify-content:center;min-height:44px;background:#172033;color:#fff;text-decoration:none;border-radius:12px;padding:0 16px;font-weight:800;white-space:nowrap}.pubMobileMenu{display:none;position:relative}.pubMobileMenu summary{display:flex;align-items:center;justify-content:center;min-height:44px;list-style:none;border-radius:10px;background:#eef2f7;padding:0 12px;cursor:pointer}.pubMobileMenu summary::-webkit-details-marker{display:none}.pubMobileMenu nav{position:absolute;right:0;top:52px;width:min(86vw,320px);max-height:75vh;overflow:auto;display:grid;background:#fff;border:1px solid #dce3ef;border-radius:16px;padding:8px;box-shadow:0 18px 44px #17203320}.pubWrap{max-width:1040px;margin:auto;padding:26px 24px 56px}.pubBreadcrumb{font-size:14px;line-height:1.6;margin:6px 0 20px;color:#596579}.pubBreadcrumb a{display:inline-flex;align-items:center;min-height:44px}.pubHero{padding:38px 0 24px;border-bottom:1px solid #dce3ef}.pubEyebrow{font-size:13px;font-weight:800;letter-spacing:.04em;color:#5145a5}.pubHero h1{font-size:clamp(30px,4.2vw,46px);line-height:1.28;letter-spacing:-.045em;margin:14px 0 18px;max-width:800px}.pubHero p{max-width:780px;color:#526075;line-height:1.9;font-size:17px}.pubHeroActions{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}.pubBtn{border:0;display:inline-flex;align-items:center;justify-content:center;min-height:46px;border-radius:12px;background:#312e81;color:#fff;text-decoration:none;font-size:15px;font-weight:800;padding:10px 18px;cursor:pointer;font-family:inherit}.pubBtn.secondary{background:#fff;color:#312e81;border:1px solid #cbd3e3}.pubMeta{font-size:13px!important;color:#596579!important}.pubToc{display:flex;flex-wrap:wrap;gap:2px 18px;margin:18px 0 30px;padding:14px 0;border-bottom:1px solid #dce3ef}.pubToc b{flex-basis:100%;font-size:13px;color:#596579}.pubToc a{display:inline-flex;align-items:center;min-height:44px;font-size:14px;text-decoration:none}.pubSection{margin:0;padding:30px 0;border-bottom:1px solid #e1e7f0;max-width:100%}.pubSection h2,.pubDemo h2{font-size:26px;line-height:1.4;margin:0 0 18px;letter-spacing:-.035em}.pubSection p,.pubSection li{color:#43516a;line-height:1.9;font-size:16px}.pubSection p{max-width:820px}.pubSection ul,.pubSection ol{padding-left:25px}.pubSection li{padding:4px 0 4px 4px}.pubLinks{display:flex;flex-wrap:wrap;gap:8px 12px;margin:18px 0 4px}.pubLinks a{display:inline-flex;align-items:center;min-height:44px;line-height:1.5;border-radius:10px;background:#eeedfa;color:#373078;text-decoration:none;padding:10px 14px;font-size:14px;font-weight:700}.pubLinks span{margin-left:6px}.pubNote{background:#eef6f1;border-left:3px solid #298064;color:#215842;padding:16px 18px;margin:18px 0;line-height:1.8}.pubTableWrap{max-width:100%;overflow-x:auto;margin:20px 0;border:1px solid #dce3ef;border-radius:14px;background:#fff}.pubTable{width:100%;border-collapse:collapse;font-size:14px;line-height:1.75}.pubTable caption{text-align:left;padding:16px 18px;font-weight:700;color:#526075}.pubTable th,.pubTable td{padding:15px 18px;border-top:1px solid #e1e7f0;text-align:left;vertical-align:top;min-width:110px}.pubTable thead th{background:#f0f2fa;color:#353067}.pubTable tbody th{font-weight:700;color:#172033}.pubTable td{color:#43516a}.pubFaq{display:grid;gap:10px}.pubFaq details{border:1px solid #dce3ef;border-radius:12px;padding:0 18px;background:#fff}.pubFaq summary{cursor:pointer;min-height:52px;padding:17px 0;font-weight:700;line-height:1.6}.pubFaq p{padding-bottom:4px}.pubHome .pubHero{background:#1c2141;color:#fff;border-radius:24px;padding:44px;margin:8px 0 18px;border:0}.pubHome .pubHero p{color:#dce2f7}.pubHome .pubHero .pubEyebrow{color:#c9bdfb}.pubHome .pubHero .pubMeta{color:#dce2f7!important}.pubHome .pubHero .pubMeta a{color:#dce2f7}.pubHome .pubHero .pubBtn{background:#FEE500;color:#191919}.pubHome .pubHero .pubBtn.secondary{background:transparent;color:#fff;border-color:#8891b2}.pubDemo{padding:28px;border:1px solid #d2d5ec;border-radius:20px;background:#fff;margin:24px 0}.pubDemoHeading p{color:#526075;line-height:1.6}.pubDemoHeading h2{margin:10px 0}.pubMetrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:24px 0}.pubMetrics div{border-top:2px solid #d9daf1;padding:12px 0}.pubMetrics dt{font-size:13px;color:#596579;line-height:1.7}.pubMetrics dd{font-size:24px;font-weight:800;margin:6px 0;color:#25234f;letter-spacing:-.03em}.pubDemoRate{font-size:16px}.pubDemoRate strong{margin-left:10px;font-size:23px;color:#312e81}.pubDemo fieldset{margin:22px 0 12px;padding:18px;border:1px solid #dce3ef;border-radius:14px;min-width:0}.pubDemo legend{font-weight:700;padding:0 6px}.pubDemoInputs{display:flex;flex-wrap:wrap;align-items:end;gap:12px}.pubDemoInputs label{display:grid;gap:8px;font-size:14px;flex:1 1 180px;min-width:0;color:#43516a}.pubDemoInputs input{width:100%;min-height:46px;border:1px solid #9ca8bd;border-radius:10px;font-size:16px;padding:10px;color:#172033;background:#fff}.pubDemoInputs input[aria-invalid=true]{border-color:#b42318}.pubDemo fieldset p,#demo-status{font-size:14px;color:#526075;line-height:1.8}#demo-status{min-height:50px}.pubFooter{display:grid;grid-template-columns:1fr;gap:10px;margin-top:32px;padding:26px 0;border-top:1px solid #dce3ef;color:#596579}.pubFooter b{color:#263247}.pubFooter p{line-height:1.8;font-size:14px}.pubFooterLinks{display:flex;flex-wrap:wrap;gap:0 18px}.pubFooterLinks a{display:inline-flex;align-items:center;min-height:44px;color:#475569;font-size:13px}.pubReadingNext{padding:28px 0}.pubReadingNext a{display:inline-flex;min-height:44px;align-items:center;font-weight:700}
@media(max-width:960px){.pubDesktopNav{display:none}.pubMobileMenu{display:block}.pubHeaderInner{justify-content:space-between}.pubStart{margin-left:auto}}@media(max-width:600px){.pubWrap{padding:16px 18px 40px}.pubHeaderInner{padding:8px 16px;gap:12px;min-height:64px}.pubBrand b{font-size:16px}.pubStart{display:none}.pubHero{padding:20px 0}.pubHome .pubHero{padding:28px 22px}.pubHero h1{font-size:31px}.pubHero p{font-size:16px}.pubSection{padding:26px 0}.pubSection h2,.pubDemo h2{font-size:23px}.pubMetrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pubMetrics dd{font-size:21px}.pubDemo{padding:20px 16px}.pubTable th,.pubTable td{padding:12px;min-width:96px}.pubTable caption{padding:14px 12px}.pubDemoInputs .pubBtn{flex:1 1 auto}.pubToc{display:block}.pubToc b{display:block}.pubToc a{display:flex}.pubHeroActions .pubBtn{flex:1 1 auto}.pubMeta a{display:inline-block}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;
}

function renderPublicContentPage(env = {}, url = null, key = "home") {
  const catalog = publicPageCatalog(env, url);
  const page = Object.hasOwn(catalog, key) ? catalog[key] : catalog.home;
  const origin = publicBaseUrl(env, url);
  const canonical = `${origin}${key === "home" ? "/" : `/${key}`}`;
  const pageTitle = `${page.title} · ${appName(env)}`;
  const sectionList = safeArray(page.sections);
  const sections = sectionList.map((section, index) => `<section class="pubSection" id="section-${index + 1}"><h2>${escapeHtml(section.title)}</h2>${safeArray(section.paragraphs).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}${section.table ? publicContentTable(section.table, `table-${index + 1}`) : ""}${safeArray(section.steps).length ? `<ol>${section.steps.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ol>` : ""}${safeArray(section.bullets).length ? `<ul>${section.bullets.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}${section.note ? `<aside class="pubNote">${escapeHtml(section.note)}</aside>` : ""}${section.links ? publicContentLinks(section.links) : ""}</section>${page.demo && index === 0 ? renderPublicDemo() : ""}`).join("");
  const faqs = safeArray(page.faqs).length ? `<section class="pubSection" id="questions"><h2>자주 묻는 질문</h2><div class="pubFaq">${page.faqs.map(([q, a]) => `<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join("")}</div>${publicContentLinks([["가이드에서 자세히 보기", "/guides"], ["해결되지 않았다면 문의하기", "/contact"]])}</section>` : "";
  const type = page.type || "Article";
  const structured = JSON.stringify({
    "@context": "https://schema.org", "@type": type, name: page.title,
    description: page.description, url: canonical, inLanguage: "ko-KR", dateModified: page.updated,
    publisher: { "@type": "Organization", name: BUSINESS_FOOTER_INFO.company, url: origin },
    ...(type === "Article" ? { headline: page.title, author: { "@type": "Organization", name: BUSINESS_FOOTER_INFO.company, url: `${origin}/about` }, mainEntityOfPage: canonical } : {}),
    ...(type === "SoftwareApplication" ? { applicationCategory: "FinanceApplication", operatingSystem: "Web" } : {}),
    ...(type === "FAQPage" ? { mainEntity: page.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) } : {}),
  }).replace(/</g, "\\u003c");
  const primary = page.primary || ["가상 예제로 확인하기", "/demo"];
  const secondary = page.secondary || ["전체 사용 가이드", "/guides"];
  const toc = sectionList.length >= 3 ? `<nav class="pubToc" aria-label="이 페이지 목차"><b>이 페이지에서</b>${sectionList.map((section, index) => `<a href="#section-${index + 1}">${escapeHtml(section.title)}</a>`).join("")}</nav>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(pageTitle)}</title><meta name="description" content="${escapeHtml(page.description)}"/><meta name="robots" content="index,follow,max-image-preview:large"/><meta name="theme-color" content="#312e81"/><link rel="canonical" href="${escapeHtml(canonical)}"/><meta property="og:type" content="${type === "Article" ? "article" : "website"}"/><meta property="og:site_name" content="${escapeHtml(appName(env))}"/><meta property="og:locale" content="ko_KR"/><meta property="og:title" content="${escapeHtml(pageTitle)}"/><meta property="og:description" content="${escapeHtml(page.description)}"/><meta property="og:url" content="${escapeHtml(canonical)}"/>${publicAdsenseHead(env)}<script type="application/ld+json">${structured}</script><style>${publicContentStyles()}</style></head><body${key === "home" ? ' class="pubHome"' : ""}><a class="pubSkip" href="#main">본문으로 건너뛰기</a>${publicSiteNav(key)}<main class="pubWrap" id="main">${key === "home" ? "" : `<nav class="pubBreadcrumb" aria-label="현재 위치"><a href="/">말해가계부</a> / <a href="/guides">사용 가이드</a> / ${escapeHtml(page.title)}</nav>`}<article><header class="pubHero"><span class="pubEyebrow">${escapeHtml(page.eyebrow || "말해가계부")}</span><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.intro)}</p><p class="pubMeta">${type === "Article" ? "작성·관리" : "운영"}: <a href="/about">${escapeHtml(BUSINESS_FOOTER_INFO.company)}${type === "Article" ? " 운영팀" : ""}</a> · 안내 수정 <time datetime="${page.updated}">${page.updated}</time></p><div class="pubHeroActions"><a class="pubBtn" href="${primary[1]}">${escapeHtml(primary[0])}</a><a class="pubBtn secondary" href="${secondary[1]}">${escapeHtml(secondary[0])}</a></div></header>${toc}${sections}${faqs}</article><div class="pubReadingNext"><a href="/guides">다른 사용 가이드 찾아보기 →</a></div>${publicSiteFooter()}</main></body></html>`;
}

async function handlePublicContentPage(request, env, url, key = "home") {
  return htmlResponse(renderPublicContentPage(env, url, key), 200, { "cache-control": "public, max-age=300, stale-while-revalidate=600", "x-robots-tag": "index, follow" });
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
