
function mergedOptions(base, extra) {
  const seen = new Set();
  const out = [];
  for (const v of [...base, ...extra]) {
    const s = String(v || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s); out.push(s);
  }
  return out;
}

function formatMessage(msg) {
  if (msg === "signup_created_invite_missing") return "계정을 만들고 로그인했습니다. 입력한 초대코드는 찾지 못했습니다. 가입을 다시 누르지 말고 아래에서 가계부를 만들거나 초대코드로 참여하세요.";
  if (msg === "import_preview_expired") return escapeHtml("가져오기 미리보기가 만료되었거나 현재 계정·가계부와 맞지 않습니다. 원본은 저장되지 않았으니 파일을 다시 선택해 미리보기를 만들어 주세요.");
  if (msg === "member_alias_updated") return escapeHtml("참여자 이름을 수정했습니다.");
  const friendly = {
    backup_login_saved: "내 계정 로그인 비밀번호를 저장했습니다. 이전에 보던 화면으로 돌아왔습니다.",
    confirmation_required: "처리 내용을 확인하는 항목에 동의해 주세요.",
    current_password_wrong: "현재 관리자 비밀번호가 맞지 않습니다.",
    delete_confirm_required: "삭제 전 확인 문구를 정확히 입력해 주세요.",
    display_name_required: "이 가계부에서 사용할 내 이름을 입력해 주세요.",
    household_deleted: "가계부와 연결된 기록을 안전하게 삭제했습니다.",
    household_left: "가계부에서 나왔습니다. 기존 기록의 지출자 이름은 유지됩니다.",
    household_required: "먼저 사용할 가계부를 선택해 주세요.",
    household_updated: "가계부 이름을 변경했습니다.",
    invalid_date: "날짜를 확인해 주세요. 기록은 변경되지 않았습니다.",
    invalid_mode: "지원하지 않는 정산 방식입니다. 방식을 다시 선택해 주세요.",
    login_required: "이 기능을 사용하려면 먼저 로그인해 주세요.",
    manage_required: "가계부 소유자 또는 관리자만 변경할 수 있습니다.",
    member_missing: "변경할 참여자를 찾지 못했습니다. 목록을 새로 열어 다시 선택해 주세요.",
    nickname_missing: "표시 이름을 입력해 주세요.",
    password_mismatch: "새 비밀번호 확인이 일치하지 않습니다.",
    password_too_short: "관리자 비밀번호는 10자리 이상으로 설정해 주세요.",
    personal_password_invalid: "내 계정 로그인 비밀번호가 맞지 않습니다.",
    personal_password_mismatch: "내 계정 로그인 비밀번호 확인이 일치하지 않습니다.",
    personal_password_short: "내 계정 로그인 비밀번호는 8자리 이상으로 입력해 주세요.",
    preference_saved: "설정을 저장했습니다.",
    recurring_exists: "같은 반복 항목이 이미 등록되어 있어 중복 저장하지 않았습니다.",
    recurring_registered: "반복 항목을 등록했습니다.",
    recurring_save_failed: "반복 항목을 저장하지 못했습니다. 기존 데이터는 유지됩니다.",
    regenerated: "초대코드를 새로 만들었습니다. 이전 코드는 더 이상 사용할 수 없습니다.",
    save_failed: "저장하지 못했습니다. 기존 데이터는 유지되므로 잠시 후 다시 시도해 주세요.",
    "거래내역을 저장하지 못했습니다. 기존 데이터는 변경되지 않았습니다.": "거래내역을 저장하지 못했습니다. 기존 데이터는 변경되지 않았습니다.",
    settings_table_required: "보안 설정 저장 공간을 확인해야 합니다. 관리자에게 배포 상태 확인을 요청해 주세요.",
    settlement_already_completed: "같은 조건의 정산 완료 이력이 이미 있습니다.",
    settlement_busy: "다른 정산 저장이 진행 중입니다. 잠시 후 한 번만 다시 시도해 주세요.",
    settlement_completed: "정산 완료 이력을 저장했습니다.",
    spender_not_member: "지출자는 현재 가계부 참여자 중에서 선택해 주세요.",
    payment_asset_saved_snapshot_deferred: "자산·결제수단은 저장했습니다. 이번 달 순자산 기록 갱신은 잠시 후 다시 시도해 주세요.",
    payment_asset_updated_snapshot_deferred: "자산 정보는 수정했습니다. 이번 달 순자산 기록 갱신은 잠시 후 다시 시도해 주세요.",
    payment_asset_balance_updated_snapshot_deferred: "현재 잔액은 저장했습니다. 이번 달 순자산 기록 갱신은 잠시 후 다시 시도해 주세요.",
    payment_asset_deleted_snapshot_deferred: "자산·결제수단은 삭제했습니다. 이번 달 순자산 기록 갱신은 잠시 후 다시 시도해 주세요.",
  };
  if (friendly[msg]) return escapeHtml(friendly[msg]);
  const map = { no_household: "현재 열 수 있는 가계부가 없습니다. 새 가계부를 만들거나 받은 초대코드로 참여해 주세요.", joined: "가계부 참여가 완료되었습니다. 가계부 목록에서 선택해 기록을 확인하세요.",
    joined_viewer: "조회 전용으로 참여 중인 가계부입니다. 기록은 볼 수 있지만 저장·수정·삭제할 수 없습니다.",
    join_blocked: "이 가계부에서는 참여가 차단되어 있습니다. 초대코드를 다시 입력해도 권한은 바뀌지 않습니다. 소유자에게 확인해 주세요.",
    db_write_unknown: "처리 결과를 아직 확인하지 못했습니다. 기록·목표·참여 목록을 새로고침해 결과를 먼저 확인하고 같은 요청을 반복하지 마세요.", amount_required: "0원보다 큰 금액을 입력해 주세요. 입력 내용은 저장되지 않았습니다.", amount_too_large: "금액이 너무 큽니다. 20억 원 이하로 입력해 주세요. 입력 내용은 저장되지 않았습니다.", record_not_found: "수정할 기록을 찾지 못했습니다. 기록 목록을 새로 열어 다시 선택해 주세요.", not_my_record: "이 기록을 바꿀 권한이 없습니다. 내가 만든 기록을 선택하거나 소유자·관리자에게 요청해 주세요.", budget_save_failed: "예산을 저장하지 못했습니다. 기존 값은 유지되므로 잠시 후 한 번만 다시 시도해 주세요.", budget_amount_invalid: "예산 금액을 숫자로 입력해 주세요. 기존 예산은 그대로 유지됩니다.", budget_plan_too_many: "예산 항목은 한 번에 100개까지 저장할 수 있습니다. 101번째 이후 항목을 줄인 뒤 다시 저장해 주세요. 기존 예산은 유지됩니다.", category_missing: "분류 이름을 입력해 주세요. 다른 입력값은 저장되지 않았습니다.", category_keywords_save_failed: "분류 키워드를 저장하지 못했습니다. 기존 설정은 유지되므로 잠시 후 다시 시도해 주세요.", category_created_keywords_pending: "분류는 추가했지만 키워드는 저장하지 못했습니다. 분류 목록에서 키워드만 다시 저장해 주세요.", keyword_manage_only: "분류 키워드 저장은 가계부 소유자·관리자만 할 수 있습니다. 현재 설정은 그대로 확인할 수 있습니다.", recurring_missing: "정기항목의 내용과 0원보다 큰 금액을 입력해 주세요.", recurring_table_required: "정기항목 저장 공간을 사용할 수 없습니다. 입력값은 저장되지 않았으니 관리자에게 운영 상태 확인을 요청해 주세요.", recurring_delete_failed: "정기항목을 삭제하지 못했습니다. 기존 항목은 유지되므로 새로고침 후 다시 시도해 주세요.", recurring_manual_month_end_blocked: "29~31일 고정항목은 현재 수동 반영에서 안전하게 처리할 수 없어 저장하지 않았습니다. 예약 실행은 실제 말일에 맞춰 처리하며, 수동 반영 RPC 확인과 별도 SQL 보완 승인이 필요합니다.", record_update_failed: "기록을 수정하지 못했습니다. 기존 기록은 유지되므로 새로고침 후 다시 시도해 주세요.", record_delete_failed: "기록을 삭제하지 못했습니다. 기존 기록은 유지되므로 새로고침 후 다시 시도해 주세요.", empty_import: "가져올 내용이 비어 있습니다. 파일을 다시 선택하거나 표·자연어 기록을 붙여넣어 주세요.", write_not_allowed: "현재 권한은 조회 전용이라 기록을 변경하거나 가져올 수 없습니다. 소유자 또는 관리자에게 권한을 요청해 주세요.", excel_conversion_required: "엑셀 파일을 텍스트 표로 변환하지 못했습니다. 이 화면에서 다시 선택해 변환을 기다리거나 CSV로 저장해 올려 주세요.", import_file_too_large: "한 번에 분석할 수 있는 파일 크기를 넘었습니다. 원본은 바뀌지 않았으니 월별 또는 시트별로 나눠 다시 가져와 주세요.", import_file_read_failed: "파일을 읽지 못했습니다. 파일이 열리는지 확인한 뒤 CSV·TSV·TXT로 저장하거나 내용을 붙여넣어 주세요.", added: "거래내역을 추가했습니다.", deleted: "거래내역을 삭제했습니다.", updated: "거래내역을 수정했습니다.", bulk_updated: "선택 항목을 일괄 수정했습니다.", bulk_deleted: "선택 항목을 삭제했습니다.", created: "새 가계부를 만들었습니다. 이제 초대·단톡방 연결 → 기록 방법 → 첫 기록 순서로 진행해 보세요.", household_duplicate_selected: "같은 이름의 가계부가 이미 있어 중복 생성하지 않고 기존 가계부를 선택했습니다.", household_name_invalid: "가계부 이름은 2~40자의 일반 이름으로 입력해 주세요. 명령어·전화번호·초대코드·금액만 있는 이름은 사용할 수 없습니다.", household_create_failed: "가계부 생성을 완료하지 못했습니다. 중간 생성 데이터는 정리했으니 잠시 후 한 번만 다시 시도해 주세요.", household_create_busy: "같은 이름의 가계부를 다른 곳에서 만드는 중입니다. 잠시 후 다시 시도하면 기존 가계부가 선택됩니다.", duplicate_skipped: "방금 같은 내용의 기록이 있어 중복 저장을 막았습니다.", db_delay: "저장소 응답이 잠시 지연되고 있습니다. 잠시 후 다시 시도해주세요.", invite_code_not_found: "초대코드를 찾지 못했습니다. 영문·숫자를 다시 확인하고, 계속 안 되면 초대한 사람에게 최신 코드를 요청해 주세요.", invite_code_missing: "초대코드를 입력해주세요.", approval_pending: "참여 요청이 접수되었습니다. 같은 코드를 반복 입력하지 말고 관리자 승인 후 다시 열어 주세요.", join_failed: "참여 요청을 안전하게 저장하지 못했습니다. 권한은 자동으로 열리지 않았습니다. 잠시 후 한 번만 다시 시도해 주세요.", member_updated: "참여자 권한을 수정했습니다.", member_removed: "참여자를 방출했습니다.", nickname_updated: "닉네임을 수정했습니다.", category_created: "분류를 추가했습니다.", category_created_fallback: "분류를 저장했습니다.", category_deleted: "분류를 삭제했습니다.", category_deleted_fallback: "분류를 삭제했습니다.", category_keywords_saved: "분류 키워드를 저장했습니다.", payment_asset_saved: "자산·결제수단을 저장했습니다.", payment_asset_updated: "자산·결제수단 정보를 수정했습니다.", payment_asset_balance_updated: "현재 잔액을 저장하고 이번 달 순자산 기록을 갱신했습니다.", payment_asset_deleted: "자산·결제수단을 삭제하고 순자산 기록을 갱신했습니다.", reserve_saved: "정기 수입·지출 항목을 저장했습니다.",
  reserve_updated: "정기 수입·지출 항목을 수정했습니다.", reserve_deleted: "정기지출 준비 항목을 삭제했습니다.", budget_saved: "예산을 저장했습니다.", budget_deleted: "예산을 삭제했습니다.", budget_over: "저장했습니다. 예산을 초과했습니다.", recurring_saved: "고정항목을 저장했습니다.", recurring_deleted: "고정항목을 삭제했습니다.", password_updated: "비밀번호를 변경했습니다.", meme_saved: "밈카드를 도감에 저장했습니다.", meme_deleted: "밈카드를 삭제했습니다.", meme_liked: "좋아요를 반영했습니다.", meme_shared: "공유 횟수를 반영했습니다.", kakao_linked: "카카오 계정 연동이 완료되었습니다.",
};
  const generic = "요청을 처리하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.";
  // 쿼리 문자열은 사용자가 직접 만들 수 있다. 정확히 열거한 코드만 사용자 안내로 바꾸고,
  // 코드가 아닌 자유 문장(짧은 한국어 포함)은 출처를 증명할 수 없으므로 일반 안내로 닫는다.
  return escapeHtml(map[msg] || generic);
}

function isMissingCategory(value) {
  const v = String(value || "").trim();
  return !v || ["기타", "기타지출", "기타수입", "미분류", "분류없음", "없음", "-"].includes(v);
}

function isMissingPayment(value) {
  const v = String(value || "").trim();
  return !v || ["미입력", "없음", "-", "결제수단없음"].includes(v);
}

function renderQualityOptions(selected) {
  const opts = [["all","정리상태 전체"],["missing_any","정리 필요"],["missing_category","카테고리 미분류"],["missing_payment","결제수단 미입력"],["kakao_only","카카오 입력"],["web_only","웹 직접 입력"]];
  return opts.map(([v,l]) => `<option value="${v}"${selected === v ? " selected" : ""}>${l}</option>`).join("");
}

function renderGroupOptions(selected) {
  const opts = [["category","분류별"],["payment_method","결제수단별"],["transaction_date","날짜별"],["weekday","요일별"],["type","기록 유형별"],["source","입력경로별"]];
  return opts.map(([v,l]) => `<option value="${v}"${selected === v ? " selected" : ""}>통계: ${l}</option>`).join("");
}

function groupLabel(groupBy) {
  return { category: "분류별", payment_method: "결제수단별", transaction_date: "날짜별", weekday: "요일별", type: "기록 유형별", source: "입력경로별" }[groupBy] || "분류별";
}

function kakaoSkillSafeFallbackText(origin = "") {
  return [
    "잠시 처리 흐름을 정리하고 있어요 😊",
    "",
    "아래처럼 다시 보내주세요.",
    "• 점심 12000원 국민카드",
    "• 월급 250만원",
    "• 이번 달 요약",
    "• 도움말",
  ].join("\n");
}

function kakaoNoMatchGuideText(utterance = "", origin = "") {
  const t = normalizeText(utterance);
  if (/(닉네임|별명|표시명|내 이름|이름 수정|이름 변경)/.test(t)) {
    return [
      "이 가계부에서 표시할 이름을 바꾸려는 것으로 이해했어요 😊",
      "",
      "아래처럼 보내주세요.",
      "• 내 이름 설정",
      "• 내 이름을 인남으로 변경",
    ].join("\n");
  }
  if (/(초대|코드|구성원|멤버)/.test(t)) {
    return [
      "구성원 초대 또는 초대코드 확인으로 이해했어요 😊",
      "",
      "아래처럼 보내주세요.",
      "• 초대코드",
      "• 구성원 초대",
      "• 초대코드로 참여",
    ].join("\n");
  }
  const maybeHasMoneyWord = /(원|만원|천원|카드|현금|페이|계좌|점심|커피|마트|병원|월급|수입|지출|결제|주유|택시|보험|세금)/.test(t);
  const firstLine = maybeHasMoneyWord
    ? "금액과 내용을 한 문장으로 보내주시면 바로 기록할 수 있어요 😊"
    : "말씀하신 내용을 정확히 이해하지 못했어요. 아래 예시처럼 보내주세요 😊";
  return [
    firstLine,
    "",
    "기록 예시",
    "• 점심 12000원 국민카드",
    "• 커피 5000원 현금",
    "• 어제 병원 15000원",
    "• 월급 250만원",
    "",
    "자주 쓰는 말",
    "• 이번 달 요약",
    "• 오늘 기록 보기",
    "• 내 이름 설정",
    "• 초대코드",
    "• 수정가이드",
  ].filter(Boolean).join("\n");
}

function detectKakaoAmbiguity(utterance = "") {
  const raw = normalizeText(stripKakaoBotMention(utterance));
  const normalized = normalizeKakaoIntentText(utterance);
  const compact = normalized.replace(/\s+/g, "");
  if (!normalized) return null;

  if (/^(이름변경|이름수정|이름바꾸기|이름바꿔|이름고치기)$/.test(compact)) {
    return { type: "name_target", confidence: 0.99 };
  }
  if (/^(초대|초대하기|초대해줘)$/.test(compact)) {
    return { type: "invite_action", confidence: 0.99 };
  }
  if (/^(예산|예산좀|예산관리)$/.test(compact)) {
    return { type: "budget_action", confidence: 0.99 };
  }
  if (/^(가계부|장부)$/.test(compact)) {
    return { type: "household_action", confidence: 0.99 };
  }

  // V22.8.76: "주유 5만원"·"카페 4500" 처럼 분류 이름과 금액만 온 말은 더 이상
  // 되묻지 않고 지출로 바로 기록한다. 되묻는 기준이 21개 단어 목록이라
  // "카페 4500"은 묻고 "커피 4500"은 안 묻는 식이라 규칙을 알 수 없었다.
  // 대부분은 지출이라는 뜻이고, 예산은 "식비 예산 30만원"으로 말하면 된다.
  return null;
}

function kakaoAmbiguityGuide(utterance = "", origin = "") {
  const ambiguity = detectKakaoAmbiguity(utterance);
  if (!ambiguity) return null;
  if (ambiguity.type === "name_target") {
    return {
      text: "어떤 이름을 바꾸시려는 건가요?",
      quickReplies: [["내 표시 이름", "내 이름 설정"], ["가계부 이름", "가계부 관리"]],
      reason: ambiguity.type,
    };
  }
  if (ambiguity.type === "invite_action") {
    return {
      text: "구성원을 초대할까요, 받은 초대코드로 참여할까요?",
      quickReplies: [["초대코드 보기", "초대코드"], ["코드로 참여", "초대코드로 참여"]],
      reason: ambiguity.type,
    };
  }
  if (ambiguity.type === "budget_action") {
    return {
      text: "예산을 새로 설정할까요, 현재 예산을 확인할까요?",
      quickReplies: [["예산 설정", "예산 설정"], ["남은 예산", "남은 예산"]],
      reason: ambiguity.type,
    };
  }
  if (ambiguity.type === "household_action") {
    return {
      text: "가계부에서 무엇을 하시려는 건가요?",
      quickReplies: [["새로 만들기", "새 가계부 만들기"], ["코드로 참여", "초대코드로 참여"], ["가계부 전환", "가계부 전환"]],
      reason: ambiguity.type,
    };
  }
  return null;
}

// V22.9.17: "안녕"·"고마워" 같은 인사에 "이해하지 못했어요"로 답하고 있었다. 첫 인사가 오류 문구면
// 안 된다. 짧은 인사로 받고 다음 행동만 짚어 준다. 금액이 섞인 문장은 인사로 보지 않는다.
const KAKAO_GREETING_PATTERN = /^(안녕|안녕하세요|안녕하십니까|하이|헬로|반가워|반갑습니다|ㅎㅇ|좋은\s*아침|굿모닝|굿나잇|잘\s*자|고마워|고맙습니다|감사|감사합니다|땡큐|수고|수고했어|잘\s*했어|최고|짱|ㅋㅋ+|ㅎㅎ+)[!~.^\s]*$/;

function isKakaoGreetingUtterance(utterance = "") {
  const t = normalizeText(utterance);
  if (!t || /\d/.test(t)) return false;
  return KAKAO_GREETING_PATTERN.test(t);
}

function kakaoGreetingReply(utterance = "") {
  const t = normalizeText(utterance);
  const thanks = /(고마|감사|땡큐|수고|잘\s*했|최고|짱)/.test(t);
  const text = thanks
    ? "저도 고마워요 😊 오늘 쓴 돈이 있으면 바로 적어 주세요.\n예: 커피 4500원"
    : "안녕하세요 😊 무엇을 도와드릴까요?\n\n지출은 이렇게 보내면 바로 기록돼요.\n• 점심 12000원 국민카드\n• 어제 병원 15000원";
  return { text, quickReplies: [["기록 방법", "기록 방법"], ["이번 달 요약", "이번 달 요약"], ["도움말", "도움말"]] };
}

function kakaoNoMatchGuide(utterance = "", origin = "") {
  if (isKakaoGreetingUtterance(utterance)) return kakaoGreetingReply(utterance);
  const nlu = detectKakaoNaturalIntent(utterance);
  const text = kakaoNoMatchGuideText(utterance, origin);
  if (nlu.intent === "MEMBER_ALIAS_CHANGE") return { text, quickReplies: [["내 이름 변경", "내 이름 설정"], ["취소", "취소"]] };
  if (["INVITE_CODE_SHOW","INVITE_MEMBER"].includes(nlu.intent) || /(초대|코드|구성원|멤버)/.test(nlu.normalized)) {
    return { text, quickReplies: [["초대코드 보기", "초대코드"], ["코드로 참여", "초대코드로 참여"]] };
  }
  if (["BUDGET_SETUP","BUDGET_STATUS"].includes(nlu.intent) || /예산/.test(nlu.normalized)) {
    return { text: "예산을 설정할까요, 현재 예산을 확인할까요?", quickReplies: [["예산 설정", "예산 설정"], ["남은 예산", "남은 예산"]] };
  }
  if (/가계부/.test(nlu.normalized)) {
    return { text: "가계부를 새로 만들거나, 초대코드로 참여하거나, 다른 가계부로 전환할 수 있어요.", quickReplies: [["새 가계부", "새 가계부 만들기"], ["코드로 참여", "초대코드로 참여"], ["가계부 전환", "가계부 전환"]] };
  }
  return { text, quickReplies: [] };
}

function kakaoInputExampleText(origin = "") {
  return [
    "📝 입력 예시",
    "",
    "지출",
    "• 점심 12000원 국민카드",
    "• 커피 5000원 현금",
    "• 어제 병원 15000원",
    "• 7월 2일 주유 70000원",
    "",
    "수입",
    "• 월급 250만원",
    "• 부수입 30000원",
    "",
    "확인/수정",
    "• 오늘 기록",
    "• 수정 01번 금액 13000원",
    "• 수정 01번 삭제",
  ].join("\n");
}

function kakaoKeywordGuideText(origin = "") {
  return [
    "🔎 키워드 안내",
    "",
    "자주 쓰는 상호명이나 표현을 분류 키워드로 등록할 수 있어요.",
    "",
    "예시",
    "• 스타벅스, 스벅, 커피 → 식비",
    "• 주유, 하이패스 → 교통",
    "• 병원, 약국, 치과 → 의료",
    "",
    "상세 키워드 관리는 웹에서 ‘키워드 안내’를 요청했을 때만 연결해 드려요.",
  ].join("\n");
}

function kakaoEditSimpleGuideText(origin = "") {
  return [
    "✏️ 수정가이드",
    "",
    "먼저 ‘오늘 기록 보기’를 입력해 번호를 확인해 주세요.",
    "",
    "예시",
    "• 수정 01번  ← 메뉴로 하나씩 선택",
    "• 수정 01번 금액 13000",
    "• 수정 01번 지출자 엄마",
    "• 삭제 01번",
  ].join("\n");
}

function kakaoReserveSimpleGuideText(origin = "") {
  return [
    "📌 정기지출 준비",
    "",
    "재산세, 자동차세, 자동차보험처럼 큰 지출을 미리 기록하고 준비할 수 있어요.",
    "",
    "입력 예시",
    "• 자동차보험 120만원 8월",
    "• 재산세 30만원 7월",
  ].join("\n");
}

function kakaoBudgetGuideText(origin = "") {
  return [
    "💰 예산 사용법",
    "",
    "설정: ‘예산 설정’ 또는 ‘/예산설정’",
    "직접 설정: ‘식비 예산설정 100만원’",
    "확인: ‘남은 예산’ 또는 ‘예산 현황’",
  ].join("\n");
}

function kakaoOpenBuilderGuideText(origin = "") {
  return [
    "🧩 카카오 오픈빌더 설정 안내",
    "",
    "카카오톡에서 기본 응답으로 빠지면 대부분 Worker가 아니라 오픈빌더 블록/폴백이 /skill로 전달되지 않는 상태예요.",
    "",
    "필수 연결",
    `Skill URL: ${origin}/skill`,
    "",
    "반드시 /skill로 연결할 발화",
    "• 도움말 / 처음 / 메뉴",
    "• 입력 예시",
    "• 요약",
    "• 남은 예산 / 예산 확인 / 남은 돈",
    "• 최근 / 오늘 기록",
    "• 수정가이드",
    "• 키워드 안내",
    "• 정기지출",
    "• 링크",
    "• 폴백",
    "",
    origin ? `설정 가이드\n${origin}/openbuilder-guide\n\n운영점검\n${origin}/openbuilder-report` : "",
  ].filter(Boolean).join("\n");
}

function kakaoBrandGuideText(origin = "", env = {}) {
  const name = appName(env);
  return [
    `📒 ${name}`,
    "",
    "말하면 알아서 정리되는 우리집 가계부",
    "",
    "브랜드 원칙",
    "• 카카오/카톡/공식 명칭처럼 보이지 않기",
    "• 금융사·투자·대출 서비스처럼 보이지 않기",
    "• 가족 생활비 기록 도우미로 설명하기",
    "",
    origin ? `브랜드/심사 문구\n${origin}/brand-kit` : "",
  ].filter(Boolean).join("\n");
}

function kakaoDataPolicyText(origin = "") {
  return [
    "🔐 개인정보·데이터 안내",
    "",
    "말해가계부는 단톡방 전체 대화를 읽거나 학습하지 않습니다.",
    "봇에게 직접 보낸 명령어와 가계부 기록에 필요한 데이터만 처리합니다.",
    "",
    "저장되는 정보",
    "• 입력한 수입/지출 기록",
    "• 가계부 참여/권한 정보",
    "• 표시명과 설정값",
    "",
    "보관 기준",
    "• 가계부 이용 중에는 보관합니다.",
    "• 웹에서 직접 삭제하거나 탈퇴하면 더 이상 보관하지 않습니다.",
    "",
    origin ? `자세히 보기\n${origin}/privacy` : "",
  ].filter(Boolean).join("\n");
}
