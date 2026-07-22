import { createServer } from "node:http";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

const fixture = await createV2265QaFixture();
const port = Number(process.env.QA_BROWSER_PORT || 41718);

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value != null) headers.set(name, value);
    }
    headers.set("cookie", fixture.cookie);
    const method = incoming.method || "GET";
    const request = new Request(`https://ttokttok-accountbook.com${incoming.url || "/"}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
    });
    const response = await app.fetch(request, fixture.env, {});
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => {
      if (name.toLowerCase() !== "content-encoding") outgoing.setHeader(name, value);
    });
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader("content-type", "text/plain; charset=utf-8");
    outgoing.end(String(error?.stack || error));
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`qa-browser-server http://127.0.0.1:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
