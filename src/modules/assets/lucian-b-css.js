// Lucian UX/UI Prompt #070, #071, #092 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#092
const ACCOUNTBOOK_LUCIAN_B_CSS = `
.abTxEmpty{padding:24px;border:1px solid var(--ab12-line);border-radius:20px;background:var(--ab12-surface);color:var(--ab12-text);text-align:center}
.abTxEmpty h3{margin:0 0 8px;font-size:18px}.abTxEmpty p{margin:0 0 16px;color:var(--ab12-muted);line-height:1.6}
.abTxEmptyActions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}.abTxEmpty a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 14px;border:1px solid var(--ab12-line);border-radius:12px;color:var(--ab12-text);background:var(--ab12-surface-raised);text-decoration:none;font-size:14px;font-weight:650}
.abTxEmpty a:focus-visible,.abDeleteNotice button:focus-visible{outline:2px solid var(--ab12-accent);outline-offset:3px}
[data-ab-delete-pending]{display:none!important}
.abDeleteNotice{position:fixed;z-index:11000;bottom:calc(94px + env(safe-area-inset-bottom));right:16px;width:min(440px,calc(100vw - 32px));padding:16px;border:1px solid var(--ab12-line);border-radius:18px;background:var(--ab12-surface);color:var(--ab12-text);box-shadow:var(--ab12-elev-float)}
.abDeleteNotice[hidden],.abDeleteNotice [hidden]{display:none!important}.abDeleteMessage{margin:0 0 6px;font-size:15px;line-height:1.5;font-weight:700}.abDeleteHelp{display:block;font-size:13px;color:var(--ab12-muted);line-height:1.6}.abDeleteCountdown{display:block;margin-top:6px;font-size:13px;color:var(--ab12-muted);font-variant-numeric:tabular-nums}.abDeleteActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.abDeleteNotice button{min-height:44px;border:1px solid var(--ab12-line);border-radius:12px;padding:8px 12px;background:var(--ab12-surface-raised);color:var(--ab12-text);font:inherit;font-size:14px;font-weight:650;cursor:pointer}.abDeleteNotice button:disabled{cursor:default;opacity:.7}
@media(prefers-reduced-motion:reduce){.abDeleteNotice,.abTxEmpty{transition:none;animation:none}}
`;
// @build:exports-start
export { ACCOUNTBOOK_LUCIAN_B_CSS };
// @build:exports-end
