// @build:imports-start
import {
  accountbookFavRowsJsAsset, accountbookGoalsJsAsset, accountbookV5BundleJsAsset,
} from "../client/v5-bundle-mains.js";
import { AB_CURSOR_ASSET_PATH, AB_CURSOR_ASSET_SOURCE } from "./ab-cursor.js";
import { NUMBER_FLOW_ASSET_PATH, NUMBER_FLOW_ASSET_SOURCE } from "./number-flow.js";
import {
  AB_UIUX_CSS_ASSET_PATH, ACCOUNTBOOK_EXPERIENCE_CSS, ACCOUNTBOOK_FAVROWS_JS_ASSET_PATH,
  ACCOUNTBOOK_GOALS_JS_ASSET_PATH, ACCOUNTBOOK_NOTIF_JS_ASSET_PATH,
  ACCOUNTBOOK_SEARCH_JS_ASSET_PATH, ACCOUNTBOOK_SHELL_CSS_ASSET_PATH, ACCOUNTBOOK_SHELL_V22811_CSS,
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
import { AB_CATEGORY_RULES_ASSET_PATH, abCategoryRulesJsAsset } from "../nlu/category-rules.js";
// @build:imports-end

function mobileHomePerformanceAssetResponse(request, url) {
  if (!request || !url || !["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) return null;
  const path = String(url.pathname || "");
  const historical = AB_HISTORICAL_RUNTIME_ASSETS[path];
  if (historical) return new Response(request.method === "HEAD" ? null : historical.body, {headers:{"content-type":"text/javascript; charset=utf-8", "cache-control":"public, max-age=31536000, immutable", "x-content-type-options":"nosniff", "cross-origin-resource-policy":"same-origin", etag:historical.etag}});
  const assetPaths = [AB_CATEGORY_RULES_ASSET_PATH, AB_CURSOR_ASSET_PATH, AB_UIUX_CSS_ASSET_PATH, MOBILE_HOME_CSS_ASSET_PATH, LEGACY_ACCOUNTBOOK_SHELL_CSS_ASSET_PATH, ACCOUNTBOOK_SHELL_CSS_ASSET_PATH, ACCOUNTBOOK_THEME_JS_ASSET_PATH, MOBILE_HOME_JS_ASSET_PATH, MOBILE_HOME_SHELL_JS_ASSET_PATH, ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH, ACCOUNTBOOK_SEARCH_JS_ASSET_PATH, ACCOUNTBOOK_NOTIF_JS_ASSET_PATH, ACCOUNTBOOK_GOALS_JS_ASSET_PATH, ACCOUNTBOOK_FAVROWS_JS_ASSET_PATH, ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH, NUMBER_FLOW_ASSET_PATH];
  if (!assetPaths.includes(path)) return null;
  const isCss = [AB_UIUX_CSS_ASSET_PATH, MOBILE_HOME_CSS_ASSET_PATH, LEGACY_ACCOUNTBOOK_SHELL_CSS_ASSET_PATH, ACCOUNTBOOK_SHELL_CSS_ASSET_PATH].includes(path);
  const content = path === AB_CATEGORY_RULES_ASSET_PATH
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
      ? ACCOUNTBOOK_SHELL_CSS + ACCOUNTBOOK_EXPERIENCE_CSS
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
    etag: path === AB_CATEGORY_RULES_ASSET_PATH
      ? '"ab-category-rules-v22926-js"'
      : path === AB_CURSOR_ASSET_PATH
      ? '"ab-cursor-v22895-mjs"'
      : path === NUMBER_FLOW_ASSET_PATH
      ? '"number-flow-v22893-mjs"'
      : path === AB_UIUX_CSS_ASSET_PATH
      ? '"ab-uiux-v22919-css"'
      : path === MOBILE_HOME_CSS_ASSET_PATH
      ? '"mobile-home-v22919-css"'
      : path === LEGACY_ACCOUNTBOOK_SHELL_CSS_ASSET_PATH
        ? '"accountbook-shell-v22811-css"'
      : path === ACCOUNTBOOK_SHELL_CSS_ASSET_PATH
        ? '"accountbook-shell-v22925-css"'
        : path === ACCOUNTBOOK_THEME_JS_ASSET_PATH
          ? '"accountbook-theme-v2299-js"'
        : path === MOBILE_HOME_SHELL_JS_ASSET_PATH
          ? '"mobile-home-shell-v22934-js"'
        : path === ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH
          ? '"accountbook-nav-v22930-js"'
        : path === ACCOUNTBOOK_SEARCH_JS_ASSET_PATH
          ? '"accountbook-search-v22929-js"'
        : path === ACCOUNTBOOK_NOTIF_JS_ASSET_PATH
          ? '"accountbook-notif-v22836-js"'
        : path === ACCOUNTBOOK_GOALS_JS_ASSET_PATH
          ? '"accountbook-goals-v22929-js"'
        : path === ACCOUNTBOOK_FAVROWS_JS_ASSET_PATH
          ? '"accountbook-favrows-v22836-js"'
        : path === ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH
          ? '"accountbook-v5-v22934-js"'
          : '"mobile-home-v22934-js"',
  };
  return new Response(request.method === "HEAD" ? null : content, { status: 200, headers });
}
// @build:exports-start
export { mobileHomePerformanceAssetResponse };
// @build:exports-end
