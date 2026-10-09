// V22.9.32 — 배포 스크립트 tools/deploy-worker-version.mjs 를 가짜 Cloudflare API 로 검증한다.
//
// 대시보드에 3MB 를 붙여넣던 배포를 Versions API 업로드 → 대조 → 승격으로 바꿨다. 이 스크립트는
// 운영 Worker 의 바인딩·Secret·런타임 설정에 닿을 수 있는 자동 경로라서, 실제 API 를 부르지 않고
// 하네스 안에서 다음을 고정한다.
//   - dry-run 과 인자·자격 오류는 네트워크를 쓰지 않는다.
//   - 업로드는 현재 배포 버전의 바인딩 전부를 inherit(latest, strict)로 넘기고 호환 설정을 그대로
//     옮기며, 배포(POST /deployments)는 하지 않는다. 바인딩을 읽지 못하면 올리지 않는다.
//   - 실제 Versions API 는 inherit 의 version_id 로 "latest" 만 받는다(버전 ID 는 10057, 2026-10-09 첫 실행).
//     latest 는 최신 버전이므로, 최신 버전이 현재 배포 버전(또는 이 스크립트가 그 버전에서 올린 버전)이
//     아니면 올리지 않는다. 가짜 API 도 실제처럼 버전 ID 를 거부하고 최신 버전에서 이어받는다.
//   - 저장된 버전의 바인딩·script_runtime·handlers 가 현재와 다르면 승격하지 않는다.
//   - 승격은 업로드 기록·현재 소스·HEAD·etag 가 맞을 때만 하고, 승격 뒤 배포 상태·소스 해시·
//     /health·공개 검사를 확인한다. 실패하면 되돌리기 명령만 알리고 스스로 되돌리지 않는다.
//   - 토큰은 로그·기록 파일에 남지 않고, 바인딩 값은 해시로만 저장한다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../tools/build-worker.mjs";
import { canonical, compareVersionResources, deployedScriptSha256, liveVersionOf, parseArgs, runDeploy } from "../tools/deploy-worker-version.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const throwsLike = (fn, pattern, message) => { assert.throws(fn, pattern, message); checks += 1; };

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceBytes = readFileSync(resolve(root, "src/index.js"));
const SOURCE_SHA = sha256(sourceBytes);
const APP_VERSION = (sourceBytes.toString("utf8").match(/const APP_VERSION = "([^"]+)"/) || [])[1];
const TOKEN = `fake-token-${"q".repeat(30)}`;
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const SCRIPT = "kakao-accountbook";
const ORIGIN = "https://malhaebook.com";
const HEAD = "a".repeat(40);
const LIVE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const API_PREFIX = `/client/v4/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}`;
const PLAIN_VALUE = "PLAIN-VALUE-MUST-NOT-BE-STORED";
const LIVE_BINDINGS = [
  { name: "APP_NAME", type: "plain_text", text: PLAIN_VALUE },
  { name: "SUPABASE_URL", type: "plain_text", text: "https://example.invalid" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", type: "secret_text" },
  { name: "KAKAO_SKILL_SECRET", type: "secret_text" },
  { name: "OPS_MONITOR", type: "service", service: "malhaebook-monitor", environment: "production" },
];
const LIVE_RUNTIME = { compatibility_date: "2026-06-16", compatibility_flags: [], usage_model: "standard" };
const everyText = [];

// ---------------------------------------------------------------------------
// 가짜 Cloudflare API: 배포 목록, 버전 조회·업로드(inherit 해석·strict), 배포 생성, content/v2, /health
// ---------------------------------------------------------------------------
function fakeCloudflare(options = {}) {
  const versions = new Map();
  const contents = new Map();
  const calls = [];
  let counter = 0;
  versions.set(LIVE_ID, {
    id: LIVE_ID,
    number: 40,
    metadata: { created_on: "2026-10-07T00:00:00Z", source: "dash" },
    resources: {
      bindings: options.liveBindings ?? structuredClone(LIVE_BINDINGS),
      script: { etag: "etag-live", handlers: ["fetch", "scheduled"], named_handlers: [] },
      script_runtime: { ...structuredClone(LIVE_RUNTIME), ...(options.liveRuntimeExtra ?? {}) },
    },
  });
  contents.set(LIVE_ID, Buffer.from("// previous release\n"));
  if (options.newerVersion) {
    // 대시보드에서 저장만 하고 배포하지 않은 더 새 버전 — inherit latest 의 출처가 현재 배포 버전이 아니게 된다
    const newer = structuredClone(versions.get(LIVE_ID));
    newer.id = OTHER_ID;
    newer.number = 41;
    newer.resources.bindings.find((b) => b.name === "APP_NAME").text = "NEWER-UNDEPLOYED";
    versions.set(OTHER_ID, newer);
  }
  const newest = () => [...versions.values()].at(-1);
  const deployments = [{
    id: "deployment-live",
    created_on: "2026-10-07T00:00:00Z",
    source: "dash",
    strategy: "percentage",
    versions: options.split ? [{ version_id: LIVE_ID, percentage: 90 }, { version_id: OTHER_ID, percentage: 10 }] : [{ version_id: LIVE_ID, percentage: 100 }],
  }];
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const success = (result) => json(200, { success: true, errors: [], messages: [], result });
  const failure = (status, code, message) => json(status, { success: false, errors: [{ code, message }], messages: [], result: null });

  async function fetch(url, init = {}) {
    const request = new Request(url, init);
    const target = new URL(request.url);
    const isApi = target.origin === "https://api.cloudflare.com" && target.pathname.startsWith(API_PREFIX);
    const call = { method: request.method, origin: target.origin, path: isApi ? target.pathname.slice(API_PREFIX.length) : target.pathname, query: target.search, authorization: request.headers.get("authorization") };
    calls.push(call);
    if (target.origin === ORIGIN && target.pathname === "/health") {
      const version = options.healthVersion ?? (deployments[0].versions[0].version_id === LIVE_ID ? "V-OLD" : APP_VERSION);
      return json(200, { alive: true, version, missing_count: 0 });
    }
    if (!isApi) throw new Error(`fake: unexpected request ${request.method} ${target.href}`);
    if (call.authorization !== `Bearer ${TOKEN}`) return failure(403, 10000, "Authentication error");
    if (request.method === "GET" && call.path === "/deployments") return success({ deployments: structuredClone(deployments) });
    if (request.method === "GET" && call.path === "/versions") {
      if (options.versionListShape === "bad") return success({});
      return success({ items: [...versions.values()].reverse().map(({ id, number, metadata }) => structuredClone({ id, number, metadata })) });
    }
    if (request.method === "GET" && call.path.startsWith("/versions/")) {
      const version = versions.get(call.path.slice("/versions/".length));
      return version ? success(structuredClone(version)) : failure(404, 10007, "version not found");
    }
    if (request.method === "POST" && call.path === "/versions") {
      if (options.uploadError) return failure(400, 10021, "Uncaught SyntaxError at index.js");
      const form = await request.formData();
      const metadata = JSON.parse(await form.get("metadata").text());
      const file = form.get(metadata.main_module);
      call.upload = { metadata, metadataType: form.get("metadata").type, file: { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) } };
      const strict = target.searchParams.get("bindings_inherit") === "strict";
      const bindings = [];
      for (const binding of metadata.bindings ?? []) {
        if (binding.type !== "inherit") { bindings.push(binding); continue; }
        if (binding.version_id !== undefined && binding.version_id !== "latest") {
          return failure(400, 10057, `inherit binding '${binding.name}' is invalid: 'version_id' value '${binding.version_id}' is invalid, only the literal 'latest' is supported by this API`);
        }
        const from = newest();
        const found = binding.name === options.hideFromInherit ? null : from?.resources.bindings.find((b) => b.name === (binding.old_name || binding.name));
        if (!found) {
          if (strict) return failure(400, 10021, `binding ${binding.name} could not be inherited`);
          continue;
        }
        bindings.push({ ...structuredClone(found), name: binding.name });
      }
      counter += 1;
      const id = `${String(counter).padStart(8, "0")}-0000-4000-8000-000000000000`;
      const created = {
        id,
        number: 40 + counter,
        metadata: { created_on: "2026-10-08T00:00:00Z", source: "api" },
        startup_time_ms: 41,
        resources: {
          bindings,
          script: { etag: sha256(call.upload.file.bytes), handlers: ["fetch", "scheduled"], named_handlers: [] },
          script_runtime: { compatibility_date: metadata.compatibility_date, compatibility_flags: metadata.compatibility_flags ?? [], usage_model: metadata.usage_model ?? "bundled" },
        },
      };
      options.mutateUploaded?.(created);
      versions.set(id, created);
      contents.set(id, call.upload.file.bytes);
      return success(structuredClone(created));
    }
    if (request.method === "POST" && call.path === "/deployments") {
      call.body = await request.json();
      const deployment = { id: `deployment-${calls.length}`, created_on: "2026-10-08T00:00:01Z", source: "api", strategy: call.body.strategy, versions: call.body.versions, annotations: call.body.annotations };
      if (!options.ignoreDeploy) deployments.unshift(deployment);
      return success(structuredClone(deployment));
    }
    if (request.method === "GET" && call.path === "/content/v2") {
      const active = deployments[0].versions[0].version_id;
      if (options.contentMode === "json") return success({ id: active });
      const bytes = options.contentMode === "mismatch" ? Buffer.from("// not the uploaded source\n") : contents.get(active);
      const form = new FormData();
      form.append("index.js", new Blob([bytes], { type: "application/javascript+module" }), "index.js");
      return new Response(form, { headers: { "cf-entrypoint": "index.js" } });
    }
    return failure(404, 10000, `fake: no route ${request.method} ${call.path}`);
  }
  return { fetch, calls, versions, deployments };
}

function harness({ fake = null, env = { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT }, trackedChanges = [], buildText = null, overrides = {}, publicExit = 0, files = new Map() } = {}) {
  const logs = [];
  const publicRuns = [];
  const network = [];
  const deps = {
    root,
    env,
    fetch: fake ? fake.fetch : async (url) => { network.push(String(url)); throw new Error("network must not be used"); },
    git: { head: () => HEAD, trackedChanges: () => trackedChanges },
    build: () => ({ text: buildText ?? sourceBytes.toString("utf8") }),
    readFile: (path, encoding) => {
      if (files.has(path)) return files.get(path);
      const name = Object.keys(overrides).find((key) => resolve(root, key) === path);
      return name ? overrides[name] : readFileSync(path, encoding);
    },
    writeFile: (path, data) => files.set(path, data),
    exists: (path) => files.has(path),
    mkdir: () => {},
    now: () => new Date("2026-10-08T00:00:00.000Z"),
    sleep: async () => {},
    log: (line) => logs.push(String(line)),
    error: (line) => logs.push(String(line)),
    runPublicChecks: (args) => { publicRuns.push(args); return publicExit; },
  };
  const h = { deps, files, logs, publicRuns, network, output: () => logs.join("\n") };
  everyText.push(() => [h.output(), ...[...files.values()].map(String)].join("\n"));
  return h;
}

const posts = (fake, path) => fake.calls.filter((c) => c.method === "POST" && c.path === path).length;
const recordOf = (h, prefix) => {
  const entry = [...h.files.entries()].find(([path]) => path.includes(prefix));
  return entry ? { path: entry[0], data: JSON.parse(entry[1]) } : null;
};
async function upload(fakeOptions = {}, harnessOptions = {}) {
  const fake = fakeCloudflare(fakeOptions);
  const h = harness({ fake, ...harnessOptions });
  const code = await runDeploy([], h.deps);
  const created = fake.calls.find((c) => c.method === "POST" && c.path === "/versions" && c.upload);
  const newId = [...fake.versions.keys()].find((id) => id !== LIVE_ID) ?? null;
  return { fake, h, code, created, newId };
}

// ---------------------------------------------------------------------------
// 1. 인자 — 모드는 하나, 버전 ID 는 UUID, origin 은 https 만
// ---------------------------------------------------------------------------
eq(parseArgs([]).mode, "upload", "인자가 없으면 업로드(배포 아님)다");
eq(parseArgs(["--promote", LIVE_ID]).mode, "promote", "--promote 는 버전 ID 를 받는다");
throwsLike(() => parseArgs(["--dry-run", "--rollback", LIVE_ID]), /하나만/, "모드 두 개를 함께 받지 않는다");
throwsLike(() => parseArgs(["--promote"]), /값이 필요/, "--promote 에 버전 ID 가 없으면 거부한다");
throwsLike(() => parseArgs(["--promote", "latest"]), /버전 ID 형식/, "UUID 가 아닌 버전 ID 를 거부한다");
throwsLike(() => parseArgs(["--state", "x.json"]), /dry-run/, "--state 는 dry-run 에서만 받는다");
throwsLike(() => parseArgs(["--origin", "http://malhaebook.com"]), /https origin/, "https 가 아닌 origin 을 거부한다");
throwsLike(() => parseArgs(["--chek"]), /알 수 없는 인자/, "오타 인자를 거부한다");
throwsLike(() => liveVersionOf([]), /찾지 못했습니다/, "배포 목록이 비면 멈춘다");

// ---------------------------------------------------------------------------
// 2. 네트워크 없는 경로 — dry-run, 자격 없음, 전제 검사 실패
// ---------------------------------------------------------------------------
{
  const h = harness();
  eq(await runDeploy(["--dry-run"], h.deps), 0, "dry-run 은 전제 검사가 통과하면 0 으로 끝난다");
  eq(h.network.length, 0, "dry-run 은 네트워크를 쓰지 않는다");
  ok(h.output().includes(SOURCE_SHA) && h.output().includes("bindings_inherit=strict"), "dry-run 이 로컬 SHA-256 과 요청 계획을 보여 준다");
  ok(h.output().includes("Bearer ***") && !h.output().includes(TOKEN), "dry-run 은 토큰을 출력하지 않는다");
}
{
  const h = harness({ env: {} });
  eq(await runDeploy([], h.deps), 2, "토큰·계정 ID 가 없으면 종료 코드 2");
  eq(h.network.length, 0, "자격이 없으면 요청을 보내지 않는다");
}
for (const [label, options, pattern] of [
  ["추적 파일 변경", { trackedChanges: [" M src/modules/nlu/amount-parser.js"] }, /추적 파일 변경/],
  ["빌드 드리프트", { buildText: `${sourceBytes.toString("utf8")}// edit\n` }, /빌드 결과와 다릅니다/],
  ["판 번호 불일치", { overrides: { "VERSION.txt": "V0.0.0-OTHER\n" } }, /VERSION.txt/],
]) {
  const fake = fakeCloudflare();
  const h = harness({ fake, ...options });
  eq(await runDeploy([], h.deps), 2, `${label}이면 업로드하지 않는다(종료 코드 2)`);
  eq(fake.calls.length, 0, `${label}이면 API 를 부르지 않는다`);
  ok(pattern.test(h.output()), `${label} 이유를 알린다`);
}

// ---------------------------------------------------------------------------
// 3. 업로드 — inherit(latest, strict), 호환 설정 복사, 배포하지 않음, 기록과 가림
// ---------------------------------------------------------------------------
const first = await upload();
{
  const { fake, h, code, created, newId } = first;
  eq(code, 0, "업로드와 대조가 통과한다");
  eq(fake.calls.map((c) => `${c.method} ${c.path}`).join(" | "), `GET /deployments | GET /versions/${LIVE_ID} | GET /versions | POST /versions | GET /versions/${newId}`, "현재 배포 → 현재 버전 → 최신 버전 확인 → 업로드 → 저장된 버전 순서로만 요청한다");
  ok(fake.calls.every((c) => c.authorization === `Bearer ${TOKEN}`), "모든 API 요청에 Bearer 토큰을 붙인다");
  eq(created.query, "?bindings_inherit=strict", "업로드는 bindings_inherit=strict 로 보낸다");
  const { metadata, file, metadataType } = created.upload;
  eq(metadataType, "application/json", "metadata 부분은 application/json 이다");
  eq(metadata.main_module, "index.js", "main_module 은 index.js 다");
  eq(file.name, "index.js", "모듈 부분 이름이 main_module 과 같다");
  eq(file.type, "application/javascript+module", "모듈 부분은 ES module 형식이다");
  eq(sha256(file.bytes), SOURCE_SHA, "보낸 모듈 바이트가 src/index.js 와 같다");
  eq(metadata.bindings.length, LIVE_BINDINGS.length, "현재 바인딩 수만큼 inherit 를 보낸다");
  ok(metadata.bindings.every((b) => b.type === "inherit" && b.version_id === "latest" && Object.keys(b).length === 3), "모든 바인딩이 inherit(latest)이고 값은 담지 않는다 — 실제 API 는 버전 ID 고정을 10057 로 거부한다");
  eq(canonical(metadata.bindings.map((b) => b.name).sort()), canonical(LIVE_BINDINGS.map((b) => b.name).sort()), "inherit 이름이 현재 바인딩 이름과 같다");
  ok(!JSON.stringify(metadata).includes(PLAIN_VALUE), "업로드 metadata 에 환경변수 값이 없다");
  eq(metadata.compatibility_date, LIVE_RUNTIME.compatibility_date, "compatibility_date 를 현재 버전에서 옮긴다");
  eq(canonical(metadata.compatibility_flags), canonical(LIVE_RUNTIME.compatibility_flags), "compatibility_flags 를 옮긴다");
  eq(metadata.usage_model, LIVE_RUNTIME.usage_model, "usage_model 을 옮긴다 — 빠지면 기본값으로 바뀔 수 있다");
  eq(metadata.annotations["workers/commit_sha"], HEAD, "커밋 SHA 를 버전 주석에 남긴다");
  ok(metadata.annotations["workers/message"].includes(APP_VERSION) && metadata.annotations["workers/message"].includes(SOURCE_SHA), "버전 메시지에 판과 SHA-256 을 남긴다");
  eq(posts(fake, "/deployments"), 0, "업로드는 배포하지 않는다");
  eq(fake.deployments[0].versions[0].version_id, LIVE_ID, "업로드 뒤에도 현재 배포는 그대로다");
  const record = recordOf(h, `upload-${newId}`);
  ok(record, "업로드 기록을 남긴다");
  eq(record.data.sha256, SOURCE_SHA, "기록에 보낸 소스의 SHA-256 이 있다");
  eq(record.data.commit, HEAD, "기록에 커밋이 있다");
  eq(record.data.differences.length, 0, "기록에 대조 결과(차이 없음)가 있다");
  ok(record.data.uploaded.etag, "기록에 서버 etag 가 있다");
  ok(record.data.inherit?.version_id === "latest" && record.data.inherit.latest_version_id === LIVE_ID && record.data.inherit.basis === "live", "기록에 inherit 출처(최신 버전 = 현재 배포 버전)가 남는다");
  const snapshot = recordOf(h, `live-${LIVE_ID}`);
  ok(snapshot && !JSON.stringify(snapshot.data).includes(PLAIN_VALUE) && JSON.stringify(snapshot.data).includes("sha256:"), "현재 버전 스냅숏은 바인딩 값을 해시로만 저장한다");
  ok(h.output().includes(`--promote ${newId}`), "승격 명령을 알려 주고 스스로 승격하지 않는다");
}
{
  const h = harness();
  const statePath = "output/deploy/state-fixture.json";
  h.files.set(resolve(root, statePath), first.h.files.get(recordOf(first.h, `live-${LIVE_ID}`).path));
  eq(await runDeploy(["--dry-run", "--state", statePath], h.deps), 0, "dry-run 이 저장된 스냅숏으로 실제 metadata 를 보여 준다");
  eq(h.network.length, 0, "--state dry-run 도 네트워크를 쓰지 않는다");
  ok(LIVE_BINDINGS.every((b) => h.output().includes(`"name": "${b.name}"`)) && h.output().includes(`"version_id": "latest"`) && !h.output().includes(`"version_id": "${LIVE_ID}"`), "dry-run metadata 가 모든 바인딩을 inherit latest 로 적는다");
}

// ---------------------------------------------------------------------------
// 4. 업로드 거부 — 점진 배포, 바인딩을 못 읽음, inherit 실패, 최신 버전 출처, 저장 결과가 다름
// ---------------------------------------------------------------------------
for (const [label, fakeOptions, pattern, uploads] of [
  ["점진 배포 중", { split: true }, /100% 가 아닙니다/, 0],
  ["바인딩 0개", { liveBindings: [] }, /바인딩 목록을 읽지 못했습니다/, 0],
  ["바인딩이 배열이 아님", { liveBindings: {} }, /바인딩 목록을 읽지 못했습니다/, 0],
  ["Durable Object 마이그레이션", { liveRuntimeExtra: { migration_tag: "v1" } }, /마이그레이션/, 0],
  ["inherit 할 수 없는 바인딩", { hideFromInherit: "KAKAO_SKILL_SECRET" }, /10021.*KAKAO_SKILL_SECRET/, 1],
  ["업로드 오류 응답", { uploadError: true }, /10021/, 1],
  ["최신 버전이 배포되지 않은 다른 버전", { newerVersion: true }, /최신 버전 22222222-.* 현재 배포 버전 11111111-/, 0],
  ["버전 목록 형식을 알 수 없음", { versionListShape: "bad" }, /최신 버전을 읽지 못했습니다/, 0],
]) {
  const { fake, h, code } = await upload(fakeOptions);
  eq(code, 1, `${label}이면 멈춘다(종료 코드 1)`);
  eq(posts(fake, "/versions"), uploads, `${label}: 업로드 요청 ${uploads}회`);
  eq(posts(fake, "/deployments"), 0, `${label}: 배포하지 않는다`);
  ok(pattern.test(h.output()), `${label} 이유를 알린다`);
}
for (const [label, mutate, pattern] of [
  ["바인딩이 빠진 저장 결과", (v) => { v.resources.bindings = v.resources.bindings.filter((b) => b.name !== "OPS_MONITOR"); }, /바인딩 없음: OPS_MONITOR/],
  ["바인딩 값이 다른 저장 결과", (v) => { v.resources.bindings.find((b) => b.name === "APP_NAME").text = "CHANGED-VALUE-NOT-PRINTED"; }, /바인딩 다름: APP_NAME [(]plain_text[)] — text/],
  ["usage_model 이 바뀐 저장 결과", (v) => { v.resources.script_runtime.usage_model = "bundled"; }, /script_runtime.usage_model/],
  ["compatibility_date 가 바뀐 저장 결과", (v) => { v.resources.script_runtime.compatibility_date = "2026-10-08"; }, /script_runtime.compatibility_date/],
  ["scheduled 가 빠진 저장 결과", (v) => { v.resources.script.handlers = ["fetch"]; }, /handlers/],
]) {
  const { fake, h, code, newId } = await upload({ mutateUploaded: mutate });
  eq(code, 1, `${label}: 대조 실패로 종료 코드 1`);
  eq(posts(fake, "/deployments"), 0, `${label}: 배포하지 않는다`);
  ok(pattern.test(h.output()), `${label}: 어디가 다른지 알린다`);
  ok(!h.output().includes("CHANGED-VALUE-NOT-PRINTED") && !h.output().includes(PLAIN_VALUE), `${label}: 바인딩 값 자체는 출력하지 않는다`);
  const record = recordOf(h, `upload-${newId}`);
  ok(record && record.data.differences.length > 0, `${label}: 기록에 차이가 남는다`);
  eq(await runDeploy(["--promote", newId], h.deps), 1, `${label}: 그 버전은 --promote 도 거부한다`);
  eq(posts(fake, "/deployments"), 0, `${label}: 승격 시도에도 배포하지 않는다`);
}
{
  // 대조에 실패해 배포하지 않은 업로드가 최신 버전이 돼도, 이 스크립트가 같은 현재 버전에서 올린 것이면 다시 올린다
  const fake = fakeCloudflare();
  const h = harness({ fake });
  eq(await runDeploy([], h.deps), 0, "같은 현재 버전에서 첫 업로드");
  const firstId = [...fake.versions.keys()].at(-1);
  eq(await runDeploy([], h.deps), 0, "최신 버전이 이 스크립트가 같은 현재 버전에서 올린 버전이면 다시 올린다");
  eq(posts(fake, "/versions"), 2, "두 번째 업로드 요청을 보낸다");
  const second = recordOf(h, `upload-${[...fake.versions.keys()].at(-1)}`);
  ok(second.data.inherit.latest_version_id === firstId && second.data.inherit.basis === "recorded-upload" && second.data.differences.length === 0, "두 번째 업로드는 앞선 업로드에서 이어받고, 현재 버전과 같다");
}
{
  const fake = fakeCloudflare();
  const h = harness({ fake });
  await runDeploy([], h.deps);
  const r = recordOf(h, `upload-${[...fake.versions.keys()].at(-1)}`);
  h.files.set(r.path, JSON.stringify({ ...r.data, live: { ...r.data.live, version_id: OTHER_ID } }));
  eq(await runDeploy([], h.deps), 1, "최신 버전의 업로드 기록이 다른 배포 버전에서 나왔으면 올리지 않는다");
  eq(posts(fake, "/versions"), 1, "그때는 업로드 요청을 보내지 않는다");
  ok(/최신 버전 .* 현재 배포 버전/.test(h.output()), "올리지 않는 이유를 알린다");
}
{
  // 실제 API(2026-10-09 첫 실행)처럼 가짜 API 도 버전 ID 를 고정한 inherit 를 10057 로 거부한다
  const fake = fakeCloudflare();
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ main_module: "index.js", bindings: [{ type: "inherit", name: "APP_NAME", version_id: LIVE_ID }] })], { type: "application/json" }));
  form.append("index.js", new Blob(["export default {};\n"], { type: "application/javascript+module" }), "index.js");
  const response = await fake.fetch(`https://api.cloudflare.com${API_PREFIX}/versions?bindings_inherit=strict`, { method: "POST", body: form, headers: { authorization: `Bearer ${TOKEN}` } });
  const body = await response.json();
  ok(response.status === 400 && body.errors?.[0]?.code === 10057 && fake.versions.size === 1, "가짜 API 도 실제처럼 버전 ID 고정 inherit 를 10057 로 거부하고 버전을 만들지 않는다");
}

// ---------------------------------------------------------------------------
// 5. 승격 — 기록·HEAD·etag·현재 배포를 다시 확인한 뒤 100%, 그다음 확인
// ---------------------------------------------------------------------------
{
  const { fake, h, newId } = await upload();
  const before = fake.calls.length;
  eq(await runDeploy(["--promote", newId], h.deps), 0, "승격과 배포 후 확인이 통과한다");
  const calls = fake.calls.slice(before);
  const order = calls.map((c) => `${c.method} ${c.path}`);
  const deployAt = order.indexOf("POST /deployments");
  ok(deployAt > order.indexOf(`GET /versions/${newId}`) && deployAt > order.indexOf(`GET /versions/${LIVE_ID}`), "배포 전에 현재 버전과 대상 버전을 다시 읽어 대조한다");
  const body = calls[deployAt].body;
  eq(body.strategy, "percentage", "배포 전략은 percentage 다");
  eq(canonical(body.versions), canonical([{ version_id: newId, percentage: 100 }]), "대상 버전 하나에 100% 를 보낸다");
  ok(!calls[deployAt].query.includes("force"), "force 로 배포 차단을 우회하지 않는다");
  ok(body.annotations["workers/message"].includes(SOURCE_SHA), "배포 메시지에 SHA-256 을 남긴다");
  ok(order.slice(deployAt).includes("GET /deployments") && order.slice(deployAt).includes("GET /content/v2"), "배포 뒤 현재 배포와 배포된 소스를 다시 읽는다");
  ok(calls.some((c) => c.origin === ORIGIN && c.path === "/health"), "배포 뒤 /health 를 확인한다");
  eq(fake.deployments[0].versions[0].version_id, newId, "새 버전이 100% 배포된다");
  eq(h.publicRuns.length, 1, "공개 검사를 한 번 실행한다");
  eq(h.publicRuns[0].appVersion, APP_VERSION, "공개 검사에 로컬 판을 넘긴다");
  const record = recordOf(h, `promote-${newId}`);
  ok(record && record.data.failures.length === 0 && record.data.content.sha256 === SOURCE_SHA, "승격 기록에 배포된 소스 해시와 실패 없음이 남는다");
  ok(h.output().includes(`--rollback ${LIVE_ID}`), "되돌릴 이전 버전을 알려 준다");
  eq(await runDeploy(["--promote", newId], h.deps), 1, "이미 100% 인 버전은 다시 승격하지 않는다");
  eq(posts(fake, "/deployments"), 1, "두 번째 승격 시도는 배포 요청을 보내지 않는다");
  const rollbackFrom = fake.calls.length;
  eq(await runDeploy(["--rollback", LIVE_ID], h.deps), 0, "이전 버전으로 되돌린다");
  const rollbackCalls = fake.calls.slice(rollbackFrom);
  eq(canonical(rollbackCalls.find((c) => c.method === "POST" && c.path === "/deployments").body.versions), canonical([{ version_id: LIVE_ID, percentage: 100 }]), "되돌림은 지정한 이전 버전 하나에 100% 를 보낸다");
  ok(!rollbackCalls.some((c) => c.path === "/content/v2"), "되돌림은 로컬 소스와 비교하지 않는다");
  eq(h.publicRuns.length, 1, "되돌림 뒤에는 로컬 판 기준 공개 검사를 실행하지 않는다");
  eq(fake.deployments[0].versions[0].version_id, LIVE_ID, "이전 버전이 다시 100% 다");
}
{
  const fake = fakeCloudflare();
  const h = harness({ fake });
  eq(await runDeploy(["--promote", OTHER_ID], h.deps), 2, "업로드 기록이 없는 버전은 승격하지 않는다");
  eq(fake.calls.length, 0, "기록이 없으면 API 를 부르지 않는다");
}
for (const [label, tamper, pattern] of [
  ["업로드 뒤 소스가 바뀜", (ctx) => { const r = recordOf(ctx.h, `upload-${ctx.newId}`); ctx.h.files.set(r.path, JSON.stringify({ ...r.data, sha256: "0".repeat(64) })); }, /업로드한 소스/],
  ["업로드 뒤 HEAD 가 바뀜", (ctx) => { ctx.h.deps.git.head = () => "b".repeat(40); }, /HEAD/],
  ["업로드 뒤 대시보드에서 바인딩이 추가됨", (ctx) => { ctx.fake.versions.get(LIVE_ID).resources.bindings.push({ name: "NEW_FLAG", type: "plain_text", text: "1" }); }, /바인딩 없음: NEW_FLAG/],
  ["저장된 버전의 etag 가 바뀜", (ctx) => { ctx.fake.versions.get(ctx.newId).resources.script.etag = "tampered"; }, /etag/],
]) {
  const ctx = await upload();
  tamper(ctx);
  eq(await runDeploy(["--promote", ctx.newId], ctx.h.deps), 1, `${label}: 승격하지 않는다`);
  eq(posts(ctx.fake, "/deployments"), 0, `${label}: 배포 요청을 보내지 않는다`);
  ok(pattern.test(ctx.h.output()), `${label}: 이유를 알린다`);
}

// ---------------------------------------------------------------------------
// 6. 승격 뒤 확인 실패 — 성공으로 세지 않고, 되돌리기 명령만 알린다
// ---------------------------------------------------------------------------
for (const [label, fakeOptions, harnessOptions, pattern, publicRuns] of [
  ["배포된 소스가 다름", { contentMode: "mismatch" }, {}, /SHA-256 과 같음을 확인하지 못했습니다/, 0],
  ["content/v2 가 JSON 을 돌려줌", { contentMode: "json" }, {}, /알 수 없는 content-type/, 0],
  ["/health 판이 다름", { healthVersion: "V-STALE" }, {}, /[/]health/, 0],
  ["배포가 반영되지 않음", { ignoreDeploy: true }, {}, /100% 가 아닙니다/, 0],
  ["공개 검사 실패", {}, { publicExit: 1 }, /공개 검사 실패/, 1],
]) {
  const ctx = await upload(fakeOptions, harnessOptions);
  eq(await runDeploy(["--promote", ctx.newId], ctx.h.deps), 1, `${label}: 종료 코드 1`);
  ok(pattern.test(ctx.h.output()), `${label}: 무엇이 실패했는지 알린다`);
  ok(ctx.h.output().includes(`--rollback ${LIVE_ID}`), `${label}: 되돌리기 명령을 알린다`);
  eq(posts(ctx.fake, "/deployments"), 1, `${label}: 스스로 되돌리거나 다시 배포하지 않는다`);
  eq(ctx.h.publicRuns.length, publicRuns, `${label}: 앞선 확인이 실패하면 공개 검사로 넘어가지 않는다`);
}
{
  const ctx = await upload({ healthVersion: "V-STALE" });
  await runDeploy(["--promote", ctx.newId], ctx.h.deps);
  eq(ctx.fake.calls.filter((c) => c.path === "/health").length, 10, "/health 는 전파 지연을 고려해 10번까지 다시 본다");
}

// ---------------------------------------------------------------------------
// 7. 비교·해시 단위
// ---------------------------------------------------------------------------
{
  const version = { resources: { bindings: [{ name: "A", type: "plain_text", text: "x" }], script: { handlers: ["scheduled", "fetch"] }, script_runtime: { usage_model: "standard", compatibility_date: "2026-06-16" } } };
  const reordered = { resources: { bindings: [{ text: "x", type: "plain_text", name: "A" }], script: { handlers: ["fetch", "scheduled"] }, script_runtime: { compatibility_date: "2026-06-16", usage_model: "standard" } } };
  eq(compareVersionResources(version, reordered).length, 0, "키·handlers 순서만 다른 버전은 같다");
  eq(compareVersionResources(version, { resources: {} }).length, 4, "빈 버전과는 바인딩·런타임 두 키·handlers 가 모두 다르다");
  const dashboardRuntime = { resources: { script_runtime: { compatibility_date: "2026-06-16", usage_model: "standard" } } };
  const withFlags = (flags) => ({ resources: { script_runtime: { compatibility_date: "2026-06-16", usage_model: "standard", compatibility_flags: flags } } });
  eq(compareVersionResources(dashboardRuntime, withFlags([])).length, 0, "compatibility_flags 가 없는 것과 빈 목록은 같다(대시보드로 올린 운영 버전은 키를 생략한다)");
  eq(compareVersionResources(dashboardRuntime, withFlags(["nodejs_compat"])).join(" "), 'script_runtime.compatibility_flags: [] → ["nodejs_compat"]', "플래그가 실제로 생기면 차이로 잡는다");
  const text = await deployedScriptSha256(new Response(sourceBytes, { headers: { "content-type": "application/javascript" } }));
  eq(text.sha256, SOURCE_SHA, "content/v2 가 스크립트 본문이면 그 바이트를 해시한다");
  const html = await deployedScriptSha256(new Response("<html></html>", { headers: { "content-type": "text/html" } }));
  ok(html.error && !html.sha256, "알 수 없는 형식은 해시로 세지 않는다");
}

// ---------------------------------------------------------------------------
// 8. 토큰은 어디에도 남지 않는다
// ---------------------------------------------------------------------------
const leaked = everyText.map((text) => text()).filter((text) => text.includes(TOKEN));
eq(leaked.length, 0, "모든 실행의 출력과 기록 파일에 토큰이 없다");

console.log(`V22.9.32 배포 스크립트 검사 통과 (${checks} checks)`);
