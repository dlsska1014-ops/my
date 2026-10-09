// @build:imports-start
import {
  explicitDateIntent, moneyTokenSpans, quickInputDate, transactionTypeFromText,
} from "../client/shared-input-parsers.js";
import { htmlResponse } from "../runtime/http.js";
import {
  makeMyImportPreviewToken, verifyMyImportPreviewToken,
} from "../auth/crypto-admin-session.js";
import { fetchCategoryKeywordMap, setCategoryKeywords } from "../settings/categories-keywords.js";
import {
  addReservePlan, deleteReservePlan, fetchReservePlans, updateReservePlan,
} from "../settings/reserve-plans.js";
import {
  alignImportCells, canonicalImportField, normalizeImportedRecordDetailed,
  parseFlexibleImportRecords,
} from "../import/flexible-import-parser.js";
import {
  fetchMemberAliasMap, saveMemberAlias, supabaseExactCount,
} from "../data/households-members-rows.js";
import { buildBudgetAlertPolishModel } from "../features/budget-alerts-annual-goals.js";
import { buildSettlementModel } from "../features/settlement-ops-pages.js";
import { resolveEffectiveUserId } from "../auth/user-session.js";
import {
  boundedFormRequest, ensureKakaoLoginUser, fetchUserIdentityLinks, makeCredentialProof,
  readPurposeToken, signedPurposeToken, verifyCredentialProof,
} from "../auth/identity-reauth.js";
import { createUserHousehold } from "../data/users-household-create.js";
import {
  decodeImportUploadBytes, myImportDeterministicTransactionId, myImportReasonCounts,
  prepareMyImportEntry, renderMyImportPreviewHtml, renderMyImportResultHtml,
} from "../my/backup-import.js";
import { runRecurringAutoApply } from "../cron/recurring-auto-apply.js";
import {
  buildReportChallenge, buildReportDashboardSummary, challengePeriodDays, normalizeReportChallenge,
  renderReportChallenge, renderReportDashboard, renderReportMonthNavigator,
  reportChallengeSettingsKey, reportMonthHref, shiftChallengeDate,
} from "../my/report-challenge.js";
import { runAutomaticReports } from "../my/reports-premium.js";
import { budgetExpenseRows } from "../client/insight-main.js";
import {
  canReadMyHousehold, canWriteMyHousehold, getMySelectedHousehold, renderMyAccessStatusHtml,
} from "../my/access-control.js";
import {
  householdJoinFeedback, purgeHouseholdData, removeMemberAlias,
} from "../my/households-lifecycle.js";
import {
  budgetAlertText, budgetFeedbackLine, budgetStageInfo, budgetSummary,
} from "../domain/budgets.js";
import {
  quickChipIconCss, resolveQuickChipIcon, resolveQuickPaymentIcon,
} from "../web/quick-chip-icons.js";
import { normalizeRecurringDay } from "../admin/budget-center-recurring.js";
import { renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { detectKakaoAmbiguity, formatMessage } from "../kakao/reply-texts.js";
import {
  detectKakaoNaturalIntent, kakaoNluRegistrySummary, normalizeKakaoIntentText,
} from "../kakao/intent-nlu.js";
import { isDefiniteStorageFailure, isUncertainStorageWrite } from "../kakao/response-builders.js";
import {
  kakaoEditMenuTextV4, parseKakaoDeleteCommandV4, parseKakaoEditCommandV4,
  parseKakaoRestoreCommandV4,
} from "../kakao/edit-session-v4.js";
import {
  FIELD_BY_NUMBER, FIELD_LABEL, FIELD_SYNONYMS, MAX_FAILS, MAX_TOTAL_TURNS, SESSION_TTL_MS,
  buildValuePrompt, handleEditMessage, isSessionExpired, loopFuzzTest, parseEditInput, selfTest,
} from "../kakao/edit-state-machine.js";
import { parseDirectBudgetSetCommand } from "../kakao/household-budget-commands.js";
import {
  bindKakaoGroupByInviteCode, getExplicitKakaoBotGroupKey, kakaoGroupFirstKeys,
  kakaoGroupLinkItemSettingsKey, readKakaoGroupFirstSnapshot, removeKakaoGroupLink,
} from "../kakao/group-links-first-record.js";
import { persistIdentityAliases } from "../kakao/identity-chat-first.js";
import { ensureUser, joinHouseholdByCode } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { parseMultipleTransactions, parseTransaction } from "../nlu/transaction-parser.js";
import { resolveWeekdayPhrase } from "../nlu/date-payment.js";
// @build:imports-end

export {
  parseEditInput,
  handleEditMessage,
  isSessionExpired,
  selfTest,
  loopFuzzTest,
  buildValuePrompt,
  SESSION_TTL_MS,
  MAX_FAILS,
  MAX_TOTAL_TURNS,
  FIELD_SYNONYMS,
  FIELD_BY_NUMBER,
  FIELD_LABEL,
  parseKakaoEditCommandV4,
  parseKakaoDeleteCommandV4,
  parseKakaoRestoreCommandV4,
  kakaoEditMenuTextV4,
  detectKakaoNaturalIntent,
  normalizeKakaoIntentText,
  detectKakaoAmbiguity,
  kakaoNluRegistrySummary,
  parseFlexibleImportRecords,
  canonicalImportField,
  normalizeImportedRecordDetailed,
  resolveWeekdayPhrase,
  formatMessage,
  fetchCategoryKeywordMap,
  setCategoryKeywords,
  fetchReservePlans,
  addReservePlan,
  updateReservePlan,
  deleteReservePlan,
  fetchMemberAliasMap,
  saveMemberAlias,
  removeMemberAlias,
  fetchUserIdentityLinks,
  persistIdentityAliases,
  ensureUser,
  resolveEffectiveUserId,
  purgeHouseholdData,
  alignImportCells,
  decodeImportUploadBytes,
  createUserHousehold,
  joinHouseholdByCode,
  normalizeRecurringDay,
  householdJoinFeedback,
  isUncertainStorageWrite,
  ensureKakaoLoginUser,
  supabase,
  supabaseExactCount,
  isDefiniteStorageFailure,
  getMySelectedHousehold,
  renderMyAccessStatusHtml,
  renderMyImportPreviewHtml,
  renderMyImportResultHtml,
  makeMyImportPreviewToken,
  verifyMyImportPreviewToken,
  prepareMyImportEntry,
  myImportDeterministicTransactionId,
  myImportReasonCounts,
  renderMyStartChoiceHtml,
  htmlResponse,
  canReadMyHousehold,
  canWriteMyHousehold,
  buildSettlementModel,
  reportChallengeSettingsKey,
  shiftChallengeDate,
  challengePeriodDays,
  normalizeReportChallenge,
  buildReportChallenge,
  renderReportChallenge,
  reportMonthHref,
  renderReportMonthNavigator,
  buildReportDashboardSummary,
  renderReportDashboard,
  resolveQuickChipIcon,
  resolveQuickPaymentIcon,
  quickChipIconCss,
};

export { moneyTokenSpans, transactionTypeFromText, quickInputDate, signedPurposeToken, readPurposeToken, makeCredentialProof, verifyCredentialProof, boundedFormRequest, parseMultipleTransactions, parseTransaction, budgetSummary };

export { runRecurringAutoApply, runAutomaticReports, buildBudgetAlertPolishModel, budgetStageInfo, budgetAlertText, budgetFeedbackLine, parseDirectBudgetSetCommand };

export { budgetExpenseRows };

export { explicitDateIntent };

export { kakaoGroupFirstKeys, kakaoGroupLinkItemSettingsKey, getExplicitKakaoBotGroupKey, readKakaoGroupFirstSnapshot, removeKakaoGroupLink, bindKakaoGroupByInviteCode };
