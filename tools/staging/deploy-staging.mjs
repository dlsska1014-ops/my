#!/usr/bin/env node
// V22.9.83: 테스트 서버(Cloudflare 별도 Worker "malhaebook-staging")에 이 폴더의 코드를 올린다.
//   node tools/staging/deploy-staging.mjs --dry-run   네트워크 없이 올릴 모듈·metadata 만 만들어 보여 준다
//   node tools/staging/deploy-staging.mjs             올리고 → workers.dev 주소를 켜고 → 비밀번호로 /__preview/health 를 확인한다
// 환경변수(파일·로그에 남기지 않는다): CLOUDFLARE_API_TOKEN(Workers Scripts 편집, 이 계정만),
//   CLOUDFLARE_ACCOUNT_ID(또는 CF_ACCOUNT_ID), STAGING_PASSWORD(8자 이상, 테스트 서버를 열 때 쓰는 비밀번호).
//
// 운영을 건드리지 않는 장치
// - Worker 이름은 malhaebook-staging 으로 고정이다. 이름을 바꾸는 옵션이 없고, 운영 이름(kakao-accountbook)이면 멈춘다.
// - 운영 Worker 의 설정·버전·배포를 읽지도 쓰지도 않는다. 부르는 주소는 아래 넷뿐이다.
//     PUT  /accounts/{id}/workers/scripts/malhaebook-staging             모듈 업로드(테스트 Worker 를 통째로 바꾼다)
//     POST /accounts/{id}/workers/scripts/malhaebook-staging/subdomain   workers.dev 주소 켜기
//     GET  /accounts/{id}/workers/subdomain                              계정의 workers.dev 이름 읽기
//     GET  https://malhaebook-staging.<이름>.workers.dev/__preview/health  올라간 판 확인(Basic 비밀번호)
// - 경로(route)·사용자 도메인을 붙이지 않는다. malhaebook.com 은 계속 운영 Worker 만 받는다.
// - 바인딩은 STAGING_PASSWORD(Secret)·PREVIEW_VERSION(글자) 둘뿐이다. 운영 Secret 을 옮기지 않는다.
// - src/index.js 가 src/modules 빌드와 다르면 올리지 않는다(테스트 서버에 보이는 코드 = 이 폴더의 코드).
// - Workers Free 의 하루 요청 한도는 계정 전체(운영 포함)에 걸린다. 테스트 서버는 사람이 열어 볼 때만 요청이 생긴다.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFromModulesRoot, sha256 } from "../build-worker.mjs";

export const STAGING_SCRIPT = "malhaebook-staging";
export const PRODUCTION_SCRIPT = "kakao-accountbook";
export const COMPATIBILITY_DATE = "2026-10-01";
export const API_BASE = "https://api.cloudflare.com/client/v4";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// [올라가는 모듈 이름, 저장소 안 경로]. 이름은 각 파일의 import 지정자("./index.js" 등)와 같아야 한다.
export const STAGING_MODULES = [
  ["worker-entry.mjs", "tools/staging/worker-entry.mjs"],
  ["index.js", "src/index.js"],
  ["qa-fixture.mjs", "validation/qa-fixture.mjs"],
  ["lifecycle-fixture-v22961.mjs", "validation/lifecycle-fixture-v22961.mjs"],
  ["demo-handler.mjs", "tools/staging/demo-handler.mjs"],
  ["demo-data.mjs", "tools/staging/demo-data.mjs"],
];

export function planStagingUpload({ root = ROOT, script = STAGING_SCRIPT, read = (p) => readFileSync(join(root, p)) } = {}) {
  if (script !== STAGING_SCRIPT || script === PRODUCTION_SCRIPT) throw new Error(`refusing to upload to ${script}: only ${STAGING_SCRIPT} is allowed`);
  const bundle = read("src/index.js");
  const built = buildFromModulesRoot(join(root, "src/modules")).text;
  if (sha256(bundle) !== sha256(built)) throw new Error("src/index.js differs from the src/modules build; run npm run build:worker first");
  const version = String(read("VERSION.txt")).trim();
  const modules = STAGING_MODULES.map(([name, path]) => {
    const bytes = read(path);
    return { name, path, bytes, size: bytes.length, sha256: sha256(bytes) };
  });
  const metadata = {
    main_module: "worker-entry.mjs",
    compatibility_date: COMPATIBILITY_DATE,
    compatibility_flags: ["nodejs_compat"],
    bindings: [{ type: "plain_text", name: "PREVIEW_VERSION", text: version }],
  };
  return { script, version, modules, metadata };
}

export function uploadForm(plan, password) {
  if (!password || String(password).length < 8) throw new Error("STAGING_PASSWORD must be at least 8 characters");
  const metadata = { ...plan.metadata, bindings: [...plan.metadata.bindings, { type: "secret_text", name: "STAGING_PASSWORD", text: String(password) }] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  for (const mod of plan.modules) form.append(mod.name, new Blob([mod.bytes], { type: "application/javascript+module" }), mod.name);
  return form;
}

async function api(fetchImpl, token, method, path, body) {
  const init = { method, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120000) };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers["content-type"] = "application/json"; }
  const response = await fetchImpl(`${API_BASE}${path}`, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) {
    const errors = (json.errors || []).map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`${method} ${path} → HTTP ${response.status}${errors ? ` (${errors})` : ""}`);
  }
  return json.result;
}

export async function deployStaging({ env = process.env, fetchImpl = globalThis.fetch, log = console.log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), plan = planStagingUpload() } = {}) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID;
  const password = env.STAGING_PASSWORD;
  if (!token || !accountId) throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
  const base = `/accounts/${encodeURIComponent(accountId)}/workers`;
  log(`테스트 Worker ${plan.script} 에 ${plan.version} 을 올립니다(모듈 ${plan.modules.length}개).`);
  await api(fetchImpl, token, "PUT", `${base}/scripts/${plan.script}`, uploadForm(plan, password));
  await api(fetchImpl, token, "POST", `${base}/scripts/${plan.script}/subdomain`, { enabled: true, previews_enabled: false });
  const sub = await api(fetchImpl, token, "GET", `${base}/subdomain`);
  if (!sub?.subdomain) throw new Error("the account has no workers.dev subdomain; open Workers & Pages once in the dashboard to create it");
  const url = `https://${plan.script}.${sub.subdomain}.workers.dev`;
  const auth = `Basic ${Buffer.from(`preview:${password}`).toString("base64")}`;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetchImpl(`${url}/__preview/health`, { headers: { authorization: auth }, signal: AbortSignal.timeout(20000) });
      const health = await response.json().catch(() => ({}));
      if (response.ok && health.preview === true && health.version === plan.version) {
        log(`확인됨: ${url}/app (판 ${health.version}, 예시 데이터 ${health.data?.transactions ?? "?"}건)`);
        return { url, version: health.version };
      }
    } catch (_) { /* workers.dev 주소가 퍼질 때까지 기다린다 */ }
    await sleep(5000);
  }
  throw new Error(`${url}/__preview/health did not report ${plan.version} within a minute`);
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  try {
    const plan = planStagingUpload();
    if (process.argv.includes("--dry-run")) {
      console.log(JSON.stringify({ script: plan.script, version: plan.version, metadata: plan.metadata, modules: plan.modules.map(({ name, path, size, sha256: digest }) => ({ name, path, size, sha256: digest })) }, null, 2));
    } else {
      await deployStaging({ plan });
    }
  } catch (error) {
    console.error(`테스트 서버 배포 실패: ${error.message}`);
    process.exitCode = 1;
  }
}
