
// V22.8.63: 브라우저는 링크 태그가 없어도 /favicon.ico와 /apple-touch-icon.png를
// 스스로 요청한다. 지금까지 두 경로가 404여서 모든 화면에 콘솔 404가 남고
// 홈 화면에 추가할 때 아이콘이 비어 있었다. 홈 HTML 예산을 건드리지 않도록
// 마크업은 그대로 두고 실제 아이콘 바이트만 만들어 제공한다.
const AB_ICON_BRAND_RGB = [0x31, 0x82, 0xf6];
const AB_ICON_MARK_RGB = [0xff, 0xff, 0xff];
let AB_ICON_ICO_CACHE = null;
const AB_ICON_PNG_CACHE = new Map();

// 좌측 책등과 3줄 장부선을 가진 브랜드 마크를 정규 좌표(0~1)로 그린다.
// 크기가 달라도 같은 모양이 나오도록 픽셀 대신 비율로만 판단한다.
function abIconMarkAt(u, v) {
  const inRect = (x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
  if (inRect(0.28, 0.22, 0.365, 0.78)) return true;
  if (inRect(0.44, 0.3, 0.75, 0.375)) return true;
  if (inRect(0.44, 0.46, 0.75, 0.535)) return true;
  if (inRect(0.44, 0.62, 0.63, 0.695)) return true;
  return false;
}

// 모서리를 둥글린 정사각형 안쪽인지 판단한다.
function abIconInsideRoundedSquare(u, v, radius) {
  const dx = Math.max(radius - u, 0, u - (1 - radius));
  const dy = Math.max(radius - v, 0, v - (1 - radius));
  if (dx === 0 || dy === 0) return true;
  return (dx * dx + dy * dy) <= radius * radius;
}

// size×size 팔레트 인덱스 배열(0=투명, 1=브랜드, 2=마크)을 만든다.
// rounded=false면 모서리까지 브랜드 색으로 채운다. iOS는 홈 화면 아이콘을
// 스스로 둥글게 마스킹하므로 apple-touch-icon은 투명 모서리를 두면 안 된다.
function abIconIndexedPixels(size, rounded = true) {
  const pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      if (rounded && !abIconInsideRoundedSquare(u, v, 0.22)) continue;
      pixels[y * size + x] = abIconMarkAt(u, v) ? 2 : 1;
    }
  }
  return pixels;
}

function abIconCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function abIconAdler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function abIconPngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcTarget = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, abIconCrc32(crcTarget));
  return out;
}

// 압축기를 넣지 않으려고 deflate는 저장(비압축) 블록만 사용한다.
// 인덱스 컬러라 원본이 이미 작아 결과도 충분히 작다.
function abIconStoredDeflate(raw) {
  const maxBlock = 65535;
  const blocks = Math.max(1, Math.ceil(raw.length / maxBlock));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let offset = 2;
  for (let index = 0; index < blocks; index += 1) {
    const start = index * maxBlock;
    const length = Math.min(maxBlock, raw.length - start);
    out[offset] = index === blocks - 1 ? 1 : 0;
    out[offset + 1] = length & 0xff;
    out[offset + 2] = (length >> 8) & 0xff;
    out[offset + 3] = ~length & 0xff;
    out[offset + 4] = (~length >> 8) & 0xff;
    out.set(raw.subarray(start, start + length), offset + 5);
    offset += 5 + length;
  }
  new DataView(out.buffer).setUint32(offset, abIconAdler32(raw));
  return out.subarray(0, offset + 4);
}

// 런타임이 제공하는 압축기를 우선 쓰고, 없으면 저장(비압축) 블록으로 되돌린다.
// 2색 인덱스 이미지라 실제 압축률이 매우 높아 512px 아이콘도 몇 KB로 끝난다.
async function abIconDeflate(raw) {
  if (typeof CompressionStream === "function") {
    try {
      const compressed = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"));
      return new Uint8Array(await new Response(compressed).arrayBuffer());
    } catch (_error) {
      // 압축기를 쓸 수 없으면 아래 저장 블록으로 계속 진행한다.
    }
  }
  return abIconStoredDeflate(raw);
}

async function abIconPngBytes(size = 180) {
  const pixels = abIconIndexedPixels(size, false);
  const raw = new Uint8Array(size * (size + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size + 1)] = 0;
    raw.set(pixels.subarray(y * size, (y + 1) * size), y * (size + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, size);
  ihdrView.setUint32(4, size);
  ihdr[8] = 8;
  ihdr[9] = 3;
  // 인덱스 0은 쓰이지 않지만 팔레트 자리를 맞추려고 브랜드 색을 그대로 둔다.
  // 전부 불투명한 정사각형이라 tRNS 청크는 넣지 않는다.
  const plte = new Uint8Array([...AB_ICON_BRAND_RGB, ...AB_ICON_BRAND_RGB, ...AB_ICON_MARK_RGB]);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    abIconPngChunk("IHDR", ihdr),
    abIconPngChunk("PLTE", plte),
    abIconPngChunk("IDAT", await abIconDeflate(raw)),
    abIconPngChunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { png.set(part, offset); offset += part.length; }
  return png;
}

function abIconIcoBytes(size = 32) {
  const pixels = abIconIndexedPixels(size);
  const rowMask = Math.ceil(size / 32) * 4;
  const xorSize = size * size * 4;
  const andSize = rowMask * size;
  const image = new Uint8Array(40 + xorSize + andSize);
  const header = new DataView(image.buffer);
  header.setUint32(0, 40, true);
  header.setInt32(4, size, true);
  header.setInt32(8, size * 2, true);
  header.setUint16(12, 1, true);
  header.setUint16(14, 32, true);
  header.setUint32(20, xorSize + andSize, true);
  for (let y = 0; y < size; y += 1) {
    const sourceRow = size - 1 - y;
    for (let x = 0; x < size; x += 1) {
      const index = pixels[sourceRow * size + x];
      const target = 40 + (y * size + x) * 4;
      const rgb = index === 2 ? AB_ICON_MARK_RGB : AB_ICON_BRAND_RGB;
      image[target] = rgb[2];
      image[target + 1] = rgb[1];
      image[target + 2] = rgb[0];
      image[target + 3] = index === 0 ? 0 : 0xff;
      if (index === 0) {
        const maskByte = 40 + xorSize + y * rowMask + (x >> 3);
        image[maskByte] |= 0x80 >> (x & 7);
      }
    }
  }
  const ico = new Uint8Array(22 + image.length);
  const directory = new DataView(ico.buffer);
  directory.setUint16(0, 0, true);
  directory.setUint16(2, 1, true);
  directory.setUint16(4, 1, true);
  ico[6] = size === 256 ? 0 : size;
  ico[7] = size === 256 ? 0 : size;
  directory.setUint16(10, 1, true);
  directory.setUint16(12, 32, true);
  directory.setUint32(14, image.length, true);
  directory.setUint32(18, 22, true);
  ico.set(image, 22);
  return ico;
}

function abIconIco() {
  if (!AB_ICON_ICO_CACHE) AB_ICON_ICO_CACHE = abIconIcoBytes(32);
  return AB_ICON_ICO_CACHE;
}

async function abIconPng(size = 180) {
  if (!AB_ICON_PNG_CACHE.has(size)) AB_ICON_PNG_CACHE.set(size, await abIconPngBytes(size));
  return AB_ICON_PNG_CACHE.get(size);
}

// 홈 화면에 추가했을 때 앱처럼 열리도록 하는 최소 매니페스트.
// display를 "browser"로 바꾸면 기존처럼 브라우저 UI를 유지한 채 열린다.
const AB_WEB_MANIFEST = {
  name: "말해 가계부",
  short_name: "가계부",
  description: "카카오톡으로 기록하고 웹에서 정리하는 우리집 가계부",
  lang: "ko",
  dir: "ltr",
  start_url: "/app",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#f2f4f6",
  theme_color: "#3182f6",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  // V22.9.8: 홈 화면 아이콘을 길게 누르면 바로 갈 수 있는 자리 셋.
  // 가장 자주 하는 일 순서다 — 적는다 · 얼마 남았나 본다.
  shortcuts: [
    { name: "빠른 입력", short_name: "입력", url: "/app#add" },
    { name: "이번 달 예산", short_name: "예산", url: "/budgets" },
  ],
  // 카드 결제 알림이나 문자를 공유 시트에서 가계부로 넘기면 빠른 입력이 채워진 채 열린다.
  //
  // method 를 GET 으로 둔 이유: POST 공유는 multipart 라 서비스워커가 그 요청을 받아야
  // 하는데, 이 앱에는 서비스워커가 없고 그것만을 위해 하나 들이면 캐시 수명·업데이트
  // 문제를 새로 떠안는다. 텍스트 공유는 GET 으로 충분하고 서버가 바로 받는다.
  // (영수증 **사진** 공유는 그래서 여기 없다 — 별건이다.)
  share_target: {
    action: "/app",
    method: "GET",
    params: { title: "share_title", text: "share_text", url: "share_url" },
  },
};
const AB_WEB_MANIFEST_JSON = JSON.stringify(AB_WEB_MANIFEST);
const AB_MANIFEST_PATH = "/manifest.json";
const AB_MANIFEST_LINK = `<link rel="manifest" href="${AB_MANIFEST_PATH}"/>`;
const AB_SPECULATION_RULES_TAG = "<script type=\"speculationrules\">{\"prerender\":[{\"where\":{\"and\":[{\"href_matches\":\"/*\"},{\"not\":{\"href_matches\":[\"/assets/*\",\"/admin/*\",\"/backup/*\",\"/cron/*\",\"/logout*\",\"/my/logout*\",\"/api/*\",\"/kakao/*\"]}}]},\"eagerness\":\"conservative\"}]}</script>";

const AB_ICON_ROUTES = new Map([
  ["/favicon.ico", { kind: "ico", size: 32 }],
  ["/apple-touch-icon.png", { kind: "png", size: 180 }],
  ["/apple-touch-icon-precomposed.png", { kind: "png", size: 180 }],
  ["/icon-192.png", { kind: "png", size: 192 }],
  ["/icon-512.png", { kind: "png", size: 512 }],
  [AB_MANIFEST_PATH, { kind: "manifest", size: 0 }],
]);

async function appIconAssetResponse(request, url) {
  if (!request || !url) return null;
  const method = String(request.method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method)) return null;
  const route = AB_ICON_ROUTES.get(String(url.pathname || ""));
  if (!route) return null;
  const body = route.kind === "ico"
    ? abIconIco()
    : route.kind === "manifest"
      ? new TextEncoder().encode(AB_WEB_MANIFEST_JSON)
      : await abIconPng(route.size);
  const contentType = route.kind === "ico"
    ? "image/x-icon"
    : route.kind === "manifest"
      ? "application/manifest+json; charset=utf-8"
      : "image/png";
  return new Response(method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=604800",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      etag: route.kind === "manifest" ? '"ab-manifest-v22920"' : `"ab-icon-v22864-${route.kind}-${route.size}"`,
    },
  });
}
