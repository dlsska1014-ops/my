
// V22.8.95 (10장) 데스크톱 커서 — cursify 의 Follow Cursor 기법을 쓰되 장식으로
// 두지 않고 "지금 무엇을 누를 수 있는지"를 말하게 만든다.
//
// 이 항목은 PR 순서의 맨 끝이고, 문제가 생기면 **가장 먼저 되돌린다**. 그래서
// 되돌리기 쉬운 모양으로 둔다 — 자산 하나 + 내비 자산 안의 로더 한 덩어리이고,
// 다른 규칙을 바꾸지 않는다.
//
// 원본과 다르게 만든 것:
//   · z-index 1 — 원본은 비워 두는데 그러면 저장 토스트 위에 점이 얹힌다.
//   · 색은 런타임에 --ab12-brand 를 읽는다. 원본의 #323232a6 은 토큰 밖 값이고
//     다크에서 보이지 않는다. 테마·톤 전환을 그대로 따라가야 한다.
//   · 조작 요소 위에서 반지름 9 → 22px, 알파 .28 → .14. 판정은 elementFromPoint 를
//     **마우스가 움직일 때만** 한다(프레임마다 하면 비싸다).
//   · 입력 영역 위에서는 숨긴다. I빔 커서와 겹치면 글자 위치를 가린다.
//   · 배경 탭·비활성 창·창 밖으로 나간 상태에서는 rAF 를 멈춘다. 원본은 계속 돌아
//     배터리를 먹는다.
//   · resize 는 150ms 디바운스. 원본은 매 이벤트마다 캔버스를 다시 잡아 창 조절
//     중 프레임이 떨어진다.
//   · 기본 커서를 숨기지 않고(cursor:none 금지), 꼬리·잔상·클릭 파동을 만들지 않는다.
const AB_CURSOR_ASSET_PATH = "/assets/ab-cursor-v22895.mjs";
const AB_CURSOR_ASSET_SOURCE = `/*! 10장 데스크톱 커서 · 덧붙임이고 정보가 아니다 · 근거는 src/index.js 주석 */
let canvas = null, ctx = null, raf = 0, timer = 0;
let pos = null, target = null, r = 9, want = 9, alpha = 0.28, hide = false;
const tone = () => getComputedStyle(document.body).getPropertyValue("--ab12-brand").trim() || "#3182f6";
const sized = () => {
  if (!canvas) return;
  const d = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * d);
  canvas.height = Math.floor(innerHeight * d);
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  ctx.setTransform(d, 0, 0, d, 0, 0);
};
const onResize = () => { clearTimeout(timer); timer = setTimeout(sized, 150); };
const draw = () => {
  raf = 0;
  if (!ctx || !pos || !target) return;
  pos.x += (target.x - pos.x) / 10;
  pos.y += (target.y - pos.y) / 10;
  r += (want - r) / 6;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!hide) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = tone();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  loop();
};
const loop = () => {
  if (raf || document.hidden || !document.hasFocus()) return;
  raf = requestAnimationFrame(draw);
};
const halt = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
const onMove = (e) => {
  target = { x: e.clientX, y: e.clientY };
  if (!pos) pos = { x: e.clientX, y: e.clientY };
  const at = document.elementFromPoint(e.clientX, e.clientY);
  const typing = at && at.closest && at.closest("input,textarea,[contenteditable]");
  const hit = at && at.closest && at.closest("a,button,[role=button],.calDay,.abNavCalDay,.txChip,.dateChip");
  hide = !!typing;
  want = hit && !typing ? 22 : 9;
  alpha = hit && !typing ? 0.14 : 0.28;
  loop();
};
const onLeave = () => { hide = true; loop(); halt(); };
export function start() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.className = "abCursorCanvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:1";
  ctx = canvas.getContext("2d");
  document.body.appendChild(canvas);
  sized();
  addEventListener("resize", onResize);
  addEventListener("mousemove", onMove);
  addEventListener("mouseout", onLeave);
  addEventListener("blur", halt);
  addEventListener("focus", loop);
  document.addEventListener("visibilitychange", loop);
}
export function stop() {
  halt();
  removeEventListener("resize", onResize);
  removeEventListener("mousemove", onMove);
  removeEventListener("mouseout", onLeave);
  removeEventListener("blur", halt);
  removeEventListener("focus", loop);
  document.removeEventListener("visibilitychange", loop);
  if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  canvas = null; ctx = null; pos = null; target = null; hide = false;
}
`;
// @build:exports-start
export { AB_CURSOR_ASSET_PATH, AB_CURSOR_ASSET_SOURCE };
// @build:exports-end
