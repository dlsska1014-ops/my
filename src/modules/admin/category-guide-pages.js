
const CATEGORY_KEYWORD_GUIDE = [
  { category: "식비", type: "expense", why: "식사·장보기·배달처럼 먹는 돈", examples: ["점심","저녁","아침","김밥","도시락","배달","치킨","피자","마트","장보기","편의점","반찬","외식"] },
  { category: "카페/간식", type: "expense", why: "커피·디저트·간식 지출", examples: ["커피","아메리카노","스타벅스","스벅","투썸","메가커피","컴포즈","디저트","빵","베이커리","아이스크림","간식"] },
  { category: "교통", type: "expense", why: "이동에 들어가는 돈", examples: ["버스","지하철","택시","카카오택시","기차","KTX","주차","하이패스","대리운전","교통카드"] },
  { category: "차량관리", type: "expense", why: "차 유지·관리 비용", examples: ["주유","기름","휘발유","경유","세차","정비","엔진오일","타이어","자동차세","보험료","하이패스"] },
  { category: "생활용품", type: "expense", why: "집에서 쓰는 소모품", examples: ["쿠팡","다이소","생필품","휴지","세제","샴푸","칫솔","물티슈","생활용품","청소용품"] },
  { category: "쇼핑", type: "expense", why: "옷·물건 구매", examples: ["쇼핑","옷","의류","신발","가방","네이버쇼핑","무신사","지그재그","온라인몰","구매"] },
  { category: "의료/병원", type: "expense", why: "병원·약국·건강 비용", examples: ["병원","약국","진료","치과","안과","내과","약","검진","렌즈","콘택트렌즈","의료비"] },
  { category: "보험", type: "expense", why: "실손·자동차·가족 보험", examples: ["보험","실손","실비","자동차보험","운전자보험","생명보험","화재보험","보험료"] },
  { category: "세금/수수료", type: "expense", why: "세금·공과금·수수료", examples: ["재산세","자동차세","주민세","세금","수수료","이체수수료","연회비","과태료","범칙금"] },
  { category: "통신", type: "expense", why: "휴대폰·인터넷·구독형 통신", examples: ["휴대폰","통신비","SKT","KT","LGU","알뜰폰","인터넷","와이파이","요금제"] },
  { category: "교육/육아", type: "expense", why: "아이·학원·교육비", examples: ["학원","교육비","어린이집","유치원","학교","준비물","문구","교재","장난감","키즈카페"] },
  { category: "문화/여가", type: "expense", why: "영화·공연·취미·여행", examples: ["영화","CGV","롯데시네마","공연","전시","게임","여행","숙박","호텔","펜션","취미"] },
  { category: "용돈", type: "expense", why: "개인 자유 사용금", examples: ["용돈","개인","커피","간식","친구","회식","취미","소액","현금"] },
  { category: "경조사/선물", type: "expense", why: "축의금·부의금·선물", examples: ["축의금","부의금","경조사","선물","생일","명절","용돈","화환","조의금"] },
  { category: "급여", type: "income", why: "월급·상여·정기 수입", examples: ["월급","급여","상여","보너스","성과급","수당","입금","급여일"] },
  { category: "부수입", type: "income", why: "정기 급여 외 수입", examples: ["부수입","알바","중고판매","당근","환급","캐시백","이자","배당","정산"] },
];

function keywordGuideForCategory(name = "", type = "expense") {
  const key = normalizeText(name);
  const same = CATEGORY_KEYWORD_GUIDE.find((x) => normalizeText(x.category) === key && (x.type || "expense") === (type || "expense"));
  if (same) return same;
  const includes = CATEGORY_KEYWORD_GUIDE.find((x) => (normalizeText(x.category).includes(key) || key.includes(normalizeText(x.category))) && (x.type || "expense") === (type || "expense"));
  return includes || null;
}

function suggestedKeywordsForCategory(name = "", type = "expense") {
  return normalizeCategoryKeywords(keywordGuideForCategory(name, type)?.examples || []);
}

function keywordGuideChips(name = "", type = "expense", current = []) {
  const currentSet = new Set(normalizeCategoryKeywords(current).map((x) => normalizeText(x)));
  const suggestions = suggestedKeywordsForCategory(name, type).filter((x) => !currentSet.has(normalizeText(x))).slice(0, 14);
  if (!suggestions.length) return `<span class="emptyKw">추천 키워드 없음</span>`;
  return suggestions.map((k) => `<button class="kwSuggest" type="button" data-kw="${escapeHtml(k)}" onclick="addKeywordToInput(this)">${escapeHtml(k)}</button>`).join("");
}

async function handleChatbotEditGuidePage(request, env, url) {
  const adminOk = await verifyAdminSession(request, env);
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = adminOk ? await fetchAdminHouseholds(env) : [];
  const householdId = adminOk ? (url.searchParams.get("household_id") || households[0]?.id || "") : "";
  const hh = householdId ? `&household_id=${encodeURIComponent(householdId)}` : "";
  const examples = [
    ["저장", "점심 12000원 국민카드", "저장 후 오늘 기준 번호가 붙습니다."],
    ["번호 수정 시작", "01번 내용 수정해줘", "무엇을 바꿀지 메뉴가 나옵니다."],
    ["금액 수정", "01번 금액 13000원", "번호 기록의 금액만 바꿉니다."],
    ["분류 수정", "01번 분류 카페/간식", "번호 기록의 분류를 바꿉니다."],
    ["결제수단 수정", "01번 현금", "번호 기록의 결제수단을 바꿉니다."],
    ["날짜 수정", "01번 날짜 어제", "기록 날짜를 바꿉니다."],
    ["삭제", "01번 삭제", "삭제 확인을 한 번 더 받습니다."],
    ["오늘 목록", "오늘 기록", "오늘 00시부터 저장된 기록을 번호로 봅니다."],
  ].map(([a,b,c]) => `<div class="ex"><span>${escapeHtml(a)}</span><b>${escapeHtml(b)}</b><p>${escapeHtml(c)}</p></div>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>챗봇 수정가이드</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f8fafc,#f3f6fb);color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff;border-radius:30px;padding:24px;margin:12px 0;box-shadow:0 22px 54px rgba(15,23,42,.2)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.55;color:#e5e7eb}.note,.publicNote{background:#fffdf3;border:1px solid #fde68a;color:#854d0e;border-radius:20px;padding:15px;margin:12px 0;line-height:1.55}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.ex{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:18px;box-shadow:0 14px 34px rgba(15,23,42,.055)}.ex span{display:block;color:#667085;font-size:13px;font-weight:900}.ex b{display:block;margin-top:6px;font-size:17px}.ex p{color:#667085;line-height:1.45;font-size:13px;margin:8px 0 0}.flow{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:18px;box-shadow:0 14px 34px rgba(15,23,42,.055);margin:12px 0;line-height:1.7}.flow code{background:#eef2ff;color:#3730a3;border-radius:999px;padding:4px 8px;font-family:inherit;font-weight:900}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${adminOk ? renderUnifiedNav("chatbot-edit-guide", { month, householdId }) : ""}<main class="wrap"><section class="hero"><h1>챗봇 수정가이드</h1><p>카카오톡에 저장한 기록은 매일 00시 기준으로 01번부터 번호가 붙습니다. 번호를 말하면 챗봇에서 바로 수정하거나 삭제할 수 있습니다.</p></section><section class="note"><b>핵심 규칙</b><br/>번호는 날짜별로 다시 시작합니다. 오늘 기록은 오늘 00시 이후 저장된 순서대로 01번, 02번, 03번이 됩니다. 어제 기록을 고치려면 “어제 01번 금액 13000원”처럼 날짜를 같이 말하면 됩니다.</section><section class="flow"><b>예시 흐름</b><br/><code>점심 12000원 국민카드</code><br/>→ 저장했어요 😊<br/>→ 01번 - 점심 / 12,000원 / 국민카드 / 식비<br/><br/><code>01번 내용 수정해줘</code><br/>→ 무엇을 바꿀까요?<br/>1. 금액 2. 분류 3. 결제수단 4. 내용 5. 날짜 6. 삭제</section><section class="grid">${examples}</section><section class="note">가계부를 시작하려면 <a href="/my">가계부 시작하기</a>를 열어주세요.</section></main></body></html>`);
}

async function handleKeywordGuidePage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
  const households = access.households;
  const selected = access.selected;
  let keywordMap = {};
  let customCategories = [];
  if (selected) {
    keywordMap = await fetchCategoryKeywordMap(env, selected.id);
    customCategories = await fetchCustomCategories(env, selected.id);
  }
  const householdId = selected?.id || "";
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  const keywordWritable = canManageMyHousehold(selected?.role || "");
  const keywordEditor = selected ? renderKeywordBulkEditor({ selected, month, keywordMap, customCategories, writable: keywordWritable, returnTo: "guide" }) : "";
  const keywordMsg = String(url.searchParams.get("msg") || "");
  const keywordErr = String(url.searchParams.get("err") || "");
  const keywordResult = keywordMsg ? `<div class="kwResult ok">${formatMessage(keywordMsg)}</div>` : keywordErr ? `<div class="kwResult bad">${formatMessage(keywordErr)}</div>` : "";
  const guideRows = CATEGORY_KEYWORD_GUIDE.slice(0, 12).map((g) => `<div class="guideCard"><div><b>${escapeHtml(g.category)}</b><span>${g.type === "income" ? "수입" : "지출"} · ${escapeHtml(g.why)}</span></div><p>${g.examples.map((k) => `<code>${escapeHtml(k)}</code>`).join("")}</p></div>`).join("");
  const nav = selected ? renderUnifiedNav("keyword-guide", { month, householdId: selected.id, householdName: selected.name }) : "";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>키워드 안내·설정</title><style>${keywordEditorCss()}*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1240px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.075)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.55;color:#e5e7eb}.filters{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:14px}.filters select,.filters button{height:44px;border:0;border-radius:14px;padding:0 12px;font:inherit}.filters button{background:#FEE500;color:#111827;font-weight:1000}.note{background:#fffdf3;border:1px solid #fde68a;color:#854d0e;border-radius:20px;padding:15px;margin:12px 0;line-height:1.55}.kwResult{border-radius:18px;padding:14px;margin:12px 0;line-height:1.6;font-weight:800}.kwResult.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}.kwResult.bad{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}.guideGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.guideCard{background:#fff;border:1px solid #e8edf4;border-radius:22px;padding:16px}.guideCard b{display:block;font-size:17px}.guideCard span{display:block;color:#667085;font-size:13px;margin-top:4px;line-height:1.45}.guideCard p{margin:12px 0 0;line-height:2}.guideCard code{display:inline-block;background:#eef6ff;color:#1d4ed8;border-radius:999px;padding:5px 9px;margin:3px;font-family:inherit;font-size:12px;font-weight:900}.muted{color:#667085;line-height:1.55}button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:14px;background:#111827;color:#fff!important;padding:11px 14px;text-decoration:none;font-weight:1000;cursor:pointer}@media(max-width:760px){body{overflow-x:hidden}.wrap{padding:12px 10px 96px}.hero{border-radius:22px;padding:18px}.hero h1{font-size:24px;line-height:1.25}.filters{grid-template-columns:1fr}.filters select,.filters button{width:100%;font-size:16px;min-height:46px}.card,.guideCard{border-radius:20px;padding:16px}.guideGrid{grid-template-columns:1fr}.kwEditorGrid{grid-template-columns:1fr!important}.keywordToolbar{display:block}.keywordToolbar button{width:100%;margin-top:8px}}</style></head><body>${nav}<main class="wrap"><section class="hero"><h1>키워드 안내·설정</h1><p>${escapeHtml(selected?.name || "내 가계부")} 기준의 키워드만 표시합니다. 다른 가계부는 이 목록에 나오지 않습니다.</p>${households.length ? `<form class="filters" method="get" action="/keyword-guide"><select name="household_id">${householdOptions}</select><input type="hidden" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form>` : ""}</section><section class="note"><b>추천 기준</b><br/>1. 가맹점명: 스타벅스, 쿠팡, 병원명<br/>2. 생활 표현: 점심, 커피, 주유, 약국<br/>3. 줄임말: 스벅, 택시, 마트<br/>4. 정기 지출명: 자동차보험, 재산세, 통신비<br/>5. 우리집만 쓰는 표현: 아이간식, 병원비, 생활비통장</section>${keywordResult}${selected ? `<section class="card">${keywordEditor}</section>` : `<section class="card"><p>먼저 가계부를 선택하세요.</p></section>`}<section class="card"><h2>카테고리별 추천 예시</h2><div class="guideGrid">${guideRows}</div></section></main></body></html>`);
}

async function handleCategoryAdminPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || "";
  const selected = households.find((h) => h.id === householdId) || null;
  const custom = await fetchCustomCategories(env, householdId);
  const keywordMap = await fetchCategoryKeywordMap(env, householdId);
  const displayCategories = categoryKeywordDisplayRows(custom, keywordMap, householdId);
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  return htmlResponse(renderCategoryAdminHtml({ env, households, selected, householdId, custom, displayCategories, msg, err }));
}

async function handleCategoryCreate(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const name = String(form.get("name") || "").trim().slice(0, 80);
  const type = String(form.get("type") || "expense").trim() === "income" ? "income" : "expense";
  const keywords = normalizeCategoryKeywords(form.get("keywords") || "");
  if (!householdId || !name) return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&err=category_missing`);
  let tableCreated = false;
  try {
    await supabase(env, "/rest/v1/accountbook_categories", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ household_id: householdId, name, type, sort_order: 100 }),
    });
    tableCreated = true;
  } catch (err) {
    try {
      await addSettingsCategory(env, householdId, name, type, keywords);
      return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&msg=category_created_fallback`);
    } catch (fallbackErr) {
      return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&err=${encodeURIComponent("분류 저장을 완료하지 못했습니다. 기본 분류는 계속 사용할 수 있습니다.")}`);
    }
  }
  if (tableCreated && keywords.length) {
    try {
      await setCategoryKeywords(env, householdId, type, name, keywords);
    } catch (err) {
      rememberOpsEvent({ kind: "category_created_keywords_pending", severity: "warn", path: "/admin/category/create", method: "POST", detail: safeError(err) });
      return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&msg=category_created&err=category_created_keywords_pending`);
    }
  }
  return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&msg=category_created`);
}

async function handleCategoryDelete(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const householdId = String(form.get("household_id") || "").trim();
  if (!id) return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&err=category_missing`);
  if (id.startsWith("settings_")) {
    try {
      await deleteSettingsCategory(env, householdId, id);
      return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&msg=category_deleted_fallback`);
    } catch (fallbackErr) {
      return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&err=${encodeURIComponent("분류 삭제를 완료하지 못했습니다.")}`);
    }
  }
  try {
    await supabase(env, `/rest/v1/accountbook_categories?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&msg=category_deleted`);
  } catch (err) {
    try {
      await deleteSettingsCategory(env, householdId, id);
      return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&msg=category_deleted_fallback`);
    } catch (fallbackErr) {
      return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&err=${encodeURIComponent("분류 삭제를 완료하지 못했습니다.")}`);
    }
  }
}

async function handleCategoryKeywordsSave(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const type = String(form.get("type") || "expense").trim() === "income" ? "income" : "expense";
  const name = String(form.get("name") || "").trim().slice(0, 80);
  const keywords = normalizeCategoryKeywords(form.get("keywords") || "");
  if (!householdId || !name) return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&err=category_missing`);
  try {
    await setCategoryKeywords(env, householdId, type, name, keywords);
    return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&msg=category_keywords_saved`);
  } catch (err) {
    return redirectResponse(`/categories?household_id=${encodeURIComponent(householdId)}&err=${encodeURIComponent("키워드 저장을 완료하지 못했습니다.")}`);
  }
}

async function handleMyProfilePage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  return htmlResponse(renderMyProfileHtml({ env, user, msg: url.searchParams.get("msg") || "", err: url.searchParams.get("err") || "" }));
}

async function handleMyProfileUpdate(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const nickname = stripMergedMarkerSuffix(String(form.get("nickname") || "")).slice(0, 80);
  if (!nickname) return redirectResponse("/my/profile?err=nickname_missing");
  await supabase(env, `/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ nickname }),
  });
  return redirectResponse("/my/profile?msg=updated");
}

function renderMyProfileHtml({ env, user, msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 프로필</title><style>body{margin:0;background:#f6f7f9;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:640px;margin:0 auto;padding:18px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;box-shadow:0 10px 26px rgba(15,23,42,.06)}input{width:100%;height:44px;border:1px solid #cbd5e1;border-radius:14px;padding:0 12px;font:inherit}button,.btn{height:42px;border:0;border-radius:14px;background:#111827;color:#fff;text-decoration:none;font-weight:950;padding:0 14px;display:inline-flex;align-items:center}.muted{color:#64748b;font-size:13px;line-height:1.6}.notice{background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe;border-radius:14px;padding:12px;line-height:1.55}.ok{background:#e8f1e9;color:#365b41;border:1px solid #c9decf;border-radius:12px;padding:10px;margin-bottom:10px}.error{background:#f7e8e4;color:#8f463d;border:1px solid #e7c4bd;border-radius:12px;padding:10px;margin-bottom:10px}</style></head><body><main class="wrap"><h1>내 프로필</h1>${msg ? `<div class="ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error">${escapeHtml(err)}</div>` : ""}<section class="card"><form method="post" action="/my/profile"><p class="muted">가계부 참여자 명단과 지출자 표시 이름으로 사용됩니다.</p><div class="notice">이 이름을 수정해도 로그인 이름과 비밀번호는 바뀌지 않습니다.</div><p><label>표시 이름</label></p><input name="nickname" value="${escapeHtml(user?.nickname || "")}" placeholder="예: Bin, 엄마, 아빠"/><p><button type="submit">저장</button> <a class="btn" href="/my" style="background:#e2e8f0;color:#111">내 가계부</a></p></form></section></main></body></html>`;
}

function renderCategoryAdminHtml({ env, households, selected, householdId, custom = [], displayCategories = [], msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  const presets = DEFAULT_CATEGORIES.map((c) => `<span class="pill">${escapeHtml(c)}</span>`).join("");
  const categoryCards = displayCategories.length ? displayCategories.map((c) => {
    const keywords = normalizeCategoryKeywords(c.keywords || "");
    const keywordText = keywords.join(", ");
    const keywordChips = keywords.length ? keywords.map((k) => `<span class="kw">${escapeHtml(k)}</span>`).join("") : `<span class="emptyKw">키워드 없음</span>`;
    const isCustom = !String(c.id || "").startsWith("default_") && c.storage !== "default" && c.storage !== "default_keyword";
    const deleteForm = isCustom ? `<form method="post" action="/admin/category/delete"><input type="hidden" name="household_id" value="${escapeHtml(c.household_id || householdId)}"/><input type="hidden" name="id" value="${escapeHtml(c.id)}"/><button class="danger" type="submit">삭제</button></form>` : `<span class="baseBadge">기본</span>`;
    return `<div class="catCard"><div class="catHead"><div><b>${escapeHtml(c.name)}</b><span>${c.type === "income" ? "수입" : "지출"}</span></div>${deleteForm}</div><div class="kwBox">${keywordChips}</div><div class="suggestBox"><strong>추천 키워드</strong>${keywordGuideChips(c.name, c.type, keywords)}</div><form class="kwForm" method="post" action="/admin/category-keywords/save"><input type="hidden" name="household_id" value="${escapeHtml(c.household_id || householdId)}"/><input type="hidden" name="type" value="${escapeHtml(c.type || "expense")}"/><input type="hidden" name="name" value="${escapeHtml(c.name)}"/><input name="keywords" value="${escapeHtml(keywordText)}" placeholder="예: 스타벅스, 커피, 투썸"/><button class="primary" type="submit">키워드 저장</button></form></div>`;
  }).join("") : `<p class="muted">분류를 선택하거나 내 분류를 추가하면 키워드를 관리할 수 있습니다.</p>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 분류 설정</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff;border-radius:28px;padding:22px;margin:12px 0;box-shadow:0 18px 42px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:28px}.hero p{line-height:1.55;opacity:.92}.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.filters,.formGrid,.kwForm{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px}.filters select,.filters button,.formGrid input,.formGrid select,.formGrid button,.kwForm input,.kwForm button{height:44px;border:1px solid #d1d5db;border-radius:14px;padding:0 12px;background:#fff;font:inherit}.filters button,.formGrid button,.kwForm button{background:#111827;color:#fff;font-weight:1000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.catCard{background:#f8fafc;border:1px solid #e5e7eb;border-radius:20px;padding:14px}.catHead{display:flex;align-items:center;justify-content:space-between;gap:10px}.catHead b{display:block;font-size:17px}.catHead span,.muted{color:#64748b;font-size:13px;line-height:1.45}.pill,.kw,.emptyKw,.baseBadge,.kwSuggest{display:inline-flex;border-radius:999px;padding:6px 10px;margin:3px;font-size:12px;font-weight:900}.pill{background:#f1f5f9;border:1px solid #e2e8f0}.kw{background:#e0f2fe;color:#075985}.kwSuggest{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;cursor:pointer}.emptyKw{background:#f1f5f9;color:#64748b}.baseBadge{background:#ecfdf5;color:#065f46}.danger{height:34px;border:0;border-radius:11px;background:#fee2e2;color:#991b1b;font-weight:900;padding:0 10px}.ok{background:#e8f1e9;color:#365b41;border:1px solid #c9decf;border-radius:12px;padding:10px}.error{background:#f7e8e4;color:#8f463d;border:1px solid #e7c4bd;border-radius:12px;padding:10px}.tip{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:12px;line-height:1.55}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}.filters,.formGrid,.kwForm{grid-template-columns:1fr}}</style></head><body>${renderUnifiedNav("categories", { householdId })}<main class="wrap"><section class="hero"><h1>분류·키워드 설정</h1><p>같은 단어라도 집마다 분류 기준이 다를 수 있습니다. 예를 들어 “커피”를 식비로 볼 수도 있고, 용돈으로 볼 수도 있습니다. 우리집 기준에 맞게 키워드를 연결하세요.</p><form class="filters" method="get" action="/categories"><select name="household_id"><option value="">가계부 선택</option>${households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("")}</select><button type="submit">조회</button></form></section>${msg ? `<div class="ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error">${escapeHtml(err)}</div>` : ""}<section class="card"><h2>내 분류 추가</h2><div class="guideLine">키워드는 순서와 상관없이 동작합니다. 대신 “가족이 실제로 입력할 말”을 넣어야 자동분류가 잘 됩니다. 예: 커피, 스벅, 스타벅스, 점심, 주유, 자동차보험 <a href="/keyword-guide" style="font-weight:1000;color:#1d4ed8">키워드 안내 보기</a></div><form class="formGrid" method="post" action="/admin/category/create"><input type="hidden" name="household_id" value="${escapeHtml(householdId || selected?.id || "")}"/><input name="name" placeholder="예: 용돈, 아이간식, 렌즈소모품"/><select name="type"><option value="expense">지출</option><option value="income">수입</option></select><input name="keywords" placeholder="키워드 예: 커피, 스벅, 편의점"/><button type="submit">추가</button></form><p class="tip">키워드는 쉼표로 여러 개 입력할 수 있습니다. 챗봇 입력과 카드/문자 내역 분류에 우선 반영됩니다.</p></section><section class="card"><h2>기본 분류</h2><p class="muted">기본 분류도 키워드를 연결할 수 있습니다.</p><div>${presets}</div></section><section class="card"><h2>키워드 관리</h2><div class="grid">${categoryCards}</div></section><script>function addKeywordToInput(btn){var form=btn.closest(".catCard")?.querySelector(".kwForm");if(!form)return;var input=form.querySelector('input[name="keywords"]');if(!input)return;var kw=btn.getAttribute("data-kw")||btn.textContent.trim();var parts=input.value.split(/[,\n|/]+/).map(function(x){return x.trim()}).filter(Boolean);if(!parts.some(function(x){return x.toLowerCase()===kw.toLowerCase()})){parts.push(kw)}input.value=parts.join(", ");input.focus()}</script></main></body></html>`;
}
