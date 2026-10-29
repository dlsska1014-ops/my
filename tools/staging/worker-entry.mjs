// V22.9.83: Cloudflare 별도 Worker(malhaebook-staging)의 입구. 운영 Worker(kakao-accountbook)에는 올라가지 않는다.
// deploy-staging.mjs 가 이 파일과 src/index.js·QA 픽스처·demo-*.mjs 를 모듈로 함께 올린다(번들러 없음).
//
// - 바인딩은 STAGING_PASSWORD(Secret)와 PREVIEW_VERSION(글자) 둘뿐이다. 운영 DB·카카오·메일 Secret 이 없다.
// - 비밀번호(HTTP Basic)를 모르면 아무 화면도 열리지 않는다. 아이디 칸은 비워 두거나 아무 글자나 써도 된다.
// - 예약 작업(cron)이 없다. fetch 만 내보낸다.
// - 데이터는 isolate 메모리에만 있다. 입력한 기록은 isolate 가 바뀌면 사라지고 처음 예시로 돌아간다.
import { Buffer } from "node:buffer";
import app from "./index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { createDemoHandler } from "./demo-handler.mjs";

globalThis.Buffer ??= Buffer;
let handlerPromise = null;

function sameText(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function passwordFrom(request) {
  const header = request.headers.get("authorization") || "";
  if (!/^Basic\s+/i.test(header)) return null;
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(header.replace(/^Basic\s+/i, "")), (c) => c.charCodeAt(0)));
    return decoded.slice(decoded.indexOf(":") + 1);
  } catch (_) {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    const noindex = { "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" };
    if (!env.STAGING_PASSWORD || String(env.STAGING_PASSWORD).length < 8) {
      return new Response("테스트 서버 비밀번호가 설정되지 않았습니다.", { status: 503, headers: { ...noindex, "content-type": "text/plain; charset=utf-8" } });
    }
    const given = passwordFrom(request);
    if (given === null || !sameText(given, env.STAGING_PASSWORD)) {
      return new Response("테스트 서버 비밀번호가 필요합니다.", {
        status: 401,
        headers: { ...noindex, "content-type": "text/plain; charset=utf-8", "www-authenticate": 'Basic realm="malhaebook-staging", charset="UTF-8"' },
      });
    }
    handlerPromise ??= createDemoHandler({ app, createFixture: createV2265QaFixture, publicOrigin: new URL(request.url).origin, version: env.PREVIEW_VERSION || "" })
      .catch((error) => { handlerPromise = null; throw error; });
    const handler = await handlerPromise;
    return handler.fetch(request, ctx);
  },
};
