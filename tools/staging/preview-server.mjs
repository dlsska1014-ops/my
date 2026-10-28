// V22.9.83: 로컬 테스트 서버. 이 폴더의 src/index.js 를 예시 데이터로 띄운다(운영 DB·Secret·외부 통신 없음).
//   npm run preview:app                 → http://127.0.0.1:4400/app
//   PREVIEW_PORT=4401 PREVIEW_APP_ROOT=../my-v22982-usage-metrics npm run preview:app
//     (다른 판 클론의 앱을 같은 예시 데이터로 나란히 띄워 전후를 비교할 때. 그 폴더의 src/index.js·QA 픽스처·VERSION.txt 를 쓴다)
// 같은 PC 의 브라우저에서만 열린다(127.0.0.1). 끄려면 Ctrl+C.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDemoHandler } from "./demo-handler.mjs";

const root = resolve(process.env.PREVIEW_APP_ROOT || fileURLToPath(new URL("../..", import.meta.url)));
const app = (await import(pathToFileURL(resolve(root, "src/index.js")).href)).default;
const { createV2265QaFixture } = await import(pathToFileURL(resolve(root, "validation/qa-fixture.mjs")).href);
const port = Number(process.env.PREVIEW_PORT || 4400);
const origin = `http://127.0.0.1:${port}`;
const version = readFileSync(resolve(root, "VERSION.txt"), "utf8").trim();
const handler = await createDemoHandler({ app, createFixture: createV2265QaFixture, publicOrigin: origin, version });

createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value != null) headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
    }
    const method = req.method || "GET";
    const request = new Request(origin + req.url, { method, headers, body: ["GET", "HEAD"].includes(method) ? undefined : Buffer.concat(chunks) });
    const pending = [];
    const response = await handler.fetch(request, { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); }, passThroughOnException() {} });
    const out = {};
    response.headers.forEach((value, key) => { if (key !== "set-cookie") out[key] = value; });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) out["set-cookie"] = cookies;
    res.writeHead(response.status, out);
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
    await Promise.all(pending);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("테스트 서버 오류 — 터미널을 확인하세요.");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`말해가계부 테스트 서버: ${origin}/app  (판 ${version}, 예시 데이터 ${handler.summary.transactions}건, 외부 통신 차단)`);
  console.log("구성원 화면: /__preview/as/member · 소유자 화면: /__preview/as/owner · 데이터 초기화: /__preview/reset · 끄기: Ctrl+C");
});
