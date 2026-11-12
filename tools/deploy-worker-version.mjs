#!/usr/bin/env node
// Uploads src/index.js as a new Cloudflare Worker version, compares the stored version with the
// version serving traffic, and promotes it only when asked. It replaces pasting 3 MB into the
// dashboard editor and keeps the manual procedure: save a version, compare, promote.
//
//   node tools/deploy-worker-version.mjs --dry-run [--state <live-*.json>]   no network at all
//   node tools/deploy-worker-version.mjs                                    upload and compare; never deploys
//   node tools/deploy-worker-version.mjs --promote <version-id>             after approval: compare again, deploy 100%, verify
//   node tools/deploy-worker-version.mjs --rollback <version-id>            deploy an earlier version 100%, verify
//
// Options: --script <name> (kakao-accountbook), --origin <https origin> (https://malhaebook.com),
// --legacy-origin <https origin> (passed to the public checks), --out-dir <dir> (output/deploy),
// --skip-public-checks, --allow-pre-seoul-db (rollback only: see the rollback floor below).
// Environment, never written to files or logs: CLOUDFLARE_API_TOKEN (Workers Scripts Write, this
// account only, with an expiry) and CLOUDFLARE_ACCOUNT_ID or CF_ACCOUNT_ID.
//
// Rules, in the order they apply:
// - Upload and promote require no uncommitted tracked changes, src/index.js equal to the
//   src/modules build, and VERSION.txt, package.json and APP_VERSION agreeing. Rollback deploys
//   old code and skips these.
// - The live deployment must send 100% of traffic to one version (no gradual rollout).
// - The live version must list at least one binding. Every binding is sent as
//   {"type":"inherit","version_id":"latest"} with bindings_inherit=strict, so a binding that
//   cannot be inherited fails the upload instead of being dropped. The Versions API accepts only
//   the literal "latest" there (a version id is refused with 10057; first real run, 2026-10-09),
//   and "latest" is the newest uploaded version, not necessarily the deployed one. So the upload
//   first requires the newest version to be the live version, or a version this script uploaded
//   while that same version was live (its local upload record says so); otherwise it refuses.
//   compatibility_date, compatibility_flags and usage_model are copied from the live version;
//   Durable Object exports or migrations are refused (this Worker has none).
// - The stored version is read back; its bindings, script_runtime and handlers must deep-equal
//   those of the live version, otherwise nothing may be promoted.
// - --promote needs the record written by the upload run for that version id, with the same
//   SHA-256 as the current src/index.js, the same commit and an unchanged server etag. No API
//   returns the source of a stored version, so the bytes are proven again after promotion.
// - After promotion the active deployment must be that version at 100%, the deployed script
//   (content/v2) must hash to the local SHA-256, and /health must report APP_VERSION in
//   HEALTH_CONSECUTIVE responses in a row (a mismatch restarts the count). Only then do the public
//   checks (tools/verify-deployment-v22920.mjs) run, and they must pass. The output names the
//   version that was live before only as a record ("되돌리기 대상(기록만): <id>"), never as a runnable
//   rollback command (rule since the 2026-10-19 incident, where a printed example was run as is);
//   the script never rolls back, retries a write or uses force on its own.
// - --rollback refuses a target older than the Seoul database cutover of this Worker (ROLLBACK_FLOORS:
//   version #333 ac5f2a4b…, created 2026-11-05 19:07 KST). Older versions carry the Secrets of the old
//   Sydney Supabase project, which is being paused, so deploying one takes the whole service down. The
//   version number and created_on from GET /versions/<id> decide; if neither can be read the rollback is
//   refused too. --allow-pre-seoul-db overrides this on purpose. After a rollback /health must stay
//   alive and /ready must answer ok READY_CONSECUTIVE times in a row (it checks the tables and
//   functions, which /health does not). The APP_VERSION that /health reported before the rollback is
//   recorded first; afterwards only responses with a different version count. A /ready answer reused
//   from an instance cache (cached:true) counts as not ready when it is not ok, counts as ok only when
//   its checked_at is later than the deployment request, and otherwise is not counted (the tool waits
//   for that cache to expire). When /health still reports only the pre-rollback APP_VERSION (a version
//   with the same APP_VERSION, e.g. one that only changed variables or Secrets), the responses cannot
//   tell the versions apart: that is a warning, not a failure, and /health liveness and /ready run
//   without the version filter and decide the exit code. The warning names the active version id that
//   the deployments API reported after the rollback, which is the evidence to check.
// - Snapshots go to <out-dir>/<APP_VERSION>/ (untracked). Binding fields other than identifiers
//   are stored as SHA-256 digests; the API never returns Secret values.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFromModulesRoot, sha256 } from "./build-worker.mjs";

export const DEFAULT_SCRIPT = "kakao-accountbook";
export const DEFAULT_ORIGIN = "https://malhaebook.com";
export const DEFAULT_OUT_DIR = "output/deploy";
export const API_BASE = "https://api.cloudflare.com/client/v4";
export const MAIN_MODULE = "index.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACCOUNT_ID = /^[0-9a-f]{32}$/;
const USAGE = [
  "usage: node tools/deploy-worker-version.mjs [--dry-run [--state <file>] | --promote <version-id> | --rollback <version-id> [--allow-pre-seoul-db]]",
  "         [--script <name>] [--origin <https-origin>] [--legacy-origin <https-origin>] [--out-dir <dir>] [--skip-public-checks]",
].join("\n");

// V22.9.118 O-4: 되돌리기 하한. 이 Worker 의 서울 DB 전환 버전(2026-11-05 19:07 KST 업로드, 새 Supabase Secret 두 개)보다 앞선 버전은
// 옛(시드니) Supabase 프로젝트의 Secret 을 담고 있다. 옛 프로젝트를 멈춘 뒤 그 버전으로 내리면 모든 DB 요청이 실패한다(전면 장애).
// created_on 은 실제 업로드 기록(review-artifacts/supabase-seoul-migration/cutover-2026-11-05/upload-ac5f2a4b-….json)의 값이다.
export const ROLLBACK_FLOOR_OVERRIDE = "--allow-pre-seoul-db";
export const ROLLBACK_FLOORS = Object.freeze({
  "kakao-accountbook": Object.freeze({ versionId: "ac5f2a4b-de71-46a5-94cc-92b1743a3d8b", number: 333, createdOn: "2026-11-05T10:07:18.932265Z", label: "서울 DB 전환 버전(#333, 2026-11-05 19:07 KST)" }),
});

export class UsageError extends Error {}

function httpsOrigin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new UsageError(`${name}: URL 이 아닙니다: ${value}`); }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new UsageError(`${name}: 경로·쿼리·자격 증명이 없는 https origin 이어야 합니다: ${value}`);
  }
  return url.origin;
}

export function parseArgs(argv) {
  const options = { mode: "upload", versionId: null, state: null, script: DEFAULT_SCRIPT, origin: DEFAULT_ORIGIN, legacyOrigin: null, outDir: DEFAULT_OUT_DIR, publicChecks: true, allowPreSeoulDb: false };
  const modes = [];
  const valueAt = (i) => {
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) throw new UsageError(`${argv[i]} 에 값이 필요합니다\n${USAGE}`);
    return next;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") modes.push("dry-run");
    else if (arg === "--skip-public-checks") options.publicChecks = false;
    else if (arg === ROLLBACK_FLOOR_OVERRIDE) options.allowPreSeoulDb = true;
    else if (arg === "--promote" || arg === "--rollback") { modes.push(arg.slice(2)); options.versionId = valueAt(i); i += 1; }
    else if (arg === "--state") { options.state = valueAt(i); i += 1; }
    else if (arg === "--script") { options.script = valueAt(i); i += 1; }
    else if (arg === "--origin") { options.origin = valueAt(i); i += 1; }
    else if (arg === "--legacy-origin") { options.legacyOrigin = valueAt(i); i += 1; }
    else if (arg === "--out-dir") { options.outDir = valueAt(i); i += 1; }
    else throw new UsageError(`알 수 없는 인자: ${arg}\n${USAGE}`);
  }
  if (modes.length > 1) throw new UsageError(`--dry-run, --promote, --rollback 중 하나만 씁니다\n${USAGE}`);
  if (modes.length === 1) options.mode = modes[0];
  if (options.state && options.mode !== "dry-run") throw new UsageError("--state 는 --dry-run 에서만 씁니다");
  if (options.allowPreSeoulDb && options.mode !== "rollback") throw new UsageError(`${ROLLBACK_FLOOR_OVERRIDE} 는 --rollback 에서만 씁니다`);
  if (options.versionId && !UUID.test(options.versionId)) throw new UsageError(`버전 ID 형식이 아닙니다: ${options.versionId}`);
  if (!/^[a-z0-9-]+$/.test(options.script)) throw new UsageError(`Worker 이름 형식이 아닙니다: ${options.script}`);
  options.origin = httpsOrigin(options.origin, "--origin");
  if (options.legacyOrigin) options.legacyOrigin = httpsOrigin(options.legacyOrigin, "--legacy-origin");
  return options;
}

export function readCredentials(env) {
  const token = String(env.CLOUDFLARE_API_TOKEN || "");
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || "");
  const problems = [];
  if (!token || !/^[!-~]+$/.test(token)) problems.push("CLOUDFLARE_API_TOKEN 환경변수가 없거나 형식이 이상합니다");
  if (!ACCOUNT_ID.test(accountId)) problems.push("CLOUDFLARE_ACCOUNT_ID(또는 CF_ACCOUNT_ID) 환경변수가 32자리 계정 ID 가 아닙니다");
  if (problems.length) throw new UsageError(problems.join("\n"));
  return { token, accountId };
}

export function readLocalRelease(root, readFile = readFileSync) {
  const sourceBytes = readFile(resolve(root, "src/index.js"));
  const appVersion = (sourceBytes.toString("utf8").match(/const APP_VERSION = "([^"]+)"/) || [])[1] || null;
  return {
    sourceBytes,
    sha256: sha256(sourceBytes),
    bytes: sourceBytes.length,
    appVersion,
    versionTxt: String(readFile(resolve(root, "VERSION.txt"), "utf8")).trim(),
    pkgVersion: JSON.parse(readFile(resolve(root, "package.json"), "utf8")).version,
  };
}

export function checkPreconditions({ trackedChanges, local, builtSha256 }) {
  const problems = [];
  if (trackedChanges.length) problems.push(`커밋되지 않은 추적 파일 변경이 있습니다: ${trackedChanges.slice(0, 5).join(", ")}`);
  if (builtSha256 !== local.sha256) problems.push("src/index.js 가 src/modules 빌드 결과와 다릅니다 (npm run build:worker 후 커밋)");
  if (!local.appVersion) problems.push("src/index.js 에서 APP_VERSION 을 찾지 못했습니다");
  else {
    if (local.versionTxt !== local.appVersion) problems.push(`VERSION.txt(${local.versionTxt}) 와 APP_VERSION(${local.appVersion}) 이 다릅니다`);
    const numeric = local.appVersion.replace(/^V/, "").split("-")[0];
    if (local.pkgVersion !== numeric) problems.push(`package.json version(${local.pkgVersion}) 이 APP_VERSION 의 숫자 ${numeric} 와 다릅니다`);
  }
  return problems;
}

export function createCloudflareClient({ fetch, token, accountId, script }) {
  const base = `${API_BASE}/accounts/${accountId}/workers/scripts/${script}`;
  async function call(method, path, { body, json, timeoutMs = 30000, raw = false } = {}) {
    const init = { method, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) };
    if (json !== undefined) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(json); }
    if (body !== undefined) init.body = body;
    const response = await fetch(`${base}${path}`, init);
    if (raw) return response;
    let envelope;
    try { envelope = await response.json(); } catch { throw new Error(`${method} ${path}: HTTP ${response.status}, JSON 이 아닌 응답`); }
    if (!response.ok || !envelope || envelope.success !== true) {
      const errors = (envelope?.errors || []).map((e) => `${e.code}: ${e.message}`).join("; ") || "오류 내용 없음";
      throw new Error(`${method} ${path}: HTTP ${response.status} — ${errors}`);
    }
    return envelope.result;
  }
  return {
    listDeployments: async () => (await call("GET", "/deployments"))?.deployments ?? [],
    listVersions: async () => (await call("GET", "/versions"))?.items,
    getVersion: (versionId) => call("GET", `/versions/${versionId}`),
    uploadVersion: (form) => call("POST", "/versions?bindings_inherit=strict", { body: form, timeoutMs: 120000 }),
    createDeployment: (payload) => call("POST", "/deployments", { json: payload }),
    getContent: () => call("GET", "/content/v2", { raw: true, timeoutMs: 60000 }),
  };
}

export function liveVersionOf(deployments) {
  const active = deployments[0];
  if (!active) throw new Error("현재 배포를 찾지 못했습니다");
  const versions = active.versions || [];
  if (versions.length !== 1 || Number(versions[0].percentage) !== 100 || !UUID.test(String(versions[0].version_id))) {
    throw new Error(`현재 배포 ${active.id} 가 버전 하나에 100% 가 아닙니다(점진 배포 중). 대시보드에서 먼저 정리합니다`);
  }
  return { deploymentId: active.id, versionId: versions[0].version_id };
}

// GET /versions lists the newest version first (API reference: "The first version in the list is
// the latest version"). A list that does not look like that is not taken as an answer.
export function latestVersionIdOf(items) {
  const id = Array.isArray(items) ? items[0]?.id : undefined;
  if (!UUID.test(String(id))) throw new Error("버전 목록에서 최신 버전을 읽지 못했습니다. 업로드하지 않습니다");
  return id;
}

// inherit "latest" copies every binding, Secret values included, from the newest version. That is
// the live configuration only when the newest version is the live one, or one this script uploaded
// while the same version was live (that upload inherited from it in turn, under this same rule).
export function inheritSourceCheck({ liveVersionId, latestVersionId, record }) {
  if (latestVersionId === liveVersionId) return { ok: true, basis: "live" };
  if (record?.mode === "upload" && record?.uploaded?.version_id === latestVersionId && record?.live?.version_id === liveVersionId) return { ok: true, basis: "recorded-upload" };
  return { ok: false, reason: `최신 버전 ${latestVersionId} 이 현재 배포 버전 ${liveVersionId} 가 아닙니다. inherit 는 최신 버전의 바인딩·Secret 을 이어받으므로 업로드하지 않습니다. 대시보드에서 최신 버전이 무엇인지 확인합니다` };
}

// Key-sorted JSON, so two objects with the same content compare equal regardless of key order.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

// A version whose bindings cannot be read must never count as "no bindings": uploading zero
// inherit bindings and then comparing zero with zero would promote a Worker without Secrets.
export function requireBindings(version) {
  const bindings = version?.resources?.bindings;
  if (!Array.isArray(bindings) || bindings.length === 0) throw new Error("현재 버전의 바인딩 목록을 읽지 못했습니다(배열이 아니거나 0개). 업로드하지 않습니다");
  const names = new Set();
  for (const binding of bindings) {
    if (!binding || typeof binding.name !== "string" || !binding.name || typeof binding.type !== "string") throw new Error("이름·종류가 없는 바인딩이 있습니다. 업로드하지 않습니다");
    if (names.has(binding.name)) throw new Error(`같은 이름의 바인딩이 두 번 있습니다: ${binding.name}`);
    names.add(binding.name);
  }
  return bindings;
}

export function compareVersionResources(expected, actual) {
  const differences = [];
  const byName = (version) => new Map((Array.isArray(version?.resources?.bindings) ? version.resources.bindings : []).map((b) => [b?.name, b]));
  const before = byName(expected);
  const after = byName(actual);
  for (const [name, binding] of before) {
    const other = after.get(name);
    if (!other) { differences.push(`바인딩 없음: ${name} (${binding?.type})`); continue; }
    if (canonical(binding) !== canonical(other)) {
      const fields = [...new Set([...Object.keys(binding), ...Object.keys(other)])].filter((k) => canonical(binding[k]) !== canonical(other[k]));
      differences.push(`바인딩 다름: ${name} (${binding?.type}) — ${fields.sort().join(", ")}`);
    }
  }
  for (const [name, binding] of after) if (!before.has(name)) differences.push(`바인딩 추가됨: ${name} (${binding?.type})`);
  // No compatibility flags and an empty flag list mean the same; dashboard versions omit the key.
  const runtimeOf = (version) => {
    const runtime = { ...(version?.resources?.script_runtime ?? {}) };
    if (runtime.compatibility_flags == null) runtime.compatibility_flags = [];
    return runtime;
  };
  const runtimeBefore = runtimeOf(expected);
  const runtimeAfter = runtimeOf(actual);
  for (const key of [...new Set([...Object.keys(runtimeBefore), ...Object.keys(runtimeAfter)])].sort()) {
    if (canonical(runtimeBefore[key]) !== canonical(runtimeAfter[key])) differences.push(`script_runtime.${key}: ${canonical(runtimeBefore[key])} → ${canonical(runtimeAfter[key])}`);
  }
  const handlers = (version) => canonical([...(version?.resources?.script?.handlers ?? [])].sort());
  if (handlers(expected) !== handlers(actual)) differences.push(`handlers: ${handlers(expected)} → ${handlers(actual)}`);
  const named = (version) => canonical(version?.resources?.script?.named_handlers ?? []);
  if (named(expected) !== named(actual)) differences.push(`named_handlers: ${named(expected)} → ${named(actual)}`);
  return differences;
}

export function buildUploadMetadata(liveVersion, { appVersion, sha256: digest, commitSha }) {
  const runtime = liveVersion?.resources?.script_runtime ?? {};
  if (runtime.migration_tag) throw new Error("Durable Object 마이그레이션이 있는 Worker 는 이 스크립트로 올리지 않습니다");
  if (runtime.exports && Object.keys(runtime.exports).length) throw new Error("선언형 exports 가 있는 Worker 는 이 스크립트로 올리지 않습니다");
  if (!runtime.compatibility_date) throw new Error("현재 버전의 compatibility_date 를 읽지 못했습니다. 업로드하지 않습니다");
  const bindings = requireBindings(liveVersion);
  const metadata = { main_module: MAIN_MODULE, compatibility_date: runtime.compatibility_date };
  if (Array.isArray(runtime.compatibility_flags)) metadata.compatibility_flags = [...runtime.compatibility_flags];
  if (runtime.usage_model) metadata.usage_model = runtime.usage_model;
  metadata.bindings = bindings.map((binding) => ({ type: "inherit", name: binding.name, version_id: "latest" }));
  metadata.annotations = { "workers/message": `${appVersion} sha256:${digest}`, "workers/commit_sha": commitSha };
  return metadata;
}

export function buildUploadForm(metadata, sourceBytes) {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append(MAIN_MODULE, new Blob([sourceBytes], { type: "application/javascript+module" }), MAIN_MODULE);
  return form;
}

// content/v2 is not documented: accept a multipart body (the entry module part) or a plain script
// body. Anything else is "not verified", never success.
export async function deployedScriptSha256(response) {
  if (!response.ok) return { error: `HTTP ${response.status}` };
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (type.startsWith("multipart/form-data")) {
    const form = await response.formData();
    const entry = response.headers.get("cf-entrypoint") || MAIN_MODULE;
    const part = form.get(entry);
    if (part === null) return { error: `multipart 응답에 ${entry} 부분이 없습니다 (${[...form.keys()].join(", ")})` };
    const bytes = typeof part === "string" ? Buffer.from(part, "utf8") : Buffer.from(await part.arrayBuffer());
    return { sha256: sha256(bytes), bytes: bytes.length, entry, parts: [...form.keys()] };
  }
  if (type.includes("javascript") || type.startsWith("text/plain")) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return { sha256: sha256(bytes), bytes: bytes.length, entry: "(본문)", parts: [] };
  }
  return { error: `알 수 없는 content-type: ${type || "(없음)"}` };
}

// While a deployment propagates, requests can still reach the previous version for a few seconds,
// so one matching /health response is not enough: the public checks that follow make their own
// single /health request (first real promotion, 2026-10-09: 115/116 for exactly that reason).
// Wait for HEALTH_CONSECUTIVE matching responses in a row; any mismatch starts the count again.
export const HEALTH_CONSECUTIVE = 5;
export const HEALTH_MAX_ATTEMPTS = 40;
export const HEALTH_DELAY_MS = 2000;

// excludeVersion(V22.9.118 O-4, 되돌리기): 배포 전 판. 그 판을 알리는 응답은 이전 버전 인스턴스의 것이라 맞은 응답으로 세지 않는다.
// 그때만 살아 있으면서 그 판을 알린 응답 수(previous_version)를 함께 돌려준다(승격처럼 excludeVersion 이 없으면 결과 모양은 예전 그대로).
export async function checkHealth({ fetch, origin, expectedVersion, excludeVersion = null, sleep, attempts = HEALTH_MAX_ATTEMPTS, delayMs = HEALTH_DELAY_MS, consecutive = HEALTH_CONSECUTIVE }) {
  let last = {};
  let streak = 0;
  let mismatches = 0;
  let firstMatch = null;
  let previousVersion = 0;
  const previous = () => (excludeVersion ? { previous_version: previousVersion } : {});
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let matched = false;
    try {
      const response = await fetch(`${origin}/health`, { headers: { accept: "application/json", "cache-control": "no-cache", "user-agent": "MalhaebookDeploy" }, signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      last = { status: response.status, alive: data?.alive, version: data?.version, missing_count: data?.missing_count };
      matched = response.status === 200 && data?.alive === true && (!expectedVersion || data?.version === expectedVersion) && (!excludeVersion || data?.version !== excludeVersion);
      if (excludeVersion && response.status === 200 && data?.alive === true && data?.version === excludeVersion) previousVersion += 1;
    } catch (error) {
      last = { error: error.message };
    }
    if (matched) {
      streak += 1;
      firstMatch ??= attempt;
      if (streak >= consecutive) return { ok: true, attempts: attempt, consecutive: streak, first_match_attempt: firstMatch, mismatches, ...previous(), ...last };
    } else {
      streak = 0;
      mismatches += 1;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  return { ok: false, attempts, consecutive: streak, first_match_attempt: firstMatch, mismatches, ...previous(), ...last };
}

// V22.9.118 O-4: 되돌린 뒤의 /ready. /health 는 DB 를 보지 않아 옛 Supabase 를 가리키는 버전도 살아 있다고 답한다. /ready 는 필수 표·함수를
// 점검해 준비되면 200·ok:true, 아니면 503 이다. 전파 중에는 이전 버전 인스턴스가 답할 수 있어 READY_CONSECUTIVE 번 연속 ok 를 본다.
// 한 번에 몇 초 걸릴 수 있어 시간 제한은 /health 보다 길다.
// 독립 검토 P3-4: 되돌린 버전이 직접 점검한 응답만 센다.
//  · excludeVersion(배포 전 판)을 알리는 응답은 이전 버전 인스턴스의 것이라 세지 않고 연속을 끊는다(/health 의 불일치와 같다).
//  · 다시 쓴 응답(cached:true): 앱은 인스턴스(isolate)마다 마지막 점검 결과(성공·실패 모두)를 60초 다시 쓰고, 그 답에만 실제 점검 시각
//    checked_at 을 붙인다(src/modules/worker/router.js readinessReportV22994·/ready). 재검토(2026-11-12) 반영:
//    - ok 가 아니면 ‘준비 안 됨’으로 센다(연속을 끊는다 — 되돌린 버전이 60초 안에 실제로 점검해 얻은 503 이다).
//    - ok 이면 checked_at 이 배포 요청 시각(notBefore)보다 뒤일 때만 센다(그 버전이 배포 뒤 직접 점검한 결과다).
//    - checked_at 이 없거나, 배포 요청 시각보다 뒤가 아니거나, notBefore 를 받지 않았으면 세지도 끊지도 않고 그 인스턴스의 다시 쓰기가 끝날
//      만큼(READY_CACHE_WAIT_MS) 기다렸다 다시 본다.
//    배포 요청 시각은 이 PC 의 시계, checked_at 은 Worker 의 시계다. PC 시계가 늦으면 그만큼 앞선 점검도 셀 수 있다(빠르면 기다릴 뿐이다).
// 판 이름이 배포 전과 같은 버전으로 되돌릴 때(응답으로 가릴 수 없을 때)는 deployAndVerify 가 판 제외 없이 이 함수를 부른다.
export const READY_CONSECUTIVE = 2;
export const READY_MAX_ATTEMPTS = 6;
export const READY_CACHE_WAIT_MS = 61000;

export async function checkReady({ fetch, origin, sleep, excludeVersion = null, notBefore = null, attempts = READY_MAX_ATTEMPTS, delayMs = HEALTH_DELAY_MS, cacheWaitMs = READY_CACHE_WAIT_MS, consecutive = READY_CONSECUTIVE }) {
  const since = notBefore === null || notBefore === undefined ? NaN : new Date(notBefore).getTime();
  let last = {};
  let streak = 0;
  let notOk = 0;
  let previousVersion = 0;
  let cachedSkipped = 0;
  let cachedCounted = 0;
  let cachedNotOk = 0;
  const counts = () => ({ not_ok: notOk, previous_version: previousVersion, cached_skipped: cachedSkipped, cached_counted: cachedCounted, cached_not_ok: cachedNotOk });
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let outcome = "not_ok";
    try {
      const response = await fetch(`${origin}/ready`, { headers: { accept: "application/json", "cache-control": "no-cache", "user-agent": "MalhaebookDeploy" }, signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      last = { status: response.status, ready: data?.ready, body_ok: data?.ok, version: data?.version, failed_tables: Array.isArray(data?.failed_tables) ? data.failed_tables.length : null, missing_rpcs: Array.isArray(data?.missing_rpcs) ? data.missing_rpcs.length : null, cached: data?.cached === true };
      const healthy = response.status === 200 && data?.ok === true;
      if (excludeVersion && data?.version === excludeVersion) outcome = "previous_version";
      else if (data?.cached !== true) outcome = healthy ? "ok" : "not_ok";
      else if (!healthy) {
        outcome = "not_ok";
        cachedNotOk += 1;
      } else {
        const checkedAt = typeof data?.checked_at === "string" ? Date.parse(data.checked_at) : NaN;
        if (Number.isFinite(checkedAt) && Number.isFinite(since) && checkedAt > since) {
          outcome = "ok";
          cachedCounted += 1;
        } else {
          outcome = "cached";
        }
      }
    } catch (error) {
      last = { error: error.message };
    }
    if (outcome === "ok") {
      streak += 1;
      if (streak >= consecutive) return { ...last, ok: true, attempts: attempt, consecutive: streak, ...counts() };
    } else if (outcome === "cached") {
      cachedSkipped += 1;
    } else {
      streak = 0;
      if (outcome === "previous_version") previousVersion += 1;
      else notOk += 1;
    }
    if (attempt < attempts) await sleep(outcome === "cached" ? cacheWaitMs : delayMs);
  }
  return { ...last, ok: false, attempts, consecutive: streak, ...counts() };
}

// V22.9.118 O-4: 되돌리기 전 /health 의 판을 한 번 읽는다(되돌린 뒤 그 판의 응답을 세지 않으려고). 읽지 못하면 version 은 null 이다.
export async function readHealthVersion({ fetch, origin }) {
  try {
    const response = await fetch(`${origin}/health`, { headers: { accept: "application/json", "cache-control": "no-cache", "user-agent": "MalhaebookDeploy" }, signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    const version = response.status === 200 && typeof data?.version === "string" && data.version ? data.version : null;
    return { status: response.status, version };
  } catch (error) {
    return { error: error.message, version: null };
  }
}

// created_on 은 마이크로초까지 온다(2026-11-05T10:07:18.932265Z). 밀리초 세 자리로 잘라 읽는다.
function versionCreatedMs(value) {
  const text = String(value ?? "").trim().replace(/(\.\d{3})\d+/, "$1");
  return text ? Date.parse(text) : NaN;
}

// V22.9.118 O-4: 되돌릴 버전이 이 Worker 의 하한(ROLLBACK_FLOORS)보다 앞서면 그 이유를, 아니면 null 을 돌려준다. 하한 버전 자신은 된다.
// 버전 번호와 만든 시각(created_on) 중 하나라도 하한보다 앞이면 앞선 버전이다. 둘 다 읽지 못하면 확인하지 못한 것이라 거절 쪽이다.
// 하한이 없는 Worker(다른 --script)는 보지 않는다.
export function rollbackFloorProblem({ script, versionId, version }) {
  const floor = ROLLBACK_FLOORS[script];
  if (!floor || versionId === floor.versionId) return null;
  const rawNumber = version?.number;
  const number = rawNumber === null || rawNumber === undefined || rawNumber === "" ? NaN : Number(rawNumber);
  const created = versionCreatedMs(version?.metadata?.created_on);
  if (Number.isFinite(number) && number < floor.number) return `되돌릴 버전 ${versionId} 는 ${floor.label}보다 앞선 버전입니다(번호 ${number} < ${floor.number})`;
  if (Number.isFinite(created) && created < versionCreatedMs(floor.createdOn)) return `되돌릴 버전 ${versionId} 는 ${floor.label}보다 앞선 버전입니다(만든 시각 ${version.metadata.created_on})`;
  if (!Number.isFinite(number) && !Number.isFinite(created)) return `되돌릴 버전 ${versionId} 의 번호·만든 시각을 읽지 못해 ${floor.label} 뒤의 버전인지 확인하지 못했습니다`;
  return null;
}

const IDENTIFIER_FIELDS = new Set(["name", "type", "service", "environment", "entrypoint", "namespace_id", "database_id", "id", "bucket_name", "jurisdiction", "queue_name", "class_name", "script_name", "dataset", "index_name", "workflow_name", "store_id", "secret_name", "certificate_id", "namespace", "pipeline", "format", "algorithm", "usages"]);

export function redactVersion(version) {
  const copy = JSON.parse(JSON.stringify(version ?? {}));
  if (Array.isArray(copy?.resources?.bindings)) {
    copy.resources.bindings = copy.resources.bindings.map((binding) => Object.fromEntries(Object.entries(binding).map(([key, value]) => [key, IDENTIFIER_FIELDS.has(key) ? value : `sha256:${sha256(canonical(value))}`])));
  }
  return copy;
}

function releaseDirectory(deps, options, label) {
  return resolve(deps.root, options.outDir, label || "unknown");
}

// 2026-10-19 (V22.9.68 배포 뒤): 최신 버전의 업로드 기록이 다른 판 폴더에 남을 수 있다. 저장만 하고 승격하지 않은 업로드
// (V22.9.63-ROOM-REBIND, 3fe22ed1…) 뒤에 판이 V22.9.68 로 올라가자 현재 판 폴더에서만 찾던 기록을 못 찾아 업로드를 거부했다.
// 현재 판 폴더를 먼저 보고, 없으면 out-dir 아래 모든 판 폴더를 본다. 기록이 어느 배포 버전에서 올린 것인지는 예전처럼
// inheritSourceCheck 가 판정하므로 다른 폴더의 기록이라고 더 믿는 것은 없다.
function findUploadRecord(deps, options, label, versionId) {
  const name = `upload-${versionId}.json`;
  const base = resolve(deps.root, options.outDir);
  const siblings = typeof deps.listDirectories === "function" ? deps.listDirectories(base) : [];
  for (const folder of [...new Set([label || "unknown", ...siblings])]) {
    const path = join(base, folder, name);
    if (deps.exists(path)) return { path, folder, record: JSON.parse(deps.readFile(path, "utf8")) };
  }
  return null;
}

function writeRecord(deps, directory, name, data) {
  deps.mkdir(directory);
  const path = join(directory, name);
  deps.writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}

function liveSnapshot(deps, options, live, liveVersion) {
  return { at: deps.now().toISOString(), script: options.script, deployment: { id: live.deploymentId, versions: [{ version_id: live.versionId, percentage: 100 }] }, version: redactVersion(liveVersion) };
}

function localPreconditions(deps) {
  const local = readLocalRelease(deps.root, deps.readFile);
  const problems = checkPreconditions({ trackedChanges: deps.git.trackedChanges(), local, builtSha256: sha256(deps.build().text) });
  return { local, problems, commit: deps.git.head() };
}

async function runDryRun(options, deps) {
  const { local, problems, commit } = localPreconditions(deps);
  const state = options.state ? JSON.parse(deps.readFile(resolve(deps.root, options.state), "utf8")) : null;
  const accountId = deps.env.CLOUDFLARE_ACCOUNT_ID || deps.env.CF_ACCOUNT_ID || "<CLOUDFLARE_ACCOUNT_ID>";
  const base = `${API_BASE}/accounts/${accountId}/workers/scripts/${options.script}`;
  deps.log(`[dry-run] 네트워크 요청 없음. API 토큰 ${deps.env.CLOUDFLARE_API_TOKEN ? "있음(출력하지 않음)" : "없음"}`);
  deps.log(`로컬: ${local.appVersion} · commit ${commit} · src/index.js ${local.bytes} bytes · sha256 ${local.sha256}`);
  deps.log(problems.length ? `전제 검사 실패:\n- ${problems.join("\n- ")}` : "전제 검사 통과: 추적 파일 변경 없음, 빌드 동일, 판 번호 일치");
  deps.log("실제 실행의 요청 순서 (Authorization: Bearer ***):");
  for (const line of [
    `GET  ${base}/deployments  — 현재 배포가 버전 하나 100% 인지`,
    `GET  ${base}/versions/<live-version-id>  — 바인딩·script_runtime·handlers`,
    `GET  ${base}/versions  — 최신 버전이 현재 배포 버전(또는 이 스크립트가 그 버전에서 올린 버전)인지. inherit latest 의 출처이므로 아니면 업로드 금지`,
    `POST ${base}/versions?bindings_inherit=strict  — multipart: metadata(application/json) + ${MAIN_MODULE}(application/javascript+module, ${local.bytes} bytes)`,
    `GET  ${base}/versions/<new-version-id>  — 저장된 버전 깊은 비교, 다르면 승격 금지`,
    "--promote <id> (승인 후): 기록·HEAD·etag 확인 → 다시 비교 → POST /deployments 100% → GET /deployments → GET /content/v2 해시 → /health → 공개 검사",
  ]) deps.log(`  ${line}`);
  let metadata;
  if (state?.version) {
    const liveVersionId = state.version.id || state.deployment?.versions?.[0]?.version_id;
    metadata = buildUploadMetadata(state.version, { appVersion: local.appVersion, sha256: local.sha256, commitSha: commit });
    deps.log(`상태 파일 ${options.state} 기준 metadata (바인딩 ${metadata.bindings.length}개, 모두 inherit latest — 최신 버전이 ${liveVersionId} 일 때만 올림):`);
  } else {
    metadata = { main_module: MAIN_MODULE, compatibility_date: "<현재 버전 값>", compatibility_flags: "<현재 버전 값>", usage_model: "<현재 버전 값>", bindings: "<현재 버전의 바인딩 전부를 inherit 로, version_id=latest>", annotations: { "workers/message": `${local.appVersion} sha256:${local.sha256}`, "workers/commit_sha": commit } };
    deps.log("metadata 골격 (바인딩·호환 설정은 실제 실행 때 현재 버전에서 읽습니다. --state 로 미리 볼 수 있습니다):");
  }
  deps.log(JSON.stringify(metadata, null, 2));
  return problems.length ? 2 : 0;
}

async function runUpload(options, deps, client) {
  const { local, problems, commit } = localPreconditions(deps);
  if (problems.length) { deps.error(`전제 검사 실패 — 업로드하지 않습니다:\n- ${problems.join("\n- ")}`); return 2; }
  const live = liveVersionOf(await client.listDeployments());
  const liveVersion = await client.getVersion(live.versionId);
  const metadata = buildUploadMetadata(liveVersion, { appVersion: local.appVersion, sha256: local.sha256, commitSha: commit });
  const directory = releaseDirectory(deps, options, local.appVersion);
  writeRecord(deps, directory, `live-${live.versionId}.json`, liveSnapshot(deps, options, live, liveVersion));
  const latestId = latestVersionIdOf(await client.listVersions());
  const latestFound = latestId !== live.versionId ? findUploadRecord(deps, options, local.appVersion, latestId) : null;
  const latestRecord = latestFound?.record || null;
  const latestRecordPath = latestFound?.path || "";
  const inherit = inheritSourceCheck({ liveVersionId: live.versionId, latestVersionId: latestId, record: latestRecord });
  if (!inherit.ok) { deps.error(inherit.reason); return 1; }
  deps.log(`현재 배포 ${live.deploymentId} → 버전 ${live.versionId} (바인딩 ${metadata.bindings.length}개). 최신 버전 ${latestId}${inherit.basis === "live" ? " = 현재 배포 버전" : ` = 이 스크립트가 현재 배포 버전에서 올린 버전(${latestFound?.folder === local.appVersion ? "" : "이전 판 폴더 "}${latestRecordPath})`}. ${local.appVersion} 업로드 — 배포 아님`);
  const created = await client.uploadVersion(buildUploadForm(metadata, local.sourceBytes));
  if (!created?.id || !UUID.test(created.id)) throw new Error("업로드 응답에 버전 ID 가 없습니다");
  const uploaded = await client.getVersion(created.id);
  const differences = compareVersionResources(liveVersion, uploaded);
  const etag = uploaded?.resources?.script?.etag ?? created?.resources?.script?.etag ?? null;
  const record = {
    mode: "upload", at: deps.now().toISOString(), script: options.script, app_version: local.appVersion, commit, sha256: local.sha256, bytes: local.bytes,
    live: { deployment_id: live.deploymentId, version_id: live.versionId, binding_count: metadata.bindings.length },
    inherit: { version_id: "latest", latest_version_id: latestId, basis: inherit.basis },
    uploaded: { version_id: created.id, number: uploaded?.number ?? created?.number ?? null, created_on: uploaded?.metadata?.created_on ?? null, etag, etag_equals_sha256: etag === local.sha256, startup_time_ms: created?.startup_time_ms ?? null },
    differences, metadata_sent: metadata,
  };
  const path = writeRecord(deps, directory, `upload-${created.id}.json`, record);
  deps.log(`저장된 버전 ${created.id} (번호 ${record.uploaded.number ?? "?"}, 시작 ${record.uploaded.startup_time_ms ?? "?"}ms). 기록: ${path}`);
  if (differences.length) {
    deps.error(`저장된 버전이 현재 버전과 다릅니다 — 승격하지 마세요:\n- ${differences.join("\n- ")}`);
    return 1;
  }
  deps.log(`바인딩 ${metadata.bindings.length}개·script_runtime·handlers 가 현재 버전과 같습니다. 배포는 하지 않았습니다.`);
  deps.log(`승인 후 승격: node tools/deploy-worker-version.mjs --promote ${created.id}`);
  return 0;
}

async function deployAndVerify(options, deps, client, { targetId, previousId, expectedVersion, expectedSha256, message, runPublic, runReady = false, excludeVersion = null }) {
  // V22.9.118 재검토 P3: 되돌리기의 /ready 는 다시 쓴 응답의 checked_at 을 이 배포 요청 시각과 견준다(승격은 /ready 를 보지 않아 읽지 않는다).
  const requestedAt = runReady ? deps.now() : null;
  const deployment = await client.createDeployment({ strategy: "percentage", versions: [{ version_id: targetId, percentage: 100 }], annotations: { "workers/message": message } });
  deps.log(`배포 ${deployment?.id ?? "?"}: 버전 ${targetId} 100%`);
  const checks = { deployment_id: deployment?.id ?? null, previous_version_id: previousId };
  if (requestedAt) checks.deploy_requested_at = requestedAt.toISOString();
  const failures = [];
  try { checks.active = liveVersionOf(await client.listDeployments()); } catch (error) { checks.active = { error: error.message }; }
  if (checks.active.versionId !== targetId) failures.push(`현재 배포가 ${targetId} 100% 가 아닙니다 (${checks.active.versionId ?? checks.active.error})`);
  if (expectedSha256) {
    try { checks.content = await deployedScriptSha256(await client.getContent()); } catch (error) { checks.content = { error: error.message }; }
    if (checks.content.sha256 !== expectedSha256) failures.push(`배포된 소스가 로컬 SHA-256 과 같음을 확인하지 못했습니다 (${checks.content.sha256 ?? checks.content.error})`);
  }
  checks.health = await checkHealth({ fetch: deps.fetch, origin: options.origin, expectedVersion, excludeVersion, sleep: deps.sleep });
  // V22.9.118 재검토 P2: 되돌린 뒤에도 /health 가 배포 전 판만 알리면(살아 있는 응답이 모두 그 판, 다른 판은 한 번도 없음) 판 이름이 같은 버전이다
  // (대시보드에서 변수·Secret 만 바꾼 버전들 — 계정 전체 횟수를 끄는 복구도 그런 버전을 만든다). 응답으로 가릴 수 없으니 실패가 아니라 경고로
  // 남기고, 판 제외 없이 /health 연속 확인과 /ready 를 다시 돌려 그 결과로 종료 코드를 정한다. 증거는 위에서 배포 API 로 읽은 활성 version id 다.
  let versionFilter = excludeVersion;
  if (excludeVersion && !checks.health.ok && checks.health.first_match_attempt === null && checks.health.previous_version > 0) {
    const active = checks.active.versionId === targetId ? `배포 API 의 활성 버전은 ${targetId} 100% 로 확인했습니다` : `배포 API 의 활성 버전이 ${targetId} 100% 가 아닙니다(${checks.active.versionId ?? checks.active.error}) — 아래 실패를 보세요`;
    const warning = `판 이름이 같아 응답만으로는 되돌린 버전인지 가릴 수 없습니다(되돌린 뒤에도 /health 가 배포 전 판 ${excludeVersion} 만 알림) — 배포 기록의 활성 version id 로 확인하세요. ${active}`;
    deps.error(`경고: ${warning}`);
    checks.warnings = [warning];
    checks.health_version_filtered = checks.health;
    versionFilter = null;
    checks.health = await checkHealth({ fetch: deps.fetch, origin: options.origin, expectedVersion, excludeVersion: null, sleep: deps.sleep });
  }
  const healthTarget = expectedVersion ?? (versionFilter ? `배포 전 판(${versionFilter})과 다른 판` : "alive");
  const healthSummary = `시도 ${checks.health.attempts}회, 불일치 ${checks.health.mismatches}회, 마지막 ${checks.health.version ?? checks.health.error ?? checks.health.status}`;
  if (checks.health.ok) deps.log(`/health: ${healthTarget} ${checks.health.consecutive}번 연속 확인 (${healthSummary})`);
  else failures.push(`/health 가 ${HEALTH_CONSECUTIVE}번 연속 ${healthTarget} 를 알리지 않습니다 (${healthSummary}, 마지막 연속 ${checks.health.consecutive}번)${versionFilter && checks.health.version === versionFilter ? ` — 배포 전 판의 응답이 섞여 나옵니다(전파가 늦음). /health·/ready 를 직접 확인하세요` : ""}`);
  if (runReady && !failures.length) {
    checks.ready = await checkReady({ fetch: deps.fetch, origin: options.origin, excludeVersion: versionFilter, notBefore: requestedAt, sleep: deps.sleep });
    const readySummary = `시도 ${checks.ready.attempts}회, ok 아님 ${checks.ready.not_ok}회${checks.ready.cached_not_ok ? `(그중 다시 쓴 응답 ${checks.ready.cached_not_ok}회)` : ""}${checks.ready.previous_version ? `, 배포 전 판 응답 ${checks.ready.previous_version}회` : ""}${checks.ready.cached_counted ? `, 배포 뒤 점검을 다시 쓴 ok ${checks.ready.cached_counted}회(셈)` : ""}${checks.ready.cached_skipped ? `, 다시 쓴 응답(세지 않음) ${checks.ready.cached_skipped}회` : ""}, 마지막 ${checks.ready.error ?? `HTTP ${checks.ready.status} ready=${checks.ready.ready}`}${checks.ready.failed_tables ? ` · 실패 표 ${checks.ready.failed_tables}개` : ""}${checks.ready.missing_rpcs ? ` · 없는 함수 ${checks.ready.missing_rpcs}개` : ""}`;
    if (checks.ready.ok) deps.log(`/ready: ok ${checks.ready.consecutive}번 연속 확인 (${readySummary})`);
    else failures.push(`/ready 가 ${READY_CONSECUTIVE}번 연속 ok 가 아닙니다 (${readySummary})${checks.ready.not_ok ? " — DB 를 쓸 수 없는 버전일 수 있습니다" : checks.ready.previous_version ? " — 배포 전 판의 응답이 이어집니다(전파가 늦음)" : " — 되돌린 버전이 직접 점검한 응답을 받지 못했습니다"}`);
  }
  if (runPublic && !failures.length) {
    checks.public_checks_exit = deps.runPublicChecks({ origin: options.origin, legacyOrigin: options.legacyOrigin, appVersion: expectedVersion });
    if (checks.public_checks_exit !== 0) failures.push(`공개 검사 실패 (종료 코드 ${checks.public_checks_exit})`);
  }
  return { checks, failures };
}

async function runPromote(options, deps, client) {
  const { local, problems, commit } = localPreconditions(deps);
  if (problems.length) { deps.error(`전제 검사 실패 — 승격하지 않습니다:\n- ${problems.join("\n- ")}`); return 2; }
  const directory = releaseDirectory(deps, options, local.appVersion);
  const recordPath = join(directory, `upload-${options.versionId}.json`);
  if (!deps.exists(recordPath)) { deps.error(`이 버전의 업로드 기록이 없습니다: ${recordPath}\n이 스크립트로 업로드하고 대조를 통과한 버전만 승격합니다`); return 2; }
  const record = JSON.parse(deps.readFile(recordPath, "utf8"));
  const mismatch = [];
  if (record.sha256 !== local.sha256) mismatch.push(`업로드한 소스 ${record.sha256} ≠ 현재 src/index.js ${local.sha256}`);
  if (record.commit !== commit) mismatch.push(`업로드 커밋 ${record.commit} ≠ 현재 HEAD ${commit}`);
  if (record.app_version !== local.appVersion) mismatch.push(`업로드 판 ${record.app_version} ≠ ${local.appVersion}`);
  if (record.uploaded?.version_id !== options.versionId) mismatch.push("기록의 버전 ID 가 다릅니다");
  if (!Array.isArray(record.differences) || record.differences.length) mismatch.push("업로드 때 현재 버전과의 대조를 통과하지 못한 기록입니다");
  if (mismatch.length) { deps.error(`업로드 기록과 지금 상태가 다릅니다 — 승격하지 않습니다:\n- ${mismatch.join("\n- ")}`); return 1; }
  const live = liveVersionOf(await client.listDeployments());
  if (live.versionId === options.versionId) { deps.error(`버전 ${options.versionId} 는 이미 100% 배포돼 있습니다`); return 1; }
  const liveVersion = await client.getVersion(live.versionId);
  const target = await client.getVersion(options.versionId);
  const refuse = compareVersionResources(liveVersion, target);
  const etag = target?.resources?.script?.etag ?? null;
  // V22.9.76 (감사 G-4): 업로드 뒤 대시보드에서 Secret·설정을 바꾸면 새 버전이 만들어져 배포된다. 그 뒤 이 버전을
  //   승격하면 업로드 때 이어받은 옛 Secret 값으로 되돌아간다(Secret 값은 API 로 비교할 수 없어 위 대조는 통과한다).
  if (record.live?.version_id && live.versionId !== record.live.version_id) refuse.push(`업로드 뒤 현재 배포가 바뀌었습니다 (${record.live.version_id} → ${live.versionId}). 그사이 대시보드에서 Secret·설정을 바꿨다면 이 버전은 옛 값을 담고 있으니 다시 업로드하세요`);
  if (record.uploaded?.etag && etag !== record.uploaded.etag) refuse.push(`저장된 버전의 etag 가 업로드 때와 다릅니다 (${record.uploaded.etag} → ${etag})`);
  if (refuse.length) { deps.error(`현재 배포와 다릅니다 — 승격하지 않습니다:\n- ${refuse.join("\n- ")}`); return 1; }
  writeRecord(deps, directory, `live-${live.versionId}.json`, liveSnapshot(deps, options, live, liveVersion));
  const { checks, failures } = await deployAndVerify(options, deps, client, { targetId: options.versionId, previousId: live.versionId, expectedVersion: local.appVersion, expectedSha256: local.sha256, message: `${local.appVersion} sha256:${local.sha256} (이전 ${live.versionId})`, runPublic: options.publicChecks });
  const path = writeRecord(deps, directory, `promote-${options.versionId}.json`, { mode: "promote", at: deps.now().toISOString(), script: options.script, app_version: local.appVersion, commit, sha256: local.sha256, version_id: options.versionId, ...checks, failures });
  return finish(deps, failures, path, live.versionId, `${local.appVersion} 버전 ${options.versionId} 100% 배포, 소스 해시·/health${options.publicChecks ? "·공개 검사" : ""} 확인 완료`);
}

async function runRollback(options, deps, client) {
  const live = liveVersionOf(await client.listDeployments());
  if (live.versionId === options.versionId) { deps.error(`버전 ${options.versionId} 는 이미 100% 배포돼 있습니다`); return 1; }
  const liveVersion = await client.getVersion(live.versionId);
  const target = await client.getVersion(options.versionId);
  // V22.9.118 O-4: 서울 DB 전환보다 앞선 버전(옛 시드니 Secret)으로는 내리지 않는다. 넘기려면 --allow-pre-seoul-db 를 일부러 함께 쓴다.
  const floorProblem = rollbackFloorProblem({ script: options.script, versionId: options.versionId, version: target });
  if (floorProblem && !options.allowPreSeoulDb) {
    deps.error(`되돌리지 않습니다 — ${floorProblem}. 그 버전은 옛(시드니) Supabase Secret 을 담고 있어, 옛 프로젝트를 멈춘 뒤에는 모든 DB 요청이 실패합니다. 서울 전환 뒤 버전을 고르세요(Secret 을 먼저 확인했다면 ${ROLLBACK_FLOOR_OVERRIDE} 로만 넘길 수 있습니다)`);
    return 1;
  }
  if (floorProblem) deps.error(`경고: ${ROLLBACK_FLOOR_OVERRIDE} — 하한을 일부러 넘깁니다: ${floorProblem}`);
  const refuse = compareVersionResources(liveVersion, target);
  if (refuse.length) { deps.error(`되돌릴 버전의 바인딩·런타임이 현재와 다릅니다 — 대시보드에서 확인하세요:\n- ${refuse.join("\n- ")}`); return 1; }
  const directory = releaseDirectory(deps, options, "rollback");
  writeRecord(deps, directory, `live-${live.versionId}.json`, liveSnapshot(deps, options, live, liveVersion));
  // V22.9.118 O-4(독립 검토 P3-4): 배포 전 /health 의 판을 적어 두고, 되돌린 뒤 /health·/ready 는 그 판과 다른 응답만 센다(전파 중에는 이전 버전
  // 인스턴스가 답할 수 있다). 읽지 못하면(지금 버전이 망가졌을 수 있다) 되돌리기는 그대로 하되 판으로 가리지 않고 경고를 남긴다.
  // 되돌린 뒤에도 그 판만 알리면(판 이름이 같은 버전) 경고를 남기고 판 제외 없이 확인한다(재검토 P2, deployAndVerify).
  const before = await readHealthVersion({ fetch: deps.fetch, origin: options.origin });
  if (!before.version) deps.error(`경고: 되돌리기 전 /health 의 판을 읽지 못했습니다(${before.error ?? `HTTP ${before.status}`}) — 되돌린 뒤 응답이 되돌린 버전의 것인지 판으로 가리지 않습니다`);
  // The public checks compare the site with the local release, which is the code being rolled
  // back, so after a rollback the deployment, /health liveness and /ready (V22.9.118 O-4) are verified.
  const { checks, failures } = await deployAndVerify(options, deps, client, { targetId: options.versionId, previousId: live.versionId, expectedVersion: null, expectedSha256: null, message: `rollback to ${options.versionId} (이전 ${live.versionId})`, runPublic: false, runReady: true, excludeVersion: before.version });
  const floor = floorProblem ? { ok: false, overridden: true, problem: floorProblem } : { ok: true, number: target?.number ?? null, created_on: target?.metadata?.created_on ?? null };
  const path = writeRecord(deps, directory, `rollback-${options.versionId}.json`, { mode: "rollback", at: deps.now().toISOString(), script: options.script, version_id: options.versionId, floor, before, ...checks, failures });
  const warned = checks.warnings?.length ? `, 경고 ${checks.warnings.length}건 — 판 이름이 같아 응답으로는 되돌린 버전을 가리지 못했습니다(활성 version id 로 확인)` : "";
  return finish(deps, failures, path, live.versionId, `버전 ${options.versionId} 로 되돌림 (/health 판 ${checks.health.version ?? "?"}, /ready ok${warned})`, "되돌리기 전 배포 버전");
}

// V22.9.118 O-4: 실행할 수 있는 되돌리기 명령 줄을 출력하지 않는다(2026-10-19 사고 뒤 규칙: 출력·문서의 예시가 그대로 실행됐다).
// 그 전 배포 버전은 id 만 기록으로 적는다. 되돌릴지는 사람이 정하고, 명령은 사람이 직접 쓴다.
function finish(deps, failures, path, previousId, success, previousLabel = "되돌리기 대상") {
  const previous = `${previousLabel}(기록만): ${previousId}`;
  if (failures.length) {
    deps.error(`배포 후 확인 실패:\n- ${failures.join("\n- ")}\n기록: ${path}\n${previous}`);
    return 1;
  }
  deps.log(`${success}. 기록: ${path}`);
  deps.log(previous);
  return 0;
}

// Exit codes: 0 done, 1 refused or a check failed, 2 usage, credentials or local preconditions.
export async function runDeploy(argv, deps) {
  try {
    const options = parseArgs(argv);
    if (options.mode === "dry-run") return await runDryRun(options, deps);
    const { token, accountId } = readCredentials(deps.env);
    const client = createCloudflareClient({ fetch: deps.fetch, token, accountId, script: options.script });
    if (options.mode === "promote") return await runPromote(options, deps, client);
    if (options.mode === "rollback") return await runRollback(options, deps, client);
    return await runUpload(options, deps, client);
  } catch (error) {
    deps.error(error instanceof UsageError ? error.message : `중단: ${error.message}`);
    return error instanceof UsageError ? 2 : 1;
  }
}

function gitOutput(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(" ")} 실패: ${String(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout;
}

export function defaultDeps(root) {
  return {
    root,
    env: process.env,
    fetch: globalThis.fetch,
    git: {
      head: () => gitOutput(root, ["rev-parse", "HEAD"]).trim(),
      trackedChanges: () => gitOutput(root, ["status", "--porcelain", "--untracked-files=no"]).split("\n").filter(Boolean),
    },
    build: () => buildFromModulesRoot(resolve(root, "src/modules")),
    readFile: readFileSync,
    writeFile: writeFileSync,
    exists: existsSync,
    mkdir: (directory) => mkdirSync(directory, { recursive: true }),
    listDirectories: (directory) => existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : [],
    now: () => new Date(),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    log: (line) => console.log(line),
    error: (line) => console.error(line),
    runPublicChecks: ({ origin, legacyOrigin, appVersion }) => {
      const args = [resolve(root, "tools/verify-deployment-v22920.mjs"), "--origin", origin, "--version", appVersion];
      if (legacyOrigin) args.push("--legacy-origin", legacyOrigin);
      return spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", windowsHide: true }).status ?? 1;
    },
  };
}

// Runs only as a script; the harness imports this file and drives it against a fake API.
const entry = process.argv[1] ? resolve(process.argv[1]) : "";
const self = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self) {
  process.exitCode = await runDeploy(process.argv.slice(2), defaultDeps(resolve(dirname(self), "..")));
}
