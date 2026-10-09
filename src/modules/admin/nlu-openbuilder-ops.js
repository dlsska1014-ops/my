
function expectedOpenBuilderRows() {
  return [
    ["웰컴", "처음 진입", "버튼: /my, /start-guide, /keyword-guide, /chatbot-edit-guide"],
    ["도움말", "도움말, 처음, 시작, 메뉴, 사용법", "Skill 연결"],
    ["입력 예시", "입력 예시, 입력, 지출 입력, 어떻게 입력", "Skill 연결"],
    ["요약", "요약, 이번달, 통계, 현황", "Skill 연결"],
    ["예산", "남은예산, 예산 확인, 남은 돈, 쓸 수 있는 돈", "Skill 연결"],
    ["최근 기록", "최근, 최근 내역, 오늘 기록, 오늘 내역", "Skill 연결"],
    ["수정", "수정가이드, 번호수정, 삭제 방법", "Skill 연결"],
    ["키워드", "키워드 안내, 분류, 자동분류", "Skill 연결"],
    ["정기지출", "정기지출, 자동차세, 재산세, 자동차보험", "Skill 연결"],
    ["링크", "링크, 주소, 가계부 시작, 안전 링크", "Skill 연결"],
    ["자유 입력", "점심 12000원 국민카드, 월급 250만원", "Skill 연결"],
    ["폴백", "그 외 모든 말", "반드시 Skill 연결"],
  ];
}

async function handleOpenBuilderReportPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const origin = publicBaseUrl(env, url);
  const rows = expectedOpenBuilderRows().map(([block, utter, action]) => `<tr><td><b>${escapeHtml(block)}</b></td><td>${escapeHtml(utter)}</td><td>${escapeHtml(action)}</td></tr>`).join("");
  const tests = ["도움말", "입력 예시", "남은예산", "요약", "오늘 기록", "수정가이드", "키워드 안내", "정기지출", "링크", "아무말", "점심 12000원 국민카드"].map((x) => `<span>${escapeHtml(x)}</span>`).join("");
  const warnings = [
    "카카오/카톡/공식 명칭을 브랜드명처럼 사용하지 않기",
    "단톡방 대화를 읽거나 학습한다는 표현 금지",
    "폴백 블록을 고정 문구로 두지 말고 /skill로 연결",
    "응답은 핵심만 짧게, 자세한 설정은 /my 웹으로 연결",
    "사용자 이름은 가계부 표시명으로만 수정하고 카카오 고유키는 변경하지 않기",
  ].map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 챗봇 운영점검</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f8fafc,#eef2f7);color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1240px;margin:0 auto;padding:16px}.startHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.flowGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.flowCard{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:10px;text-decoration:none;color:#111827;border:1px solid #e8edf4;background:#fff;border-radius:18px;padding:13px;min-width:0}.flowCard span{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:#111827;color:#fff;font-weight:1000}.flowCard b{display:block}.flowCard small{display:block;color:#667085;font-size:13px;margin-top:4px;line-height:1.35}.flowCard em{font-style:normal;font-size:11px;color:#64748b;background:#f1f5f9;border-radius:999px;padding:5px 8px;white-space:nowrap}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.075)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#d1fae5}.skill{background:#111827;color:#fff;border-radius:18px;padding:14px;word-break:break-all;font-weight:1000}.muted{color:#667085;line-height:1.6}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:18px;padding:14px;line-height:1.65}.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:18px;padding:14px;line-height:1.65}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e8edf4;padding:11px;text-align:left;vertical-align:top}.chips{display:flex;gap:8px;flex-wrap:wrap}.chips span{background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:8px 11px;font-size:13px;font-weight:900}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:760px){.grid{grid-template-columns:1fr}.wrap{padding:10px}}</style></head><body><main class="wrap"><section class="hero"><h1>챗봇 운영점검 리포트</h1><p>정식 챗봇 운영 전 OpenBuilder 블록, 폴백, 응답 문구, 사용자 식별 안정성을 점검합니다.</p></section><section class="card"><h2>Skill URL</h2><div class="skill">${escapeHtml(origin)}/skill</div><p class="warn"><b>가장 중요</b><br/>폴백 블록도 반드시 Skill URL로 연결해야 합니다. 폴백이 고정 문구면 Worker 안정화가 적용되지 않습니다.</p></section><section class="card"><h2>필수 블록/발화</h2><table><thead><tr><th>블록</th><th>대표 발화</th><th>연결</th></tr></thead><tbody>${rows}</tbody></table></section><section class="grid"><div class="card"><h2>심사/운영 주의사항</h2><ul>${warnings}</ul></div><div class="card"><h2>배포 후 테스트 발화</h2><div class="chips">${tests}</div><p class="muted">테스트 중 하나라도 기본 응답으로 빠지면 해당 발화 또는 폴백이 /skill로 연결되지 않은 것입니다.</p></div></section><div class="ok"><b>v15.8 운영 기준</b><br/>/skill에는 과도 요청 제한, 안전 fallback, 최근 이벤트 로그가 적용되어 있습니다. 운영 상태는 /skill-ops에서 확인합니다.</div></main></body></html>`);
}

async function fetchPersistentNluMetrics(env = {}, hours = 168) {
  const cfg = nluOpsConfig(env);
  if (!cfg.aggregate_metrics_enabled) return [];
  const since = new Date(Date.now() - Math.max(1, Math.min(2160, Number(hours || 168))) * 3600000).toISOString();
  return optionalSupabase(env, `/rest/v1/nlu_intent_metrics_hourly?bucket_start=gte.${encodeURIComponent(since)}&select=bucket_start,intent,result,request_count,latency_sum_ms,latency_max_ms,version&order=bucket_start.desc&limit=5000`, { method: "GET" }, []);
}

async function fetchPersistentNluFailures(env = {}, days = 14, limit = 300) {
  const cfg = nluOpsConfig(env);
  if (!cfg.failure_samples_enabled) return [];
  const since = new Date(Date.now() - Math.max(1, Math.min(90, Number(days || 14))) * 86400000).toISOString();
  return optionalSupabase(env, `/rest/v1/nlu_failure_samples?last_seen=gte.${encodeURIComponent(since)}&select=sample_hash,redacted_sample,intent,result,reason,version,hit_count,first_seen,last_seen&order=hit_count.desc,last_seen.desc&limit=${Math.max(1, Math.min(1000, Number(limit || 300)))}`, { method: "GET" }, []);
}

function summarizePersistentNluMetrics(rows = []) {
  const totals = { total: 0, latency_sum_ms: 0, latency_max_ms: 0, by_result: {}, by_intent: {} };
  for (const row of safeArray(rows)) {
    const count = Math.max(0, Number(row.request_count || 0));
    totals.total += count;
    totals.latency_sum_ms += Math.max(0, Number(row.latency_sum_ms || 0));
    totals.latency_max_ms = Math.max(totals.latency_max_ms, Math.max(0, Number(row.latency_max_ms || 0)));
    const result = String(row.result || "unknown");
    const intent = String(row.intent || "UNKNOWN");
    totals.by_result[result] = (totals.by_result[result] || 0) + count;
    totals.by_intent[intent] = (totals.by_intent[intent] || 0) + count;
  }
  totals.avg_latency_ms = totals.total ? Math.round(totals.latency_sum_ms / totals.total) : 0;
  totals.success_rate = totals.total ? Math.round((Number(totals.by_result.ok || 0) / totals.total) * 10000) / 100 : 0;
  totals.fallback_rate = totals.total ? Math.round((Number(totals.by_result.fallback || 0) / totals.total) * 10000) / 100 : 0;
  totals.clarify_rate = totals.total ? Math.round((Number(totals.by_result.clarify || 0) / totals.total) * 10000) / 100 : 0;
  totals.error_rate = totals.total ? Math.round((Number(totals.by_result.error || 0) / totals.total) * 10000) / 100 : 0;
  return totals;
}

async function nluAdminAuthorized(request, env, url) {
  return !!(await verifyAdminSession(request, env));
}

async function handleNluOpsJson(request, env, url) {
  if (!(await nluAdminAuthorized(request, env, url))) return jsonResponse({ ok: false, error: "admin_required", reason: "admin_required", message: "관리자 권한이 필요합니다." }, 401);
  const hours = Math.max(1, Math.min(2160, Number(url.searchParams.get("hours") || 168)));
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || 14)));
  const [metrics, failures] = await Promise.all([fetchPersistentNluMetrics(env, hours), fetchPersistentNluFailures(env, days, 300)]);
  return jsonResponse({
    ok: true,
    version: APP_VERSION,
    runtime: getNluOpsSnapshot(env),
    persistent: { enabled: nluOpsConfig(env), hours, days, summary: summarizePersistentNluMetrics(metrics), metrics, failures },
  });
}

async function handleNluFailuresCsv(request, env, url) {
  if (!(await nluAdminAuthorized(request, env, url))) return jsonResponse({ ok: false, error: "admin_required", reason: "admin_required", message: "관리자 권한이 필요합니다." }, 401);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || 14)));
  const rows = await fetchPersistentNluFailures(env, days, 1000);
  const lines = [["sample_hash", "redacted_sample", "intent", "result", "reason", "version", "hit_count", "first_seen", "last_seen"].map(csvCell).join(",")];
  for (const r of rows) lines.push([r.sample_hash, r.redacted_sample || "", r.intent, r.result, r.reason, r.version, r.hit_count, r.first_seen, r.last_seen].map(csvCell).join(","));
  return new Response("\ufeff" + lines.join("\n"), { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="nlu-failures-${new Date().toISOString().slice(0,10)}.csv"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

async function handleNluOpsPage(request, env, url) {
  if (!(await nluAdminAuthorized(request, env, url))) return redirectResponse("/admin-view");
  const hours = Math.max(1, Math.min(2160, Number(url.searchParams.get("hours") || 168)));
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || 14)));
  const runtime = getNluOpsSnapshot(env);
  const [metricRows, failureRows] = await Promise.all([fetchPersistentNluMetrics(env, hours), fetchPersistentNluFailures(env, days, 200)]);
  const persistent = summarizePersistentNluMetrics(metricRows);
  const topIntents = Object.entries(persistent.total ? persistent.by_intent : runtime.by_intent).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([intent, count]) => `<tr><td><b>${escapeHtml(intent)}</b></td><td>${numberWithCommas(count)}</td></tr>`).join("") || `<tr><td colspan="2">아직 집계가 없습니다.</td></tr>`;
  const recentProblems = runtime.recent.filter((e) => e.result !== "ok").slice(0, 60).map((e) => `<tr><td>${escapeHtml(String(e.at || "").replace("T", " ").slice(0,19))}</td><td><span class="pill ${escapeHtml(e.result)}">${escapeHtml(e.result)}</span></td><td>${escapeHtml(e.intent)}</td><td>${escapeHtml(e.sample || "-")}</td><td>${escapeHtml(e.reason || "")}</td><td>${numberWithCommas(e.latency_ms)}ms</td></tr>`).join("") || `<tr><td colspan="6">현재 Worker 인스턴스에서 최근 실패·확인 질문이 없습니다.</td></tr>`;
  const persistentProblems = failureRows.slice(0, 80).map((e) => `<tr><td>${escapeHtml(String(e.last_seen || "").replace("T", " ").slice(0,19))}</td><td><span class="pill ${escapeHtml(e.result || "")}">${escapeHtml(e.result || "")}</span></td><td>${escapeHtml(e.intent || "")}</td><td>${escapeHtml(e.redacted_sample || "텍스트 저장 비활성")}</td><td>${numberWithCommas(e.hit_count || 0)}</td><td>${escapeHtml(e.version || "")}</td></tr>`).join("") || `<tr><td colspan="6">영구 실패 샘플이 없거나 기능이 비활성입니다.</td></tr>`;
  const cfg = nluOpsConfig(env);
  const metricSource = persistent.total ? persistent : { total: runtime.total, success_rate: runtime.success_rate, fallback_rate: runtime.fallback_rate, clarify_rate: runtime.clarify_rate, error_rate: runtime.error_rate, avg_latency_ms: runtime.latency.p50, latency_max_ms: runtime.latency.max };
  const configRows = Object.entries(cfg).map(([k,v]) => `<tr><td><code>${escapeHtml(k)}</code></td><td>${escapeHtml(String(v))}</td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>NLU 운영·학습</title><style>*{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1220px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#4f46e5));color:#fff;border-radius:28px;padding:24px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.2)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.94}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.metric,.card{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:16px;box-shadow:0 10px 28px rgba(15,23,42,.05)}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:25px;margin-top:6px}.card{margin:12px 0}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}th,td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:13px;vertical-align:top}.pill{display:inline-flex;border-radius:999px;padding:5px 9px;background:#f1f5f9;font-weight:900}.fallback{background:#ffedd5;color:#9a3412}.clarify{background:#e0e7ff;color:#3730a3}.error{background:#fee2e2;color:#991b1b}.ok{background:#dcfce7;color:#166534}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.btn.light{background:#eef2ff;color:#3730a3}.notice{background:#fffbeb;border:1px solid #fde68a;color:#854d0e;border-radius:16px;padding:13px;line-height:1.55}code{background:#f1f5f9;border-radius:8px;padding:3px 6px}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("operation-center", { showOps: true })}<main class="wrap"><section class="hero"><h1>자연어 운영·학습 센터</h1><p>실패 발화, 확인 질문, 의도별 성공률과 응답시간을 확인해 실제 사용자 표현을 안전하게 개선합니다.</p><p><a class="btn light" href="/nlu-ops.json?hours=${hours}&days=${days}">JSON 보기</a><a class="btn light" href="/nlu-failures.csv?days=${days}">실패 샘플 CSV</a><a class="btn light" href="/nlu-intents.json">Intent 목록</a><a class="btn light" href="/operation-center">운영센터</a></p></section><section class="grid"><div class="metric"><span>집계 요청</span><b>${numberWithCommas(metricSource.total || 0)}</b></div><div class="metric"><span>성공률</span><b>${numberWithCommas(metricSource.success_rate || 0)}%</b></div><div class="metric"><span>폴백률</span><b>${numberWithCommas(metricSource.fallback_rate || 0)}%</b></div><div class="metric"><span>확인질문률</span><b>${numberWithCommas(metricSource.clarify_rate || 0)}%</b></div><div class="metric"><span>오류율</span><b>${numberWithCommas(metricSource.error_rate || 0)}%</b></div><div class="metric"><span>지연</span><b>${numberWithCommas(persistent.total ? persistent.avg_latency_ms : runtime.latency.p95)}ms</b></div></section><section class="card"><h2>집계 설정</h2><div class="tableWrap"><table><tbody>${configRows}</tbody></table></div><p class="notice">기본값은 DB 영구 로그 비활성입니다. 선택 SQL 적용 후 NLU_METRICS_ENABLED=1로 집계만 켜고, 실패 문장 수집은 개인정보 검토 후 별도로 켜세요.</p></section><section class="card"><h2>상위 의도</h2><div class="tableWrap"><table><thead><tr><th>의도</th><th>건수</th></tr></thead><tbody>${topIntents}</tbody></table></div></section><section class="card"><h2>현재 인스턴스의 최근 확인·실패</h2><div class="tableWrap"><table><thead><tr><th>시간</th><th>결과</th><th>의도</th><th>비식별 샘플</th><th>사유</th><th>지연</th></tr></thead><tbody>${recentProblems}</tbody></table></div></section><section class="card"><h2>영구 실패 샘플 · 최근 ${days}일</h2><div class="tableWrap"><table><thead><tr><th>최근</th><th>결과</th><th>의도</th><th>비식별 문장</th><th>반복</th><th>버전</th></tr></thead><tbody>${persistentProblems}</tbody></table></div></section><section class="notice"><b>개선 순서</b><br/>반복 샘플 확인 → 기존 의도 누락인지 판단 → 사전·규칙·되묻기 보강 → 평가 데이터셋 추가 → 전체 회귀시험 → 점진 배포. 실패 문장을 OpenBuilder 블록에 무조건 학습시키지 않습니다.</section></main></body></html>`);
}

async function handleSkillOpsPage(request, env, url) {
  const adminOk = await verifyAdminSession(request, env);
  if (!adminOk) return redirectResponse("/admin-view");
  const title = escapeHtml(appName(env));
  const snap = getSkillOpsSnapshot();
  const rows = snap.recent.map((e) => `<tr><td>${escapeHtml(e.at)}</td><td><span class="kind ${escapeHtml(e.kind)}">${escapeHtml(e.kind)}</span></td><td>${escapeHtml(maskKey(e.user_key || ""))}</td><td>${escapeHtml(e.utterance || "")}</td><td>${escapeHtml(e.detail || "")}</td></tr>`).join("") || `<tr><td colspan="5">아직 이벤트가 없습니다.</td></tr>`;
  const kindRows = Object.entries(snap.byKind || {}).map(([k, v]) => `<span>${escapeHtml(k)} ${numberWithCommas(v)}건</span>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 스킬 운영상태</title><style>body{margin:0;background:#f8fafc;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1160px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff}.hero p{color:#e9d5ff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.box{background:#f8fafc;border:1px solid #e8edf4;border-radius:18px;padding:14px}.box b{display:block;font-size:24px}table{width:100%;border-collapse:collapse;background:#fff}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px}.chips{display:flex;gap:8px;flex-wrap:wrap}.chips span{background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:8px 11px;font-weight:900;font-size:12px}.kind{border-radius:999px;padding:5px 9px;background:#f1f5f9;font-weight:900}.rate_limited{background:#ffedd5;color:#9a3412}.error,.bad_json{background:#fee2e2;color:#991b1b}.ok{background:#dcfce7;color:#166534}.muted{color:#667085;line-height:1.6}.scroll{overflow:auto;border:1px solid #e8edf4;border-radius:18px}</style></head><body><main class="wrap"><section class="hero"><h1>카카오 스킬 운영상태</h1><p>이 화면은 현재 Worker 인스턴스의 최근 /skill 이벤트와 과도 요청 제한 상태를 보여줍니다.</p></section><section class="grid"><div class="box"><span>활성 요청 버킷</span><b>${numberWithCommas(snap.activeBuckets)}</b></div><div class="box"><span>최근 이벤트</span><b>${numberWithCommas(snap.recent.length)}</b></div><div class="box"><span>기본 제한</span><b>${numberWithCommas(boundedRuntimeNumber(env.SKILL_RATE_LIMIT, 60, 10, 10000))}/분</b></div></section><section class="card"><h2>이벤트 요약</h2><div class="chips">${kindRows || "<span>이벤트 없음</span>"}</div><p class="muted">Cloudflare Worker 메모리 기반 임시 로그라 인스턴스 재시작 시 초기화됩니다. 장기 로그가 필요하면 별도 DB 로그 테이블을 추가하세요.</p></section><section class="card"><h2>최근 이벤트</h2><div class="scroll"><table><thead><tr><th>시간</th><th>종류</th><th>사용자키</th><th>발화</th><th>상세</th></tr></thead><tbody>${rows}</tbody></table></div></section></main></body></html>`);
}

async function handleOpenBuilderGuidePage(request, env, url) {
  const title = escapeHtml(appName(env));
  const origin = publicBaseUrl(env, url);
  const skillUrl = `${origin}/skill`;
  const rows = [
    ["웰컴 블록", "처음 진입 안내", "가계부 시작하기, 시작가이드, 키워드 안내, 수정가이드 버튼"],
    ["도움말 블록", "도움말 / 처음 / 시작 / 메뉴 / 사용법", "스킬 사용"],
    ["입력 예시 블록", "입력 예시 / 지출 입력 / 어떻게 입력", "스킬 사용"],
    ["요약 블록", "요약 / 이번 달 요약 / 통계 / 현황", "스킬 사용"],
    ["예산 블록", "남은예산 / 남은 예산 / 예산 확인 / 남은 돈 / 쓸 수 있는 돈 / 예산 사용률", "스킬 사용"],
    ["최근 기록 블록", "최근 / 최근 내역 / 오늘 기록 / 오늘 내역", "스킬 사용"],
    ["수정 블록", "수정가이드 / 번호수정 / 방금 수정 / 삭제 방법", "스킬 사용"],
    ["키워드 블록", "키워드 안내 / 분류 / 자동분류", "스킬 사용"],
    ["정기지출 블록", "정기지출 / 자동차세 / 재산세 / 자동차보험", "스킬 사용"],
    ["링크 블록", "링크 / 주소 / 가계부 시작 / 안전 링크", "스킬 사용"],
    ["초대 블록", "초대 / 초대코드 / 가계부 참여", "스킬 사용"],
    ["폴백 블록", "그 외 모든 말", "반드시 스킬 사용"],
  ].map(([block, utter, action]) => `<tr><td><b>${escapeHtml(block)}</b></td><td>${escapeHtml(utter)}</td><td>${escapeHtml(action)}</td></tr>`).join("");
  const tests = ["도움말", "입력 예시", "남은예산", "예산 확인", "요약", "오늘 기록", "수정가이드", "키워드 안내", "정기지출", "링크", "아무말", "점심 12000원 국민카드"].map((x) => `<span>${escapeHtml(x)}</span>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 오픈빌더 설정</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f8fafc,#eef2f7);color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff;border-radius:30px;padding:26px;margin:14px 0;box-shadow:0 22px 54px rgba(15,23,42,.18)}.hero h1{margin:0 0 10px;font-size:32px;letter-spacing:-.06em}.hero p{color:#e5e7eb;line-height:1.6}.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:18px;margin:12px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.skill{background:#111827;color:#fff;border-radius:18px;padding:15px;word-break:break-all;font-weight:1000}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:18px;padding:14px;line-height:1.6}.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:18px;padding:14px;line-height:1.6}table{width:100%;border-collapse:collapse;background:#fff;border-radius:18px;overflow:hidden}td,th{border-bottom:1px solid #e8edf4;padding:12px;text-align:left;vertical-align:top}th{background:#f8fafc}.chips{display:flex;gap:8px;flex-wrap:wrap}.chips span{display:inline-flex;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:8px 11px;font-weight:900;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:25px}.grid{grid-template-columns:1fr}table{font-size:13px}}</style></head><body><main class="wrap"><section class="hero"><h1>카카오 오픈빌더 설정가이드</h1><p>카카오톡에서 “이해하기 어려워요”가 나오면 대부분 코드 문제가 아니라 발화가 /skill로 전달되지 않는 상태입니다. 아래 블록과 폴백을 모두 스킬로 연결하세요.</p></section><section class="card"><h2>Skill URL</h2><div class="skill">${escapeHtml(skillUrl)}</div><p class="warn"><b>중요</b><br/>폴백 블록도 반드시 위 Skill URL로 연결해야 합니다. 폴백이 고정 문구로 남아 있으면 사용자는 계속 “이해하기 어려워요”를 보게 됩니다.</p></section><section class="card"><h2>권장 블록/발화</h2><table><thead><tr><th>블록</th><th>대표 발화</th><th>연결</th></tr></thead><tbody>${rows}</tbody></table></section><section class="grid"><div class="card"><h2>웰컴 버튼 안전 링크</h2><p>가계부 시작하기<br/><b>${origin}/my</b></p><p>시작가이드<br/><b>${origin}/start-guide</b></p><p>키워드 안내<br/><b>${origin}/keyword-guide</b></p><p>수정가이드<br/><b>${origin}/chatbot-edit-guide</b></p></div><div class="card"><h2>배포 후 테스트 발화</h2><div class="chips">${tests}</div></div></section><div class="ok"><b>운영 기준</b><br/>OpenBuilder의 모든 주요 블록과 폴백이 /skill로 연결되면 Worker가 입력 예시, 예산, 요약, 수정가이드 등으로 부드럽게 응답합니다.</div></main></body></html>`);
}

async function handleKakaoStabilityGuidePage(request, env, url) {
  const title = escapeHtml(appName(env));
  const rows = [
    ["도움말", "사용법, 시작, 메뉴, 처음, 웰컴"],
    ["입력 예시", "입력, 지출 입력, 예시, 어떻게 입력"],
    ["키워드", "키워드, 분류, 자동분류, 키워드 안내"],
    ["수정", "수정, 수정가이드, 번호수정, 방금 수정"],
    ["정기지출", "정기지출, 자동차세, 재산세, 자동차보험"],
    ["확인", "요약, 남은예산, 예산 확인, 최근, 오늘 기록, 링크"],
    ["오픈빌더", "오픈빌더, 블록 설정, 폴백, 스킬 연결, 발화 목록"],
  ].map(([a,b]) => `<tr><td>${escapeHtml(a)}</td><td>${escapeHtml(b)}</td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 카카오 안정화</title><style>body{margin:0;background:#f8fafc;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:980px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.muted{color:#667085;line-height:1.6}.hero .muted{color:#e5e7eb}table{width:100%;border-collapse:collapse;background:#fff;border-radius:18px;overflow:hidden}td,th{border-bottom:1px solid #e8edf4;padding:12px;text-align:left}.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:18px;padding:14px;line-height:1.6}</style></head><body><main class="wrap"><section class="hero"><h1>카카오 스킬 안정화</h1><p class="muted">스킬에서 서버 오류 팝업이 뜨지 않도록 모든 /skill 예외를 카카오 응답 형식으로 처리하고, 대표 발화를 넓혔습니다.</p></section><section class="card"><h2>확장 발화</h2><table><tbody>${rows}</tbody></table></section><div class="ok"><b>운영 원칙</b><br/>이해 불가/처리 불가 대신 입력 예시, 시작 링크, 키워드 안내, 수정가이드로 우회 안내합니다.</div></main></body></html>`);
}

async function handleWelcomeLinkGuidePage(request, env, url) {
  const title = escapeHtml(appName(env));
  const origin = publicBaseUrl(env, url);
  const welcomeText = [
    "안녕하세요 😊",
    "말해가계부예요.",
    "",
    "처음이라면 먼저 가계부를 새로 만들지,",
    "초대코드로 참여할지 선택해주세요.",
    "",
    "카톡에는 이렇게 입력하면 됩니다.",
    "",
    "점심 12000원 국민카드",
    "커피 5000원 현금",
    "월급 250만원",
    "요약",
    "",
    "키워드, 예산, 카드, 정기지출은",
    "시작가이드 순서대로 설정하면 됩니다.",
  ].join("\n");
  const safeLinks = [
    ["가계부 시작하기", `${origin}/my`, "생성/참여 선택"],
    ["시작가이드", `${origin}/start-guide`, "처음 사용 순서"],
    ["키워드 안내", `${origin}/keyword-guide`, "자동분류 단어 예시"],
    ["수정가이드", `${origin}/chatbot-edit-guide`, "01번 수정/삭제 방법"],
  ].map(([label, href, desc]) => `<div class="linkBox"><b>${escapeHtml(label)}</b><code>${escapeHtml(href)}</code><span>${escapeHtml(desc)}</span></div>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 웰컴링크</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 50%,#eef2f7);color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1040px;margin:0 auto;padding:18px}.hero{background:#fff;border:1px solid #e8edf4;border-radius:32px;padding:26px;margin:16px 0;box-shadow:0 22px 54px rgba(15,23,42,.09)}.badge{display:inline-flex;background:#FEE500;color:#191919;border-radius:999px;padding:7px 11px;font-weight:1000;font-size:13px}.hero h1{font-size:32px;letter-spacing:-.06em;margin:14px 0 10px}.muted{color:#667085;line-height:1.6}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{background:#fff;border:1px solid #e8edf4;border-radius:26px;padding:20px;box-shadow:0 14px 34px rgba(15,23,42,.055)}pre{white-space:pre-wrap;background:#111827;color:#f9fafb;border-radius:18px;padding:16px;line-height:1.6;font-family:inherit}.linkBox{background:#f8fafc;border:1px solid #e8edf4;border-radius:20px;padding:14px;margin:9px 0}.linkBox b{display:block}.linkBox code{display:block;background:#eef2ff;color:#3730a3;border-radius:12px;padding:9px;margin:8px 0;font-family:inherit;word-break:break-all}.linkBox span{display:block;color:#667085;font-size:13px}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:18px;padding:14px;line-height:1.6;margin:12px 0}@media(max-width:760px){.wrap{padding:12px}.grid{grid-template-columns:1fr}.hero h1{font-size:26px}}</style></head><body><main class="wrap"><section class="hero"><span class="badge">웰컴블록 안전 링크</span><h1>웰컴블록에는 관리자 링크를 넣지 마세요.</h1><p class="muted">아래 링크들은 일반 사용자가 눌러도 관리자 비밀번호 화면으로 가지 않는 공개/사용자용 링크입니다.</p></section><section class="grid"><div class="card"><h2>웰컴문구</h2><pre>${escapeHtml(welcomeText)}</pre></div><div class="card"><h2>버튼 링크</h2>${safeLinks}</div></section><div class="warn"><b>사용 금지</b><br/>웰컴블록에는 관리자/운영 화면 링크를 넣지 마세요. 대신 <code>/my</code>, <code>/start-guide</code>, <code>/keyword-guide</code>, <code>/chatbot-edit-guide</code>를 사용하세요.</div></main></body></html>`);
}
