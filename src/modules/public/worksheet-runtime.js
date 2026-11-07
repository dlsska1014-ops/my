// @build:imports-start
import { worksheetComputeV229106 } from "./worksheet-calculations.js";
import { PUBLIC_WORKSHEETS_V229106, publicWorksheetPathV229106 } from "./worksheet-pages.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

function worksheetClientV229106(slug, spec, calculate) {
  const form = document.getElementById("worksheet-form");
  const output = document.getElementById("worksheet-result");
  const status = document.getElementById("worksheet-status");
  const exportButton = document.getElementById("worksheet-export");
  let last = null;
  const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const field = (schema, value, prefix) => {
    const [key, title, type, options] = schema;
    const label = element("label");
    label.append(element("span", title));
    const node = element(type === "select" ? "select" : "input");
    if (type !== "select") { node.type = type; if (type === "number") node.step = "1"; if (type === "text") node.maxLength = 500; }
    else for (const [v, title] of options) { const option = element("option", title); option.value = v; node.append(option); }
    node.name = key; node.id = prefix + "-" + key; node.value = String(value ?? "");
    label.htmlFor = node.id; label.append(node); return label;
  };
  const invalidate = () => { last = null; exportButton.disabled = true; output.replaceChildren(); status.textContent = "입력값이 바뀌었습니다. ‘결과 계산’을 눌러 다시 확인해 주세요."; };
  let sequence = 0;
  const addRow = (group, holder, row = {}) => {
    if (holder.children.length >= (group.max || 100)) { status.textContent = `최대 ${group.max || 100}행까지 입력할 수 있습니다.`; return; }
    const box = element("fieldset"); box.dataset.row = "true";
    box.append(element("legend", group.label + " 입력"));
    const grid = element("div"); grid.className = "fields";
    for (const column of group.columns) grid.append(field(column, row[column[0]] ?? (column[2] === "select" ? column[3][0][0] : ""), "row-" + sequence));
    sequence++;
    const remove = element("button", "이 행 삭제"); remove.type = "button"; remove.className = "secondary";
    remove.addEventListener("click", () => { box.remove(); invalidate(); });
    box.append(grid, remove); holder.append(box);
  };
  const read = () => {
    const input = { settings: Object.create(null) };
    for (const node of form.querySelectorAll("#worksheet-settings input, #worksheet-settings select")) input.settings[node.name] = node.value;
    for (const group of spec.groups) input[group.key] = [...form.querySelector(`[data-group="${group.key}"]`).children].map((box) => {
      const row = Object.create(null); for (const node of box.querySelectorAll("input,select")) row[node.name] = node.value; return row;
    });
    return input;
  };
  const run = () => {
    output.replaceChildren(); last = null; exportButton.disabled = true;
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
      last = { input, result }; exportButton.disabled = false;
      status.textContent = "계산했습니다. 결과와 처리 이유를 확인하고 필요한 경우 CSV로 저장하세요.";
    } catch (error) { status.textContent = error.message || "입력값을 확인해 주세요."; }
  };
  const reset = () => {
    form.replaceChildren();
    const settings = element("div"); settings.id = "worksheet-settings"; settings.className = "fields";
    for (const schema of spec.fields) settings.append(field(schema, spec.example.settings[schema[0]], "setting"));
    form.append(settings);
    for (const group of spec.groups) {
      const section = element("section"); section.append(element("h2", group.label));
      const holder = element("div"); holder.dataset.group = group.key;
      for (const row of spec.example[group.key]) addRow(group, holder, row);
      const add = element("button", "행 추가"); add.type = "button"; add.className = "secondary";
      add.addEventListener("click", () => { addRow(group, holder); invalidate(); });
      section.append(holder, add); form.append(section);
    }
    const submit = element("button", "결과 계산"); submit.type = "submit"; form.append(submit); run();
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); run(); });
  form.addEventListener("input", invalidate);
  form.addEventListener("change", invalidate);
  document.getElementById("worksheet-reset").addEventListener("click", reset);
  document.getElementById("worksheet-print").addEventListener("click", () => window.print());
  exportButton.addEventListener("click", () => {
    if (!last) return;
    const exportValue = (schema, value) => schema[2] === "select" ? schema[3].find((option) => option[0] === value)?.[1] || value : schema[2] === "number" && value !== "" ? Number(value) : value;
    const rows = [[spec.title], ["가상 예제를 바꿔 계산한 결과입니다. 입력과 계산 조건을 함께 보관하세요."], ["설정", "입력값"], ...spec.fields.map((schema) => [schema[1], exportValue(schema, last.input.settings[schema[0]])])];
    for (const group of spec.groups) rows.push([], [group.label], group.columns.map((c) => c[1]), ...last.input[group.key].map((r) => group.columns.map((c) => exportValue(c, r[c[0]]))));
    for (const table of last.result.tables) rows.push([], [table.caption], table.headers, ...table.rows);
    rows.push([], ...last.result.notes.map((n) => [n]));
    const cell = (value) => { let text = String(value ?? ""); if (typeof value !== "number" && /^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const url = URL.createObjectURL(new Blob(["\ufeff", rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = element("a"); a.href = url; a.download = slug + "-result.csv"; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  reset();
}

function renderPublicWorksheetV229106(slug, spec) {
  const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
  const title = escapeHtml(spec.title);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${title} · 말해가계부</title><style>
  :root{color-scheme:light dark;--bg:#f6f7f9;--surface:#fff;--text:#172337;--muted:#4d596a;--line:#cbd2dc;--accent:#1d4e9e}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.7 system-ui,-apple-system,sans-serif}main{max-width:980px;margin:auto;padding:28px 20px 70px}h1{font-size:clamp(1.7rem,5vw,2.5rem);line-height:1.3;margin:26px 0 18px;word-break:keep-all}h2{font-size:1.3rem;margin:36px 0 16px}p{max-width:72ch}a{color:var(--accent);text-underline-offset:4px}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:16px}fieldset{min-width:0;margin:14px 0;padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}legend{padding:0 6px;font-weight:650}label{display:flex;flex-direction:column;gap:6px;font-size:15px}input,select{font:inherit;font-size:17px;color:var(--text);background:var(--surface);min-height:46px;width:100%;border:1px solid var(--line);border-radius:6px;padding:8px;caret-color:var(--accent)}button{font:inherit;font-weight:650;min-height:46px;padding:9px 17px;margin:14px 8px 0 0;border:1px solid var(--accent);border-radius:7px;background:var(--accent);color:#fff;cursor:pointer}button.secondary{background:var(--surface);color:var(--accent)}button:disabled{opacity:.55;cursor:not-allowed}button:hover:not(:disabled){filter:brightness(.92)}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}::selection{background:#c9dbff;color:#102b58}.table-scroll{overflow:auto;max-width:100%;margin:24px 0}table{border-collapse:collapse;width:100%;background:var(--surface);font-variant-numeric:tabular-nums}caption{text-align:left;font-weight:700;margin:0 0 12px}th,td{border-bottom:1px solid var(--line);padding:10px 14px;text-align:left;vertical-align:top;min-width:100px}th{font-weight:650}#worksheet-status{font-weight:650;min-height:2em;margin-top:24px}.meta{color:var(--muted);font-size:15px}.actions{display:flex;flex-wrap:wrap;gap:4px}details{margin:24px 0}summary{cursor:pointer;font-weight:650}@media(prefers-color-scheme:dark){:root{--bg:#141922;--surface:#1c2430;--text:#edf1f7;--muted:#c0cad8;--line:#566276;--accent:#9bc1ff}button{color:#101b2e}button.secondary{color:var(--accent)}}@media print{:root{color-scheme:light;--bg:#fff;--surface:#fff;--text:#000;--muted:#333;--line:#777;--accent:#000}body{background:#fff;color:#000}button,.actions{display:none}fieldset{break-inside:avoid}.fields{grid-template-columns:repeat(2,minmax(0,1fr))}input,select{border:0;padding:0;min-height:0;background:#fff;color:#000}main{max-width:none;padding:0}.table-scroll{overflow:visible}table{font-size:10pt}th,td{min-width:0;padding:5px}a{color:#000}}
  </style></head><body><main><a href="https://malhaebook.com/${slug}">설명 글과 계산 근거로 돌아가기</a><h1>${title}</h1><p>${escapeHtml(spec.outcome)}</p><p>${escapeHtml(spec.instruction)}</p><p class="meta">편집용 가상 예제 · 2026-11-07 작성 · 도담 네트워크 운영팀<br>계산표는 이 브라우저 안에서만 작동합니다. 입력값은 서버 전송·광고·방문 분석·브라우저 저장소에 사용하지 않습니다. 새로고침하면 입력이 초기화되므로 필요한 결과는 CSV로 보관하세요.</p><details><summary>예제 결과와 확인할 예외</summary><ul>${spec.checks.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></details><noscript><p>계산하려면 JavaScript가 필요합니다. 위 설명 글에서 원본 예제와 결과 표를 읽을 수 있습니다.</p></noscript><form id="worksheet-form" action="#" novalidate></form><p id="worksheet-status" role="status" aria-live="polite"></p><h2>계산 결과</h2><div id="worksheet-result"></div><div class="actions"><button type="button" id="worksheet-export" disabled>입력과 결과 CSV 저장</button><button type="button" class="secondary" id="worksheet-print">결과 인쇄</button><button type="button" class="secondary" id="worksheet-reset">가상 예제로 되돌리기</button></div><p class="meta">이 자료는 합의와 검산을 돕는 별도 계산표입니다. 실제 거래 저장·송금·가입·구독 해지를 실행하지 않습니다. CSV에는 입력한 내용이 포함됩니다.</p></main><script>(${worksheetClientV229106.toString()})(${json(slug)},${json(spec)},${worksheetComputeV229106.toString()});</script></body></html>`;
}

function publicWorksheetResponseV229106(request, url) {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const slug = Object.keys(PUBLIC_WORKSHEETS_V229106).find((key) => publicWorksheetPathV229106(key) === url.pathname);
  if (!slug) return null;
  const download = url.searchParams.get("download") === "1";
  return new Response(request.method === "HEAD" ? null : renderPublicWorksheetV229106(slug, PUBLIC_WORKSHEETS_V229106[slug]), { headers: {
    "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, follow", "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "cache-control": download ? "no-store" : "public, max-age=31536000, immutable",
    ...(download ? { "content-disposition": `attachment; filename="${slug}.html"` } : {}),
  } });
}

// @build:exports-start
export { publicWorksheetResponseV229106 };
// @build:exports-end
