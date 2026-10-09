// @build:imports-start
import {
  boundedRuntimeNumber, checkTrafficGuard, cleanupNluOpsRetention, csrfOriginAllowed,
  csrfRejectedResponse, csrfSignalSummary, rememberOpsEvent, trafficLimitedResponse,
} from "../runtime/ops-telemetry.js";
import {
  CORS_HEADERS, READINESS_ALTERNATIVE_RPC_GROUPS, READINESS_CORE_RPCS, READINESS_OPTIONAL_TABLES,
  READINESS_REQUIRED_TABLES, missingRuntimeConfiguration, rememberedHouseholdRequest,
  withRememberedHouseholdCookie,
} from "../runtime/config-readiness.js";
import {
  abMonitorCompleted, abMonitorDatabaseProbe, abMonitorRequestContext, handleComprehensiveMonitor,
} from "../runtime/ops-monitor.js";
import {
  APP_MODE, APP_VERSION, KAKAO_SECONDARY_COMMANDS, appName, canonicalRedirectResponse,
  handleKakaoCommandSystemPage, hiddenIncompleteFeatureResponse, kakaoChatCommandCatalog,
  kakaoRepresentativeCommands, publicBaseUrl, renderSkillGetHealthHtml,
} from "../public/site-config.js";
import {
  handleAdsTxt, handlePublicContentPage, handlePublicRobots, handlePublicSitemap,
  handlePublicSitemapStylesheet,
} from "../public/content-pages.js";
import { logWorkerError, safeError } from "../runtime/leases.js";
import {
  browserFormRequestFailed, emergencyReturnUrl, headOnlyResponse, htmlResponse, isExplicitAdminUrl,
  isJsonApiPath, isMobileRequest, jsonResponse, mobileAppLocation, redirectPublicAwayFromAdmin,
  redirectResponse, renderEmergencyErrorHtml, safeHtmlRoute,
} from "../runtime/http.js";
import {
  kakaoSkillAuthSnapshot, skillLatencySnapshot, verifyAdminSession,
} from "../auth/crypto-admin-session.js";
import {
  handleAdminAddTransaction, handleAdminDeleteTransaction, handleAdminHouseholdCreate,
  handleAdminHouseholdDelete, handleAdminHouseholdRegenerate, handleAdminHouseholdUpdate,
  handleAdminLogin, handleAdminLogout, handleAdminMemberNickname, handleAdminMemberRemove,
  handleAdminMemberUpdate, handleAdminPage, handleAdminUpdateTransaction, handleTransactionEditPage,
} from "../admin/transactions-households.js";
import {
  handlePaymentAssetCreate, handlePaymentAssetDelete, handlePaymentAssetUpdate,
} from "../settings/payment-assets.js";
import {
  handleReservePlanCreate, handleReservePlanDelete, handleReservePlanUpdate, handleReservePlansPage,
} from "../settings/reserve-plans.js";
import {
  handleCategoryAdminPage, handleCategoryCreate, handleCategoryDelete, handleCategoryKeywordsSave,
  handleChatbotEditGuidePage, handleKeywordGuidePage, handleMyProfilePage, handleMyProfileUpdate,
} from "../admin/category-guide-pages.js";
import { handleAdminBulkUpdate, safeUserReturnPath } from "../admin/bulk-and-return-paths.js";
import {
  handleAdminCsv, handleAdminImportJson, handleImportTemplateCsv, handleImportTemplateXls,
} from "../import/flexible-import-parser.js";
import { getScopedHouseholdsForPage } from "../data/households-members-rows.js";
import {
  checkRpcAvailable, checkTableAvailable, handleRecordFlowAuditPage, handleRouteAuditPage,
  handleSettingsPage, handleSettingsPasswordUpdate, handleTopTabAuditPage,
} from "../admin/settings-audit-pages.js";
import {
  handleAdminExportJson, handleBackupCenterPage, handleBackupComparePage, handleBackupComparePost,
  handleBackupPreviewPage, handleBackupPreviewPost,
} from "../admin/backup-compare.js";
import {
  handleBackupCandidateSelectPage, handleBackupCandidateSelectPost, handleImportApplyPage,
  handleImportApplyPost, handleImportFinalCheckPage, handleImportFinalCheckPost,
} from "../admin/backup-apply.js";
import {
  handleImportHistoryCsv, handleImportHistoryPage, handleRollbackCandidatePage,
  handleRollbackFinalCheckPage, handleRollbackFinalCheckPost,
} from "../admin/import-history-rollback.js";
import {
  handleDeployRunbookPage, handleFeatureMapPage, handleFilterPagingAuditPage,
  handleFinalReleasePage, handleOperationCenterPage, handleUiAuditPage, handleUserReadyCheckPage,
  handleUserReleaseCheckPage,
} from "../admin/release-audit-pages.js";
import { handleCardBenefitsPage } from "../features/card-benefits.js";
import { handlePaymentMethodsPage } from "../features/payment-methods-page.js";
import {
  handleDiagnosticsPage, handleHouseholdAdminPage, handleHouseholdUserPage,
  handleProductionOpsAuditPage,
} from "../admin/ops-diagnostics-pages.js";
import {
  handleBackupSafetyGuidePage, handleBetaChecklistPage, handleBetaStartPage,
  handleDeploymentCheckPage, handleHouseholdFlowGuidePage, handleKakaoGroupFlowPage,
  handleKakaoGroupLinksPage, handleKakaoLoginRecoveryGuidePage, handleMemeCardContentPage,
  handleMenuPolishGuidePage, handleMobileFirstFlowGuidePage, handleOpenBuilderFinalUtterancePage,
  handleQuickInputHelpPage, handleQuickInputQaPage, handleRealUserQaPage, handleReviewReadyPage,
  handleUiPolishCheckPage, handleUserPolishFinalPage,
} from "../admin/guide-pages.js";
import {
  MEME_CONTENT_LIBRARY, handleKakaoCommandsPage, handleMemeContentCenterPage,
  handleMemeMotionGuidePage, handleMemeReviewCheckPage, handleMemeShareKitPage,
  handleOpsSnapshotJson, handleReleaseDryRunPage, memeMotionPromptList, memeSafePolicyList,
} from "../admin/meme-content-pages.js";
import { handleAnnualReportPage, handleGoalsPage } from "../features/budget-alerts-annual-goals.js";
import {
  handleBrandKitPage, handleBudgetAlertGuidePage, handleBudgetAlertPolishPage,
  handleDuplicateSafetyPage, handleHouseholdCreateJoinGuidePage, handleMeetingArchiveGuidePage,
  handleMeetingHouseholdTemplatePage, handleOpsDashboardPage, handleReleaseCandidateCheckPage,
  handleSettlementHistorySave, handleSettlementSummaryPage, handleTrafficOpsPage,
} from "../features/settlement-ops-pages.js";
import {
  handleKakaoStabilityGuidePage, handleNluFailuresCsv, handleNluOpsJson, handleNluOpsPage,
  handleOpenBuilderGuidePage, handleOpenBuilderReportPage, handleSkillOpsPage,
  handleWelcomeLinkGuidePage,
} from "../admin/nlu-openbuilder-ops.js";
import { handleBeginnerGuidePage, handleUnifiedMenuPage } from "../web/menu-and-guides.js";
import { mergedUserSessionRecoveryResponse, verifyUserSession } from "../auth/user-session.js";
import { boundedFormRequest, handleAccountReauth } from "../auth/identity-reauth.js";
import {
  handleKakaoLoginCallback, handleKakaoLoginStart, handleMyLogout,
} from "../auth/kakao-oauth.js";
import { handleMyMembersPage } from "../my/members-page.js";
import { handleMyBackupCsv, handleMyBackupPage, handleMyImport } from "../my/backup-import.js";
import { handleRecurringCronApply, runRecurringAutoApply } from "../cron/recurring-auto-apply.js";
import { handleMyBudgetBulkSave, handleMyGroupsPage } from "../my/groups-budget-bulk.js";
import { handleReportChallengeSave } from "../my/report-challenge.js";
import {
  handleAutomaticReportCron, handleFreeReportsPage, handleMyPremiumPage, handleReportPreferenceSave,
  runAutomaticReports,
} from "../my/reports-premium.js";
import {
  handleMyAnalysisPage, handleMyInsightPage, insightAppJsResponse,
} from "../my/insight-page.js";
import {
  handleMyBudgetSave, handleMyCategoryKeywordsBulkSave, handleMyCategoryKeywordsSave,
  handleMyRecurringDelete, handleMyRecurringSave, handleMySettingsPage,
  handleRecurringCandidateConfirm,
} from "../my/settings-page.js";
import {
  handleMyAddTransaction, handleMyDeleteTransaction, handleMyUpdateTransaction,
} from "../my/transactions.js";
import {
  handleMyCreate, handleMyHouseholdDelete, handleMyHouseholdLeave, handleMyHouseholdUpdate,
  handleMyHouseholdsPage, handleMyJoin, handleMyPage,
} from "../my/households-lifecycle.js";
import {
  handleMemeArchivePage, handleMemeDelete, handleMemeImage, handleMemeLabPage,
  handleMemePublicStatsPage, handleMemeRankPage, handleMemeReact, handleMemeSave,
  handleMemeSharePage, handlePublicMemeImage, handlePublicMemeLike, handlePublicMemeShareCount,
  handlePublicMemeSharePage,
} from "../features/meme-cards.js";
import { appIconAssetResponse } from "../assets/icons-manifest.js";
import { mobileHomePerformanceAssetResponse } from "../assets/asset-responses.js";
import { handleMobileV8Page } from "../my/mobile-home.js";
import {
  handleBudgetDelete, handleBudgetSave, handlePcAnalysisPage, handlePcCalendarPage,
} from "../admin/pc-analysis-calendar.js";
import {
  handleCursorPreference, handleCursorPreferenceSave, handleHomeLayoutPage, handleHomeLayoutSave,
} from "../my/money-plan-home-layout.js";
import {
  handleBudgetCenterPage, handleRecurringApply, handleRecurringDelete, handleRecurringSave,
} from "../admin/budget-center-recurring.js";
import {
  handleMyBackupLoginPage, handleMyBackupLoginSave, handleMyLocalLogin, handleMyLocalSignup,
  renderKakaoLoginCheckHtml,
} from "../auth/local-login-pages.js";
import { handleMyKakaoClaim } from "../auth/kakao-web-claim.js";
import { renderUserLoginHtml } from "../web/login-page-side-nav.js";
import { renderPublicShareCardHtml } from "../admin/dashboard-fragments.js";
import {
  detectKakaoAmbiguity, formatMessage, kakaoSkillSafeFallbackText,
} from "../kakao/reply-texts.js";
import {
  detectKakaoNaturalIntent, kakaoNluRegistrySummary, kakaoNluRuntimeConfig,
} from "../kakao/intent-nlu.js";
import {
  isUncertainStorageWrite, kakaoDefaultQuickReplies, kakaoText,
} from "../kakao/response-builders.js";
import { buildKakaoSkillTestPayload, kakaoQaRequestAllowed } from "../kakao/request-guards.js";
import { handleKakaoSkillStable } from "../kakao/skill-handler.js";
import { handleKakaoRecentDebug } from "../kakao/transaction-save.js";
import {
  handleUserDayTransactions, handleUserFavorites, handleUserGoals, handleUserNotifications,
  handleUserRecentTransactions, handleUserTxSearch,
} from "../api/user-api.js";
import { handleApi } from "../api/admin-api.js";
import { handleIdentityAuditPage, handleIdentityMerge } from "../admin/identity-merge.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import {
  handleBetaReleaseCandidateFinalPage, handleDomainMigrationGuidePage,
  handleGroupChatbotLaunchGuidePage, handleGroupChatbotTrafficScalePage, handlePersonalUrlAuditPage,
} from "../admin/launch-guide-pages.js";
// @build:imports-end

const ACCOUNTBOOK_WORKER = {
  async fetch(request, env, ctx) {
    const monitoring = abMonitorRequestContext(request, env);
    const requestEnv = { ...env, ...(monitoring ? { __AB_MONITOR_REQUEST: monitoring } : {}), __AB_REQUEST_USER_ROWS: new Map(), __AB_IDENTITY_CONFIRMED: new Map(), __AB_DB_BUDGET: {used: 0, limit: 50} };
    const routed = rememberedHouseholdRequest(request);
    try {
      const response = await ACCOUNTBOOK_WORKER.route(routed.request, requestEnv, ctx);
      abMonitorCompleted(requestEnv, ctx, response);
      return withRememberedHouseholdCookie(routed, response);
    } catch (error) {
      abMonitorCompleted(requestEnv, ctx, null);
      throw error;
    }
  },
  async route(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (["POST", "PUT", "PATCH"].includes(request.method) && url.pathname !== "/skill") {
        request = await boundedFormRequest(request, /\/import(?:\/|$)/.test(url.pathname) ? 16 * 1024 * 1024 : 64 * 1024);
      }

      if (url.pathname === "/internal/ops-metrics" && request.method === "GET") {
        return await abMonitorDatabaseProbe(request, env);
      }

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      const canonicalRedirect = canonicalRedirectResponse(request, env, url);
      if (canonicalRedirect) return canonicalRedirect;

      const optimizedHomeAsset = mobileHomePerformanceAssetResponse(request, url);
      if (optimizedHomeAsset) return optimizedHomeAsset;

      // 브라우저가 링크 태그 없이도 자동으로 요청하는 아이콘 경로.
      // 홈 HTML 예산(35KB·44KB)을 늘리지 않으려고 마크업 대신 실제 파일만 제공한다.
      const appIcon = await appIconAssetResponse(request, url);
      if (appIcon) return appIcon;

      // V22.6.1: 통합된 보조 계정의 오래된 웹 세션을 주 계정 세션으로 자동 복구합니다.
      const recoveredUserSession = await mergedUserSessionRecoveryResponse(request, env, url);
      if (recoveredUserSession) return recoveredUserSession;

      const trafficGuard = checkTrafficGuard(request, env, url);
      if (!trafficGuard.ok) return trafficLimitedResponse(url, request, trafficGuard, env);

      if (!csrfOriginAllowed(request, url)) {
        rememberOpsEvent({ kind: "csrf_blocked", severity: "warn", path: url.pathname, method: request.method, detail: csrfSignalSummary(request, url) });
        return csrfRejectedResponse(url);
      }

      const hiddenFeature = hiddenIncompleteFeatureResponse(request, env, url);
      if (hiddenFeature) return hiddenFeature;

      if (request.method === "HEAD" && url.pathname === "/" && !isExplicitAdminUrl(url) && url.searchParams.get("legacy") !== "1") {
        return headOnlyResponse(await handlePublicContentPage(request, env, url, "home"));
      }

      if (request.method === "HEAD" && url.pathname === "/ads.txt") {
        return headOnlyResponse(handleAdsTxt(env));
      }

      if (url.pathname === "/" && request.method === "GET") {
        // V22.4: 공개 루트는 AdSense 심사와 신규 사용자 이해를 위한 서비스 소개 페이지입니다.
        // 기존 관리자 화면은 ?legacy=1 또는 명시적 관리자 URL에서 그대로 유지합니다.
        const explicitAdmin = isExplicitAdminUrl(url) || url.searchParams.get("legacy") === "1";
        if (!explicitAdmin) return await handlePublicContentPage(request, env, url, "home");
        const adminOk = await verifyAdminSession(request, env);
        if (isMobileRequest(request) && url.searchParams.get("desktop") !== "1" && url.searchParams.get("legacy") !== "1" && adminOk) {
          return redirectResponse(mobileAppLocation(url));
        }
        return safeHtmlRoute(request, url, () => handleAdminPage(request, env, url), "관리자 화면");
      }

      if ((url.pathname === "/manage" || url.pathname === "/admin" || url.pathname === "/home" || url.pathname === "/pc") && request.method === "GET") {
        return redirectResponse("/admin-view");
      }

      if (url.pathname === "/ledger" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        const qs = new URLSearchParams(url.search);
        qs.set("legacy", "1");
        qs.set("tab", "transactions");
        return redirectResponse(`/?${qs.toString()}`);
      }

      if (url.pathname === "/admin-view" && request.method === "GET") {
        return safeHtmlRoute(request, url, () => handleAdminPage(request, env, url), "관리자 화면");
      }

      if ((url.pathname === "/app" || url.pathname === "/m") && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => {
          return await handleMobileV8Page(request, env, url);
        }, "PC 전체 화면");
      }

      if (url.pathname === "/login" && request.method === "POST") {
        return await handleAdminLogin(request, env);
      }

      if (url.pathname === "/logout" && request.method === "POST") {
        return await handleAdminLogout();
      }

      if (url.pathname === "/my" && request.method === "GET") {
        return safeHtmlRoute(request, url, () => handleMyPage(request, env, url), "내 가계부");
      }

      if (url.pathname === "/my/households" && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => handleMyHouseholdsPage(request, env, url), "가계부 전환·생성·참여");
      }

      if (url.pathname === "/my/local-login" && request.method === "POST") {
        return await handleMyLocalLogin(request, env);
      }
      if (url.pathname === "/my/account-reauth" && request.method === "POST") {
        return await handleAccountReauth(request, env);
      }

      if (url.pathname === "/my/kakao-claim" && request.method === "GET") {
        return htmlResponse(renderUserLoginHtml(env, "", safeUserReturnPath(url.searchParams.get("return_to") || "", ""), "kakao_claim"));
      }

      if (url.pathname === "/my/kakao-claim" && request.method === "POST") {
        return await handleMyKakaoClaim(request, env);
      }

      if (url.pathname === "/my/local-signup" && request.method === "POST") {
        return await handleMyLocalSignup(request, env);
      }

      if (url.pathname === "/my/join" && request.method === "POST") {
        return await handleMyJoin(request, env);
      }

      if (url.pathname === "/my/create" && request.method === "POST") {
        return await handleMyCreate(request, env);
      }

      if (url.pathname === "/my/household/update" && request.method === "POST") {
        return await handleMyHouseholdUpdate(request, env);
      }

      if (url.pathname === "/my/household/delete" && request.method === "POST") {
        return await handleMyHouseholdDelete(request, env);
      }

      if (url.pathname === "/my/household/leave" && request.method === "POST") {
        return await handleMyHouseholdLeave(request, env);
      }

      if (url.pathname === "/my/transactions" && request.method === "POST") {
        return await handleMyAddTransaction(request, env);
      }

      if (url.pathname === "/my/backup" && request.method === "GET") {
        return await handleMyBackupPage(request, env, url);
      }

      if (url.pathname === "/my/backup.csv" && request.method === "GET") {
        return await handleMyBackupCsv(request, env, url);
      }

      if (url.pathname === "/my/import" && request.method === "POST") {
        return await handleMyImport(request, env);
      }

      if (url.pathname === "/my/settings" && request.method === "GET") {
        return await handleMySettingsPage(request, env, url);
      }

      if (url.pathname === "/my/analysis" && request.method === "GET") {
        if (url.searchParams.get("view") === "report") return safeHtmlRoute(request, url, () => handleMyAnalysisPage(request, env, url), "종합 리포트");
        return safeHtmlRoute(request, url, () => handleMyInsightPage(request, env, url), "분석 화면");
      }

      if ((url.pathname === "/smart-tools" || url.pathname === "/my/premium") && request.method === "GET") {
        return safeHtmlRoute(request, url, () => handleMyPremiumPage(request, env, url), "무료 스마트 도구");
      }

      // 영수증 사진 등록은 인식률 문제로 없앴다. 예전 북마크·홈 화면 바로가기는 홈으로 보낸다.
      if (url.pathname === "/receipts" && request.method === "GET") {
        const keep = new URLSearchParams();
        for (const key of ["month", "household_id"]) if (url.searchParams.get(key)) keep.set(key, url.searchParams.get(key));
        return redirectResponse(keep.toString() ? `/app?${keep.toString()}` : "/app");
      }

      if (url.pathname === "/reports" && request.method === "GET") {
        return safeHtmlRoute(request, url, () => handleFreeReportsPage(request, env, url), "자동 리포트");
      }

      if (url.pathname === "/my/report-preference/save" && request.method === "POST") {
        return await handleReportPreferenceSave(request, env);
      }

      if (url.pathname === "/my/report-challenge/save" && request.method === "POST") {
        return await handleReportChallengeSave(request, env);
      }

      if (url.pathname === "/my/recurring/from-candidate" && request.method === "POST") {
        return await handleRecurringCandidateConfirm(request, env);
      }

      if (url.pathname === "/my/analysis/app.js" && request.method === "GET") {
        return insightAppJsResponse();
      }

      if (url.pathname === "/my/calendar" && request.method === "GET") {
        const next = new URL("/app", url);
        next.searchParams.set("month", validMonth(url.searchParams.get("month")) || currentMonthKst());
        const hid = url.searchParams.get("household_id");
        if (hid) next.searchParams.set("household_id", hid);
        next.searchParams.set("view", "calendar");
        return redirectResponse(next.pathname + "?" + next.searchParams.toString() + "#calendar");
      }

      if (url.pathname === "/my/groups" && request.method === "GET") {
        return await handleMyGroupsPage(request, env, url);
      }

      if (url.pathname === "/my/members" && request.method === "GET") {
        return await handleMyMembersPage(request, env, url);
      }

      if (url.pathname === "/my/budget/save" && request.method === "POST") {
        return await handleMyBudgetSave(request, env);
      }

      if (url.pathname === "/my/budget-bulk/save" && request.method === "POST") {
        return await handleMyBudgetBulkSave(request, env);
      }

      if (url.pathname === "/my/category-keywords/save" && request.method === "POST") {
        return await handleMyCategoryKeywordsSave(request, env);
      }

      if (url.pathname === "/my/category-keywords/bulk-save" && request.method === "POST") {
        return await handleMyCategoryKeywordsBulkSave(request, env);
      }

      if (url.pathname === "/my/recurring/save" && request.method === "POST") {
        return await handleMyRecurringSave(request, env);
      }

      if (url.pathname === "/my/recurring/delete" && request.method === "POST") {
        return await handleMyRecurringDelete(request, env);
      }

      if (url.pathname === "/cron/recurring/apply" && request.method === "POST") {
        return await handleRecurringCronApply(request, env, url);
      }

      if (url.pathname === "/cron/reports/generate" && request.method === "POST") {
        return await handleAutomaticReportCron(request, env, url);
      }

      if (url.pathname === "/my/update" && request.method === "POST") {
        return await handleMyUpdateTransaction(request, env);
      }

      if (url.pathname === "/my/delete" && request.method === "POST") {
        return await handleMyDeleteTransaction(request, env);
      }

      if (url.pathname === "/my/logout" && request.method === "POST") {
        return await handleMyLogout();
      }

      if ((url.pathname === "/auth/kakao/start" || url.pathname === "/my/kakao-link") && request.method === "GET") {
        if (url.pathname === "/my/kakao-link") url.searchParams.set("link", "1");
        return await handleKakaoLoginStart(request, env, url);
      }

      if (url.pathname === "/auth/kakao/callback" && request.method === "GET") {
        return await handleKakaoLoginCallback(request, env, url);
      }

      if (url.pathname === "/kakao-login-check" && request.method === "GET") {
        // V22.9.26: 설정 여부를 보여 주는 진단 화면이라 관리자만 연다.
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return htmlResponse(renderKakaoLoginCheckHtml(env, url));
      }
      if (url.pathname === "/share" && request.method === "GET") {
        return htmlResponse(renderPublicShareCardHtml(url, env));
      }

      if (url.pathname === "/admin/transactions" && request.method === "POST") {
        return await handleAdminAddTransaction(request, env);
      }

      if (url.pathname === "/admin/delete" && request.method === "POST") {
        return await handleAdminDeleteTransaction(request, env);
      }

      if (url.pathname === "/admin/update" && request.method === "POST") {
        return await handleAdminUpdateTransaction(request, env);
      }

      if (url.pathname === "/transactions/edit" && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => {
          return await handleTransactionEditPage(request, env, url);
        }, "기록 수정 화면");
      }

      if (url.pathname === "/admin/bulk" && request.method === "POST") {
        return await handleAdminBulkUpdate(request, env);
      }

      if (url.pathname === "/admin/budget/save" && request.method === "POST") {
        return await handleBudgetSave(request, env);
      }

      if (url.pathname === "/analysis" && request.method === "GET") {
        const adminOk = await verifyAdminSession(request, env);
        if (!adminOk) {
          const userId = await verifyUserSession(request, env);
          if (userId) {
            const next = new URL("/my/analysis", url);
            return redirectResponse(next.pathname + next.search);
          }
        }
        return safeHtmlRoute(request, url, async () => {
          return await handlePcAnalysisPage(request, env, url);
        }, "PC 분석 화면");
      }

      if (url.pathname === "/calendar" && request.method === "GET") {
        const adminOk = await verifyAdminSession(request, env);
        if (!adminOk) {
          const userId = await verifyUserSession(request, env);
          if (userId) {
            const next = new URL("/app", url);
            next.searchParams.set("month", validMonth(url.searchParams.get("month")) || currentMonthKst());
            const hid = url.searchParams.get("household_id");
            if (hid) next.searchParams.set("household_id", hid);
            next.searchParams.set("view", "calendar");
            return redirectResponse(next.pathname + "?" + next.searchParams.toString() + "#calendar");
          }
        }
        return safeHtmlRoute(request, url, async () => {
          return await handlePcCalendarPage(request, env, url);
        }, "PC 캘린더 화면");
      }

      if (url.pathname === "/budgets" && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => {
          return await handleBudgetCenterPage(request, env, url);
        }, "PC 예산 화면");
      }

      if (url.pathname === "/cursor-preference" && request.method === "GET") {
        return await handleCursorPreference(request, env, url);
      }

      if (url.pathname === "/cursor-preference/save" && request.method === "POST") {
        return await handleCursorPreferenceSave(request, env);
      }

      if (url.pathname === "/home-layout" && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => {
          return await handleHomeLayoutPage(request, env, url);
        }, "홈 구성 화면");
      }

      if (url.pathname === "/home-layout/save" && request.method === "POST") {
        return await handleHomeLayoutSave(request, env);
      }

      if (url.pathname === "/admin/budget/delete" && request.method === "POST") {
        return await handleBudgetDelete(request, env);
      }

      if (url.pathname === "/admin/recurring/save" && request.method === "POST") {
        return await handleRecurringSave(request, env);
      }

      if (url.pathname === "/admin/recurring/delete" && request.method === "POST") {
        return await handleRecurringDelete(request, env);
      }

      if (url.pathname === "/admin/recurring/apply" && request.method === "POST") {
        return await handleRecurringApply(request, env);
      }

      if (url.pathname === "/households" && request.method === "GET") {
        const userId = await verifyUserSession(request, env);
        if (userId) return await handleHouseholdUserPage(request, env, url, userId);
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleHouseholdAdminPage(request, env, url);
      }

      if (url.pathname === "/identity-audit" && request.method === "GET") {
        return await handleIdentityAuditPage(request, env, url);
      }

      if (url.pathname === "/admin/identity/merge" && request.method === "POST") {
        return await handleIdentityMerge(request, env);
      }

      if (url.pathname === "/categories" && request.method === "GET") {
        const userId = await verifyUserSession(request, env);
        if (userId) return redirectResponse(`/keyword-guide?month=${encodeURIComponent(validMonth(url.searchParams.get("month")) || currentMonthKst())}${url.searchParams.get("household_id") ? `&household_id=${encodeURIComponent(url.searchParams.get("household_id"))}` : ""}`);
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/keyword-guide");
        if (blocked) return blocked;
        return await handleCategoryAdminPage(request, env, url);
      }

      if (url.pathname === "/keyword-guide" && request.method === "GET") {
        return await handleKeywordGuidePage(request, env, url);
      }

      if (url.pathname === "/chatbot-edit-guide" && request.method === "GET") {
        return await handleChatbotEditGuidePage(request, env, url);
      }

      if (url.pathname === "/admin/member/update" && request.method === "POST") {
        return await handleAdminMemberUpdate(request, env);
      }

      if (url.pathname === "/admin/member/remove" && request.method === "POST") {
        return await handleAdminMemberRemove(request, env);
      }

      if (url.pathname === "/admin/member/nickname" && request.method === "POST") {
        return await handleAdminMemberNickname(request, env);
      }

      if (url.pathname === "/admin/category/create" && request.method === "POST") {
        return await handleCategoryCreate(request, env);
      }

      if (url.pathname === "/admin/category/delete" && request.method === "POST") {
        return await handleCategoryDelete(request, env);
      }

      if (url.pathname === "/admin/category-keywords/save" && request.method === "POST") {
        return await handleCategoryKeywordsSave(request, env);
      }

      if (url.pathname === "/my/profile" && request.method === "GET") {
        return await handleMyProfilePage(request, env, url);
      }

      if (url.pathname === "/my/profile" && request.method === "POST") {
        return await handleMyProfileUpdate(request, env);
      }

      if (url.pathname === "/my/backup-login" && request.method === "GET") {
        return await handleMyBackupLoginPage(request, env, url);
      }

      if (url.pathname === "/my/backup-login" && request.method === "POST") {
        return await handleMyBackupLoginSave(request, env);
      }

      if (url.pathname === "/admin/household/create" && request.method === "POST") {
        return await handleAdminHouseholdCreate(request, env);
      }

      if (url.pathname === "/admin/household/update" && request.method === "POST") {
        return await handleAdminHouseholdUpdate(request, env);
      }

      if (url.pathname === "/admin/household/regenerate" && request.method === "POST") {
        return await handleAdminHouseholdRegenerate(request, env);
      }

      if (url.pathname === "/admin/household/delete" && request.method === "POST") {
        return await handleAdminHouseholdDelete(request, env);
      }

      if (url.pathname === "/admin/csv" && request.method === "GET") {
        return await handleAdminCsv(request, env, url);
      }

      if (url.pathname === "/admin/import/template.csv" && request.method === "GET") {
        return await handleImportTemplateCsv(request, env);
      }

      if (url.pathname === "/admin/import/template.xls" && request.method === "GET") {
        return await handleImportTemplateXls(request, env);
      }

      if (url.pathname === "/admin/import/json" && request.method === "POST") {
        return await handleAdminImportJson(request, env);
      }

      if (url.pathname === "/health") {
        const missing = missingRuntimeConfiguration(env);
        return jsonResponse({ ok: true, alive: true, status: "alive", configured: missing.length === 0, app: appName(env), version: APP_VERSION, mode: APP_MODE, integrity: "auth-atomicity-spender-audit", missing_count: missing.length, skill_caller_auth_configured: !!String(env.KAKAO_SKILL_SECRET || "").trim(), skill_caller_auth: kakaoSkillAuthSnapshot(env), skill_latency: skillLatencySnapshot(), ready_endpoint: "/ready", time: new Date().toISOString() });
      }

      if (url.pathname === "/ready") {
        const missing = missingRuntimeConfiguration(env);
        if (missing.length) return jsonResponse({ ok: false, ready: false, error: "missing_required_configuration", reason: "missing_required_configuration", message: "필수 설정이 비어 있어 요청을 처리할 수 없습니다.", missing_count: missing.length }, 503);
        const [checks, optionalChecks, rpcResults, alternativeRpcResults] = await Promise.all([
          Promise.all(READINESS_REQUIRED_TABLES.map((name) => checkTableAvailable(env, name))),
          Promise.all(READINESS_OPTIONAL_TABLES.map((name) => checkTableAvailable(env, name))),
          Promise.all(READINESS_CORE_RPCS.map((name) => checkRpcAvailable(env, name))),
          Promise.all(READINESS_ALTERNATIVE_RPC_GROUPS.map(async (group) => Promise.all(group.map((name) => checkRpcAvailable(env, name))))),
        ]);
        const failed = READINESS_REQUIRED_TABLES.filter((_name, index) => !checks[index].ok);
        const unavailableOptionalTables = READINESS_OPTIONAL_TABLES.filter((_name, index) => !optionalChecks[index].ok);
        const missingRpcs = READINESS_CORE_RPCS.filter((_name, index) => !rpcResults[index].ok);
        const missingAlternativeRpcs = READINESS_ALTERNATIVE_RPC_GROUPS.filter((_group, index) => !alternativeRpcResults[index].some((result) => result.ok)).map((group) => group.join("|"));
        const allMissingRpcs = [...missingRpcs, ...missingAlternativeRpcs];
        const ready = failed.length === 0 && allMissingRpcs.length === 0;
        const checkedRpcCount = READINESS_CORE_RPCS.length + READINESS_ALTERNATIVE_RPC_GROUPS.reduce((sum, group) => sum + group.length, 0);
        return jsonResponse({ ok: ready, ready, version: APP_VERSION, skill_caller_auth_configured: !!String(env.KAKAO_SKILL_SECRET || "").trim(), skill_caller_auth: kakaoSkillAuthSnapshot(env), checked_tables: READINESS_REQUIRED_TABLES.length + READINESS_OPTIONAL_TABLES.length, checked_required_tables: READINESS_REQUIRED_TABLES.length, checked_optional_tables: READINESS_OPTIONAL_TABLES.length, checked_rpcs: checkedRpcCount, failed_tables: failed, unavailable_optional_tables: unavailableOptionalTables, missing_rpcs: allMissingRpcs, time: new Date().toISOString() }, ready ? 200 : 503);
      }

      if ((url.pathname === "/nlu-intents.json" || url.pathname === "/nlu-runtime.json") && request.method === "GET") {
        return jsonResponse({ ok: true, version: APP_VERSION, mode: APP_MODE, runtime: kakaoNluRuntimeConfig(env), intents: kakaoNluRegistrySummary() });
      }

      if (url.pathname === "/nlu-detect.json" && request.method === "GET") {
        const q = String(url.searchParams.get("q") || "").slice(0, 300);
        const detected = detectKakaoNaturalIntent(q);
        const ambiguity = detectKakaoAmbiguity(q);
        return jsonResponse({ ok: true, version: APP_VERSION, input_length: q.length, detected, ambiguity: ambiguity ? { type: ambiguity.type, confidence: ambiguity.confidence } : null });
      }

      if (url.pathname === "/nlu-ops" && request.method === "GET") {
        return await handleNluOpsPage(request, env, url);
      }

      if (url.pathname === "/nlu-ops.json" && request.method === "GET") {
        return await handleNluOpsJson(request, env, url);
      }

      if (url.pathname === "/nlu-failures.csv" && request.method === "GET") {
        return await handleNluFailuresCsv(request, env, url);
      }

      if (url.pathname === "/ops-audit" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleProductionOpsAuditPage(request, env, url);
      }

      if (url.pathname === "/card-benefits" && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => {
          const scoped = await getScopedHouseholdsForPage(request, env);
          if (scoped.scope === "none") return redirectResponse("/my");
          const requestedHouseholdId = String(url.searchParams.get("household_id") || "").trim();
          if (requestedHouseholdId && !scoped.households.some((household) => String(household.id) === requestedHouseholdId)) {
            return redirectResponse("/my?err=no_household");
          }
          return await handleCardBenefitsPage(request, env, url);
        }, "카드혜택");
      }

      if (url.pathname === "/payment-methods" && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => {
          return await handlePaymentMethodsPage(request, env, url);
        }, "자산·결제수단");
      }

      if (url.pathname === "/reserve-plans" && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => {
          return await handleReservePlansPage(request, env, url);
        }, "정기지출 준비");
      }

      if ((url.pathname === "/annual" || url.pathname === "/annual-report") && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => {
          return await handleAnnualReportPage(request, env, url);
        }, "연간 리포트");
      }

      if ((url.pathname === "/goals" || url.pathname === "/savings-goals") && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => {
          return await handleGoalsPage(request, env, url);
        }, "저축·목표");
      }

      if (url.pathname === "/admin/reserve-plan/create" && request.method === "POST") {
        return await handleReservePlanCreate(request, env);
      }

      if (url.pathname === "/admin/reserve-plan/update" && request.method === "POST") {
        return await handleReservePlanUpdate(request, env);
      }

      if (url.pathname === "/admin/reserve-plan/delete" && request.method === "POST") {
        return await handleReservePlanDelete(request, env);
      }

      if (url.pathname === "/admin/payment-asset/create" && request.method === "POST") {
        return await handlePaymentAssetCreate(request, env);
      }

      if (url.pathname === "/admin/payment-asset/update" && request.method === "POST") {
        return await handlePaymentAssetUpdate(request, env);
      }

      if (url.pathname === "/admin/payment-asset/delete" && request.method === "POST") {
        return await handlePaymentAssetDelete(request, env);
      }

      if (url.pathname === "/operation-center" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleOperationCenterPage(request, env, url);
      }

      if (url.pathname === "/release-check" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleUserReleaseCheckPage(request, env, url);
      }

      if (url.pathname === "/user-ready-check" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleUserReadyCheckPage(request, env, url);
      }

      if (url.pathname === "/deployment-check" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleDeploymentCheckPage(request, env, url);
      }

      if (url.pathname === "/ui-polish-check" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleUiPolishCheckPage(request, env, url);
      }

      if (url.pathname === "/final-release" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleFinalReleasePage(request, env, url);
      }

      if (url.pathname === "/feature-map" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleFeatureMapPage(request, env, url);
      }

      if (url.pathname === "/deploy-runbook" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleDeployRunbookPage(request, env, url);
      }

      if (url.pathname === "/kakao-recent" && request.method === "GET") {
        if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
        return await handleKakaoRecentDebug(request, env, url);
      }

      if (url.pathname === "/diagnostics" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleDiagnosticsPage(request, env, url);
      }

      if (url.pathname === "/ui-audit" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleUiAuditPage(request, env, url);
      }

      if (url.pathname === "/route-audit" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleRouteAuditPage(request, env, url);
      }

      if (url.pathname === "/nav-audit" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleTopTabAuditPage(request, env, url);
      }

      if (url.pathname === "/flow-audit" && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleRecordFlowAuditPage(request, env, url);
      }

      if (url.pathname === "/filter-audit" && request.method === "GET") {
        return await handleFilterPagingAuditPage(request, env, url);
      }

      if (url.pathname === "/backup" && request.method === "GET") {
        return await handleBackupCenterPage(request, env, url);
      }

      if (url.pathname === "/backup/preview" && request.method === "GET") {
        return await handleBackupPreviewPage(request, env, url);
      }

      if (url.pathname === "/backup/preview" && request.method === "POST") {
        return await handleBackupPreviewPost(request, env);
      }

      if (url.pathname === "/backup/compare" && request.method === "GET") {
        return await handleBackupComparePage(request, env, url);
      }

      if (url.pathname === "/backup/compare" && request.method === "POST") {
        return await handleBackupComparePost(request, env);
      }

      if (url.pathname === "/backup/select" && request.method === "GET") {
        return await handleBackupCandidateSelectPage(request, env, url);
      }

      if (url.pathname === "/backup/select" && request.method === "POST") {
        return await handleBackupCandidateSelectPost(request, env);
      }

      if (url.pathname === "/backup/final-check" && request.method === "GET") {
        return await handleImportFinalCheckPage(request, env, url);
      }

      if (url.pathname === "/backup/final-check" && request.method === "POST") {
        return await handleImportFinalCheckPost(request, env);
      }

      if (url.pathname === "/backup/apply" && request.method === "GET") {
        return await handleImportApplyPage(request, env, url);
      }

      if (url.pathname === "/backup/apply" && request.method === "POST") {
        return await handleImportApplyPost(request, env);
      }

      if (url.pathname === "/backup/import-history" && request.method === "GET") {
        return await handleImportHistoryPage(request, env, url);
      }

      if (url.pathname === "/backup/import-history.csv" && request.method === "GET") {
        return await handleImportHistoryCsv(request, env, url);
      }

      if (url.pathname === "/backup/rollback-candidates" && request.method === "GET") {
        return await handleRollbackCandidatePage(request, env, url);
      }

      if (url.pathname === "/backup/rollback-final-check" && request.method === "GET") {
        return await handleRollbackFinalCheckPage(request, env, url);
      }

      if (url.pathname === "/backup/rollback-final-check" && request.method === "POST") {
        return await handleRollbackFinalCheckPost(request, env);
      }

      if (url.pathname === "/admin/export/json" && request.method === "GET") {
        return await handleAdminExportJson(request, env, url);
      }

      if (url.pathname === "/robots.txt" && request.method === "GET") {
        return await handlePublicRobots(env, url);
      }

      if (url.pathname === "/sitemap.xml" && request.method === "GET") {
        return await handlePublicSitemap(env, url);
      }

      if (url.pathname === "/sitemap.xsl" && request.method === "GET") {
        return await handlePublicSitemapStylesheet(env, url);
      }

      if ((url.pathname === "/site-map" || url.pathname === "/sitemap") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "site-map");
      }

      if (url.pathname === "/ads.txt" && request.method === "GET") {
        return await handleAdsTxt(env);
      }

      if ((url.pathname === "/service-guide" || url.pathname === "/service") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "service-guide");
      }

      if ((url.pathname === "/how-it-works" || url.pathname === "/usage-guide") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "how-it-works");
      }

      if ((url.pathname === "/kakao-guide" || url.pathname === "/kakao-accountbook-guide") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "kakao-guide");
      }

      if ((url.pathname === "/budget-guide" || url.pathname === "/budget-management-guide") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "budget-guide");
      }

      if ((url.pathname === "/group-accountbook" || url.pathname === "/family-accountbook") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "group-accountbook");
      }

      if ((url.pathname === "/security" || url.pathname === "/data-security") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "security");
      }

      if (url.pathname === "/faq" && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "faq");
      }

      if ((url.pathname === "/about" || url.pathname === "/about-service") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "about");
      }

      if ((url.pathname === "/contact" || url.pathname === "/support") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "contact");
      }

      if ((url.pathname === "/cookies" || url.pathname === "/cookie-policy") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "cookies");
      }

      if (url.pathname === "/menu" && request.method === "GET") {
        return await handleUnifiedMenuPage(request, env, url);
      }

      if (url.pathname === "/start-guide" && request.method === "GET") {
        return await handleBeginnerGuidePage(request, env, url);
      }

      if (url.pathname === "/welcome" && request.method === "GET") {
        return await handleWelcomeLinkGuidePage(request, env, url);
      }

      if (url.pathname === "/safe-links" && request.method === "GET") {
        return await handleWelcomeLinkGuidePage(request, env, url);
      }

      if (url.pathname === "/kakao-stability" && request.method === "GET") {
        return await handleKakaoStabilityGuidePage(request, env, url);
      }

      if ((url.pathname === "/openbuilder-guide" || url.pathname === "/kakao-openbuilder" || url.pathname === "/openbuilder-check") && request.method === "GET") {
        return await handleOpenBuilderGuidePage(request, env, url);
      }

      if ((url.pathname === "/openbuilder-report" || url.pathname === "/kakao-review" || url.pathname === "/review-check") && request.method === "GET") {
        return await handleOpenBuilderReportPage(request, env, url);
      }

      if ((url.pathname === "/brand-kit" || url.pathname === "/brand-guide" || url.pathname === "/review-copy") && request.method === "GET") {
        return await handleBrandKitPage(request, env, url);
      }

      if ((url.pathname === "/privacy" || url.pathname === "/data-policy") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "privacy");
      }

      if ((url.pathname === "/terms" || url.pathname === "/service-policy") && request.method === "GET") {
        return await handlePublicContentPage(request, env, url, "terms");
      }

      if ((url.pathname === "/review-ready" || url.pathname === "/beta-ready") && request.method === "GET") {
        return await handleReviewReadyPage(request, env, url);
      }

      if ((url.pathname === "/beta-start" || url.pathname === "/onboarding" || url.pathname === "/user-onboarding") && request.method === "GET") {
        return await handleBetaStartPage(request, env, url);
      }

      if ((url.pathname === "/household-flow" || url.pathname === "/multi-household-guide") && request.method === "GET") {
        return await handleHouseholdFlowGuidePage(request, env, url);
      }

      if ((url.pathname === "/backup-safety" || url.pathname === "/backup-guide") && request.method === "GET") {
        return await handleBackupSafetyGuidePage(request, env, url);
      }

      if ((url.pathname === "/kakao-commands" || url.pathname === "/chatbot-commands") && request.method === "GET") {
        return await handleKakaoCommandsPage(request, env, url);
      }

      if ((url.pathname === "/kakao-group-flow" || url.pathname === "/group-chat-flow" || url.pathname === "/group-household-flow" || url.pathname === "/group-chat-setup") && request.method === "GET") {
        return await handleKakaoGroupFlowPage(request, env, url);
      }

      if ((url.pathname === "/group-household-links" || url.pathname === "/kakao-group-links") && request.method === "GET") {
        return await handleKakaoGroupLinksPage(request, env, url);
      }

      if ((url.pathname === "/kakao-login-recovery" || url.pathname === "/login-recovery-guide" || url.pathname === "/backup-login-guide") && request.method === "GET") {
        return await handleKakaoLoginRecoveryGuidePage(request, env, url);
      }

      if ((url.pathname === "/openbuilder-final" || url.pathname === "/openbuilder-utterances" || url.pathname === "/kakao-openbuilder-final") && request.method === "GET") {
        return await handleOpenBuilderFinalUtterancePage(request, env, url);
      }

      if ((url.pathname === "/user-polish-final" || url.pathname === "/user-polish" || url.pathname === "/ux-final") && request.method === "GET") {
        return await handleUserPolishFinalPage(request, env, url);
      }

      if ((url.pathname === "/mobile-first-flow" || url.pathname === "/mobile-flow" || url.pathname === "/mobile-ux-guide") && request.method === "GET") {
        return await handleMobileFirstFlowGuidePage(request, env, url);
      }

      if ((url.pathname === "/quick-input-help" || url.pathname === "/input-guide" || url.pathname === "/smart-input-guide") && request.method === "GET") {
        return await handleQuickInputHelpPage(request, env, url);
      }

      if ((url.pathname === "/menu-polish" || url.pathname === "/navigation-polish" || url.pathname === "/simple-menu-guide") && request.method === "GET") {
        return await handleMenuPolishGuidePage(request, env, url);
      }

      if ((url.pathname === "/beta-checklist" || url.pathname === "/beta-final-check" || url.pathname === "/user-beta-check") && request.method === "GET") {
        return await handleBetaChecklistPage(request, env, url);
      }

      if ((url.pathname === "/real-user-qa" || url.pathname === "/qa-stability" || url.pathname === "/user-qa") && request.method === "GET") {
        return await handleRealUserQaPage(request, env, url);
      }

      if ((url.pathname === "/quick-input-qa" || url.pathname === "/input-sample-check" || url.pathname === "/classification-samples") && request.method === "GET") {
        return await handleQuickInputQaPage(request, env, url);
      }

      if ((url.pathname === "/meme-card-content" || url.pathname === "/meme-card-plan" || url.pathname === "/meme-cards") && request.method === "GET") {
        return await handleMemeCardContentPage(request, env, url);
      }

      if ((url.pathname === "/meme-content-center" || url.pathname === "/meme-library" || url.pathname === "/meme-publish-center") && request.method === "GET") {
        return await handleMemeContentCenterPage(request, env, url);
      }

      if ((url.pathname === "/meme-motion-guide" || url.pathname === "/nanobanana-prompts" || url.pathname === "/meme-animation-guide") && request.method === "GET") {
        return await handleMemeMotionGuidePage(request, env, url);
      }

      if ((url.pathname === "/meme-review-check" || url.pathname === "/meme-safety-check" || url.pathname === "/meme-policy-check") && request.method === "GET") {
        return await handleMemeReviewCheckPage(request, env, url);
      }

      if ((url.pathname === "/meme-share-kit" || url.pathname === "/meme-kakao-share-kit" || url.pathname === "/meme-share-copy") && request.method === "GET") {
        return await handleMemeShareKitPage(request, env, url);
      }

      if (url.pathname === "/meme-card-catalog.json" && request.method === "GET") {
        return jsonResponse({ ok: true, version: APP_VERSION, mode: APP_MODE, cards: MEME_CONTENT_LIBRARY, policy: memeSafePolicyList(), prompts: memeMotionPromptList(publicBaseUrl(env, url)) });
      }

      if ((url.pathname === "/release-dry-run" || url.pathname === "/final-smoke-check" || url.pathname === "/beta-release-readiness") && request.method === "GET") {
        return await handleReleaseDryRunPage(request, env, url);
      }

      if ((url.pathname === "/beta-release-candidate" || url.pathname === "/release-candidate-final" || url.pathname === "/v21-final-check" || url.pathname === "/final-candidate-check") && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleBetaReleaseCandidateFinalPage(request, env, url);
      }

      if ((url.pathname === "/domain-migration" || url.pathname === "/custom-domain-guide" || url.pathname === "/domain-check" || url.pathname === "/canonical-domain-check") && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleDomainMigrationGuidePage(request, env, url);
      }

      if ((url.pathname === "/group-chatbot-launch" || url.pathname === "/new-group-chatbot-setup" || url.pathname === "/kakao-group-chatbot-start" || url.pathname === "/openbuilder-start-blocks") && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleGroupChatbotLaunchGuidePage(request, env, url);
      }

      if ((url.pathname === "/group-chatbot-scale" || url.pathname === "/traffic-scale-readiness" || url.pathname === "/kakao-traffic-scale" || url.pathname === "/launch-traffic-check") && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handleGroupChatbotTrafficScalePage(request, env, url);
      }

      if ((url.pathname === "/personal-url-audit" || url.pathname === "/public-url-audit" || url.pathname === "/private-address-check" || url.pathname === "/personal-handle-clean-check") && request.method === "GET") {
        const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
        if (blocked) return blocked;
        return await handlePersonalUrlAuditPage(request, env, url);
      }

      if ((url.pathname === "/kakao-command-system" || url.pathname === "/chat-command-guide" || url.pathname === "/quickreply-guide") && request.method === "GET") {
        return await handleKakaoCommandSystemPage(request, env, url);
      }

      if (url.pathname === "/kakao-command-menu.json" && request.method === "GET") {
        return jsonResponse({
          ok: true,
          version: APP_VERSION,
          mode: APP_MODE,
          representative_commands: kakaoRepresentativeCommands(),
          secondary_commands: KAKAO_SECONDARY_COMMANDS,
          commands: kakaoChatCommandCatalog(publicBaseUrl(env, url)),
          quick_replies: kakaoDefaultQuickReplies(),
          registration_note: "관리자센터가 슬래시를 자동 표시하면 label/messageText를, 직접 입력 방식이면 command 값을 사용하세요.",
        });
      }

      if (url.pathname === "/kakao-new-bot-config.json" && request.method === "GET") {
        const publicBase = publicBaseUrl(env, url);
        return jsonResponse({ ok: true, version: APP_VERSION, mode: APP_MODE, service: appName(env), public_base_url: publicBase, skill_url: `${publicBase}/skill`, skill_caller_auth_configured: !!String(env.KAKAO_SKILL_SECRET || "").trim(), skill_caller_auth: kakaoSkillAuthSnapshot(env), user_home: `${publicBase}/my`, kakao_redirect_uri: `${publicBase}/auth/kakao/callback`, privacy_url: `${publicBase}/privacy`, terms_url: `${publicBase}/terms`, group_chatbot_routes: ["/group-chatbot-launch", "/openbuilder-start-blocks", "/group-chatbot-scale", "/personal-url-audit", "/kakao-command-system"], forbidden_public_patterns: ["personal handle", "private workers.dev URL", "direct user email in public copy"], skill_rate_limit_per_user_per_minute: boundedRuntimeNumber(env.SKILL_RATE_LIMIT, 60, 10, 10000), traffic_guard_limit_per_ip_per_minute: boundedRuntimeNumber(env.TRAFFIC_GUARD_LIMIT, 240, 20, 10000), skill_ip_guard: "high_ceiling_only; botUserKey guard handles normal traffic", chat_first: true, quick_replies: "direct_guided_flows_only; group_converted_to_typed_choices" });
      }

      if ((url.pathname === "/release-candidate" || url.pathname === "/rc-check" || url.pathname === "/release-candidate-check") && request.method === "GET") {
        return await handleReleaseCandidateCheckPage(request, env, url);
      }

      if ((url.pathname === "/household-create-join" || url.pathname === "/household-start" || url.pathname === "/invite-code-guide" || url.pathname === "/join-household-guide") && request.method === "GET") {
        return await handleHouseholdCreateJoinGuidePage(request, env, url);
      }

      if ((url.pathname === "/meeting-households" || url.pathname === "/travel-households" || url.pathname === "/household-templates") && request.method === "GET") {
        return await handleMeetingHouseholdTemplatePage(request, env, url);
      }

      if ((url.pathname === "/settlement-summary" || url.pathname === "/split-summary" || url.pathname === "/meeting-settlement") && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => handleSettlementSummaryPage(request, env, url), "모임 정산 요약");
      }

      if (url.pathname === "/my/settlement/save" && request.method === "POST") {
        return await handleSettlementHistorySave(request, env);
      }

      if ((url.pathname === "/meeting-archive" || url.pathname === "/household-archive-guide") && request.method === "GET") {
        return await handleMeetingArchiveGuidePage(request, env, url);
      }

      if ((url.pathname === "/budget-alerts" || url.pathname === "/today-budget" || url.pathname === "/monthly-forecast" || url.pathname === "/fixed-preview") && request.method === "GET") {
        return safeHtmlRoute(request, url, async () => handleBudgetAlertPolishPage(request, env, url), "예산 알림 센터");
      }

      if ((url.pathname === "/budget-alert-guide" || url.pathname === "/budget-polish-guide") && request.method === "GET") {
        return await handleBudgetAlertGuidePage(request, env, url);
      }

      if ((url.pathname === "/ops-dashboard" || url.pathname === "/ops-events" || url.pathname === "/ops-health") && request.method === "GET") {
        return await handleOpsDashboardPage(request, env, url);
      }

      if (url.pathname === "/ops-monitor" || url.pathname.startsWith("/ops-monitor/")) {
        return await handleComprehensiveMonitor(request, env, url);
      }

      if (url.pathname === "/ops-snapshot.json" && request.method === "GET") {
        return await handleOpsSnapshotJson(request, env, url);
      }

      if ((url.pathname === "/ops-duplicates" || url.pathname === "/duplicate-safety") && request.method === "GET") {
        return await handleDuplicateSafetyPage(request, env, url);
      }

      if ((url.pathname === "/ops-traffic" || url.pathname === "/traffic-ops") && request.method === "GET") {
        return await handleTrafficOpsPage(request, env, url);
      }

      if ((url.pathname === "/skill-ops" || url.pathname === "/ops-skill") && request.method === "GET") {
        return await handleSkillOpsPage(request, env, url);
      }

      if (url.pathname === "/settings" && request.method === "GET") {
        if (!(await verifyAdminSession(request, env))) {
          const userId = await verifyUserSession(request, env);
          if (userId) {
            const returnTo = safeUserReturnPath(url.searchParams.get("return_to") || "/my/households", "/my/households");
            return redirectResponse(`/my/backup-login?return_to=${encodeURIComponent(returnTo)}`);
          }
        }
        return await handleSettingsPage(request, env, url);
      }

      if (url.pathname === "/share/meme" && request.method === "GET") {
        return await handlePublicMemeSharePage(request, env, url);
      }

      if (url.pathname === "/share/meme/like" && request.method === "POST") {
        return await handlePublicMemeLike(request, env);
      }

      if (url.pathname === "/share/meme/share" && request.method === "POST") {
        return await handlePublicMemeShareCount(request, env);
      }

      if (url.pathname === "/share/meme-image" && request.method === "GET") {
        return await handlePublicMemeImage(request, env, url);
      }

      if (url.pathname === "/meme" && request.method === "GET") {
        return await handleMemeSharePage(request, env, url);
      }

      if (url.pathname === "/meme-image" && request.method === "GET") {
        return await handleMemeImage(request, env, url);
      }

      if (url.pathname === "/meme-lab" && request.method === "GET") {
        return await handleMemeLabPage(request, env, url);
      }

      if (url.pathname === "/meme-archive" && request.method === "GET") {
        return await handleMemeArchivePage(request, env, url);
      }

      if (url.pathname === "/meme-rank" && request.method === "GET") {
        return await handleMemeRankPage(request, env, url);
      }

      if (url.pathname === "/meme-stats" && request.method === "GET") {
        return await handleMemePublicStatsPage(request, env, url);
      }

      if (url.pathname === "/admin/meme/react" && request.method === "POST") {
        return await handleMemeReact(request, env);
      }

      if (url.pathname === "/admin/meme/save" && request.method === "POST") {
        return await handleMemeSave(request, env);
      }

      if (url.pathname === "/admin/meme/delete" && request.method === "POST") {
        return await handleMemeDelete(request, env);
      }

      if (url.pathname === "/admin/settings/password" && request.method === "POST") {
        return await handleSettingsPasswordUpdate(request, env);
      }

      if (url.pathname === "/skill" && request.method === "GET") {
        return htmlResponse(renderSkillGetHealthHtml(env, url));
      }

      if (url.pathname === "/kakao-skill-test-payload.json" && request.method === "GET") {
        if (!(await kakaoQaRequestAllowed(request, env))) return jsonResponse({ ok: false, error: "not_found", reason: "not_found", message: "요청한 내용을 찾지 못했습니다." }, 404);
        return jsonResponse(buildKakaoSkillTestPayload(url.searchParams.get("q") || "메뉴"));
      }

      if (url.pathname === "/skill" && request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "access-control-max-age": "86400" } });
      }

      if (url.pathname === "/skill" && request.method === "POST") {
        return await handleKakaoSkillStable(request, env, ctx);
      }

      if (url.pathname === "/u/api/tx/search" && request.method === "GET") {
        return await handleUserTxSearch(request, env, url);
      }

      if (url.pathname === "/u/api/recent-transactions" && request.method === "GET") {
        return await handleUserRecentTransactions(request, env, url);
      }

      if (url.pathname === "/u/api/day-transactions" && request.method === "GET") {
        return await handleUserDayTransactions(request, env, url);
      }

      if (url.pathname === "/u/api/notifications" && request.method === "GET") {
        return await handleUserNotifications(request, env, url);
      }

      if (url.pathname === "/u/api/favorites" && (request.method === "GET" || request.method === "POST")) {
        return await handleUserFavorites(request, env, url);
      }

      if (url.pathname === "/u/api/goals" && (request.method === "GET" || request.method === "POST")) {
        return await handleUserGoals(request, env, url);
      }

      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      return jsonResponse({ ok: false, error: "not_found", reason: "not_found", message: "요청한 내용을 찾지 못했습니다." }, 404);
    } catch (err) {
      if (err?.httpStatus === 400 || err?.httpStatus === 413) return jsonResponse({ ok: false, error: err.httpStatus === 413 ? "body_too_large" : "invalid_body", message: "입력 내용을 확인해 주세요." }, err.httpStatus);
      let failedRequestUrl = null;
      try { failedRequestUrl = new URL(request.url); } catch (_urlErr) {}
      logWorkerError({ event: "unhandled_request_error", path: failedRequestUrl?.pathname || "", method: request.method || "GET", error: err });
      try {
        const failUrlForOps = new URL(request.url);
        rememberOpsEvent({ kind: "server_error", severity: "error", path: failUrlForOps.pathname, method: request.method || "GET", detail: safeError(err) });
      } catch (opsErr) {}
      try {
        const failUrl = new URL(request.url);
        if (failUrl.pathname === "/skill") {
          return kakaoText(kakaoSkillSafeFallbackText(failUrl.origin));
        }
      } catch (fallbackErr) {}
      try {
        const failUrl = new URL(request.url);
        // V22.9.26: JSON 을 돌려주는 경로(/api, /u/api, *.json)는 GET 이라도 HTML 안전모드가
        // 아니라 JSON 오류로 답한다. 화면 안의 fetch() 가 JSON 으로 파싱하는 경로다.
        if (request.method === "GET" && !isJsonApiPath(failUrl.pathname)) {
          return htmlResponse(renderEmergencyErrorHtml(failUrl, err), 500);
        }
        // V22.9.26: 브라우저 폼 제출(POST)이 실패하면 JSON 본문이 아니라 같은 안전모드
        // 화면을 보여 준다. "다시 시도"는 제출한 화면(같은 출처 referer)으로 돌아간다.
        if (browserFormRequestFailed(request, failUrl)) {
          return htmlResponse(renderEmergencyErrorHtml(emergencyReturnUrl(request, failUrl), err, "요청을 완료하지 못했어요"), 500);
        }
      } catch (htmlFallbackErr) {}
      if (isUncertainStorageWrite(err)) return jsonResponse({ ok: false, error: "db_write_unknown", reason: "db_write_unknown", uncertain: true, message: formatMessage("db_write_unknown") }, 503);
      return jsonResponse({ ok: false, error: "server_error", message: "요청을 처리하지 못했습니다. 기존 데이터는 변경되지 않았으니 잠시 후 다시 시도해 주세요." }, 500);
    }
  },
  async scheduled(controller, env, ctx) {
    env = { ...env, __AB_DB_BUDGET: { used: 0, limit: 50 } };
    ctx.waitUntil((async () => {
      // V22.9.26: 세 단계를 각각 격리한다. 예전에는 정기지출 단계(가계부 목록 조회)가 던지면
      // 자동 리포트와 NLU 보존 정리가 통째로 건너뛰었다. 오류는 모두 실행한 뒤 다시 던진다.
      let firstError = null;
      try {
        const recurringResult = await runRecurringAutoApply(env);
        if (!recurringResult.ok) { firstError = firstError || new Error("scheduled_recurring_partial"); rememberOpsEvent({ kind: "scheduled_partial", severity: "warn", path: "/cron/recurring/apply", method: "SCHEDULED", detail: `recurring failed=${recurringResult.failed};partial=${!!recurringResult.partial}` }); }
      } catch (err) {
        firstError = firstError || err;
        rememberOpsEvent({ kind: "scheduled_error", severity: "error", path: "/cron/recurring/apply", method: "SCHEDULED", detail: safeError(err) });
      }
      try {
        const reportResult = await runAutomaticReports(env);
        if (!reportResult.ok) { firstError = firstError || new Error("scheduled_reports_partial"); rememberOpsEvent({ kind: "scheduled_partial", severity: "warn", path: "/cron/reports/generate", method: "SCHEDULED", detail: `reports failed=${reportResult.failed};partial=${!!reportResult.partial}` }); }
      } catch (err) {
        firstError = firstError || err;
        rememberOpsEvent({ kind: "scheduled_error", severity: "error", path: "/cron/reports/generate", method: "SCHEDULED", detail: safeError(err) });
      }
      try { await cleanupNluOpsRetention(env); } catch (nluErr) { rememberOpsEvent({ kind: "nlu_retention_error", severity: "warn", path: "/cron/nlu-retention", method: "SCHEDULED", detail: safeError(nluErr) }); }
      rememberOpsEvent({ kind: "scheduled", severity: "info", path: "/cron/recurring/apply", method: "SCHEDULED", detail: firstError ? "recurring auto apply + free reports + nlu retention completed with errors" : "recurring auto apply + free reports + nlu retention completed" });
      if (firstError) throw firstError;
    })());
  },
};

export default ACCOUNTBOOK_WORKER;
