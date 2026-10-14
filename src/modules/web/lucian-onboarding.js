// @build:imports-start
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end
// <!-- Lucian UX/UI Prompt #088 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#088 -->
function renderAccountbookEmptyState({ householdId = "", named = false, autoTour = false } = {}) {
  if (named) return `<section class="abEmptyFolder homeOnboarding" data-ab-empty-folder${autoTour ? " data-ab-new-ledger" : ""} data-household-id="${escapeHtml(householdId)}"><h2>첫 기록을 남겨보세요</h2><p>가계부를 준비했습니다. 지출이나 수입을 한 줄로 입력하세요.</p><button type="button" data-ab-quick-open>첫 기록 남기기</button></section>`;
  const templates = [["household", "우리집 생활비"], ["travel", "여행"], ["meeting", "모임 정산"], ["settlement", "단발성"]];
  return `<section class="abEmptyFolder" data-ab-empty-folder><h2>어떤 가계부를 만들까요?</h2><p>템플릿을 고르면 이름을 확인한 뒤 가계부를 만들 수 있습니다.</p><div class="abEmptyTemplates">${templates.map(([key, label]) => `<a data-ab-template="${key}" href="/my/households?template=${key}#create">${label}</a>`).join("")}</div></section>`;
}
// @build:exports-start
export { renderAccountbookEmptyState };
// @build:exports-end
