// V22.9.118 — 화면 결함 묶음(ui): 다크 대비·휴대폰 단추 겹침·같은 이름 가계부 구분·입력칸 16px·라벨과 문구.
//
// ── 이 파일이 왜 생겼는지 ──
// 2026-11-12 전체 점검(화면 감사 + 운영 측정)에서 나온 화면 결함을 사용자가 고치기로 했다. 이 검사는 고친 화면을 오프라인 픽스처로 그려
// 항목마다 옛 코드에서는 실패하고 고친 코드에서는 통과하는 단언을 둔다(U-13 의 장식 글자 aria-hidden 은 V22.9.32 부터 있어 옛 코드도 통과).
//   U-1  다크 모드 대비: 가계부 전환(선택 카드·초대코드), 단톡방 연결(명령 글자·연결 목록), 참여자(초대 키), 설정 전(상태 띠), 결제수단(종류 칩),
//        빠른 입력 도움말(안내 상자). 밝은 모드 값은 그대로(인라인 값은 같은 색을 기본값으로 둔 변수).
//   U-2  /meeting-households 휴대폰 폭에서 ‘정산’·‘기록’ 단추가 겹침 → 두 단추를 줄바꿈되는 한 줄로 묶는다.
//   U-3  같은 이름 가계부가 둘 이상이면 선택기 글자에 ‘ · 만든 날(M/D, 한국 시간)’, 같은 날이면 ‘ ②’… 를 붙인다. 이름이 하나뿐이면 글자 그대로.
//   U-4  /reserve-plans ‘매월 반복’ 체크(is_recurring)는 카드 표시에만 쓰이고 반복주기 ‘매월’과 같은 뜻 → 체크 칸만 화면에서 숨긴다(보내는 값 그대로).
//   U-5  정산 공유 문구에서 ‘초대/참여 문구’(초대코드) 줄을 뺀다.
//   U-6  좁은 화면(700px 이하)의 글자 입력칸·select·textarea 를 16px 로(iOS 확대 방지). 휴대폰 홈(35 KiB 예산)·소비 분석(R3)은 뺀다.
//   U-9  /my/backup ‘연도 없는 날짜의 기준’ 선택지를 짧게, 183일 규칙은 설명 글로.
//   U-10 /menu ‘백업·복구’ 보조 문구를 실제(CSV 내려받기, CSV·엑셀 가져오기)로.
//   U-12 /goals 목표 추가 폼의 이모지·마감월 칸에 항상 보이는 이름.
//   U-13 정산 방식 select 이름, 결제수단 장식 글자 aria-hidden.
//   U-14 /meeting-households 만들기 단추 글자를 다음 화면(이름만 묻는다)과 맞춘다.
//   U-18 홈 ‘지난달/다음 달 보는 중’ 은 바로 앞·뒤 달에만, 그 밖에는 ‘N월 보는 중’(해가 다르면 ‘YYYY년 N월 보는 중’).
// 실제 글자 크기·겹침·대비는 헤드리스 Chrome 화면 감사로 따로 쟀다(review-artifacts/v118-v119-improvements-2026-11-12/scratch/ui/).
// 독립 검토 후속(2026-11-12): U-3 을 내비 가계부 이름(사이드바·휴대폰 위 띠·숨은 제목)·두 표·/households 카드로 넓히고, 연속 공백·PostgREST 시각 꼴을
// 단언한다. U-4 는 수정 폼의 숨긴 값이 저장 뒤 그대로인지 실제 저장 경로로, U-5 는 공유 문구 내용으로, U-6 은 빠른 입력칸 없는 홈(거래 탭·조회 전용)과
// 35 KiB 예산으로 본다.
// 재검토 후속(2026-11-12): U-3 시각 꼴 장면에 판별력(한국 자정 경계·같은 순간의 두 꼴·소속 행 시각을 다른 날·역순으로)을 주고, 같은 이름 묶음에
// 만든 해가 둘 이상이면 날짜에 해를 붙이는지(‘25/11/8’) 장면 하나로 본다.
//
// ── 실행 ──
//   node validation/validate-ui-fixes-v229118.mjs
//   V229118_UI_SOFT=1 은 옛 번들에 이 검사를 돌려 실패 수를 셀 때만 쓴다(실패를 모아 끝에 센다).
import { counter, fixture, page, post, settingValue, withClock } from "./lib-audit-v22934.mjs";

const t = counter("PASS: V22.9.118 ui fixes");
const SOFT = process.env.V229118_UI_SOFT === "1";
const softFailures = [];
const ok = (value, message) => { if (SOFT && !value) { softFailures.push(message); return; } t.ok(!!value, message); };
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const H = "household_id=house-home";
const DARK = 'html[data-ab-resolved-theme="dark"]';
const headOf = (html) => html.slice(0, Math.max(0, html.indexOf("</head>")));

async function scene(name, task) {
  try { await task(); } catch (error) { if (!SOFT) throw error; softFailures.push(`${name}: ${error && error.message}`); }
}

// ── U-1 다크 대비 ──
await scene("U-1", () => fixture(async (fx) => {
  const households = (await page(fx, "/my/households")).html;
  ok(households.includes("background:var(--abHhActiveBg,#f0fdfa)!important;border-color:var(--abHhActiveLine,#0f766e)!important"), "U-1a 선택한 가계부 카드는 밝은 모드 값(#f0fdfa·#0f766e)을 기본값으로 둔 변수로 칠한다");
  ok(households.includes(`${DARK} .hhCard.active{--abHhActiveBg:var(--ab12-accent-soft,#1d2c42);--abHhActiveLine:var(--ab12-accent,#93c5fd)}`), "U-1a 다크에서 선택 카드 바탕·테두리 변수를 다크 값으로 바꾼다");
  ok(households.includes(`${DARK} :is(.inviteFold code b,.inviteCode b){`), "U-1a 다크에서 초대코드 글자 상자를 다크 바탕·노랑 글자로");
  const groups = (await page(fx, `/my/groups?${H}`)).html;
  ok(groups.includes(`${DARK} .cmd b{`) && groups.includes(`${DARK} .linkList li{`), "U-1b 단톡방 연결의 명령 글자·연결 목록에 다크 규칙");
  const members = (await page(fx, `/my/members?${H}`)).html;
  ok(members.includes(`${DARK} .inviteBox .inviteKey{`), "U-1c 참여자 화면 초대 키에 다크 규칙");
  const setup = (await page(fx, `/my/setup?${H}`)).html;
  ok(setup.includes(`${DARK} .setupState{`) && setup.includes(`${DARK} .setupState.isDone{`), "U-1d 설정 전 상태 띠(할 일·끝)에 다크 규칙");
  const payment = (await page(fx, `/payment-methods?${H}`)).html;
  ok(payment.includes(`${DARK} body.abV22812Shell .kindChips .kindChip input:checked+span{`), "U-1e 결제수단 종류 칩의 선택 표시에 다크 규칙(셸의 !important 를 이기는 특이도)");
  const help = (await page(fx, `/quick-input-help?${H}`)).html;
  ok(help.includes(`${DARK} body .notice{`), "U-1f 빠른 입력 도움말 안내 상자에 다크 규칙");
}));

// ── U-2·U-14 /meeting-households ──
await scene("U-2", () => fixture(async (fx) => {
  const meeting = await page(fx, `/meeting-households?${H}`);
  eq(meeting.status, 200, "U-2 모임 가계부 화면이 열린다");
  ok(/<span class="miniRow"><a class="mini" [^>]*>정산<\/a><a class="mini light" [^>]*>기록<\/a><\/span>/.test(meeting.html), "U-2 ‘정산’·‘기록’ 단추를 한 줄 묶음(miniRow)에 넣는다");
  ok(meeting.html.includes(".miniRow{display:inline-flex;flex-wrap:wrap;gap:6px 4px}"), "U-2 묶음은 좁으면 줄바꿈하고 단추 사이를 띄운다(겹치지 않음)");
  ok(meeting.html.includes(">이름 확인 후 만들기<") && !meeting.html.includes("이름·비밀번호 확인 후 만들기"), "U-14 만들기 단추 글자를 다음 화면(이름만 묻는다)에 맞춘다");
}));

// ── U-3 같은 이름 가계부 구분 ──
const DUP_PAGES = [
  `/app?month=2026-07&${H}`,
  `/budgets?month=2026-07&${H}`,
  `/reserve-plans?${H}`,
  `/payment-methods?${H}`,
  `/goals?${H}`,
  `/my/settings?${H}`,
  `/my/members?${H}`,
  `/my/backup?${H}`,
  `/settlement-summary?month=2026-07&${H}`,
  `/keyword-guide?${H}`,
  `/menu?${H}`,
];
function householdOptions(html) {
  const found = [];
  for (const match of html.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)) {
    const attrs = match[1];
    const value = attrs.match(/\bvalue="([^"]*)"/)?.[1] || "";
    if (!value.startsWith("house-")) continue;
    // 일부 선택기는 이름 뒤에 내 역할(‘ · 소유자’ 등)을 붙인다(전부터). 구분 글자는 이름 바로 뒤에 붙으므로 역할 꼬리를 떼고 비교한다.
    found.push({ value, text: match[2].replace(/ · (?:소유자|관리자|구성원|조회 전용|읽기 전용|보기 전용)$/, ""), dataName: attrs.match(/\bdata-household-name="([^"]*)"/)?.[1] ?? null, selected: /\bselected\b/.test(attrs) });
  }
  return found;
}
await scene("U-3 unique", () => fixture(async (fx) => {
  for (const path of DUP_PAGES) {
    const options = householdOptions((await page(fx, path)).html);
    const home = options.filter((row) => row.value === "house-home");
    ok(home.length > 0, `U-3 ${path} 가계부 선택기가 있다`);
    ok(home.every((row) => row.text === "우리집 생활비" && (row.dataName === null || row.dataName === "우리집 생활비")), `U-3 ${path} 이름이 하나뿐이면 글자를 그대로 둔다`);
  }
}));
await scene("U-3 duplicate", () => fixture(async (fx) => {
  // 같은 이름 둘을 더한다. dupb 는 UTC 로는 11/7 이지만 한국 시간 11/8 05:00 이라 같은 날(11/8)이고 dupa(11/8 10:00)보다 먼저다.
  fx.db.households.push(
    { id: "house-dupa", name: "우리집 생활비", invite_code: "DUPA2265", created_at: "2026-11-08T01:00:00.000Z" },
    { id: "house-dupb", name: "우리집 생활비", invite_code: "DUPB2265", created_at: "2026-11-07T20:00:00.000Z" },
  );
  fx.db.household_members.push(
    { household_id: "house-dupa", user_id: "user-bin", role: "owner", created_at: "2026-11-08T01:00:00.000Z" },
    { household_id: "house-dupb", user_id: "user-bin", role: "owner", created_at: "2026-11-07T20:00:00.000Z" },
  );
  const expected = { "house-home": "우리집 생활비 · 7/1", "house-dupb": "우리집 생활비 · 11/8", "house-dupa": "우리집 생활비 · 11/8 ②", "house-trip": "7월 제주여행" };
  for (const path of DUP_PAGES) {
    const options = householdOptions((await page(fx, path)).html);
    const byValue = new Map();
    for (const row of options) { if (!byValue.has(row.value)) byValue.set(row.value, []); byValue.get(row.value).push(row); }
    for (const [value, label] of Object.entries(expected)) {
      const rows = byValue.get(value) || [];
      ok(rows.length > 0 && rows.every((row) => row.text === label), `U-3 ${path} ${value} 선택지 글자 ${JSON.stringify(label)} (실제 ${JSON.stringify(rows.map((row) => row.text))})`);
      ok(rows.every((row) => row.dataName === null || row.dataName === label), `U-3 ${path} ${value} 시트·머리글이 읽는 data-household-name 도 같은 글자`);
    }
    ok(options.every((row) => row.value in expected), `U-3 ${path} 선택지 값은 가계부 id 그대로`);
    const selectedValues = [...new Set(options.filter((row) => row.selected).map((row) => row.value))];
    ok(selectedValues.length === 1 && selectedValues[0] === "house-home", `U-3 ${path} 고른 가계부(house-home)가 그대로 선택돼 있다 (실제 ${JSON.stringify(selectedValues)})`);
  }
  // 독립 검토 P2: 데스크톱 머리줄·사이드바·화면 제목(내비 가계부 이름, 휴대폰 위 띠, 숨은 제목)도 같은 구분 글자를 쓴다. 거래 탭도 같다.
  const DESKTOP = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36" };
  const plainNames = (html) => [...html.matchAll(/우리집 생활비(?! · \d)/g)].length;
  const navBrand = '<span class="abNavBrandText" title="우리집 생활비 · 7/1">우리집 생활비 · 7/1<small>';
  for (const path of [`/app?month=2026-07&${H}`, `/app?month=2026-07&${H}&tab=transactions`]) {
    const html = (await page(fx, path, { headers: DESKTOP })).html;
    eq(plainNames(html), 0, `U-3 ${path} 데스크톱: 구분 글자 없이 나오는 같은 이름이 없다`);
    ok(html.includes(navBrand), `U-3 ${path} 사이드바 가계부 이름에 구분 글자`);
  }
  // 내비 이름은 화면마다 renderUnifiedNav 호출에서 넘긴다(21곳). /home-layout 은 첫 수정에서 블록 밖 변수를 써 500 이 났던 곳이라 함께 본다.
  for (const path of [`/reports?month=2026-07&${H}`, `/smart-tools?${H}`, `/budgets?month=2026-07&${H}`, `/goals?${H}`, `/reserve-plans?${H}`, `/payment-methods?${H}`, `/home-layout?${H}`, `/annual?${H}`, `/budget-alerts?month=2026-07&${H}`, `/households?${H}`, `/keyword-guide?${H}`, `/menu?${H}`, `/settlement-summary?month=2026-07&${H}`, `/my/households?${H}`]) {
    const res = await page(fx, path, { headers: DESKTOP });
    ok(res.status === 200 && res.html.includes(navBrand), `U-3 ${path} 화면이 열리고 내비 가계부 이름에 구분 글자 (${res.status})`);
  }
  // `/households`(가계부·참여자) 의 가계부 카드는 가계부를 고르는 링크인데 이름 말고는 구분할 글자가 없다 → 같은 이름표.
  const householdCards = [...(await page(fx, `/households?${H}`)).html.matchAll(/<a class="hhCard[^"]*" href="[^"]*household_id=([^"&]+)"><b>([^<]*)<\/b>/g)].map((m) => `${m[1]}=${m[2]}`);
  ok(["house-home=우리집 생활비 · 7/1", "house-dupb=우리집 생활비 · 11/8", "house-dupa=우리집 생활비 · 11/8 ②", "house-trip=7월 제주여행"].every((card) => householdCards.includes(card)), `U-3 /households 가계부 카드 이름도 구분 (실제 ${JSON.stringify(householdCards)})`);
  // 독립 검토 P3: /meeting-households ‘내가 참여한 가계부’ 표와 가계부 만들기·참여 안내 표의 가계부 줄.
  for (const path of [`/meeting-households?${H}`, "/household-create-join"]) {
    const rows = [...(await page(fx, path)).html.matchAll(/<tr><td>([^<]*)<\/td>/g)].map((m) => m[1]);
    ok(["우리집 생활비 · 7/1", "우리집 생활비 · 11/8", "우리집 생활비 · 11/8 ②", "7월 제주여행"].every((label) => rows.includes(label)), `U-3 ${path} 표의 가계부 줄도 구분 (실제 ${JSON.stringify(rows)})`);
  }
}));
await scene("U-3 formats", () => fixture(async (fx) => {
  // 독립 검토 P3: 연속 공백만 다른 이름도 같은 이름으로 묶고(보이는 글자는 각자 그대로), PostgREST 시각 꼴(‘+00’·빈칸·오프셋 없음·‘+09:00’)을
  // 한국 날짜로 읽는다(오프셋이 없으면 UTC). 만든 순서도 읽은 시각으로 센다.
  // 재검토 P3(판별력): 오프셋 없는 꼴은 한국 자정 경계 양쪽(UTC 14:59:59 → 11/7 23:59:59, 15:00:00 → 11/8 00:00)에 두고, ‘+00’ 꼴과 ‘+09:00’ 꼴은
  // 같은 순간(한국 11/7 23:30)에 둔다 — ‘+09:00’ 을 UTC 로 잘못 읽으면 11/8, 오프셋 없는 꼴을 한국 시각으로 잘못 읽으면 15:00:00 도 11/7 이 된다.
  // 소속 행(household_members)의 시각은 가계부를 만든 시각과 다른 날(한국 12/1)·역순(늦게 만든 가계부일수록 먼저 참여)이라, 이름표가 소속 시각을
  // 쓰면 날짜(12/1)와 순번이 모두 달라진다.
  fx.db.households.find((row) => row.id === "house-home").name = "이 방의 공동 가계부";
  fx.db.households.push(
    { id: "house-fa", name: "이 방의  공동 가계부", invite_code: "FA2265", created_at: "2026-11-07 14:30:00+00" },
    { id: "house-fb", name: "이 방의 공동 가계부", invite_code: "FB2265", created_at: "2026-11-07T23:30:00+09:00" },
    { id: "house-fc", name: "이 방의 공동 가계부", invite_code: "FC2265", created_at: "2026-11-07T14:59:59" },
    { id: "house-fd", name: "이 방의 공동 가계부", invite_code: "FD2265", created_at: "2026-11-07T15:00:00" },
  );
  const joinedAt = { "house-fa": "2026-12-01T04:00:00.000Z", "house-fb": "2026-12-01T03:00:00.000Z", "house-fc": "2026-12-01T02:00:00.000Z", "house-fd": "2026-12-01T01:00:00.000Z" };
  for (const [id, at] of Object.entries(joinedAt)) fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner", created_at: at });
  const options = householdOptions((await page(fx, `/budgets?month=2026-07&${H}`)).html);
  const text = (id) => options.find((row) => row.value === id)?.text;
  eq(text("house-home"), "이 방의 공동 가계부 · 7/1", "U-3 같은 이름 다섯 가운데 가장 먼저 만든 것");
  eq(text("house-fa"), "이 방의  공동 가계부 · 11/7", "U-3 공백 두 칸 이름도 같은 이름으로 묶고 글자는 그대로, ‘+00’ 빈칸 꼴 14:30 은 한국 11/7 23:30");
  eq(text("house-fb"), "이 방의 공동 가계부 · 11/7 ②", "U-3 ‘+09:00’ 꼴 23:30 은 ‘+00’ 14:30 과 같은 순간이라 같은 한국 11/7(시각이 같으면 id 순으로 둘째)");
  eq(text("house-fc"), "이 방의 공동 가계부 · 11/7 ③", "U-3 오프셋 없는 14:59:59 는 UTC 로 보고 한국 11/7 23:59:59(같은 날 셋째)");
  eq(text("house-fd"), "이 방의 공동 가계부 · 11/8", "U-3 오프셋 없는 15:00:00 은 UTC 로 보고 한국 11/8 00:00(자정 경계 다음 날)");
  ok(options.length > 0 && !options.some((row) => row.text.includes("12/1")), `U-3 이름표는 소속 행 시각(한국 12/1)을 쓰지 않는다 (실제 ${JSON.stringify(options.map((row) => row.text))})`);
}));
await scene("U-3 years", () => fixture(async (fx) => {
  // 재검토 P3: 같은 이름 묶음 안에 만든 해(한국 날짜)가 둘 이상이면 날짜에 해 두 자리를 붙이고(‘25/11/8’), 순번은 해까지 같은 날끼리만 센다.
  // 해는 묶음마다 따로 본다 — 해가 하나뿐인 다른 묶음(우리집 생활비)은 지금 글자 그대로다. 해도 한국 날짜로 센다(UTC 2025-12-31 15:00 = 한국 2026-01-01).
  fx.db.households.push(
    { id: "house-ya", name: "동창 모임", invite_code: "YA2265", created_at: "2026-11-08T01:00:00.000Z" },
    { id: "house-yb", name: "동창 모임", invite_code: "YB2265", created_at: "2025-11-08T01:00:00.000Z" },
    { id: "house-yc", name: "동창 모임", invite_code: "YC2265", created_at: "2026-11-08 02:00:00+00" },
    { id: "house-yd", name: "동창 모임", invite_code: "YD2265", created_at: "2025-12-31T15:00:00Z" },
    { id: "house-hb", name: "우리집 생활비", invite_code: "HB2265", created_at: "2026-08-15T03:00:00.000Z" },
  );
  for (const [index, id] of ["house-ya", "house-yb", "house-yc", "house-yd", "house-hb"].entries()) fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner", created_at: `2026-12-0${index + 1}T00:00:00.000Z` });
  const expected = {
    "house-yb": "동창 모임 · 25/11/8",
    "house-yd": "동창 모임 · 26/1/1",
    "house-ya": "동창 모임 · 26/11/8",
    "house-yc": "동창 모임 · 26/11/8 ②",
    "house-home": "우리집 생활비 · 7/1",
    "house-hb": "우리집 생활비 · 8/15",
    "house-trip": "7월 제주여행",
  };
  for (const path of [`/budgets?month=2026-07&${H}`, `/app?month=2026-07&${H}`]) {
    const options = householdOptions((await page(fx, path)).html);
    for (const [id, label] of Object.entries(expected)) {
      const rows = options.filter((row) => row.value === id);
      ok(rows.length > 0 && rows.every((row) => row.text === label), `U-3 ${path} ${id} 선택지 글자 ${JSON.stringify(label)} (실제 ${JSON.stringify(rows.map((row) => row.text))})`);
    }
  }
}));

// ── U-4 정기 일정 ‘매월 반복’ ──
await scene("U-4", () => fixture(async (fx) => {
  const reserve = (await page(fx, `/reserve-plans?${H}`)).html;
  ok(reserve.includes(".reserveRepeat{display:none!important}") && !reserve.includes(".reserveRepeat{flex-direction:row!important"), "U-4 반복주기 ‘매월’과 같은 뜻인 ‘매월 반복’ 체크 칸은 화면에서 숨긴다");
  ok(reserve.includes('<label class="reserveRepeat"><input type="checkbox" name="is_recurring" value="1"/><span>매월 반복</span></label>'), "U-4 추가 폼은 체크 칸을 그대로 두어 보내는 값(꺼짐)이 전과 같다");
  ok(/<select name="recurrence" class="jsRecurrence">/.test(reserve), "U-4 반복주기 선택은 그대로 보인다");
  // 독립 검토 P3 확인(실행): 수정 폼의 숨긴 체크 칸도 브라우저는 보이던 때와 같이 보낸다(체크돼 있으면 is_recurring=1, 아니면 안 보냄).
  // 켜 둔 값은 켜진 채, 꺼 둔 값은 꺼진 채 저장되는지 실제 수정 저장 경로로 본다.
  const key = "reserve_plans:house-home";
  fx.db.accountbook_settings.find((row) => row.key === key).value = JSON.stringify([
    { id: "reserve-on", name: "연 1회 켜 둔 일정", amount: 1200000, due_months: [8], recurrence: "annual", is_recurring: true },
    { id: "reserve-off", name: "매월 꺼 둔 일정", amount: 50000, recurrence: "monthly", is_recurring: false },
  ]);
  const editPage = (await page(fx, `/reserve-plans?${H}`)).html;
  const editForms = [...editPage.matchAll(/<form class="formGrid reserveEditForm"[\s\S]*?<\/form>/g)].map((m) => m[0]);
  for (const id of ["reserve-on", "reserve-off"]) {
    const form = editForms.find((html) => html.includes(`name="id" value="${id}"`)) || "";
    ok(form.includes('<label class="reserveRepeat"><input type="checkbox" name="is_recurring" value="1"'), `U-4 ${id} 수정 폼에도 숨긴 체크 칸이 있다`);
    // 이름만 바꿔 저장한다 — 저장이 실제로 일어났는지(이름이 바뀜)와 숨긴 칸 값이 그대로인지를 함께 본다.
    const fields = browserFields(form);
    fields.set("name", `${fields.get("name")} 수정`);
    const res = await post(fx, "/admin/reserve-plan/update", fields);
    ok([302, 303].includes(res.status) && /msg=reserve_updated/.test(res.location), `U-4 ${id} 수정 저장이 처리된다 (${res.status} ${res.decoded})`);
  }
  const raw = settingValue(fx, key);
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const saved = Array.isArray(parsed) ? parsed : (parsed?.items || []);
  const plan = (id) => saved.find((row) => row.id === id) || {};
  ok(plan("reserve-on").name === "연 1회 켜 둔 일정 수정" && plan("reserve-off").name === "매월 꺼 둔 일정 수정", `U-4 두 일정 모두 수정 저장됐다 (실제 ${JSON.stringify(saved.map((row) => row.name))})`);
  eq(plan("reserve-on").is_recurring, true, "U-4 수정 저장 뒤에도 켜 둔 ‘매월 반복’ 값은 켜진 채");
  eq(plan("reserve-off").is_recurring, false, "U-4 수정 저장 뒤에도 꺼 둔 값은 꺼진 채");
  eq(plan("reserve-on").recurrence, "annual", "U-4 반복주기(연 1회)도 그대로");
  eq(plan("reserve-off").recurrence, "monthly", "U-4 반복주기(매월)도 그대로");
}));
// 브라우저가 폼을 보내는 대로 값을 모은다(체크박스·라디오는 체크된 것만, CSS 로 숨긴 칸도 그대로 보낸다).
function browserFields(form) {
  const fields = new URLSearchParams();
  const decode = (value) => value.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  for (const m of form.matchAll(/<input\b([^>]*)>/g)) {
    const tag = m[1];
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    if (!name || /\bdisabled\b/.test(tag)) continue;
    const type = (tag.match(/\btype="([^"]+)"/)?.[1] || "text").toLowerCase();
    if ((type === "checkbox" || type === "radio") && !/\bchecked\b/.test(tag)) continue;
    if (["submit", "button", "reset", "image", "file"].includes(type)) continue;
    fields.append(name, decode(tag.match(/\bvalue="([^"]*)"/)?.[1] ?? (type === "checkbox" ? "on" : "")));
  }
  for (const m of form.matchAll(/<select\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const selected = m[2].match(/<option\b[^>]*value="([^"]*)"[^>]*\bselected\b/)?.[1] ?? m[2].match(/<option\b[^>]*value="([^"]*)"/)?.[1] ?? "";
    fields.append(m[1], decode(selected));
  }
  for (const m of form.matchAll(/<textarea\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) fields.append(m[1], decode(m[2]));
  return fields;
}

// ── U-5·U-13 정산 화면 ──
await scene("U-5", () => fixture(async (fx) => {
  const settlement = (await page(fx, `/settlement-summary?month=2026-07&${H}`)).html;
  const copyStart = settlement.indexOf('id="settlementCopy"');
  ok(copyStart > 0, "U-5 정산 공유 문구 상자가 있다");
  // 독립 검토 P3: 길이 단언은 늘 참이었다 — 공유 문구 상자(div) 한 칸만 잘라 실제 내용(제목·총 지출·참여자·송금 줄)이 남고 초대 줄이 없는지 본다.
  const copyBlock = settlement.slice(copyStart, settlement.indexOf("</div>", copyStart));
  ok(!settlement.includes("초대/참여 문구"), "U-5 공유 문구에 초대코드(‘초대/참여 문구’) 줄이 없다");
  ok(copyBlock.includes("우리집 생활비 2026-07 정산") && copyBlock.includes("총 지출: 248,600원") && copyBlock.includes("참여자: 2명"), "U-5 공유 문구에 제목·총 지출·참여자 줄이 남아 있다");
  ok(copyBlock.endsWith("<br/>Bin → WIFI♥ 23,700원"), `U-5 공유 문구 끝은 송금 줄이다(초대 줄 없이) (끝 ${JSON.stringify(copyBlock.slice(-60))})`);
  ok(!/초대|참여 문구|HOME2265/.test(copyBlock), "U-5 공유 문구 상자에 초대코드·초대 문구가 없다");
  ok(settlement.includes('<select name="mode" aria-label="정산 방식">'), "U-13 정산 방식 select 에 이름(정산 방식)");
  const payment = (await page(fx, `/payment-methods?${H}`)).html;
  ok(payment.includes('<i aria-hidden="true">'), "U-13 결제수단 장식 첫 글자는 화면 읽기에서 뺀다(V22.9.32 부터 있음)");
}));

// ── U-6 입력칸 16px ──
const ZOOM_RULE = '<style id="abInputZoomStyle">@media (max-width:700px){input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image]):not([type=color]),select,textarea{font-size:16px!important}}</style>';
await scene("U-6", () => fixture(async (fx) => {
  // `/households`(셸 밖 가계부 관리 화면)도 넣는다(독립 검토 확인 요청 — 390 폭 화면 감사에서 입력칸 6개 모두 16px).
  for (const path of [`/budgets?month=2026-07&${H}`, `/reserve-plans?${H}`, "/my/households", `/households?${H}`, `/payment-methods?${H}`, `/menu?${H}`, `/my/settings?${H}`, `/my/members?${H}`, `/goals?${H}`, `/my/backup?${H}`, `/my/groups?${H}`, `/my/setup?${H}`, `/settlement-summary?month=2026-07&${H}`]) {
    const res = await page(fx, path);
    const html = res.html;
    eq(res.status, 200, `U-6 ${path} 화면이 열린다`);
    ok(headOf(html).includes(ZOOM_RULE), `U-6 ${path} 머리말에 좁은 화면 입력칸 16px 규칙 하나`);
    ok(html.split('id="abInputZoomStyle"').length === 2, `U-6 ${path} 규칙은 한 번만`);
    const viewport = html.match(/<meta name="viewport" content="([^"]*)"/)?.[1] || "";
    ok(viewport && !/maximum-scale|user-scalable/.test(viewport), `U-6 ${path} 뷰포트 배율은 막지 않는다(확대 접근성)`);
  }
  const home = (await page(fx, `/app?month=2026-07&${H}`)).html;
  ok(home.includes('id="smartInput"') && !home.includes("abInputZoomStyle"), "U-6 휴대폰 홈(35 KiB 예산)에는 붙이지 않는다");
  const analysis = (await page(fx, `/my/analysis?month=2026-07&${H}`)).html;
  ok(analysis.length > 1000 && !analysis.includes("abInputZoomStyle"), "U-6 소비 분석(R3 보호 화면)에는 붙이지 않는다");
  // 독립 검토 P2: 홈 판정은 빠른 입력칸 유무가 아니라 홈 응답 표식으로 한다 — 빠른 입력칸이 없는 거래 탭·조회 전용 홈에도 붙지 않고 35 KiB 예산 안이다.
  const IPHONE = { "user-agent": "Mozilla/5.0 (iPhone)" };
  const txTab = await page(fx, `/app?${H}&tab=transactions`, { headers: IPHONE });
  ok(txTab.status === 200 && !txTab.html.includes('id="smartInput"') && !txTab.html.includes("abInputZoomStyle"), "U-6 거래 탭 홈(빠른 입력칸 없음)에도 규칙이 없다");
  ok(Buffer.byteLength(txTab.html) < 35 * 1024, `U-6 거래 탭 홈 HTML 35 KiB 예산 안 (${Buffer.byteLength(txTab.html)} B)`);
  const homeIphone = await page(fx, `/app?${H}`, { headers: IPHONE });
  ok(Buffer.byteLength(homeIphone.html) < 35 * 1024 && !homeIphone.html.includes("abInputZoomStyle"), `U-6 홈 HTML 35 KiB 예산 안·규칙 없음 (${Buffer.byteLength(homeIphone.html)} B)`);
  fx.db.household_members.find((row) => row.household_id === "house-home" && row.user_id === "user-bin").role = "viewer";
  const viewerHome = await page(fx, `/app?${H}`, { headers: IPHONE });
  ok(viewerHome.status === 200 && !viewerHome.html.includes('id="smartInput"') && !viewerHome.html.includes("abInputZoomStyle"), "U-6 조회 전용 홈(빠른 입력칸 없음)에도 규칙이 없다");
  ok(Buffer.byteLength(viewerHome.html) < 35 * 1024, `U-6 조회 전용 홈 HTML 35 KiB 예산 안 (${Buffer.byteLength(viewerHome.html)} B)`);
}));

// ── U-9·U-10·U-12 글자·라벨 ──
await scene("U-9", () => fixture(async (fx) => {
  const backup = (await page(fx, `/my/backup?${H}`)).html;
  ok(backup.includes('<option value="default" selected>현재 기준일</option>') || backup.includes('<option value="default">현재 기준일</option>'), "U-9 기본 기준 선택지는 짧게(현재 기준일)");
  ok(/<option value="selected"[^>]*>선택한 \d{4}년<\/option>/.test(backup), "U-9 선택 연도 선택지도 짧게(선택한 YYYY년)");
  ok(backup.includes("기준일보다 183일 넘게 뒤가 되면") && backup.includes("미래 날짜도 그 해로 둡니다"), "U-9 183일 규칙과 선택 연도 규칙은 아래 설명 글에 둔다");
  ok(!backup.includes("183일 넘는 연말 날짜는 전년으로 보정</option>"), "U-9 긴 규칙을 선택지 글자에서 뺐다");
  const menu = (await page(fx, `/menu?${H}`)).html;
  ok(menu.includes("CSV 내려받기, CSV·엑셀 가져오기") && !menu.includes("CSV·JSON으로 보관"), "U-10 백업·복구 보조 문구는 실제 기능(CSV 내려받기, CSV·엑셀 가져오기)");
  const goals = (await page(fx, `/goals?${H}`)).html;
  ok(goals.includes('<label class="goalField goalFieldEmoji"><span>이모지</span><input name="emoji" value="🎯" maxlength="4"/></label>'), "U-12 이모지 칸에 항상 보이는 이름");
  ok(goals.includes('<label class="goalField goalFieldDeadline"><span>마감월(선택)</span><input name="deadline" type="month"/></label>'), "U-12 마감월 칸에 항상 보이는 이름(선택 칸)");
  ok(goals.includes(".goalForm .goalField input{flex:none;width:100%}") && goals.includes(".goalForm{align-items:flex-end}"), "U-12 이름을 붙인 칸도 다른 칸과 아래끝을 맞춘다");
  ok(goals.includes(".goalField>span{font-size:12px;font-weight:800}") && !/\.goalField\{[^}]*font-size/.test(goals), "U-12 작은 글자는 이름 글자(span)에만 — 입력칸은 font:inherit 로 폼 글자 크기를 그대로 받는다");
}));

// ── U-18 홈 달 표시 ──
await scene("U-18", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const badge = async (month) => (await page(fx, `/app?month=${month}&${H}`)).html.match(/<span class="appMonthAwayBadge">([^<]*)<\/span>/)?.[1] ?? null;
  eq(await badge("2026-06"), "지난달 보는 중", "U-18 바로 앞 달은 ‘지난달 보는 중’");
  eq(await badge("2026-08"), "다음 달 보는 중", "U-18 바로 뒤 달은 ‘다음 달 보는 중’");
  eq(await badge("2026-05"), "5월 보는 중", "U-18 두 달 전은 달 이름");
  eq(await badge("2026-09"), "9월 보는 중", "U-18 두 달 뒤도 달 이름");
  eq(await badge("2025-12"), "2025년 12월 보는 중", "U-18 해가 다르면 해까지");
  eq(await badge("2026-07"), null, "U-18 이번 달에는 띠가 없다");
})));

if (SOFT) {
  console.log(`SOFT: ${softFailures.length} failures`);
  for (const message of softFailures) console.log(`  - ${message}`);
} else {
  t.done();
}
