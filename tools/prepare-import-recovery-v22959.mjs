import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Local-only, independent files. Does not upload, deploy, stage, or commit.
const root = fileURLToPath(new URL("../", import.meta.url));
const outArgument = process.argv.find(a => a.startsWith("--out="))?.slice(6);
if (!outArgument || !isAbsolute(outArgument)) throw Error("An absolute --out= path is required");
const out = resolve(outArgument), source = resolve(root);
if (out === source || !relative(source, out).startsWith(".." + sep) || existsSync(out)) throw Error("Recovery output must be a new directory outside the source candidate");
const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
function run(command, args, cwd = source) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw Error(`${command} failed: ${result.stderr || result.error || result.status}`);
  return result.stdout;
}
const paths = [...new Set(run("git", ["ls-files", "-c", "-o", "--exclude-standard", "-z"]).split("\0").filter(Boolean))].filter(p => existsSync(resolve(source, p)) && statSync(resolve(source, p)).isFile()).sort();
if (paths.some(p => /(^|\/)(?:node_modules|\.env(?:\.[^/]*)?|secrets?)(?:\/|$)/i.test(p))) throw Error("Unexpected environment/dependency/secret path in source list");
const sha = data => createHash("sha256").update(data).digest("hex");
const before = new Map(paths.map(p => [p, sha(readFileSync(resolve(source, p)))]));
run("git", ["clone", "--no-hardlinks", "--no-checkout", "--local", source, out]);
run("git", ["checkout", "--detach", "HEAD"], out);
for (const p of run("git", ["ls-files", "-c", "-z"]).split("\0").filter(Boolean)) {
  const target = resolve(out, p);
  if (!target.startsWith(out + sep)) throw Error("Copy path escapes recovery candidate");
  if (!existsSync(resolve(source, p)) && existsSync(target)) unlinkSync(target);
}
for (const p of paths) {
  const target = resolve(out, p);
  if (!target.startsWith(out + sep)) throw Error("Copy path escapes recovery candidate");
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(source, p), target);
  if (sha(readFileSync(target)) !== before.get(p)) throw Error("Actual-source copy mismatch");
}
const gate = resolve(out, "src/modules/import/flexible-import-parser.js");
const code = readFileSync(gate, "utf8"), from = "const MY_IMPORT_WRITES_ENABLED_V22959 = true;";
if (code.split(from).length !== 2) throw Error("Recovery gate is not unique");
writeFileSync(gate, code.replace(from, "const MY_IMPORT_WRITES_ENABLED_V22959 = false;"));
const version = "V22.9.61-IMPORT-RECOVERY";
writeFileSync(resolve(out, "VERSION.txt"), version + "\n");
const config = resolve(out, "src/modules/public/site-config.js");
writeFileSync(config, readFileSync(config, "utf8").replace(/const APP_VERSION = "[^"]+";/, `const APP_VERSION = "${version}";`));
run(process.execPath, ["tools/annotate-modules.mjs"], out);
run(process.execPath, ["tools/build-worker.mjs"], out);
const manifestPath = resolve(out, "BUNDLE_FILE_CHECKSUMS_V22_9_61.sha256");
const manifest = readFileSync(manifestPath, "utf8").split(/\r?\n/).filter(Boolean).map(line => {
  const match = line.match(/^[a-f0-9]{64}\s+\*?\.\/(.+)$/i);
  if (!match) throw Error("Malformed recovery checksum path");
  return `${sha(readFileSync(resolve(out, match[1])))}  ./${match[1]}`;
});
writeFileSync(manifestPath, manifest.join("\n") + "\n");
for (const [p, hash] of before) if (sha(readFileSync(resolve(source, p))) !== hash) throw Error("Source candidate was changed while producing recovery copy");
console.log(JSON.stringify({ recovery: out, version, copiedActualSourceFiles: paths.length, activeChecksums: manifest.length, workerSha256: sha(readFileSync(resolve(out, "src/index.js"))), sourcePreserved: true, importsWritable: false, sqlExecuted: false, deployed: false }));
