// @build:imports-start
import { ACCOUNTBOOK_LUCIAN_E_CSS } from "./lucian-e-css.js";
import { ACCOUNTBOOK_LUCIAN_B_CSS } from "./lucian-b-css.js";
import { accountbookInputReviewJsAsset } from "../client/lucian-a-mains.js";
import {
  accountbookFavRowsJsAsset, accountbookGoalsJsAsset, accountbookV5BundleJsAsset,
} from "../client/v5-bundle-mains.js";
import { BUDGET_PREVIEW_JS_PATH, budgetPlanPreviewJsAsset } from "../client/lucian-d-budget.js";
import { AB_CURSOR_ASSET_PATH, AB_CURSOR_ASSET_SOURCE } from "./ab-cursor.js";
import { NUMBER_FLOW_ASSET_PATH, NUMBER_FLOW_ASSET_SOURCE } from "./number-flow.js";
import {
  AB_UIUX_CSS_ASSET_PATH, ACCOUNTBOOK_EXPERIENCE_CSS, ACCOUNTBOOK_FAVROWS_JS_ASSET_PATH,
  ACCOUNTBOOK_GOALS_JS_ASSET_PATH, ACCOUNTBOOK_NOTIF_JS_ASSET_PATH,
  ACCOUNTBOOK_QUICK_INPUT_JS_ASSET_PATH, ACCOUNTBOOK_SEARCH_JS_ASSET_PATH,
  ACCOUNTBOOK_SHELL_CSS_ASSET_PATH, ACCOUNTBOOK_SHELL_V22811_CSS,
  ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH, ACCOUNTBOOK_THEME_JS_ASSET_PATH,
  ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH, LEGACY_ACCOUNTBOOK_SHELL_CSS_ASSET_PATH,
  MOBILE_HOME_CSS_ASSET_PATH, MOBILE_HOME_JS_ASSET_PATH, MOBILE_HOME_SHELL_JS_ASSET_PATH,
} from "./asset-registry.js";
import { ACCOUNTBOOK_SHELL_CSS } from "./accountbook-shell-css.js";
import {
  abUiuxCssAsset, accountbookThemeJsAsset, mobileHomeCssAsset, mobileHomeJsAsset,
} from "./theme-home-assets.js";
import {
  accountbookNotifJsAsset, accountbookSearchJsAsset, accountbookStage4NavJsAsset,
  mobileHomeShellJsAsset,
} from "../client/nav-search-notif-mains.js";
import { AB_HISTORICAL_RUNTIME_ASSETS } from "./historical-runtime-assets.js";
import {
  AB_CONTROLS_38_CSS, AB_CONTROLS_38_CSS_PATH, AB_CONTROLS_38_JS_PATH, accountbookControls38JsAsset,
} from "./form-controls-v22938.js";
import { AB_CATEGORY_RULES_ASSET_PATH, abCategoryRulesJsAsset } from "../nlu/category-rules.js";
// @build:imports-end

function mobileHomePerformanceAssetResponse(request, url) {
  if (!request || !url || !["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) return null;
  const path = String(url.pathname || "");
  if (path === AB_CONTROLS_38_CSS_PATH || path === AB_CONTROLS_38_JS_PATH) {
    const css = path === AB_CONTROLS_38_CSS_PATH;
    return new Response(request.method === "HEAD" ? null : css ? AB_CONTROLS_38_CSS : accountbookControls38JsAsset(), { headers: { "content-type": css ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin", etag: css ? '"accountbook-controls-v22938-css"' : '"accountbook-controls-v22938-js"' } });
  }
  if (path === BUDGET_PREVIEW_JS_PATH) return new Response(request.method === "HEAD" ? null : budgetPlanPreviewJsAsset(), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin", etag: '"accountbook-budget-preview-v22993-js"' } });
  const historical = AB_HISTORICAL_RUNTIME_ASSETS[path];
  // V22.9.40 A3: 옛 CSS 주소도 옛 바이트를 그대로 낸다. 항목이 contentType 을 적으면 그것을 쓴다(없으면 JS).
  // V22.9.85: 운영 마지막 두 판과 배포 전 판이 부르는 주소만 남긴다(기준은 validate-immutable-asset-addresses-v2299 RETIRED 위 설명).
  if (historical) return new Response(request.method === "HEAD" ? null : historical.body, {headers:{"content-type":historical.contentType || "text/javascript; charset=utf-8", "cache-control":"public, max-age=31536000, immutable", "x-content-type-options":"nosniff", "cross-origin-resource-policy":"same-origin", etag:historical.etag}});
  const assetPaths = [ACCOUNTBOOK_QUICK_INPUT_JS_ASSET_PATH,AB_CATEGORY_RULES_ASSET_PATH, AB_CURSOR_ASSET_PATH, AB_UIUX_CSS_ASSET_PATH, MOBILE_HOME_CSS_ASSET_PATH, LEGACY_ACCOUNTBOOK_SHELL_CSS_ASSET_PATH, ACCOUNTBOOK_SHELL_CSS_ASSET_PATH, ACCOUNTBOOK_THEME_JS_ASSET_PATH, MOBILE_HOME_JS_ASSET_PATH, MOBILE_HOME_SHELL_JS_ASSET_PATH, ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH, ACCOUNTBOOK_SEARCH_JS_ASSET_PATH, ACCOUNTBOOK_NOTIF_JS_ASSET_PATH, ACCOUNTBOOK_GOALS_JS_ASSET_PATH, ACCOUNTBOOK_FAVROWS_JS_ASSET_PATH, ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH, NUMBER_FLOW_ASSET_PATH];
  if (!assetPaths.includes(path)) return null;
  const isCss = [AB_UIUX_CSS_ASSET_PATH, MOBILE_HOME_CSS_ASSET_PATH, LEGACY_ACCOUNTBOOK_SHELL_CSS_ASSET_PATH, ACCOUNTBOOK_SHELL_CSS_ASSET_PATH].includes(path);
  const content = path === ACCOUNTBOOK_QUICK_INPUT_JS_ASSET_PATH
    ? accountbookInputReviewJsAsset()
    : path === AB_CATEGORY_RULES_ASSET_PATH
    ? abCategoryRulesJsAsset()
    : path === AB_CURSOR_ASSET_PATH
    ? AB_CURSOR_ASSET_SOURCE
    : path === NUMBER_FLOW_ASSET_PATH
    ? NUMBER_FLOW_ASSET_SOURCE
    : path === AB_UIUX_CSS_ASSET_PATH
    ? abUiuxCssAsset()
    : path === MOBILE_HOME_CSS_ASSET_PATH
    ? mobileHomeCssAsset()
    : path === LEGACY_ACCOUNTBOOK_SHELL_CSS_ASSET_PATH
      ? ACCOUNTBOOK_SHELL_V22811_CSS
      : path === ACCOUNTBOOK_SHELL_CSS_ASSET_PATH
      ? ACCOUNTBOOK_SHELL_CSS + ACCOUNTBOOK_EXPERIENCE_CSS + ACCOUNTBOOK_LUCIAN_E_CSS + ACCOUNTBOOK_LUCIAN_B_CSS
      : path === ACCOUNTBOOK_THEME_JS_ASSET_PATH
        ? accountbookThemeJsAsset()
      : path === MOBILE_HOME_SHELL_JS_ASSET_PATH
        ? mobileHomeShellJsAsset()
      : path === ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH
        ? accountbookStage4NavJsAsset()
      : path === ACCOUNTBOOK_SEARCH_JS_ASSET_PATH
        ? accountbookSearchJsAsset()
      : path === ACCOUNTBOOK_NOTIF_JS_ASSET_PATH
        ? accountbookNotifJsAsset()
      : path === ACCOUNTBOOK_GOALS_JS_ASSET_PATH
        ? accountbookGoalsJsAsset()
      : path === ACCOUNTBOOK_FAVROWS_JS_ASSET_PATH
        ? accountbookFavRowsJsAsset()
      : path === ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH
        ? accountbookV5BundleJsAsset()
        : mobileHomeJsAsset();
  const headers = {
    "content-type": isCss ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    etag: path === ACCOUNTBOOK_QUICK_INPUT_JS_ASSET_PATH
      ? '"accountbook-quick-input-v22951-js"'
      : path === AB_CATEGORY_RULES_ASSET_PATH
      ? '"ab-category-rules-v22993-js"'
      : path === AB_CURSOR_ASSET_PATH
      ? '"ab-cursor-v22895-mjs"'
      : path === NUMBER_FLOW_ASSET_PATH
      ? '"number-flow-v22893-mjs"'
      : path === AB_UIUX_CSS_ASSET_PATH
      ? '"ab-uiux-v22919-css"'
      : path === MOBILE_HOME_CSS_ASSET_PATH
      ? '"mobile-home-v22985-css"'
      : path === LEGACY_ACCOUNTBOOK_SHELL_CSS_ASSET_PATH
        ? '"accountbook-shell-v22811-css"'
      : path === ACCOUNTBOOK_SHELL_CSS_ASSET_PATH
        ? '"accountbook-shell-v22993-css"'
        : path === ACCOUNTBOOK_THEME_JS_ASSET_PATH
          ? '"accountbook-theme-v22946-js"'
        : path === MOBILE_HOME_SHELL_JS_ASSET_PATH
          ? '"mobile-home-shell-v22993-js"'
        : path === ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH
          ? '"accountbook-nav-v22987-js"'
        : path === ACCOUNTBOOK_SEARCH_JS_ASSET_PATH
          ? '"accountbook-search-v22979-js"'
        : path === ACCOUNTBOOK_NOTIF_JS_ASSET_PATH
          ? '"accountbook-notif-v22937-js"'
        : path === ACCOUNTBOOK_GOALS_JS_ASSET_PATH
          ? '"accountbook-goals-v22993-js"'
        : path === ACCOUNTBOOK_FAVROWS_JS_ASSET_PATH
          ? '"accountbook-favrows-v22937-js"'
        : path === ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH
          ? '"accountbook-v5-v22993-js"'
          : '"mobile-home-v22993-js"',
  };
  return new Response(request.method === "HEAD" ? null : content, { status: 200, headers });
}
// @build:exports-start
export { mobileHomePerformanceAssetResponse };
// @build:exports-end
