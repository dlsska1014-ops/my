// @build:imports-start
import { parseStrictSettingsObject, withHouseholdSettingsRmw } from "../runtime/leases.js";
import { randomEntityId } from "../auth/crypto-admin-session.js";
import { CATEGORY_KEYWORD_GUIDE, keywordGuideForCategory } from "../admin/category-guide-pages.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { defaultExpenseBudgetNames } from "../my/groups-budget-bulk.js";
import { DEFAULT_CATEGORIES } from "../admin/dashboard-fragments.js";
import { mergedOptions } from "../kakao/reply-texts.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst } from "../nlu/date-payment.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

function categorySettingsKey(householdId = "") {
  return `custom_categories:${String(householdId || "default").trim() || "default"}`;
}

function categoryKeywordsSettingsKey(householdId = "") {
  return `category_keywords:${String(householdId || "default").trim() || "default"}`;
}

function categoryKeywordKey(type = "expense", name = "") {
  return `${type === "income" ? "income" : "expense"}::${normalizeText(name)}`;
}

function normalizeCategoryKeywords(value = "") {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,\n|/]+/);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const kw = String(item || "").trim().slice(0, 40);
    const key = normalizeText(kw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
  }
  return out.slice(0, 30);
}

// V22.9.26: 읽고-고쳐-쓰는 경로는 strict 로 읽는다. 예전에는 설정 읽기가 503 으로 실패하면
// 빈 값으로 보고 한 건만 담아 저장해, 기존 키워드·적립계획·별칭 전체가 조용히 사라졌다.
async function fetchCategoryKeywordMap(env, householdId = "", options = {}) {
  const strict = options.strict === true;
  try {
    const key = categoryKeywordsSettingsKey(householdId);
    const value = strict ? await getSettingValueStrict(env, key) : await getSettingValue(env, key);
    const parsed = strict
      ? parseStrictSettingsObject(value, "category_keywords")
      : (typeof value === "string" ? JSON.parse(value || "{}") : value || {});
    const out = {};
    for (const [k, v] of Object.entries(safeObject(parsed))) out[k] = normalizeCategoryKeywords(v);
    return out;
  } catch (err) {
    if (strict) throw err;
    return {};
  }
}

async function saveCategoryKeywordMap(env, householdId = "", keywordMap = {}) {
  const obj = {};
  for (const [k, v] of Object.entries(safeObject(keywordMap))) {
    const list = normalizeCategoryKeywords(v);
    if (list.length) obj[k] = list;
  }
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: categoryKeywordsSettingsKey(householdId), value: JSON.stringify(obj) }),
  });
  return obj;
}

async function setCategoryKeywords(env, householdId = "", type = "expense", name = "", keywords = []) {
  const hid = String(householdId || "").trim();
  const list = normalizeCategoryKeywords(keywords);
  return withHouseholdSettingsRmw(env, hid, async ({ assertFresh }) => {
    const map = await fetchCategoryKeywordMap(env, hid, { strict: true });
    const key = categoryKeywordKey(type, name);
    if (list.length) map[key] = list;
    else delete map[key];
    assertFresh();
    await saveCategoryKeywordMap(env, hid, map);
    return list;
  });
}

function attachCategoryKeywords(categories = [], keywordMap = {}) {
  return safeArray(categories).map((c) => {
    const type = c.type === "income" ? "income" : "expense";
    const name = c.name || "";
    const own = normalizeCategoryKeywords(c.keywords || "");
    const mapped = normalizeCategoryKeywords(keywordMap[categoryKeywordKey(type, name)] || []);
    return { ...c, type, keywords: normalizeCategoryKeywords([...own, ...mapped]) };
  });
}

function keywordEditorCategories(keywordMap = {}, customCategories = []) {
  const guideNames = CATEGORY_KEYWORD_GUIDE.map((g) => g.category);
  const customNames = safeArray(customCategories).map((c) => c.name || c.category || "").filter(Boolean);
  const mappedNames = Object.keys(safeObject(keywordMap)).map((k) => String(k).replace(/^expense::/, "").replace(/^income::/, "")).filter(Boolean);
  return mergedOptions([...guideNames, ...defaultExpenseBudgetNames(customCategories), ...customNames, ...mappedNames], []).slice(0, 48);
}

function keywordEditorCard(name = "", keywordMap = {}, initiallyOpen = false, writable = true) {
  const guide = keywordGuideForCategory(name, "expense");
  const type = guide?.type === "income" ? "income" : "expense";
  const stored = normalizeCategoryKeywords(keywordMap[categoryKeywordKey(type, name)] || []);
  const defaults = normalizeCategoryKeywords(stored.length ? stored : guide?.examples || []);
  const keywords = defaults.slice(0, 16);
  const kwDisabled = writable ? "" : " disabled";
  const chips = keywords.map((kw) => `<span class="kwChip" data-kw="${escapeHtml(kw)}">${escapeHtml(kw)}<button type="button" class="kwRemove" aria-label="${escapeHtml(kw)} 키워드 삭제"${kwDisabled}>×</button></span>`).join("");
  return `<details class="kwBox" data-type="${escapeHtml(type)}" data-name="${escapeHtml(name)}" ${initiallyOpen ? "open" : ""}><summary class="kwHead"><span><b>${escapeHtml(name)}</b><small class="kwCount">${keywords.length}개</small></span><span class="kwToggle" aria-hidden="true">펼치기</span></summary><div class="kwBody"><div class="kwChips">${chips}<span class="kwHint">등록된 키워드가 없습니다.</span></div><div class="kwAddRow"${writable ? "" : ` hidden`}><input type="text" class="kwNewInput" maxlength="40" placeholder="새 키워드" aria-label="${escapeHtml(name)} 새 키워드"${kwDisabled}/><button type="button" class="kwAdd"${kwDisabled}>추가</button></div><input type="hidden" class="kwHidden" value="${escapeHtml(keywords.join(","))}"/></div></details>`;
}

function renderKeywordBulkEditor({ selected, month, keywordMap = {}, customCategories = [], compact = false, writable = true, returnTo = "" }) {
  const cats = keywordEditorCategories(keywordMap, customCategories);
  const cards = cats.map((name, index) => keywordEditorCard(name, keywordMap, index < 2, writable)).join("");
  // 키워드 저장은 소유자·관리자만 가능하다. 권한이 없는 사람에게 살아 있는 저장 버튼을 보여 주면
  // 눌러도 저장되지 않고 볼 수 없는 화면으로 튕겨 나가므로, 편집 수단을 처음부터 잠근다.
  const lockNotice = writable ? "" : `<div class="kwLocked"><b>보기 전용</b><br/>키워드 저장은 가계부 소유자·관리자만 할 수 있습니다. 현재 설정은 그대로 확인할 수 있습니다.</div>`;
  return `<style>${keywordEditorCss()}</style><form method="post" action="/my/category-keywords/bulk-save" id="keywordBulkForm" class="kwShell ${compact ? "compactKeywords" : ""}${writable ? "" : " kwReadOnly"}"><input type="hidden" name="household_id" value="${escapeHtml(selected?.id || "")}"/><input type="hidden" name="month" value="${escapeHtml(month || currentMonthKst())}"/>${returnTo ? `<input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"/>` : ""}<div class="keywordToolbar"><div><b>카테고리별 키워드</b><p class="muted">${writable ? "카테고리를 펼쳐 키워드를 추가하거나 삭제하세요. 변경을 마치면 한 번만 저장하면 됩니다." : "우리집 자동분류에 쓰이는 키워드입니다."}</p></div>${writable ? `<button type="submit">변경사항 저장</button>` : ""}</div>${lockNotice}<div class="keywordFilter"><label for="keywordFilterInput">카테고리·키워드 찾기</label><input id="keywordFilterInput" type="search" placeholder="예: 식비, 커피, 교통" autocomplete="off"/></div><div class="kwEditorGrid">${cards}</div><p class="kwNoResult" hidden>검색 결과가 없습니다.</p></form><script>
(function(){
  function syncBox(box){
    const values = Array.from(box.querySelectorAll('.kwChip')).map(function(chip){ return chip.getAttribute('data-kw') || chip.firstChild.textContent || ''; }).map(function(v){ return v.trim(); }).filter(Boolean);
    const hidden = box.querySelector('.kwHidden');
    if (hidden) hidden.value = Array.from(new Set(values)).join(',');
    const hint = box.querySelector('.kwHint');
    if (hint) hint.style.display = values.length ? 'none' : 'inline-flex';
    const count = box.querySelector('.kwCount');
    if (count) count.textContent = values.length + '개';
  }
  function addKeyword(box, value){
    value = String(value || '').trim();
    if (!value) return;
    const exists = Array.from(box.querySelectorAll('.kwChip')).some(function(chip){ return (chip.getAttribute('data-kw') || '').trim() === value; });
    if (exists) return;
    const chip = document.createElement('span');
    chip.className = 'kwChip';
    chip.setAttribute('data-kw', value);
    chip.appendChild(document.createTextNode(value));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kwRemove';
    btn.setAttribute('aria-label','삭제');
    btn.textContent = '×';
    chip.appendChild(btn);
    const hint = box.querySelector('.kwHint');
    box.querySelector('.kwChips').insertBefore(chip, hint);
    syncBox(box);
  }
  document.querySelectorAll('.kwBox').forEach(function(box){
    syncBox(box);
    box.addEventListener('click', function(e){
      if (e.target.classList.contains('kwRemove')) {
        e.target.closest('.kwChip').remove();
        syncBox(box);
      }
      if (e.target.classList.contains('kwAdd')) {
        const input = box.querySelector('.kwNewInput');
        const value = input ? input.value : '';
        addKeyword(box, value);
        if (input) { input.value = ''; input.focus(); }
      }
    });
    const input = box.querySelector('.kwNewInput');
    if (input) input.addEventListener('keydown', function(e){
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addKeyword(box, input.value);
      input.value = '';
    });
  });
  const filter = document.getElementById('keywordFilterInput');
  if (filter) filter.addEventListener('input', function(){
    const q = String(filter.value || '').trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('.kwBox').forEach(function(box){
      const hay = ((box.getAttribute('data-name') || '') + ' ' + Array.from(box.querySelectorAll('.kwChip')).map(function(chip){ return chip.getAttribute('data-kw') || ''; }).join(' ')).toLowerCase();
      const show = !q || hay.indexOf(q) >= 0;
      box.hidden = !show;
      if (show) { visible += 1; if (q) box.open = true; }
    });
    const empty = document.querySelector('.kwNoResult');
    if (empty) empty.hidden = visible > 0;
  });
  const form = document.getElementById('keywordBulkForm');
  if (form) {
    form.addEventListener('submit', function(){
      form.querySelectorAll('input[name="kw_type"],input[name="kw_name"],input[name="kw_keywords"]').forEach(function(x){ x.remove(); });
      form.querySelectorAll('.kwBox').forEach(function(box){
        syncBox(box);
        const type = box.getAttribute('data-type') || 'expense';
        const name = box.getAttribute('data-name') || '';
        const val = box.querySelector('.kwHidden')?.value || '';
        [['kw_type',type],['kw_name',name],['kw_keywords',val]].forEach(function(pair){
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = pair[0];
          input.value = pair[1];
          form.appendChild(input);
        });
      });
    });
  }
})();
</script>`;
}

function keywordEditorCss() {
  return `.kwShell{display:block;width:100%}.kwAddRow[hidden]{display:none}.kwReadOnly .kwRemove{display:none!important}.kwLocked{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:14px;padding:12px;margin-bottom:12px;line-height:1.6}.keywordToolbar{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}.keywordToolbar b{font-size:18px}.keywordToolbar p{margin:5px 0 0}.keywordToolbar>button{flex:0 0 auto}.keywordFilter{display:grid;grid-template-columns:auto minmax(220px,360px);gap:12px;align-items:center;padding:12px 14px;margin-bottom:12px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.keywordFilter label{font-size:13px;font-weight:700;color:#344054}.keywordFilter input{min-height:42px}.kwEditorGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.kwBox{border:1px solid #e2e8f0;background:#fff;border-radius:14px;min-width:0;box-shadow:none;overflow:hidden}.kwBox[hidden]{display:none}.kwHead{display:flex;justify-content:space-between;gap:12px;align-items:center;min-height:56px;padding:0 14px;margin:0;background:#fff}.kwHead>span:first-child{display:flex;align-items:center;gap:8px;min-width:0}.kwHead b{font-size:15px}.kwCount{display:inline-flex;color:#667085;background:#f2f4f7;border-radius:999px;padding:3px 7px;font-size:11px;font-weight:600}.kwToggle{color:#667085;font-size:12px;font-weight:600}.kwBox[open] .kwToggle{font-size:0}.kwBox[open] .kwToggle:after{content:'접기';font-size:12px}.kwBody{border-top:1px solid #edf1f6;padding:12px 14px 14px}.kwChips{display:flex;flex-wrap:wrap;gap:7px;align-items:center;min-height:34px}.kwChip,.kwHint{display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:#f8fafc;border:1px solid #dbe4ef;padding:6px 7px 6px 10px;font-size:12px;font-weight:650;line-height:1.2;color:#344054}.kwRemove{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:20px!important;height:20px!important;min-height:20px!important;border:0!important;border-radius:999px!important;background:transparent!important;color:#b42318!important;padding:0!important;font-size:15px!important;font-weight:700!important;line-height:1!important;cursor:pointer!important;box-shadow:none!important;transform:none!important}.kwRemove:hover{background:#fee4e2!important}.kwHint{color:#98a2b3;font-weight:500;border-style:dashed}.kwAddRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:11px}.kwNewInput{min-height:40px!important}.kwAdd{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:64px!important;min-height:40px!important;height:40px!important;border:1px solid #c8d9ff!important;border-radius:10px!important;background:#eaf2ff!important;color:#1d4ed8!important;padding:0 13px!important;font-size:13px!important;font-weight:700!important;line-height:1!important;cursor:pointer!important;box-shadow:none!important;transform:none!important}.kwNoResult{text-align:center;color:#667085;padding:24px}.compactKeywords .kwEditorGrid{max-height:none;overflow:visible;padding-right:0}@media(max-width:760px){.keywordToolbar{display:block}.keywordToolbar>button{width:100%;margin-top:10px}.keywordFilter{grid-template-columns:1fr;gap:6px}.kwEditorGrid{grid-template-columns:1fr}.kwHead{min-height:54px}}`;
}

function defaultCategoryKeywordRows(keywordMap = {}, householdId = "") {
  const rows = [];
  for (const name of DEFAULT_CATEGORIES) {
    const keywords = normalizeCategoryKeywords(keywordMap[categoryKeywordKey("expense", name)] || []);
    if (keywords.length) {
      rows.push({
        id: `default_keyword_expense_${String(name).replace(/[^\w가-힣:-]/g, "_")}`,
        household_id: householdId || "",
        name,
        type: "expense",
        sort_order: 10,
        keywords,
        storage: "default_keyword",
      });
    }
  }
  return rows;
}

function categoryKeywordDisplayRows(custom = [], keywordMap = {}, householdId = "") {
  const customKeys = new Set(safeArray(custom).map((c) => categoryKeywordKey(c.type, c.name)));
  const defaultRows = DEFAULT_CATEGORIES.map((name) => ({
    id: `default_expense_${String(name).replace(/[^\w가-힣:-]/g, "_")}`,
    household_id: householdId || "",
    name,
    type: "expense",
    keywords: normalizeCategoryKeywords(keywordMap[categoryKeywordKey("expense", name)] || []),
    storage: "default",
  }));
  const customRows = attachCategoryKeywords(custom, keywordMap).map((c) => ({ ...c, storage: c.storage || "custom" }));
  const defaultsWithoutCustomDuplicate = defaultRows.filter((r) => !customKeys.has(categoryKeywordKey(r.type, r.name)));
  return [...customRows, ...defaultsWithoutCustomDuplicate];
}

function normalizeStoredCategoryList(value, householdId = "") {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = raw ? JSON.parse(raw) : [];
    } catch (err) {
      raw = [];
    }
  }
  if (raw && !Array.isArray(raw) && Array.isArray(raw.items)) raw = raw.items;
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((c, i) => {
      const item = safeObject(c);
      const name = String(item.name || "").trim().slice(0, 80);
      if (!name) return null;
      const type = item.type === "income" ? "income" : "expense";
      const id = String(item.id || `settings_${i}_${name}`).replace(/[^\w가-힣:-]/g, "_").slice(0, 120);
      return {
        id: id.startsWith("settings_") ? id : `settings_${id}`,
        household_id: item.household_id || householdId || "",
        name,
        type,
        sort_order: Number(item.sort_order || 100),
        keywords: normalizeCategoryKeywords(item.keywords || ""),
        created_at: item.created_at || new Date(0).toISOString(),
        storage: "settings",
      };
    })
    .filter(Boolean);
}

async function fetchSettingsCategories(env, householdId = "") {
  try {
    const value = await getSettingValue(env, categorySettingsKey(householdId));
    return normalizeStoredCategoryList(value, householdId);
  } catch (err) {
    return [];
  }
}

async function saveSettingsCategories(env, householdId = "", categories = []) {
  const cleaned = normalizeStoredCategoryList(categories, householdId).map((c, i) => ({
    id: c.id || `${randomEntityId("settings")}_${i}`,
    household_id: householdId || c.household_id || "",
    name: c.name,
    type: c.type === "income" ? "income" : "expense",
    sort_order: Number(c.sort_order || 100),
    keywords: normalizeCategoryKeywords(c.keywords || ""),
    created_at: c.created_at || new Date().toISOString(),
  }));
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: categorySettingsKey(householdId), value: JSON.stringify(cleaned) }),
  });
  return cleaned;
}

async function addSettingsCategory(env, householdId = "", name = "", type = "expense", keywords = []) {
  const cleanName = String(name || "").trim().slice(0, 80);
  if (!cleanName) return { ok: false, error: "분류명을 입력해주세요." };
  const cleanType = type === "income" ? "income" : "expense";
  const current = await fetchSettingsCategories(env, householdId);
  if (current.some((c) => normalizeText(c.name) === normalizeText(cleanName) && c.type === cleanType)) {
    return { ok: true, duplicate: true, categories: current };
  }
  const item = {
    id: randomEntityId("settings"),
    household_id: householdId || "",
    name: cleanName,
    type: cleanType,
    sort_order: 100,
    keywords: normalizeCategoryKeywords(keywords),
    created_at: new Date().toISOString(),
  };
  const saved = await saveSettingsCategories(env, householdId, [...current, item]);
  return { ok: true, categories: saved };
}

async function deleteSettingsCategory(env, householdId = "", id = "") {
  const current = await fetchSettingsCategories(env, householdId);
  const next = current.filter((c) => String(c.id) !== String(id));
  await saveSettingsCategories(env, householdId, next);
  return { ok: true, deleted: next.length !== current.length };
}

async function fetchCustomCategories(env, householdId = "") {
  // V22.9.16: 키워드 설정과 분류 표는 서로 필요 없는 조회다. 직렬로 두 번 기다리던 것을 함께 던진다.
  const params = new URLSearchParams();
  params.set("select", "id,household_id,name,type,sort_order,created_at");
  if (householdId) params.set("household_id", `eq.${householdId}`);
  params.set("order", "sort_order.asc,created_at.asc");
  params.set("limit", "300");
  const categoryRowsPromise = supabase(env, `/rest/v1/accountbook_categories?${params.toString()}`, { method: "GET" });
  const keywordMap = await fetchCategoryKeywordMap(env, householdId);
  try {
    const rows = (await categoryRowsPromise) || [];
    const attached = attachCategoryKeywords(Array.isArray(rows) ? rows : [], keywordMap);
    return [...attached, ...defaultCategoryKeywordRows(keywordMap, householdId)];
  } catch (err) {
    const attached = attachCategoryKeywords(await fetchSettingsCategories(env, householdId), keywordMap);
    return [...attached, ...defaultCategoryKeywordRows(keywordMap, householdId)];
  }
}
// @build:exports-start
export {
  addSettingsCategory, attachCategoryKeywords, categoryKeywordDisplayRows, categoryKeywordKey,
  categoryKeywordsSettingsKey, categorySettingsKey, defaultCategoryKeywordRows,
  deleteSettingsCategory, fetchCategoryKeywordMap, fetchCustomCategories, keywordEditorCss,
  normalizeCategoryKeywords, normalizeStoredCategoryList, renderKeywordBulkEditor,
  saveCategoryKeywordMap, setCategoryKeywords,
};
// @build:exports-end
