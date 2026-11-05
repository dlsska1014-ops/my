// V22.9.102 UI 수정(사용자 2026-11-05 의견 6건 + Codex 검토 3건) 검사.
//  1. 홈·기록 탭 필터: 낱말마다 맞춤(모두 맞아야 함)·금액 숫자·지출자 이름, ‘필터’ 말, 홈의 빠른 검색 칸 제거(기록 탭은 유지)
//  2. 내 계정·보안: 본인 확인(1) → 로그인 이름·비밀번호(2) 순서, 카카오 연결 칸 세 갈래, 오류 코드 → 사람 말
//  3. 가계부 기본 설정: 판정(householdSetupStatus)·띠(홈 DB 읽기 0회, 다른 화면은 쿠키만)·/my/setup 화면·이름·내 이름 저장·쿠키 정리
//  4. 초대코드 글꼴: 참여자 관리·가계부 관리의 초대 문구 표기
//  5. 단톡방 연결 목록: ‘그룹키·연결자’ 대신 방 구분 번호·연결한 사람(참여자 이름) 설명
//  6. 정기 항목: 이번 달 같은 금액·내용의 기록이 다른 참여자 것이면 ‘반영됨’으로 치지 않는다(Codex P2)
//  7. 관제 1.7.0: /ready 30분 간격 재사용(실패 뒤 1시간은 5분마다), 판·화면·문서
import { readFileSync } from "node:fs";
import { app, BASE, ctx, counter, fixture, page, post, putSetting, withClock } from "./lib-audit-v22934.mjs";
import { collectUptime } from "../monitoring/worker.mjs";
import { MONITOR_VERSION } from "../monitoring/model.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { ok, eq, done } = counter("V22.9.102 UI 수정(필터·보안 화면·기본 설정 띠·초대코드·단톡방 목록·정기 지출자·관제 1.7.0) 검사 통과");
const visible = (html) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
const cards = (html) => html.split('<article class="v8-tx"').length - 1;
const H = "household_id=house-home";
const M = "month=2026-07";
const encode = (q) => encodeURIComponent(q);

await withClock("2026-07-15", () => fixture(async (fx) => {
  const db = fx.db;
  const userBin = db.users.find((row) => row.id === "user-bin");
  const house = db.households.find((row) => row.id === "house-home");
  for (let i = 0; i < 6; i += 1) {
    db.transactions.push({ id: `tx-cafe-${i}`, household_id: "house-home", user_id: i % 2 ? "user-bin" : "user-wifi", transaction_date: `2026-07-${String(10 + i).padStart(2, "0")}`, type: "expense", amount: 4500 + i * 100, category: "카페/간식", memo: `카페 라떼 ${i}`, payment_method: "카드", source: "my_web", raw_text: "", created_at: `2026-07-${String(10 + i).padStart(2, "0")}T03:00:00.000Z` });
  }
  const monthRows = () => db.transactions.filter((row) => row.household_id === "house-home" && String(row.transaction_date || "").startsWith("2026-07"));
  const blob = (row) => `${row.memo || ""} ${row.category || ""} ${row.payment_method || ""} ${row.raw_text || ""}`.toLowerCase();

  // ── 1. 필터 ───────────────────────────────────────────────────────────────────────────────
  const home = (q, extra = "") => page(fx, `/app?${M}&${H}${q === undefined ? "" : `&q=${encode(q)}`}${extra}`);
  const tab = (q) => page(fx, `/app?${M}&${H}&tab=transactions${q === undefined ? "" : `&q=${encode(q)}`}`);
  const expectBoth = async (q, expected, label) => {
    const [h, t] = await Promise.all([home(q), tab(q)]);
    eq(h.status, 200, `홈 ${label}: 200`);
    eq(cards(h.html), expected, `홈 필터 ${JSON.stringify(q)}: ${label}`);
    eq(cards(t.html), expected, `기록 탭 필터 ${JSON.stringify(q)}: ${label}`);
  };
  await expectBoth("카페 라떼", 6, "띄어 쓴 두 낱말이 모두 맞는 기록만(카페 라떼 0~5)");
  await expectBoth("라떼 카페", 6, "낱말 순서는 상관없다");
  await expectBoth("카 페", monthRows().filter((row) => blob(row).includes("카") && blob(row).includes("페")).length, "낱말마다 따로 맞춘다");
  await expectBoth("라떼 5", 1, "숫자가 섞인 낱말도 내용 부분 일치");
  await expectBoth("4500", 1, "금액 숫자는 그 금액의 기록만");
  await expectBoth("4,500원", 1, "쉼표·원이 붙은 금액도 같다");
  await expectBoth("4600 카페", 1, "금액과 내용을 함께");
  await expectBoth("WIFI", monthRows().filter((row) => row.user_id === "user-wifi").length, "지출자 이름(WIFI♥)으로 그 사람 기록만");
  await expectBoth("wifi 카페", monthRows().filter((row) => row.user_id === "user-wifi" && blob(row).includes("카페")).length, "이름 + 내용, 대소문자 무시");
  await expectBoth("없는말", 0, "없는 낱말은 0건");
  const plainHome = await home(undefined);
  ok(plainHome.html.includes('<details class="homeFeedFilter"><summary><b>필터</b><span>전체</span></summary>'), "홈 최근 내역 머리: ‘필터 · 전체’(찾기/거르기 말 없음)");
  const filteredHome = await home("카페");
  ok(filteredHome.html.includes('<details class="homeFeedFilter" open><summary><b>필터</b><span>적용 중 · 7건</span></summary>'), "필터가 걸리면 ‘적용 중 · N건’ 을 머리에 보이고 펼친다");
  for (const [name, result] of [["홈", filteredHome], ["기록 탭", await tab("카페")]]) {
    const text = visible(result.html);
    ok(!/찾기\s*\/\s*거르기|거르기|찾기·거르기/.test(text), `${name}: ‘찾기/거르기’ 말이 없다`);
    ok(result.html.includes('placeholder="내용·금액·이름·결제수단" aria-label="내역 필터 검색어"'), `${name}: 검색 칸 안내가 무엇을 적을 수 있는지 말한다`);
    ok(result.html.includes("<summary>날짜·분류·결제수단</summary>"), `${name}: 세부 조건 접기 이름`);
    ok(result.html.includes(">필터 적용</button>") && result.html.includes(">초기화</a>"), `${name}: ‘필터 적용’·‘초기화’ 단추`);
  }
  ok(!plainHome.html.includes('id="v8Search"'), "홈에는 같은 일을 하는 빠른 검색 칸이 더 없다(필터 하나로)");
  ok((await tab(undefined)).html.includes('id="v8Search"'), "기록 탭의 ‘이 페이지에서 빠른 검색’ 칸은 그대로(validate-transactions-tab-v22879 고정)");

  // ── 2. 내 계정·보안 ───────────────────────────────────────────────────────────────────────
  const security = await page(fx, `/my/backup-login?${H}`);
  eq(security.status, 200, "내 계정·보안 화면 200");
  const step1 = security.html.indexOf('<fieldset class="step"><legend><span class="stepNo">1</span>본인 확인</legend>');
  const step2 = security.html.indexOf('<fieldset class="step"><legend><span class="stepNo">2</span>로그인 이름·비밀번호</legend>');
  const current = security.html.indexOf('name="current_password"');
  const loginName = security.html.indexOf('name="login_name"');
  ok(step1 > 0 && step2 > step1, "본인 확인(1) 다음에 로그인 이름·비밀번호(2) 가 온다");
  ok(current > step1 && current < step2 && loginName > step2, "현재 비밀번호 칸은 1단계 안에, 로그인 이름·새 비밀번호는 2단계 안에 있다");
  ok(security.html.slice(step1, step2).includes('href="/auth/kakao/start?reauth=credential-change&amp;return_to=%2Fmy%2Fbackup-login"'), "1단계에 ‘원래 연결한 카카오 계정으로 본인 확인’ 길이 있다");
  ok(security.html.includes("처음 정할 때는 원래 연결한 카카오 계정으로 본인 확인을 합니다. 현재 비밀번호 칸은 비워 두세요."), "비밀번호가 없는 사람에게는 현재 비밀번호 칸을 비우라고 말한다");
  const kakaoCard = (html) => html.slice(html.indexOf("<h2>카카오 로그인 연결</h2>"), html.indexOf("<section class=\"guide\">"));
  ok(kakaoCard(security.html).includes("카카오 계정이 연결되어 있어요") && !kakaoCard(security.html).includes('id="kakaoLinkPassword"'), "카카오 로그인 계정이면 연결 칸은 ‘연결되어 있어요’ 만(비밀번호 칸 없음)");
  const originalKey = userBin.kakao_user_key;
  userBin.kakao_user_key = "local_web:bin";
  const localOnly = await page(fx, `/my/backup-login?${H}`);
  eq(localOnly.status, 200, "비밀번호 계정(카카오 미연결)도 200");
  ok(kakaoCard(localOnly.html).includes('<form method="post" action="/my/account-reauth"><div class="field"><label for="kakaoLinkPassword">현재 로그인 비밀번호</label><input id="kakaoLinkPassword" name="current_password" type="password" autocomplete="current-password" required/></div><button type="submit">본인 확인 후 카카오 연결</button></form>'), "카카오 미연결이면 연결 칸에 본인 확인 비밀번호 폼 하나(단추 이름이 다음 일을 말한다)");
  const verified = await page(fx, `/my/backup-login?${H}&msg=account_reauth_verified`);
  ok(kakaoCard(verified.html).includes('href="/my/kakao-link"') && !kakaoCard(verified.html).includes('id="kakaoLinkPassword"') && verified.html.includes("본인 확인이 끝났어요. 5분 안에 카카오 로그인 연결을 진행해 주세요."), "본인 확인 뒤에는 비밀번호 칸 대신 ‘카카오 로그인 연결하기’ 단추");
  userBin.kakao_user_key = originalKey;
  const errKnown = await page(fx, `/my/backup-login?${H}&err=account_reauth_required`);
  ok(errKnown.html.includes("현재 로그인 비밀번호가 맞지 않거나 본인 확인이 아직이에요.") && !visible(errKnown.html).includes("account_reauth_required"), "오류 코드 대신 사람 말(account_reauth_required)");
  const errOther = await page(fx, `/my/backup-login?${H}&err=credential_reauth_required`);
  ok(errOther.html.includes("로그인 이름·비밀번호를 바꾸려면 먼저 본인 확인이 필요해요."), "오류 코드 대신 사람 말(credential_reauth_required)");
  const errUnknown = await page(fx, `/my/backup-login?${H}&err=zz_unknown_code`);
  ok(errUnknown.html.includes("요청을 처리하지 못했어요. 다시 시도해 주세요.") && !visible(errUnknown.html).includes("zz_unknown_code"), "모르는 코드는 일반 안내로");
  const loginPages = read("src/modules/auth/local-login-pages.js");
  ok(loginPages.split("backupLoginKnownCookie()").length - 1 >= 2, "비밀번호 로그인 성공과 비밀번호 저장 성공은 ‘비밀번호 있음’ 쿠키(ab_bk)를 같이 보낸다");
  ok(read("src/modules/auth/kakao-oauth.js").includes("...clearSetupCookies()"), "로그아웃은 기본 설정 판정 쿠키(ab_setup·ab_bk)도 지운다");

  // ── 3. 가계부 기본 설정 띠·화면 ────────────────────────────────────────────────────────────
  const bandOf = (html) => html.match(/<style id="abSetupBandStyle">[\s\S]*?<\/style><a class="abSetupBand"[\s\S]*?<\/a>/)?.[0] || "";
  const unknown = await home(undefined);
  ok(!unknown.html.includes("abSetupBand") && /ab_setup=house-home\.ok;/.test(unknown.setCookie), "비밀번호 유무를 모르는(쿠키 없음) 홈에는 띠가 없다 — 모르는데 ‘설정 전’이라 하지 않는다");
  const noPassword = (extra = "") => page(fx, `/app?${M}&${H}${extra}`, { cookie: `${fx.cookie}; ab_bk=0` });
  const first = await noPassword();
  const band = bandOf(first.html);
  ok(band && band.includes(`<a class="abSetupBand" href="/my/setup?household_id=house-home&amp;month=2026-07">`), "비밀번호 없는 계정의 홈에 기본 설정 띠가 붙고 /my/setup 으로 간다");
  ok(band.includes("<b>설정 전</b><span>로그인 비밀번호 · 정하지 않으면 기록을 다시 찾기 어려워요</span><em>설정하기</em>"), "띠는 무엇이 비었는지와 분실 주의를 말한다");
  eq(first.html.split('id="abSetupBandStyle"').length - 1, 1, "띠 스타일은 한 번만 실린다");
  ok(first.html.indexOf('class="abSetupBand"') < first.html.indexOf('class="abSkipLink"') || first.html.indexOf('class="abSetupBand"') < first.html.indexOf("<header"), "띠는 화면 맨 위(본문 앞)에 있다");
  ok(/ab_setup=house-home\.password; Max-Age=3600; Path=\/; HttpOnly; Secure; SameSite=Lax/.test(first.setCookie), "홈은 판정을 쿠키 ab_setup(1시간)에 적는다");
  ok(Buffer.byteLength(band) < 1024, `띠 한 줄은 1 KiB 미만(${Buffer.byteLength(band)} B)`);
  const settled = await page(fx, `/app?${M}&${H}`, { cookie: `${fx.cookie}; ab_bk=1` });
  ok(!settled.html.includes("abSetupBand") && /ab_setup=house-home\.ok;/.test(settled.setCookie), "‘비밀번호 있음’ 쿠키(ab_bk)가 있으면 띠가 없고 판정은 ok");
  ok(!visible(settled.html).includes("설정 전"), "설정이 끝난 홈에는 ‘설정 전’ 글이 없다");
  // 이름·내 이름도 비면 세 가지를 모두 적는다
  const originalName = house.name;
  const originalNick = userBin.nickname;
  const originalAliases = db.accountbook_settings.find((row) => row.key === "member_aliases:house-home")?.value || "{}";
  house.name = "가계부";
  userBin.nickname = "카카오사용자";
  const stillAliased = await noPassword();
  ok(bandOf(stillAliased.html).includes("<span>가계부 이름·로그인 비밀번호 · ") && /ab_setup=house-home\.name-password;/.test(stillAliased.setCookie), "이 가계부에서 보일 이름을 정해 두었으면(별칭) 계정 닉네임이 자리 표시여도 ‘내 이름’ 은 빈 항목이 아니다");
  putSetting(fx, "member_aliases:house-home", JSON.stringify({ "user-wifi": "WIFI♥" }));
  const bare = await noPassword();
  ok(bandOf(bare.html).includes("<span>가계부 이름·내 이름·로그인 비밀번호 · 정하지 않으면 기록을 다시 찾기 어려워요</span>") && /ab_setup=house-home\.name-me-password;/.test(bare.setCookie), "기본 이름·별칭 없음·자리 표시 닉네임이면 세 가지를 모두 적는다");
  ok(Buffer.byteLength(bandOf(bare.html)) < 1100, `세 가지 띠도 1.1 KiB 미만(${Buffer.byteLength(bandOf(bare.html))} B)`);
  userBin.nickname = "인남";
  ok(bandOf((await noPassword()).html).includes("<span>가계부 이름·로그인 비밀번호 · "), "별칭이 없어도 계정 닉네임이 진짜 이름이면 ‘내 이름’ 은 채워진 것으로 본다");
  userBin.nickname = originalNick;
  putSetting(fx, "member_aliases:house-home", originalAliases);
  for (const name of ["내 가계부", "우리 가계부", "Bin 가계부", "Bin의 가계부", "WIFI♥ 가계부", "기본 가계부", "새 가계부", "이 방의 공동 가계부"]) {
    house.name = name;
    ok(bandOf((await noPassword()).html).includes("가계부 이름·"), `‘${name}’ 은 자동 이름으로 본다`);
  }
  house.name = "우리집 생활비";
  ok(!bandOf((await noPassword()).html).includes("가계부 이름"), "‘우리집 생활비’ 는 정한 이름이다");
  userBin.nickname = originalNick;
  house.name = originalName;
  // 다른 화면은 쿠키만 보고 붙인다(DB 읽기 없음)
  const withFlag = (path, flag = "house-home.password", extra = "") => page(fx, path, { cookie: `${fx.cookie}; ab_setup=${flag}${extra}` });
  const settings = await withFlag(`/my/settings?${M}&${H}`);
  ok(bandOf(settings.html).includes('href="/my/setup?household_id=house-home&amp;month=2026-07"') && /(?:^|,\s*)Cookie(?:,|$)/i.test((await app.fetch(new Request(`${BASE}/my/settings?${M}&${H}`, { headers: { cookie: `${fx.cookie}; ab_setup=house-home.password`, accept: "text/html" } }), fx.env, ctx)).headers.get("vary") || ""), "설정 화면은 쿠키의 판정으로 같은 띠를 붙이고 Vary: Cookie 를 단다");
  for (const path of ["/menu", "/my/households", "/my/members", "/my/groups", "/my/profile", "/my/backup-login"]) {
    const shown = await withFlag(`${path}?${M}&${H}`);
    ok(shown.status === 200 && bandOf(shown.html).includes('class="abSetupBand"'), `${path}: 띠가 붙는다`);
  }
  ok(!(await page(fx, `/my/settings?${M}&${H}`)).html.includes("abSetupBand"), "판정 쿠키가 없으면 설정 화면에 띠가 없다(홈이 다시 판정한다)");
  ok(!(await withFlag(`/my/settings?${M}&${H}`, "house-home.ok")).html.includes("abSetupBand"), "판정이 ok 면 띠가 없다");
  ok(!(await withFlag(`/my/settings?${M}&${H}`, "house-other.password")).html.includes("abSetupBand"), "다른 가계부의 판정은 붙이지 않는다");
  ok(!(await withFlag(`/my/settings?${M}&${H}`, "house-home.bogus")).html.includes("abSetupBand"), "모르는 항목만 있는 쿠키는 무시한다");
  ok(!(await withFlag(`/privacy?${H}`)).html.includes("abSetupBand"), "공개 화면(/privacy)에는 붙지 않는다");
  ok(!(await page(fx, `/menu?${M}&${H}`, { cookie: "ab_setup=house-home.password" })).html.includes("abSetupBand"), "로그인 쿠키가 없으면 붙지 않는다");
  fx.env.NOTICE_TEXT = "점검 안내";
  fx.env.NOTICE_LINK = "/privacy";
  for (const [label, result] of [["설정 화면", await withFlag(`/my/settings?${M}&${H}`)], ["홈", await noPassword()]]) {
    const noticeAt = result.html.indexOf("오늘 하루 안 보기</button></form></div>");
    const noticeEnd = noticeAt + "오늘 하루 안 보기</button></form></div>".length;
    ok(noticeAt > 0 && result.html.indexOf('class="abNoticeBand"') < noticeAt && result.html.slice(noticeEnd).startsWith('<style id="abSetupBandStyle">'), `${label}: 공지 띠가 있으면 기본 설정 띠는 공지 띠 바로 아래`);
  }
  delete fx.env.NOTICE_TEXT;
  delete fx.env.NOTICE_LINK;
  // /my/setup 화면
  const setup = await page(fx, `/my/setup?${M}&${H}`);
  eq(setup.status, 200, "/my/setup 200");
  ok(setup.html.includes("<title>") && setup.html.includes(" · 가계부 기본 설정</title>"), "제목");
  ok(setup.html.includes("<h2>1. 가계부 이름</h2>") && setup.html.includes("<h2>2. 이 가계부에서 보일 내 이름</h2>") && setup.html.includes("<h2>3. 내 계정 로그인 비밀번호</h2>"), "세 칸");
  eq(setup.html.split('class="setupState isDone"').length - 1, 2, "이름·내 이름은 ‘설정됨’");
  ok(setup.html.includes("<b>아직 설정 전: 로그인 비밀번호</b>") && setup.html.includes("비밀번호가 없으면 로그인 방법이 바뀔 때 기록을 다시 찾기 어렵고"), "요약이 남은 항목과 분실 주의를 말한다");
  ok(setup.html.includes('href="/my/backup-login?') && setup.html.includes("로그인 이름·비밀번호 정하기"), "비밀번호 칸은 내 계정·보안으로 보낸다");
  ok(/ab_setup=house-home\.password;/.test(setup.setCookie) && /ab_bk=0; Max-Age=1209600/.test(setup.setCookie), "설정 화면은 판정 쿠키와 ‘비밀번호 없음’(ab_bk=0) 을 적는다");
  ok(/ab_bk=0; Max-Age=1209600/.test(security.setCookie), "내 계정·보안 화면도 비밀번호 유무(없음)를 쿠키에 적는다");
  ok(read("src/modules/auth/kakao-oauth.js").includes("cookies.push(backupLoginKnownCookie(await hasBackupLoginIdentity(env, user)))"), "카카오 로그인 콜백이 로그인 때 비밀번호 유무를 한 번 확인해 적는다");
  ok(!/무료/.test(visible(setup.html)), "설정 화면에 ‘무료’ 가 없다");
  db.accountbook_user_identities.push({ user_id: "user-bin", provider: "local", provider_subject: "bin", login_name: "bin", credential_hash: "h", credential_salt: "s", credential_iterations: 100000, credential_version: 2 });
  const doneSetup = await page(fx, `/my/setup?${M}&${H}`);
  ok(doneSetup.html.includes("세 가지가 모두 설정됐어요. 홈과 메뉴의 안내 띠는 더 보이지 않아요.") && doneSetup.html.split('class="setupState isDone"').length - 1 === 3, "비밀번호까지 있으면 세 칸 모두 ‘설정됨’");
  ok(/ab_bk=1; Max-Age=1209600; Path=\/; HttpOnly; Secure; SameSite=Lax/.test(doneSetup.setCookie) && /ab_setup=house-home\.ok;/.test(doneSetup.setCookie), "비밀번호가 있으면 ab_bk=1(14일)·판정 ok 쿠키");
  ok(/ab_bk=1; Max-Age=1209600/.test((await page(fx, `/my/backup-login?${H}`)).setCookie), "내 계정·보안 화면도 ‘있음’을 적는다");
  db.accountbook_user_identities.pop();
  // 이름 저장
  const bad = await post(fx, "/my/setup/name", { household_id: "house-home", month: "2026-07", household_name: "내 가계부" });
  ok(bad.status === 303 && bad.location === "/my/setup?household_id=house-home&month=2026-07&err=household_name_default", "기본 이름은 거절한다");
  ok((await page(fx, `/my/setup?${M}&${H}&err=household_name_default`)).html.includes("기본 이름은 그대로예요"), "기본 이름 거절 사유를 사람 말로");
  const empty = await post(fx, "/my/setup/name", { household_id: "house-home", month: "2026-07", household_name: "   " });
  ok(empty.location.endsWith("err=household_name_invalid"), "빈 이름은 거절한다");
  const renamed = await post(fx, "/my/setup/name", { household_id: "house-home", month: "2026-07", household_name: "우리집 모임비" });
  const houseRow = () => db.households.find((row) => row.id === "house-home"); // 픽스처 PATCH 는 행 배열을 새로 만든다
  ok(renamed.status === 303 && renamed.location === "/my/setup?household_id=house-home&month=2026-07&msg=household_updated" && houseRow().name === "우리집 모임비", "이름을 저장하고 설정 화면으로 돌아온다");
  ok(/ab_setup=; Max-Age=0/.test(renamed.setCookie) && !/ab_bk=; Max-Age=0/.test(renamed.setCookie), "저장 뒤에는 판정 쿠키만 지운다(비밀번호 쿠키는 그대로)");
  ok((await page(fx, `/my/setup?${M}&${H}&msg=household_updated`)).html.includes("지금 이름: <b>우리집 모임비</b>") , "설정 화면이 새 가계부 이름을 보인다");
  houseRow().name = originalName;
  const memberTry = await post(fx, "/my/setup/name", { household_id: "house-home", month: "2026-07", household_name: "구성원이 바꾼 이름" }, { cookie: await fx.cookieFor("user-wifi") });
  ok(memberTry.location.endsWith("err=household_manage_not_allowed") && houseRow().name === originalName, "구성원은 가계부 이름을 바꿀 수 없다");
  // 내 이름 저장
  const placeholder = await post(fx, "/my/setup/me", { household_id: "house-home", month: "2026-07", display_name: "사용자" });
  ok(placeholder.location.endsWith("err=display_name_required"), "자리 표시 이름은 거절한다");
  const alias = await post(fx, "/my/setup/me", { household_id: "house-home", month: "2026-07", display_name: "인남" });
  ok(alias.status === 303 && alias.location.endsWith("msg=member_alias_updated"), "내 이름을 저장한다");
  ok(JSON.parse(db.accountbook_settings.find((row) => row.key === "member_aliases:house-home")?.value || "{}")["user-bin"] === "인남", "저장한 이름은 참여자 별칭 표에 들어간다");
  ok((await page(fx, `/my/setup?${M}&${H}`)).html.includes("지금 이름: <b>인남</b>"), "설정 화면이 새 이름을 보인다");
  putSetting(fx, "member_aliases:house-home", originalAliases);
  // 로그아웃은 판정 쿠키를 지운다
  const logout = await post(fx, "/my/logout", {});
  ok(/ab_setup=; Max-Age=0/.test(logout.setCookie) && /ab_bk=; Max-Age=0/.test(logout.setCookie), "로그아웃 응답이 ab_setup·ab_bk 를 지운다");

  // ── 4. 초대코드 표기 ──────────────────────────────────────────────────────────────────────
  const members = await page(fx, `/my/members?${M}&${H}`);
  ok(members.html.includes('<div class="inviteBox"><code><span>초대 문구 · 단톡방이나 참여자에게 그대로 보내세요</span><span>가계부 참여 <b class="inviteKey">HOME2265</b></span></code><button type="button" id="copyInvite">초대 문구 복사</button></div>'), "참여자 관리: 초대 문구와 코드 칸");
  ok(/\.inviteBox \.inviteKey\{[^}]*ui-monospace[^}]*font-size:26px[^}]*letter-spacing:\.16em/.test(members.html), "초대코드는 큰 고정폭 글자·자간");
  const manage = await page(fx, `/my/households?${M}&${H}&manage=house-home`);
  ok(manage.html.includes("<code>가계부 참여 <b>HOME2265</b></code>"), "가계부 관리: 초대 문구 안에 코드를 따로 강조");
  ok(/\.inviteFold code b,\.inviteCode b\{[^}]*ui-monospace[^}]*letter-spacing:\.16em/.test(manage.html), "가계부 관리 코드 글자도 고정폭·자간");

  // ── 5. 단톡방 연결 목록 ───────────────────────────────────────────────────────────────────
  putSetting(fx, "kakao_group_links", JSON.stringify({
    group_1a2b3c4d5e6f7g8h: { household_id: "house-home", household_name: "우리집 생활비", linked_at: "2026-07-10T03:00:00.000Z", linked_by: "user-bin" },
    group_9z8y7x6w5v4u3t2s: { household_id: "house-home", household_name: "우리집 생활비", linked_at: "2026-07-11T03:00:00.000Z", linked_by: "user-left" },
    group_aaaabbbbccccdddd: { household_id: "house-home", household_name: "우리집 생활비", linked_at: "", linked_by: "" },
    group_other: { household_id: "house-other", household_name: "다른 집", linked_at: "2026-07-12T03:00:00.000Z", linked_by: "user-bin" },
  }));
  const groups = await page(fx, `/my/groups?${M}&${H}`);
  eq(groups.status, 200, "단톡방 연결 화면 200");
  const list = groups.html.slice(groups.html.indexOf("<h2>현재 연결 목록</h2>"));
  ok(list.includes('<ul class="linkList">') && list.split("<li>").length - 1 === 3, "이 가계부의 연결만 카드 목록으로(다른 가계부 제외)");
  ok(list.includes("연결한 사람 <em>Bin</em>(그 방에서 ‘단톡방 연결’ 문장을 보낸 참여자)"), "연결한 사람은 참여자 이름으로");
  ok(list.includes("연결한 사람 <em>이전 참여자</em>"), "나간 사람은 ‘이전 참여자’");
  ok(list.includes("연결한 사람 <em>알 수 없음</em>") && list.includes("연결한 날 <em>-</em>"), "값이 없으면 ‘알 수 없음’·‘-’");
  ok(list.includes("방 구분 번호 <em>") && list.includes("카카오가 방마다 붙인 번호를 가린 것(방 이름은 받지 않아요)"), "방 구분 번호가 무엇인지 설명한다");
  ok(!list.includes("group_1a2b3c4d5e6f7g8h") && !list.includes("user-left"), "방 번호와 사용자 번호 원문은 보이지 않는다");
  ok(!/그룹키|연결자/.test(visible(groups.html)), "‘그룹키’·‘연결자’ 말이 없다");
  ok(groups.html.includes("이 가계부와 이어진 카카오 단톡방입니다. 방 하나가 한 줄이고, 그 방의 기록은 모두 이 가계부에 쌓여요."), "목록이 무엇인지 한 줄로 말한다");
  putSetting(fx, "kakao_group_links", JSON.stringify({}));
  ok((await page(fx, `/my/groups?${M}&${H}`)).html.includes('<li class="isEmpty">아직 연결된 단톡방이 없어요. 위 문장을 단톡방에 보내면 여기에 나타나요.</li>'), "연결이 없으면 빈 안내");

  // ── 6. 정기 항목: 다른 참여자의 같은 기록은 ‘이번 달 반영됨’이 아니다 ───────────────────────────
  const rule = (memo, amount, type, day) => post(fx, "/my/recurring/save", { household_id: "house-home", month: "2026-07", memo, amount: String(amount), type, day_of_month: String(day), category: "", payment_method: "" });
  const other = await rule("주말 장보기", 148000, "expense", 4);
  ok(other.status === 303 && /msg=recurring_saved_other_recorded/.test(other.location), "같은 금액·내용 기록이 다른 참여자(WIFI♥) 것이면 따로 알린다");
  const otherRow = db.accountbook_recurring.find((row) => row.memo === "주말 장보기");
  ok(otherRow && otherRow.user_id === "user-bin" && String(otherRow.last_applied_month || "") !== "2026-07", "그 규칙은 이번 달 ‘반영됨’으로 적지 않아 이번 달 자동 반영이 된다");
  const mine = await rule("7월 월급", 3200000, "income", 1);
  ok(mine.status === 303 && /msg=recurring_saved(?!_)/.test(mine.location), "내가 적은 같은 기록이면 예전처럼 저장만 알린다");
  const mineRow = db.accountbook_recurring.find((row) => row.memo === "7월 월급");
  ok(mineRow && mineRow.last_applied_month === "2026-07", "내 기록이 있으면 이번 달은 반영된 것으로 적는다(중복 방지)");
  ok((await page(fx, `/my/settings?${M}&${H}&msg=recurring_saved_other_recorded`)).html.includes("다른 참여자 이름으로 있어 이번 달 자동 반영은 그대로 진행돼요"), "설정 화면이 그 안내를 사람 말로 보인다");

  // ── 7. 관제 1.7.0 ─────────────────────────────────────────────────────────────────────────
  eq(MONITOR_VERSION, "1.7.0", "관제 판 1.7.0");
  const worker = read("monitoring/worker.mjs");
  ok(worker.includes("const READY_REUSE_MS=27.5*60000;") && worker.includes("const READY_PROBE_AFTER_FAILURE_MS=60*60000;"), "재사용 창 27.5분·실패 뒤 1시간 상수");
  ok(read("monitoring/dashboard.mjs").includes("' · 30분마다 확인(마지막 '"), "화면이 재사용한 /ready 줄을 표시한다");
  ok(read("monitoring/README.md").includes("## /ready 30분 간격 (1.7.0, V22.9.102)"), "README 절");
  ok(read("monitoring/test-d1.mjs").includes("1.7.0 실패 1시간 뒤부터 다시 재사용한다"), "D1 시험에 재사용 장면이 있다");
  {
    const previousFetch = globalThis.fetch;
    const probes = [];
    let readyOk = true;
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      probes.push(url.pathname);
      return new Response(JSON.stringify(url.pathname === "/ready" ? { ready: readyOk } : { alive: true, version: "V-MOCK" }), { headers: { "content-type": "application/json" } });
    };
    try {
      const now = new Date("2026-11-05T03:10:00.000Z");
      const stub = (payload) => ({ APP_ORIGIN: "https://malhaebook.com", MONITOR_DB: { prepare: () => ({ first: async () => (payload ? { payload: JSON.stringify(payload) } : null) }) } });
      const readyAt = (minutesAgo, ok = true) => ({ path: "/ready", status: 200, duration_ms: 50, ok, probed_at: new Date(now.getTime() - minutesAgo * 60000).toISOString() });
      const r0 = await collectUptime(stub(null), now);
      ok(probes.filter((p) => p === "/ready").length === 1 && r0.ready_reused === false && r0.ready_failed_at === null, "저장된 답이 없으면 /ready 를 묻는다");
      probes.length = 0;
      const r1 = await collectUptime(stub({ checks: [readyAt(10)], ready_failed_at: null }), now);
      ok(!probes.includes("/ready") && probes.includes("/health") && r1.ready_reused === true && r1.checks.find((c) => c.path === "/ready")?.reused === true && r1.checks.find((c) => c.path === "/ready")?.probed_at === readyAt(10).probed_at, "10분 전 정상 답은 재사용하고 /health 만 묻는다");
      probes.length = 0;
      const r2 = await collectUptime(stub({ checks: [readyAt(28)], ready_failed_at: null }), now);
      ok(probes.includes("/ready") && r2.ready_reused === false && r2.checks.find((c) => c.path === "/ready")?.probed_at === now.toISOString(), "27.5분이 지난 답은 다시 묻는다");
      probes.length = 0;
      const r3 = await collectUptime(stub({ checks: [readyAt(5)], ready_failed_at: new Date(now.getTime() - 30 * 60000).toISOString() }), now);
      ok(probes.includes("/ready") && r3.ready_reused === false && r3.ready_failed_at === new Date(now.getTime() - 30 * 60000).toISOString(), "실패 뒤 1시간 안이면 5분 전 정상 답이 있어도 다시 묻고 실패 시각을 이어 적는다");
      probes.length = 0;
      const r4 = await collectUptime(stub({ checks: [readyAt(5)], ready_failed_at: new Date(now.getTime() - 61 * 60000).toISOString() }), now);
      ok(!probes.includes("/ready") && r4.ready_reused === true, "실패 1시간 뒤부터는 다시 재사용한다");
      probes.length = 0;
      const r5 = await collectUptime(stub({ checks: [readyAt(5, false)], ready_failed_at: null }), now);
      ok(probes.includes("/ready") && r5.ready_reused === false, "실패한 답은 재사용하지 않는다");
      probes.length = 0;
      readyOk = false;
      const r6 = await collectUptime(stub(null), now);
      ok(r6.checks.find((c) => c.path === "/ready")?.ok === false && r6.ready_failed_at === now.toISOString(), "/ready 실패는 ready_failed_at 에 지금 시각을 적는다");
      probes.length = 0;
      readyOk = true;
      const r7 = await collectUptime(stub({ checks: [{ path: "/ready", ok: true, status: 200, duration_ms: 40 }], ready_failed_at: null }), now);
      ok(probes.includes("/ready") && r7.ready_reused === false, "1.6.0 이 남긴 답(probed_at 없음)은 재사용하지 않는다");
    } finally {
      globalThis.fetch = previousFetch;
    }
  }
}));

done();
