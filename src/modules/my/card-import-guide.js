// @build:imports-start
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

// 카드사별 사용내역 가져오기 안내. 그림은 실제 화면 캡처가 아니라 클릭 위치를 설명하는 도식이다.
// 카드사 개편으로 메뉴 이름이 바뀔 수 있어 화면에도 그 점을 밝혀 둔다.
const CARD_IMPORT_GUIDES = [
  { id: "hyundai", name: "현대카드", color: "#1f2937", nav: ["카드", "이용내역", "혜택", "고객센터"], hit: 1, sub: ["이용내역 조회", "청구서 조회", "결제일 안내"], excel: "엑셀 저장" },
  { id: "samsung", name: "삼성카드", color: "#1d4ed8", nav: ["카드", "마이페이지", "이벤트", "고객센터"], hit: 1, sub: ["이용내역", "청구내역", "한도 조회"], excel: "엑셀 다운로드" },
  { id: "lotte", name: "롯데카드", color: "#dc2626", nav: ["카드", "마이페이지", "이벤트", "고객센터"], hit: 1, sub: ["이용내역 조회", "이용대금명세서", "한도 조회"], excel: "엑셀 저장" },
  { id: "shinhan", name: "신한카드", color: "#2563eb", nav: ["카드", "이용내역", "혜택", "고객센터"], hit: 1, sub: ["이용내역 조회", "청구내역", "결제계좌"], excel: "엑셀 다운로드" },
  { id: "kb", name: "KB국민카드", color: "#b45309", nav: ["카드", "이용내역", "혜택", "고객센터"], hit: 1, sub: ["카드 이용내역", "결제예정금액", "이용한도"], excel: "엑셀 저장" },
  { id: "nh", name: "NH농협카드", color: "#15803d", nav: ["카드", "이용내역", "혜택", "고객센터"], hit: 1, sub: ["이용내역 조회", "청구내역", "한도 조회"], excel: "엑셀 저장" },
  { id: "hana", name: "하나카드", color: "#0f766e", nav: ["카드", "이용내역", "혜택", "고객센터"], hit: 1, sub: ["이용내역 조회", "청구서", "한도 조회"], excel: "엑셀 다운로드" },
  { id: "woori", name: "우리카드", color: "#0369a1", nav: ["카드", "이용내역", "혜택", "고객센터"], hit: 1, sub: ["이용내역 조회", "청구내역", "한도 조회"], excel: "엑셀 저장" },
  { id: "bc", name: "BC카드", color: "#e11d48", nav: ["카드", "이용내역", "혜택", "고객센터"], hit: 1, sub: ["이용내역 조회", "청구내역", "한도 조회"], excel: "엑셀 저장" },
  { id: "etc", name: "기타 카드사", color: "#475569", nav: ["카드", "이용내역", "혜택", "고객센터"], hit: 1, sub: ["이용내역 조회", "청구내역", "한도 조회"], excel: "엑셀 저장" },
];

function cardGuideFigure(kind, guide) {
  const c = escapeHtml(guide.color);
  const red = "#ef4444";
  const t = (x, y, text, size = 11, fill = "#334155", weight = 500, anchor = "start") => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${escapeHtml(text)}</text>`;
  const pill = (x, y, text = "여기 클릭") => `<rect x="${x}" y="${y}" width="58" height="18" rx="9" fill="${red}"/>${t(x + 29, y + 13, text, 10, "#fff", 700, "middle")}`;
  const frame = (inner, label) => `<svg class="cgFig" viewBox="0 0 320 170" role="img" aria-label="${escapeHtml(label)}"><rect x="1" y="1" width="318" height="168" rx="10" fill="#fff" stroke="#cbd5e1"/><rect x="1" y="1" width="318" height="20" rx="10" fill="#e2e8f0"/><circle cx="14" cy="11" r="3" fill="#f87171"/><circle cx="25" cy="11" r="3" fill="#fbbf24"/><circle cx="36" cy="11" r="3" fill="#4ade80"/><rect x="50" y="5" width="200" height="12" rx="6" fill="#fff"/>${t(58, 14, `${guide.name} 공식 홈페이지`, 8, "#64748b")}<rect x="2" y="21" width="316" height="28" fill="${c}"/>${inner}</svg>`;
  if (kind === "login") {
    return frame(`${t(14, 39, guide.name, 12, "#fff", 800)}${t(110, 88, "아이디", 11)}<rect x="150" y="76" width="110" height="18" rx="4" fill="#fff" stroke="#cbd5e1"/>${t(110, 114, "비밀번호", 11)}<rect x="150" y="102" width="110" height="18" rx="4" fill="#fff" stroke="#cbd5e1"/><rect x="90" y="130" width="140" height="24" rx="6" fill="${red}" fill-opacity=".16" stroke="${red}" stroke-width="2"/>${t(160, 146, "로그인", 12, "#111827", 700, "middle")}${pill(236, 133)}`, `${guide.name} 로그인 화면 예시`);
  }
  if (kind === "menu") {
    const nav = guide.nav.map((label, i) => t(16 + i * 74, 39, label, 11, "#fff", i === guide.hit ? 800 : 500)).join("");
    const hx = 10 + guide.hit * 74;
    const subs = guide.sub.map((label, i) => `${i === 0 ? `<rect x="${hx + 4}" y="${52 + i * 24}" width="120" height="22" rx="5" fill="${red}" fill-opacity=".16" stroke="${red}" stroke-width="2"/>` : ""}${t(hx + 12, 67 + i * 24, label, 11, "#111827", i === 0 ? 800 : 500)}`).join("");
    return frame(`${nav}<rect x="${hx}" y="25" width="68" height="22" rx="6" fill="none" stroke="${red}" stroke-width="2.5"/><rect x="${hx}" y="49" width="128" height="80" rx="6" fill="#f8fafc" stroke="#cbd5e1"/>${subs}${pill(hx + 132, 55)}${t(16, 156, "① 위 메뉴에 마우스를 올리거나 클릭  ② 아래 항목 클릭", 9, "#64748b")}`, `${guide.name} 메뉴 클릭 위치 예시`);
  }
  if (kind === "period") {
    return frame(`${t(14, 39, guide.sub[0], 12, "#fff", 800)}${t(16, 88, "조회기간", 11, "#334155", 700)}<rect x="70" y="74" width="80" height="20" rx="4" fill="#fff" stroke="#cbd5e1"/>${t(110, 88, "시작일", 10, "#94a3b8", 500, "middle")}${t(158, 88, "~", 12)}<rect x="168" y="74" width="80" height="20" rx="4" fill="#fff" stroke="#cbd5e1"/>${t(208, 88, "종료일", 10, "#94a3b8", 500, "middle")}<rect x="256" y="72" width="52" height="24" rx="6" fill="${red}" fill-opacity=".16" stroke="${red}" stroke-width="2.5"/>${t(282, 88, "조회", 12, "#111827", 800, "middle")}${pill(250, 102)}${t(16, 128, "가져올 기간을 정하고 [조회]를 눌러 목록이 나오면 다음 단계로", 9, "#64748b")}`, `${guide.name} 조회 기간 설정 예시`);
  }
  const rows = [82, 100, 118, 136].map((y, i) => `<rect x="14" y="${y}" width="292" height="12" rx="3" fill="${i === 0 ? "#e2e8f0" : "#f1f5f9"}"/>`).join("");
  return frame(`${t(14, 39, guide.sub[0], 12, "#fff", 800)}<rect x="206" y="54" width="100" height="22" rx="6" fill="${red}" fill-opacity=".16" stroke="${red}" stroke-width="2.5"/>${t(256, 69, guide.excel, 11, "#111827", 800, "middle")}${pill(142, 56)}${rows}`, `${guide.name} 엑셀 저장 버튼 위치 예시`);
}

function renderCardGuideSteps(guide) {
  const steps = [
    ["login", "카드사 홈페이지(PC)에 로그인", `PC 인터넷 브라우저에서 ${guide.name} 공식 홈페이지에 접속해 로그인하세요. 앱보다 PC에서 받은 엑셀 파일이 가져오기에 더 잘 맞습니다.`],
    ["menu", `‘${guide.nav[guide.hit]}’ → ‘${guide.sub[0]}’ 클릭`, `상단 메뉴의 ‘${guide.nav[guide.hit]}’에서 ‘${guide.sub[0]}’ 화면으로 들어갑니다.`],
    ["period", "기간을 정하고 조회", "가져올 기간(예: 이번 달 1일부터 오늘까지)을 고른 뒤 [조회]를 누르세요. 기간이 길면 파일이 커질 수 있어요."],
    ["excel", `[${guide.excel}] 버튼으로 파일 받기`, `목록 위쪽의 [${guide.excel}] 버튼을 눌러 파일을 내려받습니다. 받은 파일은 내 PC의 다운로드 폴더에 저장돼요.`],
  ];
  return steps.map(([kind, title, desc], i) => `<li class="cgStep"><span class="cgNum">${i + 1}</span><div><b>${escapeHtml(title)}</b><p>${escapeHtml(desc)}</p>${cardGuideFigure(kind, guide)}</div></li>`).join("");
}

function renderCardImportSection({ canImport = true } = {}) {
  const buttons = CARD_IMPORT_GUIDES.map((g) => `<button type="button" class="cgOpen" data-card="${escapeHtml(g.id)}" style="--cg:${escapeHtml(g.color)}"${canImport ? "" : " disabled"}><span class="cgDot" aria-hidden="true">${escapeHtml(g.name.slice(0, 1))}</span><b>${escapeHtml(g.name)}</b><small>등록하기</small></button>`).join("");
  const templates = CARD_IMPORT_GUIDES.map((g) => `<template id="cgTpl-${escapeHtml(g.id)}" data-name="${escapeHtml(g.name)}"><ol class="cgSteps">${renderCardGuideSteps(g)}</ol></template>`).join("");
  return `<section class="card" id="cardImport"><h2>카드사별 사용내역 가져오기</h2><p class="muted">카드사를 고르면 엑셀 파일을 받는 방법을 그림으로 보여주고, 받은 파일을 바로 올릴 수 있습니다.</p>${canImport ? "" : `<div class="warn">조회 전용 권한에서는 가져오기를 사용할 수 없습니다.</div>`}<div class="cgGrid">${buttons}</div>${templates}</section><div id="cgModal" class="cgModal" role="dialog" aria-modal="true" aria-labelledby="cgTitle" hidden><div class="cgSheet"><header class="cgHead"><h2 id="cgTitle">카드사 사용내역 등록</h2><button type="button" id="cgClose" class="cgX" aria-label="닫기">✕</button></header><div class="cgBody"><p class="cgNote">그림은 클릭할 위치를 알려주는 예시입니다. 카드사 화면 개편에 따라 메뉴 이름과 위치가 조금 다를 수 있어요.</p><div id="cgSteps"></div><section class="cgUpload"><span class="cgNum">5</span><div><b>받은 파일을 올려주세요</b><p>엑셀(.xls/.xlsx)이나 CSV 파일을 그대로 선택하면 됩니다. 올리면 바로 저장되지 않고, 다음 화면에서 인식 결과를 확인한 뒤 저장할 행을 고릅니다.</p><input id="cgFile" type="file" accept=".csv,.tsv,.txt,.xls,.xlsx"/><div id="cgStatus" class="fileStatus" role="status" aria-live="polite">파일을 선택해 주세요.</div><ul class="cgTips"><li>파일에 암호(생년월일 등)가 걸려 있으면 엑셀에서 암호를 입력해 연 뒤 ‘다른 이름으로 저장 → CSV’로 저장해서 올려주세요.</li><li>취소·환불 내역이 섞여 있으면 미리보기에서 해당 행의 체크를 해제하세요.</li></ul><button type="button" id="cgGo" disabled>미리보기 분석하기</button></div></section></div></div></div>`;
}

function cardImportClientMain(config) {
  var modal = document.getElementById("cgModal");
  var stepsBox = document.getElementById("cgSteps");
  var title = document.getElementById("cgTitle");
  var closeBtn = document.getElementById("cgClose");
  var fileInput = document.getElementById("cgFile");
  var status = document.getElementById("cgStatus");
  var go = document.getElementById("cgGo");
  var mainForm = document.getElementById(config.formId);
  var mainFile = document.getElementById(config.fileId);
  var mainText = document.getElementById(config.textId);
  var opener = null;
  var xlsxPromise = null;
  if (!modal || !stepsBox || !fileInput || !go || !mainForm || !mainFile || !mainText) return;

  function setStatus(text, bad) {
    status.textContent = text;
    status.style.background = bad ? "#fff7ed" : "#eff6ff";
    status.style.borderColor = bad ? "#fed7aa" : "#bfdbfe";
    status.style.color = bad ? "#9a3412" : "#1e3a8a";
  }

  // 엑셀 변환기는 무거워서 파일을 고를 때에야 불러온다(가져오기 화면과 같은 방식).
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.async = true;
      script.onload = function () { if (window.XLSX) resolve(window.XLSX); else { xlsxPromise = null; reject(new Error("엑셀 변환 모듈 초기화에 실패했습니다. 파일을 CSV로 저장해서 올려주세요.")); } };
      script.onerror = function () { xlsxPromise = null; reject(new Error("엑셀 변환 모듈을 불러오지 못했습니다. 파일을 CSV로 저장해서 올려주세요.")); };
      document.head.appendChild(script);
    });
    return xlsxPromise;
  }

  function open(id, from) {
    var tpl = document.getElementById("cgTpl-" + id);
    if (!tpl) return;
    opener = from || null;
    stepsBox.innerHTML = "";
    stepsBox.appendChild(tpl.content.cloneNode(true));
    title.textContent = (tpl.getAttribute("data-name") || "카드사") + " 사용내역 등록";
    fileInput.value = "";
    go.disabled = true;
    setStatus("파일을 선택해 주세요.", false);
    modal.hidden = false;
    document.documentElement.classList.add("cgOpenLock");
    modal.querySelector(".cgBody").scrollTop = 0;
    closeBtn.focus();
  }

  function close() {
    modal.hidden = true;
    document.documentElement.classList.remove("cgOpenLock");
    if (opener && opener.focus) opener.focus();
  }

  Array.prototype.forEach.call(document.querySelectorAll(".cgOpen"), function (btn) {
    btn.addEventListener("click", function () { open(btn.getAttribute("data-card"), btn); });
  });
  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", function (event) { if (event.target === modal) close(); });
  document.addEventListener("keydown", function (event) {
    if (modal.hidden) return;
    if (event.key === "Escape") { close(); return; }
    if (event.key !== "Tab") return;
    var items = modal.querySelectorAll("button:not([disabled]),input");
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    go.disabled = true;
    if (!file) { setStatus("파일을 선택해 주세요.", false); return; }
    var name = String(file.name || "").toLowerCase();
    if (/\.xlsx?$/.test(name)) {
      setStatus("엑셀 변환 모듈을 준비하고 있습니다…", false);
      loadXlsx().then(function () {
        setStatus("엑셀 파일을 읽는 중입니다…", false);
        var reader = new FileReader();
        reader.onload = function (event) {
          try {
            var workbook = window.XLSX.read(new Uint8Array(event.target.result), { type: "array", cellDates: false });
            var chunks = [];
            workbook.SheetNames.forEach(function (sheetName) {
              var tsv = window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { FS: "\t", RS: "\n", rawNumbers: false });
              if (String(tsv || "").trim()) chunks.push("# 시트: " + sheetName + "\n" + String(tsv).trim());
            });
            if (!chunks.length) throw new Error("값이 있는 시트를 찾지 못했습니다. 암호가 걸린 파일이면 엑셀에서 열어 CSV로 저장해 주세요.");
            mainText.value = chunks.join("\n");
            mainFile.value = "";
            setStatus(file.name + " · 시트 " + workbook.SheetNames.length + "개를 읽었습니다. 아래 버튼으로 미리보기를 확인하세요.", false);
            go.disabled = false;
          } catch (error) {
            setStatus(error.message || String(error), true);
          }
        };
        reader.onerror = function () { setStatus("파일을 읽지 못했습니다. CSV로 저장해서 다시 올려주세요.", true); };
        reader.readAsArrayBuffer(file);
      }).catch(function (error) { setStatus(error.message || String(error), true); });
      return;
    }
    try {
      var transfer = new DataTransfer();
      transfer.items.add(file);
      mainFile.files = transfer.files;
      mainText.value = "";
      setStatus(file.name + " 파일을 선택했습니다. 아래 버튼으로 미리보기를 확인하세요.", false);
      go.disabled = false;
    } catch (error) {
      setStatus("이 브라우저에서는 파일을 바로 넘길 수 없습니다. 창을 닫고 ‘파일·붙여넣기 가져오기’에서 직접 선택해 주세요.", true);
    }
  });

  go.addEventListener("click", function () {
    if (go.disabled) return;
    close();
    if (typeof mainForm.requestSubmit === "function") mainForm.requestSubmit();
    else mainForm.submit();
  });
}

function cardImportCss() {
  return `.cgGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px;margin-top:12px}.cgOpen{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;text-align:left;background:#fff!important;color:#101828!important;border:1px solid #e2e8f0;border-radius:16px;padding:12px;min-height:60px}.cgOpen:hover:not(:disabled){border-color:var(--cg);box-shadow:0 4px 14px rgba(15,23,42,.1)}.cgDot{grid-row:1/3;width:34px;height:34px;border-radius:12px;background:var(--cg);color:#fff;display:grid;place-items:center;font-weight:1000}.cgOpen b{font-size:14px}.cgOpen small{color:#2563eb;font-weight:800;font-size:12px}.cgModal{position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,.6);display:grid;place-items:center;padding:16px}.cgModal[hidden]{display:none}.cgSheet{width:min(100%,640px);max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);background:#fff;color:#101828;border-radius:22px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,.35)}.cgHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid #e8edf4}.cgHead h2{margin:0;font-size:18px}.cgX{width:40px;height:40px;padding:0;background:#f1f5f9!important;color:#111827!important;border-radius:12px}.cgBody{overflow-y:auto;padding:16px 18px 22px}.cgNote{margin:0 0 12px;background:#fffbea;border:1px solid #fde68a;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.5;color:#92400e}.cgSteps{list-style:none;margin:0;padding:0;display:grid;gap:18px}.cgStep,.cgUpload{display:grid;grid-template-columns:30px 1fr;gap:10px}.cgUpload{margin-top:18px;padding-top:18px;border-top:1px dashed #cbd5e1}.cgNum{width:28px;height:28px;border-radius:50%;background:#111827;color:#fff;display:grid;place-items:center;font-weight:1000;font-size:14px}.cgStep b,.cgUpload b{font-size:15px}.cgStep p,.cgUpload p{margin:4px 0 10px;color:#475467;font-size:13px;line-height:1.55}.cgFig{display:block;width:100%;height:auto;border-radius:10px}.cgTips{margin:10px 0;padding-left:18px;color:#667085;font-size:12px;line-height:1.55}#cgGo{width:100%;min-height:48px}html.cgOpenLock body{overflow:hidden}@media(max-width:560px){.cgModal{padding:0;place-items:end stretch}.cgSheet{max-height:94vh;max-height:94dvh;border-radius:22px 22px 0 0}}`;
}
// @build:exports-start
export { cardImportClientMain, cardImportCss, renderCardImportSection };
// @build:exports-end
