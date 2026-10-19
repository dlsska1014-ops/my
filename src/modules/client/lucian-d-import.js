// @build:imports-start
import { IMPORT_EDITABLE_FIELDS } from "../import/flexible-import-parser.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end
function importMappingClientMain(bindPreview) {
  "use strict";
  var form = document.getElementById("myImportForm");
  if (!form || form.dataset.mappingBound || typeof fetch !== "function" || typeof FormData !== "function") return;
  form.dataset.mappingBound = "1";
  var workspace = document.getElementById("myImportWorkspace");
  if (!workspace) { workspace = document.createElement("div"); workspace.id = "myImportWorkspace"; form.insertAdjacentElement("afterend", workspace); }
  var status = document.getElementById("myImportFileStatus"), submit = document.getElementById("myImportSubmit");
  var initial = document.getElementById("myImportCommitForm");
  var previous = initial ? initial.querySelector('[name="import_token"]').value : "";
  var delta = [], offset = 0, serial = 0, controller = null, busy = false, saving = false, disposed = false, dirty = false;
  var recovering = !!previous, hasResult = !!previous;
  function message(text, bad) { if (status) { if (status.textContent !== text) status.textContent = text; status.dataset.error = bad ? "1" : "0"; } var node = document.getElementById("myImportMappingStatus"); if (node && node.textContent !== text) node.textContent = text; }
  function readDelta() { var node = document.getElementById("myImportMappingDelta"); if (node) { try { delta = JSON.parse(node.value); } catch (_) { delta = []; } } }
  function collectDelta() {
    var entries = new Map(delta.map(function(item) { return [item.section + ":" + item.column_index, item]; }));
    workspace.querySelectorAll(".importMappingPick").forEach(function(select) {
      var key = select.dataset.section + ":" + select.dataset.column;
      if (select.value === select.dataset.automatic) entries.delete(key);
      else entries.set(key, { section: Number(select.dataset.section), column_index: Number(select.dataset.column), field: select.value });
    });
    return Array.from(entries.values()).sort(function(a, b) { return a.section - b.section || a.column_index - b.column_index; });
  }
  function disableCommit() { var node = document.getElementById("commitImport"); if (node) node.disabled = true; var current = document.getElementById("myImportCommitForm"); if (current) current.dataset.importStale = "1"; }
  function sourceState() { return form.__abImportSource && form.__abImportSource.read ? form.__abImportSource.read() : { phase: "ready", revision: "0" }; }
  function restoreButtons() { busy = false; saving = false; if (submit) { submit.disabled = false; submit.removeAttribute("aria-busy"); submit.textContent = "미리보기 분석하기"; } [form, workspace].forEach(function(scope) { scope.querySelectorAll("[data-import-temporarily-disabled]").forEach(function(node) { node.disabled = false; delete node.dataset.importTemporarilyDisabled; }); }); workspace.removeAttribute("aria-busy"); }
  function invalidate(clearSource, text) {
    serial++;
    if (controller) controller.abort();
    controller = null; restoreButtons(); dirty = true; disableCommit();
    if (clearSource && !recovering) { previous = ""; delta = []; offset = 0; }
    if (text) message(text, false);
  }
  function privacy() {
    var hidden = document.documentElement.hasAttribute("data-ab-hide-amounts");
    workspace.querySelectorAll(".importMappingSampleValue").forEach(function(node) { node.setAttribute("aria-hidden", hidden ? "true" : "false"); });
    workspace.querySelectorAll(".importMappingSampleMask").forEach(function(node) { node.hidden = !hidden; });
  }
  var privacyObserver = new MutationObserver(privacy);
  privacyObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ab-hide-amounts"] });
  function bind() { readDelta(); if (typeof bindPreview === "function") bindPreview(); privacy(); }
  function restoreCommit(formToRestore, sent) {
    var picked = new Set(sent.getAll("selected_rows").map(String));
    formToRestore.querySelectorAll(".importPick").forEach(function(node) { node.checked = picked.has(node.value); });
    delete formToRestore.dataset.importStale;
    formToRestore.querySelectorAll(".importTypePick").forEach(function(node) { var value = sent.get(node.name); if (value === "income" || value === "expense") node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); });
    var button = formToRestore.querySelector("#commitImport"); if (button) { button.disabled = false; button.textContent = "같은 고정 ID로 저장 결과 다시 확인"; }
    dirty = false;
  }
  async function request(commit, nextOffset) {
    if (busy || disposed) return;
    if (!commit && sourceState().phase !== "ready") { message("원본 파일 변환을 마치거나 다른 파일을 선택한 뒤 다시 분석해 주세요.", true); return; }
    var currentForm = commit ? document.getElementById("myImportCommitForm") : form;
    if (!currentForm) return;
    var body = new FormData(currentForm);
    if (!commit && !body.get("csv_text") && !(body.get("csv_file") && body.get("csv_file").size)) { message("원본이 현재 탭에 없습니다. 같은 파일을 다시 선택하거나 내용을 다시 붙여넣어 주세요.", true); document.getElementById("myImportFile").focus(); return; }
    if (!commit) {
      delta = previous ? collectDelta() : []; offset = Number.isInteger(nextOffset) ? nextOffset : offset;
      body.set("import_action", "preview"); body.set("mapping_protocol", "1"); body.set("mapping_delta", JSON.stringify(delta)); body.set("mapping_offset", String(offset));
      if (previous) body.set("previous_import_token", previous);
    }
    body.set("import_response", "json");
    var requestId = ++serial, revision = sourceState().revision, household = form.querySelector('[name="household_id"]').value;
    var wasResult = hasResult, changed = dirty;
    controller = new AbortController(); busy = true; saving = commit; disableCommit();
    workspace.setAttribute("aria-busy", "true");
    if (submit) { submit.disabled = true; submit.setAttribute("aria-busy", "true"); }
    if (commit) form.querySelectorAll("input,textarea,select").forEach(function(node) { if (!node.disabled) { node.dataset.importTemporarilyDisabled = "1"; node.disabled = true; } });
    if (commit) workspace.querySelectorAll("input,select,button").forEach(function(node) { if (!node.disabled) { node.dataset.importTemporarilyDisabled = "1"; node.disabled = true; } });
    message(commit ? "선택한 항목을 저장하고 있습니다. 결과를 확인할 때까지 기다려 주세요." : "원본과 열 연결로 다시 분석하고 있습니다. 현재 결과는 저장할 수 없습니다.", false);
    var serverRejected = false;
    try {
      var response = await fetch("/my/import", { method: "POST", body: body, credentials: "same-origin", signal: controller.signal, headers: { Accept: "application/json" } });
      serverRejected = response.status >= 400 && response.status < 500;
      var html;
      if ((response.headers.get("content-type") || "").includes("application/json")) html = (await response.json()).html;
      else html = await response.text();
      if (disposed || requestId !== serial || revision !== sourceState().revision || household !== form.querySelector('[name="household_id"]').value) return;
      var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
      if (!response.ok) { serverRejected = response.status < 500; throw new Error(doc.querySelector(".error")?.textContent || "분석 또는 저장 결과를 확인하지 못했습니다. 입력과 연결을 유지했습니다. 잠시 후 다시 시도해 주세요."); }
      var content = doc.getElementById("myImportWorkspace") || (commit && doc.querySelector(".pageMain"));
      if (!content) { serverRejected = true; throw new Error("분석 결과를 확인하지 못했습니다. 로그인 상태와 원본 파일·날짜 기준을 확인한 뒤 다시 시도해 주세요."); }
      var old = document.getElementById("myImportCommitForm"); if (old) old.dispatchEvent(new Event("ab:import-preview-dispose"));
      workspace.innerHTML = content.innerHTML;
      var heading = workspace.querySelector("h1,h2"); if (heading) { heading.tabIndex = -1; heading.style.scrollMarginTop = "90px"; heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: "start", behavior: "instant" }); }
      if (commit) {
        if (Number(doc.querySelector("[data-import-unknown]")?.dataset.importUnknown || 0) > 0) {
          var retry = document.createElement("details"); retry.open = true;
          var summary = document.createElement("summary"); summary.textContent = "원래 선택한 행과 구분으로 저장 결과 다시 확인"; retry.appendChild(summary);
          retry.appendChild(currentForm); workspace.appendChild(retry); restoreCommit(currentForm, body);
          message("일부 행의 저장 결과를 확인하지 못했습니다. 원래 선택한 행·구분·고정 ID를 유지했습니다. 가져온 기록을 확인하거나 같은 항목으로 명시적으로 다시 확인해 주세요.", true);
        } else {
          var next = document.createElement("button"); next.type = "button"; next.dataset.importNext = "1"; next.textContent = "같은 연결로 다음 묶음 분석"; workspace.appendChild(next);
          dirty = true; message("서버가 확인한 저장 결과를 표시했습니다. 다음 묶음은 같은 원본과 열 연결로 분석합니다.", false);
        }
      } else {
        var nextForm = document.getElementById("myImportCommitForm");
        previous = nextForm.querySelector('[name="import_token"]').value;
        if (wasResult && changed) nextForm.querySelectorAll(".importPick").forEach(function(pick) { pick.checked = false; });
        dirty = false; hasResult = true; recovering = false; bind();
        message(wasResult ? "새 분석 결과를 확인했습니다. 저장할 행과 구분을 확인한 뒤 선택해 주세요." : "열 연결과 분석 결과를 확인한 뒤 저장할 행을 선택해 주세요.", false);
      }
    } catch (error) {
      if (requestId === serial && !disposed && error.name !== "AbortError") {
        if (commit && !serverRejected) { restoreCommit(currentForm, body); message("저장 요청의 응답을 확인하지 못했습니다. 원래 행·구분·고정 ID를 유지했습니다. 가져온 기록을 먼저 확인하거나 같은 항목으로 저장 결과를 다시 확인해 주세요.", true); }
        else { dirty = true; disableCommit(); message(error.name === "TypeError" || error.name === "SyntaxError" ? serverRejected ? "서버가 요청을 거절했습니다. 최신 분석 결과와 로그인·참여 권한을 확인한 뒤 다시 시도해 주세요." : "요청 결과를 확인하지 못했습니다. 입력과 연결을 유지했습니다. 잠시 후 다시 시도해 주세요." : error.message || "요청 결과를 확인하지 못했습니다. 입력과 연결은 유지했습니다.", true); }
      }
    } finally { if (requestId === serial) { controller = null; restoreButtons(); } }
  }
  form.addEventListener("submit", function(event) { event.preventDefault(); event.stopImmediatePropagation(); request(false); }, true);
  form.addEventListener("ab:import-source-change", function() { invalidate(true, hasResult ? "원본이 바뀌었습니다. 다시 분석한 뒤 저장할 행을 선택해 주세요." : ""); });
  form.addEventListener("change", function(event) { if (event.target.matches('[name="date_basis_mode"],[name="month"],[name="skip_duplicates"],[name="household_id"]')) invalidate(false, "분석 기준이 바뀌었습니다. 다시 분석한 뒤 저장할 행을 선택해 주세요."); });
  workspace.addEventListener("change", function(event) { if (event.target.matches(".importMappingPick")) { invalidate(false, "열 연결을 수정했습니다. ‘다시 분석’을 누르기 전에는 저장할 수 없습니다."); } });
  workspace.addEventListener("submit", function(event) { if (event.target.id !== "myImportCommitForm") return; event.preventDefault(); event.stopImmediatePropagation(); if (!dirty) request(true); }, true);
  workspace.addEventListener("click", function(event) {
    var button = event.target.closest("[data-import-reanalyze],[data-import-offset],[data-import-next],[data-import-cancel]"); if (!button) return;
    if (button.hasAttribute("data-import-cancel")) { invalidate(false, "분석을 취소했습니다. 입력과 연결을 유지했습니다. 다시 분석한 뒤 저장해 주세요."); return; }
    if (button.hasAttribute("data-import-offset")) request(false, Number(button.dataset.importOffset));
    else request(false);
  });
  window.addEventListener("pagehide", function() { disposed = true; invalidate(false); privacyObserver.disconnect(); });
  window.addEventListener("pageshow", function(event) { if (event.persisted) { disposed = false; privacyObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ab-hide-amounts"] }); disableCommit(); message("복원된 화면입니다. 원본과 최신 분석 결과를 다시 확인한 뒤 저장해 주세요.", false); } });
  document.addEventListener("change", function(event) { if (event.target.name === "household_id" && event.target.form !== form) invalidate(false, "가계부가 바뀌었습니다. 새 가계부에서 원본을 다시 분석해 주세요."); });
  bind();
  if (recovering) { dirty = true; disableCommit(); message("열 연결을 다시 분석하려면 같은 원본 파일을 재선택하거나 원문을 다시 입력해 주세요. 기존 행은 현재 미리보기에서 확인할 수 있습니다.", false); }
}

function renderMyImportMappingEditor(payload = {}) {
  const schema = payload.parsed?.mapping_schema;
  if (!schema?.total_columns) return `<section class="card"><h2>열 연결 확인</h2><p>제목 행이 인식된 표에서 열 연결을 수정할 수 있습니다. 제목 없는 표와 자연어는 기존 방식으로 분석합니다. 제목이 인식되지 않았다면 실제 날짜·금액·내용 열의 제목을 ‘날짜’, ‘금액’, ‘내용’으로 적어 다시 입력해 주세요. 첫 거래 행을 임의로 제목으로 바꾸지 않습니다.</p><p id="myImportMappingStatus" role="status"></p></section>`;
  const labels = { date: "날짜", amount: "금액", type: "수입/지출 구분", income: "수입금액", expense: "지출금액", memo: "내용", category: "분류", payment: "결제수단", spender: "지출자", ignore: "무시", currency: "통화", raw_text: "원문", time: "시간" };
  const sections = schema.sections.map(section => `<fieldset class="importMappingSection"><legend>${section.section}번째 표 · 제목 ${section.header_row}행 · 전체 ${section.total_columns}열</legend>${section.columns.map(column => {
    const id = `importMapping-${section.section}-${column.column_index}`;
    const automatic = labels[column.automatic] || "미인식";
    const control = column.readonly ? `<span id="${id}">자동 유지: ${escapeHtml(automatic)} (읽기 전용)</span>` : `<select id="${id}" class="importMappingPick" data-section="${section.section}" data-column="${column.column_index}" data-automatic="${escapeHtml(column.automatic)}"${payload.mapping_locked ? " disabled" : ""}><option value=""${column.field ? "" : " selected"}${column.automatic ? " disabled" : ""}>미인식 (자동 유지)</option>${IMPORT_EDITABLE_FIELDS.map(field => `<option value="${field}"${column.field === field ? " selected" : ""}>${escapeHtml(labels[field])}</option>`).join("")}</select>`;
    return `<div class="importMappingRow"><label for="${id}"><b>${column.column_index + 1}번 열 · ${escapeHtml(column.title || "제목 없음")}</b><small>자동 연결: ${escapeHtml(automatic)}</small></label><span class="importMappingSample"><span class="importMappingSampleValue">${escapeHtml(column.sample || "샘플 없음")}</span><span class="importMappingSampleMask" hidden>샘플을 가렸습니다.</span></span>${control}</div>`;
  }).join("")}</fieldset>`).join("");
  return `<section class="card importMappingEditor"><style>#myImportWorkspace{min-width:0}#myImportWorkspace .card{background:var(--card,#fff);color:var(--text,#111827);border:1px solid var(--line,#d1d5db);border-radius:18px;padding:16px;margin:16px 0}#myImportWorkspace .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}#myImportWorkspace .metric{padding:12px;border:1px solid var(--line,#d1d5db);border-radius:12px}#myImportWorkspace .metric span,#myImportWorkspace small{display:block;color:var(--sub,#475569)}#myImportWorkspace .metric b{display:block;font-size:21px}#myImportWorkspace .tableWrap{max-width:100%;overflow:auto}#myImportWorkspace table{min-width:860px;width:100%;border-collapse:collapse}#myImportWorkspace :is(th,td){padding:10px;text-align:left;border-bottom:1px solid var(--line,#d1d5db)}#myImportWorkspace .importMappingSection{min-width:0;border:1px solid var(--line,#d1d5db);border-radius:12px;margin:14px 0;padding:12px}#myImportWorkspace .importMappingRow{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(140px,1fr);gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line,#d1d5db);overflow-wrap:anywhere}#myImportWorkspace .importMappingRow select{min-width:0;width:100%;min-height:44px;background:var(--card,#fff);color:var(--text,#111827);border:1px solid var(--line,#94a3b8);border-radius:8px;padding:6px;font:inherit}#myImportWorkspace button{min-height:44px;margin:4px;padding:8px 14px}#myImportWorkspace :focus-visible{outline:3px solid var(--accent,#2563eb);outline-offset:3px}[data-ab-hide-amounts] #myImportWorkspace .importMappingSampleValue{display:none!important}[data-ab-hide-amounts] #myImportWorkspace .importMappingSampleMask{display:inline!important}#myImportWorkspace .importMappingSampleMask[hidden]{display:none}@media(max-width:600px){#myImportWorkspace .importMappingRow{grid-template-columns:minmax(0,1fr)}#myImportWorkspace .importMappingRow select{font-size:16px}}@media(prefers-reduced-motion:reduce){#myImportWorkspace *{animation:none!important;transition:none!important}}</style><h2>열 연결 확인</h2><p>원본 열의 연결을 확인하고 수정한 뒤 ‘다시 분석’을 누르세요. 통화·원문·시간 열과 화면에 표시되지 않은 연결은 유지합니다. 자동으로 저장하지 않습니다.</p><p>전체 ${schema.total_columns}열 중 ${schema.offset + 1}~${schema.offset + schema.shown}열을 표시합니다. 생략한 열도 기존 연결로 분석하며 무시로 바꾸지 않습니다.</p>${payload.mapping_locked ? `<p class="notice">저장을 시작한 원본입니다. 연결과 날짜 기준을 유지한 채 다음 묶음을 분석할 수 있습니다.</p>` : ""}<input id="myImportMappingDelta" type="hidden" value="${escapeHtml(JSON.stringify(payload.parsed.mapping_delta || []))}"/><div>${sections}</div><div class="toolbar">${schema.offset ? `<button type="button" data-import-offset="${Math.max(0, schema.offset - schema.limit)}">이전 열 보기</button>` : ""}${schema.offset + schema.shown < schema.total_columns ? `<button type="button" data-import-offset="${schema.offset + schema.limit}">다음 열 보기</button>` : ""}<button type="button" data-import-reanalyze>다시 분석</button><button type="button" data-import-cancel>분석 취소</button></div><p id="myImportMappingStatus" role="status" aria-live="polite">현재 연결로 분석한 결과입니다. 수정한 연결은 다시 분석한 뒤 반영됩니다.</p></section>`;
}

function renderMyImportSourceReselect(selected = {}, month = "", payload = {}) {
  const basis = payload.parsed?.date_basis;
  const mode = (basis?.requested_mode || basis?.mode) === "default" ? "default" : "selected";
  return `<details class="card" data-import-reselect><summary>다시 분석할 원본 선택</summary><p>원본은 현재 탭에서만 보관합니다. 화면 이동이나 새로고침으로 원본이 사라졌다면 같은 파일을 다시 선택하거나 같은 내용을 다시 입력해 주세요.</p><form id="myImportForm" method="post" action="/my/import" enctype="multipart/form-data"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="date_basis_mode" value="${mode}"/><input type="hidden" name="skip_duplicates" value="${payload.skip_duplicates === false ? "0" : "1"}"/><label>원본 파일<input id="myImportFile" name="csv_file" type="file" accept=".csv,.tsv,.txt,.xls,.xlsx"/></label><label>원본 내용<textarea id="myImportText" name="csv_text" rows="4"></textarea></label><p id="myImportFileStatus" role="status">같은 원본을 다시 선택해 주세요.</p><button id="myImportSubmit" type="submit">원본으로 다시 분석</button></form></details>`;
}
// @build:exports-start
export { importMappingClientMain, renderMyImportMappingEditor, renderMyImportSourceReselect };
// @build:exports-end
