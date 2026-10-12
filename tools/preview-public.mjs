// Local, anonymous preview. No credentials, database, or production writes.
import { createServer } from "node:http";
import app from "../src/index.js";

const port = Number(process.env.PUBLIC_PREVIEW_PORT || 4399);
globalThis.fetch = async () => { throw new Error("Network calls are disabled in public preview"); };
// V22.9.40: the public document list is read from the Worker's own sitemap.xml (the same PUBLIC_CONTENT_PATHS
// list, 30 documents) instead of a hand-written copy, so new public pages open here without editing this file.
const sitemap = await (await app.fetch(new Request("https://malhaebook.com/sitemap.xml"), {}, {})).text();
const documents = [...sitemap.matchAll(new RegExp("<loc>([^<]+)</loc>", "g"))].map((match) => new URL(match[1]).pathname);
if (documents.length === 0) throw new Error("sitemap.xml listed no public documents");
const allowed = new Set([...documents, "/robots.txt", "/sitemap.xml", "/sitemap.xsl", "/ads.txt"]);
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "https://malhaebook.com");
    const asset = url.pathname.startsWith("/assets/") || ["/manifest.json", "/favicon.ico"].includes(url.pathname);
    if (!["GET", "HEAD"].includes(req.method) || (!allowed.has(url.pathname) && !asset)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("This preview only serves anonymous public pages.");
      return;
    }
    const response = await app.fetch(new Request(url, { method: req.method }), {}, {});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Public preview failed. Check the terminal.");
    console.error(error);
  }
}).listen(port, "127.0.0.1", () => console.log(`Public preview: http://127.0.0.1:${port}`));
