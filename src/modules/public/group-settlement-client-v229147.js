
// V22.9.147 모임 정산 계산기(/group-settlement)의 브라우저 스크립트와 그 화면에만 싣는 CSS.
// worksheet-runtime.js 의 worksheetClientV229106(생활비 계산표 공용)을 본떴지만 따로 둔다. 공용 스크립트를 고치면 그 글이 실린
// 1년 캐시 계산표 자산(living-worksheet-v229146-*.html)의 내용이 바뀌어 자산 주소를 올려야 하고, 다른 계산표의 화면도 바뀐다.
// 공용 스크립트와 다른 점(독립 검토 2026-11-26 — 추적표 V147:G-3·G-6·G-9·G-11):
// - 모든 칸이 글자 칸(type=text)이다. 금액·몫 칸은 inputmode=numeric 으로 숫자 자판을 띄우고, 모양은 계산 함수가 본다
//   (type=number 는 브라우저가 ‘1/2’ 를 12 로, ‘50%’ 를 50 으로 말없이 바꾸거나 빈 값으로 넘긴다).
// - 나누는 방식에 쓰지 않는 칸(몫·함께한 사람)은 숨긴다(폼의 data-mode + CSS). 몫 칸 이름은 방식에 따라 ‘몫’·‘인원수’.
// - 행마다 번호를 붙인 legend(‘참여자 2’)와 이름 있는 삭제 단추. 틀린 칸에 aria-invalid·aria-describedby 를 달고 초점을 옮긴다.
// - ‘입력값이 바뀌었습니다’ 는 처음 바뀔 때 한 번만 알린다. 행 한도 알림을 덮지 않는다.
// - 예제는 단추로 고르고, 고친 입력이 예제로 바뀐 뒤에는 ‘이전 입력 되살리기’ 로 되돌린다(확인 창 없이).
// - 결산 문구 칸은 고칠 수 있다(마지막 줄의 계산기 주소를 지워도 된다). ‘결과 계산’ 을 누르면 결과로 화면을 옮긴다.
// 화면에 toString() 으로 그대로 실리므로 바깥 이름을 하나도 쓰지 않는다(validate-v229147-group-settlement 가 새 맥락에서 돌려 본다).

function groupSettlementClientV229147(slug, spec, calculate) {
  const form = document.getElementById("worksheet-form");
  const output = document.getElementById("worksheet-result");
  const status = document.getElementById("worksheet-status");
  const exportButton = document.getElementById("worksheet-export");
  const printButton = document.getElementById("worksheet-print");
  const resetButton = document.getElementById("worksheet-reset");
  const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const NUMBER = /^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/;
  let last = null;
  let stale = false;
  let dirty = false;
  let previous = null;
  let shareControls = null;
  let sequence = 0;
  const undoButton = element("button", "이전 입력 되살리기");
  undoButton.type = "button"; undoButton.className = "secondary"; undoButton.id = "worksheet-undo"; undoButton.hidden = true;
  status.after(undoButton);
  const captions = Object.create(null);
  for (const group of spec.groups) for (const column of group.columns) if (column[4] && column[4].captions) captions[column[0]] = column[4].captions;

  const field = (schema, value, prefix) => {
    const key = schema[0], title = schema[1], type = schema[2], options = schema[3], more = schema[4] || {};
    const label = element("label");
    label.dataset.col = key;
    if (more.modes) label.dataset.modes = more.modes.join(" ");
    if (more.wide) label.className = "wsWide";
    label.append(element("span", title));
    let node;
    if (type === "select") {
      node = element("select");
      for (const [optionValue, optionTitle] of options) { const option = element("option", optionTitle); option.value = optionValue; node.append(option); }
    } else {
      node = element("input");
      node.type = "text";
      node.maxLength = more.maxLength || 60;
      node.autocomplete = "off";
      if (more.inputMode) node.setAttribute("inputmode", more.inputMode);
      if (more.placeholder) node.placeholder = more.placeholder;
    }
    node.name = key; node.id = prefix + "-" + key; node.value = String(value ?? "");
    label.htmlFor = node.id; label.append(node);
    return label;
  };
  const syncMode = () => {
    const select = form.querySelector('select[name="mode"]');
    const mode = select ? select.value : "";
    form.dataset.mode = mode;
    for (const key of Object.keys(captions)) {
      const caption = captions[key][mode];
      if (caption) for (const span of form.querySelectorAll(`label[data-col="${key}"] > span`)) span.textContent = caption;
    }
  };
  const changed = () => {
    dirty = true;
    last = null; printButton.disabled = true; exportButton.disabled = true;
    if (shareControls) shareControls.disabled = true;
    if (output.childElementCount) output.dataset.stale = "1";
    if (!stale) { stale = true; status.textContent = "입력값이 바뀌었습니다. 아래 결과는 바꾸기 전 값입니다. ‘결과 계산’을 눌러 다시 확인해 주세요."; }
  };
  const renumber = (group, holder) => {
    [...holder.children].forEach((box, index) => {
      const name = `${group.label} ${index + 1}`;
      box.querySelector("legend").textContent = name;
      box.querySelector(".wsRemove").setAttribute("aria-label", `${name} 삭제`);
    });
  };
  const addRow = (group, holder, row) => {
    if (holder.children.length >= group.max) return false;
    const box = element("fieldset"); box.dataset.row = "true"; box.className = "wsRow";
    box.append(element("legend"));
    const grid = element("div"); grid.className = "fields";
    for (const column of group.columns) grid.append(field(column, row ? row[column[0]] : "", "row-" + sequence));
    sequence += 1;
    const remove = element("button", "삭제"); remove.type = "button"; remove.className = "secondary wsRemove";
    remove.addEventListener("click", () => {
      const next = box.nextElementSibling || box.previousElementSibling;
      box.remove(); renumber(group, holder); changed();
      const target = next ? next.querySelector("input") : holder.parentElement.querySelector(".wsAdd");
      if (target) target.focus();
    });
    box.append(grid, remove); holder.append(box);
    return true;
  };
  const read = () => {
    const input = { settings: Object.create(null) };
    for (const node of form.querySelectorAll("#worksheet-settings input, #worksheet-settings select")) input.settings[node.name] = node.value;
    for (const group of spec.groups) input[group.key] = [...form.querySelector(`[data-group="${group.key}"]`).children].map((box) => {
      const row = Object.create(null); for (const node of box.querySelectorAll("input,select")) row[node.name] = node.value; return row;
    });
    return input;
  };
  const run = (reveal) => {
    for (const node of form.querySelectorAll('[aria-invalid="true"]')) { node.removeAttribute("aria-invalid"); node.removeAttribute("aria-describedby"); }
    output.replaceChildren(); delete output.dataset.stale; last = null; stale = false; shareControls = null;
    printButton.disabled = true; exportButton.disabled = true;
    try {
      const input = read(), result = calculate(slug, input);
      for (const data of result.tables) {
        const region = element("div"); region.className = "table-scroll"; region.tabIndex = 0; region.setAttribute("role", "region"); region.setAttribute("aria-label", data.caption);
        const table = element("table"); table.append(element("caption", data.caption));
        const head = element("thead"), row = element("tr"); for (const title of data.headers) { const th = element("th", title); th.scope = "col"; row.append(th); } head.append(row); table.append(head);
        const body = element("tbody");
        for (const values of data.rows) { const tr = element("tr"); values.forEach((value, i) => { const cell = element(i ? "td" : "th", typeof value === "number" ? value.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : String(value)); if (!i) cell.scope = "row"; tr.append(cell); }); body.append(tr); }
        table.append(body); region.append(table); output.append(region);
      }
      for (const note of result.notes) output.append(element("p", note));
      const label = element("label", "단톡방에 보낼 결산 문구(보내기 전에 고쳐도 돼요)");
      const summary = element("textarea");
      summary.rows = result.shareText.split("\n").length; summary.value = result.shareText; summary.spellcheck = false;
      label.append(summary);
      const controls = element("fieldset");
      controls.className = "group-summary";
      controls.append(element("legend", "결산 공유"));
      const copyButton = element("button", "결산 문구 복사"); copyButton.type = "button";
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(summary.value);
          if (last && last.result === result) status.textContent = "결산 문구를 복사했어요. 보낼 단톡방에 붙여 넣으세요.";
        } catch {
          if (!last || last.result !== result) return;
          summary.focus(); summary.select();
          status.textContent = "결산 문구를 선택했어요. 기기의 복사 기능을 사용해 주세요.";
        }
      });
      controls.append(label, copyButton);
      output.append(controls);
      shareControls = controls;
      last = { input, result }; printButton.disabled = false; exportButton.disabled = false;
      status.textContent = "계산했어요. 결산 문구를 복사해 단톡방에 보내거나 CSV로 저장할 수 있어요.";
      if (reveal) output.scrollIntoView({ block: "start" });
    } catch (error) {
      status.textContent = (error && error.message) || "입력값을 확인해 주세요.";
      const where = error && error.field;
      const holder = where ? form.querySelector(`[data-group="${where.group}"]`) : null;
      const box = holder ? holder.children[where.index] : null;
      const node = box ? box.querySelector(`[name="${where.key}"]`) : null;
      if (node) {
        node.setAttribute("aria-invalid", "true"); node.setAttribute("aria-describedby", "worksheet-status");
        if (reveal) node.focus();
      }
    }
  };
  const reset = (data) => {
    form.replaceChildren();
    const settings = element("div"); settings.id = "worksheet-settings"; settings.className = "fields";
    for (const schema of spec.fields) settings.append(field(schema, data.settings ? data.settings[schema[0]] : "", "setting"));
    form.append(settings);
    for (const group of spec.groups) {
      const section = element("section"); section.className = "wsGroup";
      section.append(element("h3", group.label));
      const holder = element("div"); holder.dataset.group = group.key;
      for (const row of (data[group.key] || []).slice(0, group.max)) addRow(group, holder, row);
      renumber(group, holder);
      const add = element("button", `${group.label} 추가`); add.type = "button"; add.className = "secondary wsAdd";
      add.addEventListener("click", () => {
        if (!addRow(group, holder)) { status.textContent = `${group.label} 행은 ${group.max}개까지 입력할 수 있어요.`; return; }
        renumber(group, holder); changed();
        holder.lastElementChild.querySelector("input").focus();
      });
      section.append(holder, add); form.append(section);
    }
    const bar = element("div"); bar.className = "wsSubmit";
    const submit = element("button", "결과 계산"); submit.type = "submit"; bar.append(submit); form.append(bar);
    syncMode();
    run(false);
  };
  const load = (data, message) => {
    previous = dirty ? read() : null;
    reset(data);
    dirty = false;
    undoButton.hidden = !previous;
    status.textContent = previous ? `${message} 바꾸기 전 입력으로 돌아가려면 ‘이전 입력 되살리기’를 누르세요.` : message;
  };
  undoButton.addEventListener("click", () => {
    if (!previous) return;
    const data = previous;
    previous = null; undoButton.hidden = true;
    reset(data);
    dirty = true;
    if (last) status.textContent = "바꾸기 전 입력으로 되돌리고 다시 계산했어요.";
    const first = form.querySelector("input, select");
    if (first) first.focus();
  });
  const examples = [{ label: spec.exampleLabel, short: spec.exampleShort, input: spec.example }].concat(spec.otherExamples || []);
  const picker = element("div"); picker.className = "wsExamples"; picker.setAttribute("role", "group");
  const pickerTitle = element("span", "예제 불러오기"); pickerTitle.id = "worksheet-examples-title";
  picker.setAttribute("aria-labelledby", pickerTitle.id);
  picker.append(pickerTitle);
  for (const entry of examples) {
    const button = element("button", entry.short || entry.label); button.type = "button"; button.className = "secondary"; button.title = entry.label;
    button.addEventListener("click", () => load(entry.input, `‘${entry.label}’ 예제를 불러왔어요.`));
    picker.append(button);
  }
  form.before(picker);
  form.addEventListener("submit", (event) => { event.preventDefault(); run(true); });
  form.addEventListener("input", changed);
  form.addEventListener("change", (event) => { if (event.target && event.target.name === "mode") syncMode(); changed(); });
  resetButton.addEventListener("click", () => load(spec.example, "기본 예제로 되돌렸어요."));
  printButton.addEventListener("click", () => { if (last) window.print(); });
  exportButton.addEventListener("click", () => {
    if (!last) return;
    const exportValue = (schema, value) => {
      if (schema[2] === "select") { const option = schema[3].find((o) => o[0] === value); return option ? option[1] : value; }
      const text = String(value ?? "").trim();
      return schema[4] && schema[4].inputMode === "numeric" && NUMBER.test(text) ? Number(text.replace(/,/g, "")) : value;
    };
    const rows = [[spec.title], ["예제를 바꿔 계산한 결과입니다. 입력과 계산 조건을 함께 보관하세요."], ["설정", "입력값"], ...spec.fields.map((schema) => [schema[1], exportValue(schema, last.input.settings[schema[0]])])];
    for (const group of spec.groups) rows.push([], [group.label], group.columns.map((c) => c[1]), ...last.input[group.key].map((r) => group.columns.map((c) => exportValue(c, r[c[0]]))));
    for (const table of last.result.tables) rows.push([], [table.caption], table.headers, ...table.rows);
    rows.push([], ...last.result.notes.map((n) => [n]));
    const cell = (value) => { let text = String(value ?? ""); if (typeof value !== "number" && /^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const url = URL.createObjectURL(new Blob(["﻿", rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = element("a"); a.href = url; a.download = slug + "-result.csv"; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  reset(spec.example);
  resetButton.disabled = false;
}

// 이 화면에만 싣는 CSS(renderInlineWorksheetV229139 이 공용 CSS 뒤에 붙인다 — 다른 계산표 화면의 바이트는 그대로).
// 방식에 쓰지 않는 칸 숨기기, 휴대폰에서 참여자 한 줄(이름·몫·삭제)과 지출 두세 줄, 결과 표 줄바꿈 막기, 폭을 다 쓰는 ‘결과 계산’.
// ‘결과 계산’ 을 화면 아래에 붙이는 sticky 는 쓰지 않는다: 공개 화면의 html·body 가 overflow-x:hidden 이라 body 가 스크롤 상자가 되어
// sticky 가 붙지 않는다(머리 없는 Chrome 확인). 고정 막대는 휴대폰 자판과 겹칠 수 있어 이번 판에 넣지 않았다(추적표 V147:G-6).
const GROUP_SETTLEMENT_CSS_V229147 = [
  "#worksheet-form label[data-modes]{display:none}",
  '#worksheet-form[data-mode="ratio"] label[data-modes~="ratio"],#worksheet-form[data-mode="headcount"] label[data-modes~="headcount"],#worksheet-form[data-mode="item"] label[data-modes~="item"]{display:flex}',
  ".wsExamples{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 4px}",
  ".wsExamples>span{font-weight:700;font-size:14px;color:#1e293b;margin-right:4px}",
  ".pubInlineTool .wsExamples button{margin:0;min-height:40px;padding:6px 12px;font-size:14px}",
  ".pubInlineTool .wsRow{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10px;align-items:end;margin:10px 0;padding:10px 12px}",
  ".pubInlineTool .wsRow>.fields{margin:0;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}",
  '.pubInlineTool [data-group="members"] .wsRow>.fields{grid-template-columns:minmax(0,1fr) auto}',
  '.pubInlineTool [data-group="members"] label[data-col="weight"] input{width:84px}',
  ".pubInlineTool .wsRow label.wsWide{grid-column:1/-1}",
  ".pubInlineTool .wsRow .wsRemove{margin:0;min-height:44px;padding:6px 12px}",
  '@media (min-width:760px){.pubInlineTool [data-group="expenses"] .wsRow>.fields{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.pubInlineTool [data-group="expenses"] .wsRow label.wsWide{grid-column:auto}}',
  ".pubInlineTool .wsSubmit{margin-top:6px}",
  ".pubInlineTool .wsSubmit button{margin:0;width:100%}",
  "#worksheet-result th,#worksheet-result td{white-space:nowrap}",
  "@media (max-width:480px){#worksheet-result th,#worksheet-result td{padding:8px}}",
  ".pubInlineTool #worksheet-undo{margin:4px 0 8px}",
  '.pubInlineTool [aria-invalid="true"]{border-color:#b42318;box-shadow:0 0 0 2px rgba(180,35,24,.18)}',
].join("");

// @build:exports-start
export { GROUP_SETTLEMENT_CSS_V229147, groupSettlementClientV229147 };
// @build:exports-end
