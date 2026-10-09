
function publicPageCatalog(env = {}, url = null) {
  const support = publicSupportEmail(env);
  const supportLine = support
    ? `이메일 문의: ${support}`
    : "카카오톡에서 ‘도움말’을 입력하면 사용 방법을 확인할 수 있으며, 서면 문의는 하단 사업자 정보의 소재지로 접수할 수 있습니다.";
  return {
    home: {
      title: "카카오톡으로 함께 쓰는 생활 가계부",
      description: "가족·부부·모임이 카카오톡에서 지출을 기록하고 웹에서 예산과 소비 흐름을 확인하는 말해가계부 서비스입니다.",
      eyebrow: "기록은 간단하게, 관리는 한눈에",
      intro: "말해가계부는 복잡한 입력 화면 대신 일상 문장으로 돈의 흐름을 기록하고, 필요한 순간에 예산·날짜·구성원 기준으로 정리해 보여줍니다. 혼자 사용하는 개인 가계부부터 가족 생활비, 부부 공동지출, 모임 회비, 여행 경비까지 가계부를 분리해 운영할 수 있습니다.",
      cards: [
        ["한 문장 기록", "‘점심 12000원 국민카드’처럼 말하면 날짜, 금액, 결제수단과 분류를 정리합니다."],
        ["함께 쓰는 가계부", "초대코드로 구성원이 참여하고, 가계부별 권한과 표시 이름을 관리합니다."],
        ["예산과 요약", "전체·카테고리별 예산, 남은 금액, 날짜별 요약과 사용자별 지출을 확인합니다."],
        ["웹 분석", "카카오톡에서는 빠르게 기록하고, 웹에서는 필터·차트·거래 목록과 CSV 백업을 이용합니다."],
      ],
      sections: [
        { title: "누구나 바로 시작할 수 있는 흐름", paragraphs: ["새 카카오 사용자는 1:1 채팅에서 ‘점심 만원’처럼 첫 기록을 보내면 웹 로그인 없이 내 개인 가계부가 준비되고 기록이 저장됩니다. ‘오늘 기록 보기’로 결과를 확인하고 이름·예산은 나중에 설정해도 됩니다. 기존 사용자와 참여 권한이 제한된 계정은 현재 가계부·권한 절차를 따릅니다.", "공동 사용은 별도 선택입니다. 새 가계부 만들기, 초대코드 참여와 승인, 단톡방 연결은 명시적으로 요청해야 하며 자동으로 만들거나 참여·연결하지 않습니다. 단톡방에서는 관리자가 해당 방을 가계부에 연결하고 구성원은 권한에 맞게 봇을 호출해 사용합니다."], bullets: ["새 사용자: 1:1 첫 기록과 오늘 기록 확인", "선택: 웹 가계부 열기로 나중에 이어 열기", "공동 사용: 명시적 생성·초대·승인·단톡방 연결", "예산·이름·분류는 필요할 때 추가"] },
        { title: "카카오톡과 웹의 역할을 나눴습니다", paragraphs: ["카카오톡은 빠른 기록과 조회에 집중합니다. 기록할 때마다 홈페이지 주소를 반복하지 않고, 초대 관리·상세 분석·백업처럼 웹 화면이 더 유용한 순간에만 관련 링크를 제공합니다.", "웹에서는 기간, 분류, 결제수단, 구성원, 금액, 검색어를 조합해 거래를 분석하고 필요한 자료를 CSV로 내려받을 수 있습니다."], note: "대화에서는 필요한 답만 간결하게 제공하고, 자세한 관리가 필요할 때 웹 기능으로 자연스럽게 이어집니다." },
        { title: "생활비 기록을 위한 서비스", paragraphs: ["말해가계부는 금융상품을 추천하거나 투자·세무 판단을 대신하지 않습니다. 사용자가 직접 입력한 생활 수입과 지출을 정리하고 함께 확인하도록 돕는 기록 도구입니다.", "입력한 금액과 날짜는 사용자가 최종 확인해야 하며, 수정·삭제·백업 기능을 통해 기록을 직접 관리할 수 있습니다."] },
      ],
      faqs: [["무료로 시작할 수 있나요?", "서비스의 제공 범위와 요금 정책은 운영 화면의 최신 안내를 따릅니다."], ["카카오톡 대화를 모두 읽나요?", "아닙니다. 봇에게 전달된 명령과 기록 요청만 처리하며 단톡방 전체 대화를 임의로 읽는 구조가 아닙니다."], ["여러 가계부를 만들 수 있나요?", "가족 생활비, 모임, 여행처럼 목적에 따라 여러 가계부를 만들고 선택해 사용할 수 있습니다."]],
    },
    "service-guide": {
      title: "말해가계부 기능 안내",
      description: "거래 기록, 예산 관리, 날짜별 요약, 참여자 관리, 분석과 백업까지 말해가계부의 핵심 기능을 설명합니다.",
      eyebrow: "필요한 기능만 순서대로",
      intro: "가계부는 꾸준히 기록할 수 있어야 의미가 있습니다. 말해가계부는 입력 과정을 줄이고, 공동 가계부에서 누가 기록했는지와 예산이 얼마나 남았는지를 쉽게 확인하도록 설계했습니다.",
      cards: [["거래", "자연어 지출·수입 기록과 번호 기반 수정·삭제"], ["예산", "전체·카테고리 예산과 사용률·잔여액"], ["요약", "오늘·어제·이번 주·이번 달·특정 날짜"], ["공유", "초대코드, 권한, 단톡방 연결과 표시 이름"]],
      sections: [
        { title: "수입·지출 기록", paragraphs: ["금액과 내용을 한 문장으로 입력하면 지출 또는 수입으로 저장합니다. 날짜나 결제수단을 함께 적으면 해당 값도 반영합니다.", "저장된 거래는 오늘 기록에서 번호를 확인한 뒤 금액, 분류, 결제수단, 내용, 날짜를 수정하거나 삭제할 수 있습니다."], bullets: ["점심 12000원 국민카드", "어제 병원 15000원", "월급 250만원", "수정 01번 금액 13000원"] },
        { title: "예산 관리", paragraphs: ["월 전체 예산과 식비·교통·생활용품 같은 카테고리별 예산을 설정할 수 있습니다. 예산 현황에서는 설정액, 사용액, 남은 금액과 사용률을 함께 보여줍니다.", "예산을 초과하거나 임박한 항목을 확인해 다음 지출을 조정하는 데 활용할 수 있습니다."], bullets: ["/예산설정으로 단계형 설정", "식비 예산설정 100만원처럼 직접 입력", "남은예산 또는 내 예산으로 조회"] },
        { title: "날짜·구성원 기준 요약", paragraphs: ["오늘, 어제, 이번 주, 지난 주, 이번 달, 특정 날짜의 지출과 수입을 조회합니다. 카테고리별 합계와 결제자별 합계를 함께 확인할 수 있습니다.", "복잡한 필터와 차트가 필요할 때는 웹 분석 스튜디오에서 기간과 조건을 조합합니다."] },
        { title: "가계부와 참여자 관리", paragraphs: ["초대코드로 구성원을 초대하고 가계부 안에서 사용할 표시 이름을 설정합니다. 소유자와 관리자는 참여자의 권한을 관리할 수 있습니다.", "가계부별 데이터는 분리되어 가족 생활비와 모임 회비가 섞이지 않도록 관리됩니다."] },
      ],
    },
    "how-it-works": {
      title: "처음부터 첫 기록까지",
      description: "새 카카오 사용자의 로그인 없는 개인 첫 기록, 선택적인 웹 이어 열기와 별도 공동 사용 절차를 안내합니다.",
      eyebrow: "약 1분 시작 가이드",
      intro: "새 카카오 사용자는 먼저 1:1 채팅에 내용과 금액을 보냅니다. 웹 로그인 없이 개인 첫 기록을 저장하고, 웹과 공동 사용은 필요할 때 선택합니다.",
      cards: [["1. 1:1 첫 기록", "‘점심 만원’으로 내 개인 가계부와 첫 기록 준비"], ["2. 저장 결과 확인", "응답과 ‘오늘 기록 보기’로 금액·내용 확인"], ["3. 웹은 나중에 선택", "‘웹 가계부 열기’와 1회용 코드로 이어 열기"], ["4. 공동 사용은 별도", "명시적으로 생성·초대·승인·단톡방 연결"]],
      sections: [
        { title: "새 카카오 사용자의 개인 첫 기록", paragraphs: ["처음 사용하는 카카오 1:1 채팅에서 ‘점심 만원’처럼 내용과 금액을 보냅니다. 신뢰 가능한 새 사용자 요청이면 내 개인 가계부를 준비하고 첫 기록을 저장합니다. 먼저 웹에 가입하거나 로그인할 필요는 없습니다.", "저장 응답과 ‘오늘 기록 보기’에서 실제 금액·내용을 확인합니다. 이미 사용한 계정이나 삭제·나가기 이력이 있는 계정, 승인대기·조회 전용·제한 계정은 이 자동 준비 대상이 아니며 기존 가계부 선택·참여 권한 절차를 유지합니다."] },
        { title: "필요할 때 같은 기록을 웹에서 이어 열기", paragraphs: ["1:1에서 ‘웹 가계부 열기’를 요청하면 /my 주소와 10분 동안 한 번 사용할 수 있는 연결 코드를 받습니다. 웹의 ‘카카오에서 기록한 가계부 이어 열기’에 코드를 입력하면 같은 내부 사용자로 이어집니다. 코드가 만료되면 1:1에서 새 코드를 요청하세요.", "연결 코드는 초대코드가 아니며 URL이나 단톡방에 공유하지 않습니다. botUserKey를 카카오 OAuth ID로 추정하거나 다른 계정과 자동 병합하지 않습니다. 현재 다른 웹 계정이 열려 있으면 명시적으로 전환하므로 계정을 확인한 뒤 제출하세요. 이름·예산·로그인 비밀번호는 이후 필요할 때 설정합니다."] },
        { title: "공동 사용을 위한 새 가계부 만들기", paragraphs: ["카카오톡에서 ‘가계부 생성’ 또는 ‘새 가계부 만들기’를 입력합니다. 가족 생활비, 부부·커플, 모임 회비, 여행 경비 중 용도를 고르거나 원하는 가계부 이름을 바로 입력할 수 있습니다.", "선택을 이해하지 못한 경우 같은 문장을 반복하지 않고 선택 목록과 예시를 다시 보여주며, 입력한 문장이 이름처럼 보이면 생성 전에 이름을 확인합니다."] },
        { title: "초대코드로 함께 참여하기", paragraphs: ["가계부를 만들면 초대코드가 발급됩니다. 구성원은 ‘가계부 참여 초대코드’ 형식으로 입력해 같은 가계부에 참여할 수 있습니다."] },
        { title: "단톡방과 가계부 연결하기", paragraphs: ["단톡방은 봇을 추가하는 것만으로 연결되지 않습니다. 관리자 한 명이 단톡방 안에서 초대코드로 방과 가계부를 한 번 연결해야 합니다."] },
        { title: "기록 결과 확인과 이후 설정", paragraphs: ["‘점심 12000원 국민카드’처럼 입력한 뒤 저장 응답과 ‘오늘 기록 보기’에서 금액·내용·결제수단을 확인합니다. 공동 가계부 참여와 단톡방 연결은 개인 첫 기록의 필수 단계가 아니며 별도로 명시적으로 요청해야 합니다.", "예산, 이름, 분류, 결제수단과 정기지출 설정은 첫 기록 이후 필요할 때 추가해도 됩니다. 단톡방에서는 개인 가계부나 공동 참여를 자동 생성하지 않으며 웹 연결 코드도 제공하지 않습니다."] },
      ],
    },
    "kakao-guide": {
      title: "카카오톡 가계부 사용 가이드",
      description: "카카오톡 1:1 채팅과 단톡방에서 말해가계부를 호출하고 기록·예산·요약 기능을 사용하는 방법입니다.",
      eyebrow: "말하듯 입력하는 가계부",
      intro: "카카오톡에서는 명령어를 길게 외우기보다 내용과 금액을 자연스럽게 입력하는 방식이 기본입니다. 명확한 설정 작업은 단계형 선택지를 사용하고, 모호한 금전 문장은 저장 전에 한 번 확인합니다.",
      cards: [["기록", "점심 12000원 국민카드"], ["조회", "오늘 요약 · 남은예산"], ["관리", "내 이름 설정 · 초대코드"], ["정산", "정산 · 내가 보낼 돈"]],
      sections: [
        { title: "1:1 채팅에서 사용하기", paragraphs: ["봇과의 1:1 채팅에서는 봇 이름을 매번 붙이지 않고 바로 입력할 수 있습니다. 거래 기록, 예산 조회, 가계부 생성과 참여 안내를 이용할 수 있습니다.", "‘/기록’은 선택 가능한 보조 명령이며 필수는 아닙니다. 자연어 거래가 기본 입력 방식입니다."] },
        { title: "단톡방에서 사용하기", paragraphs: ["그룹방에서는 봇을 선택하거나 멘션한 뒤 요청을 입력합니다. 방이 가계부와 연결되어 있어야 공동 기록이 같은 가계부에 저장됩니다.", "단톡방 전체 대화를 수집하는 방식이 아니라 봇에게 전달된 요청만 처리합니다."], bullets: ["@말해가계부 점심 15000원 현대카드", "@말해가계부 오늘 요약", "@말해가계부 남은예산"] },
        { title: "모호한 문장은 확인 후 처리", paragraphs: ["‘식비 50만원’은 지출인지 예산인지 의미가 두 가지일 수 있습니다. 이런 문장은 임의로 저장하지 않고 지출 기록과 예산 설정 중 하나를 선택하도록 안내합니다.", "삭제·수정·정산처럼 금전에 영향을 주는 요청은 명시적 표현과 대상 번호를 기준으로 처리합니다."] },
        { title: "응답이 없거나 오류가 날 때", paragraphs: ["같은 요청을 반복 전송하기 전에 잠시 기다린 뒤 다시 시도합니다. 저장 여부는 ‘오늘 기록 보기’에서 확인해 중복 입력을 피할 수 있습니다.", "오류가 반복되면 도움말과 서비스 상태 안내를 확인하고, 거래 수정은 웹 기록 관리에서도 진행할 수 있습니다."] },
      ],
    },
    "budget-guide": {
      title: "생활비 예산을 현실적으로 관리하는 방법",
      description: "월 예산과 카테고리별 예산을 설정하고 사용액, 잔여액, 사용률을 해석하는 실용적인 가이드입니다.",
      eyebrow: "계획보다 중요한 것은 지속적인 조정",
      intro: "예산은 지출을 무조건 줄이는 기준이 아니라, 필요한 돈과 선택 가능한 돈을 구분하는 도구입니다. 처음부터 너무 세밀하게 나누기보다 자주 쓰는 항목부터 시작하는 것이 좋습니다.",
      cards: [["전체 예산", "한 달에 사용할 수 있는 총 생활비"], ["카테고리", "식비·교통·생활·의료 등 목적별 한도"], ["사용률", "현재 지출이 예산에서 차지하는 비율"], ["잔여액", "남은 기간에 조정할 수 있는 금액"]],
      sections: [
        { title: "첫 예산은 단순하게", paragraphs: ["최근 한두 달의 실제 지출을 참고해 전체 예산과 핵심 카테고리 3~5개만 설정합니다. 항목이 너무 많으면 기록과 검토가 어려워집니다.", "고정비와 변동비를 분리하고, 예상하지 못한 지출을 위한 여유 금액을 남겨두는 편이 현실적입니다."] },
        { title: "사용률을 날짜와 함께 보기", paragraphs: ["월 중간에 사용률이 50%라고 해서 반드시 안전한 것은 아닙니다. 월 초인지 월말인지, 정기 결제가 남아 있는지 함께 봐야 합니다.", "카테고리별 잔여액은 다음 지출을 계획하는 참고값으로 사용하고 필요한 경우 예산을 수정합니다."] },
        { title: "공동 가계부 예산", paragraphs: ["가족이나 부부 가계부에서는 결제자와 사용 목적을 구분하면 누가 많이 썼는지를 따지기보다 어떤 항목에서 계획이 달라졌는지 확인할 수 있습니다.", "관리자가 예산을 설정하고 구성원은 같은 기준으로 남은 금액을 조회하도록 운영할 수 있습니다."] },
        { title: "카카오톡에서 사용하는 문장", bullets: ["/예산설정", "전체 예산설정 300만원", "식비 예산설정 100만원", "내 예산", "이번 달 얼마 남았어"], paragraphs: ["설정인지 조회인지 모호한 문장은 선택지를 통해 확인한 뒤 처리합니다."] },
      ],
    },
    "group-accountbook": {
      title: "가족·부부·모임이 함께 쓰는 가계부",
      description: "공동 가계부의 초대, 권한, 결제자 표시, 단톡방 연결과 정산 활용법을 설명합니다.",
      eyebrow: "같이 쓰되 데이터는 가계부별로 분리",
      intro: "공동 가계부는 모든 사람에게 같은 권한을 주는 것이 아니라 역할과 목적을 명확히 할 때 편리합니다. 가계부별 초대코드와 참여자 권한으로 가족 생활비, 여행비, 모임비를 분리할 수 있습니다.",
      cards: [["가족", "생활비와 자녀·주거 관련 지출 공유"], ["부부·커플", "공동비와 개인비를 분리해 확인"], ["모임", "회비 사용과 행사 비용 정리"], ["여행", "숙박·교통·식비와 결제자별 정산"]],
      sections: [
        { title: "초대와 권한", paragraphs: ["가계부 소유자가 초대코드를 구성원에게 전달합니다. 참여 후 역할에 따라 기록, 조회, 설정 기능의 범위가 달라질 수 있습니다.", "초대코드는 외부에 공개하지 않고 참여가 끝난 뒤 필요하면 새 코드로 변경하는 것이 좋습니다."] },
        { title: "결제자 표시 이름", paragraphs: ["카카오 사용자 식별키 대신 가계부 안에서 이해하기 쉬운 이름을 연결합니다. 예를 들어 엄마, 아빠, 총무처럼 표시하면 요약과 정산을 읽기 쉽습니다.", "표시 이름 변경은 카카오 계정 닉네임을 수정하는 기능이 아니라 해당 가계부 내부의 표시값을 바꾸는 기능입니다."] },
        { title: "단톡방 연결", paragraphs: ["봇을 그룹방에 추가한 뒤 관리자 한 명이 ‘단톡방 연결 초대코드’를 입력합니다. 연결이 완료되면 봇에게 전달된 기록이 해당 가계부 범위에서 처리됩니다.", "여러 단톡방과 여러 가계부를 운영할 때는 연결 상태를 확인해 기록이 다른 가계부로 들어가지 않도록 합니다."] },
        { title: "정산 활용", paragraphs: ["정산 결과는 결제자별 지출과 참여자 수를 기준으로 참고할 수 있습니다. 복잡한 비율·제외 조건이 있는 정산은 상세 내역을 확인한 뒤 확정하는 것이 안전합니다."] },
      ],
    },
    security: {
      title: "데이터 보호와 안전한 사용",
      description: "말해가계부가 처리하는 데이터, 권한, 중복 방지, 백업, 자연어 운영 로그의 원칙을 안내합니다.",
      eyebrow: "필요한 데이터만, 목적에 맞게",
      intro: "가계부에는 생활 패턴이 포함될 수 있으므로 기록 편의성만큼 접근 권한과 데이터 관리가 중요합니다. 말해가계부는 가계부별 권한, 명시적 수정·삭제, 중복 저장 방어와 백업 기능을 중심으로 운영합니다.",
      cards: [["권한", "가계부 소유자·관리자·구성원 역할 분리"], ["중복 방지", "같은 요청이 반복될 때 중복 저장 차단"], ["백업", "CSV 내보내기와 복구 전 확인 절차"], ["자연어 로그", "원문 모델 학습 금지와 제한적 비식별 운영"]],
      sections: [
        { title: "처리 범위", paragraphs: ["사용자가 봇에게 직접 전달한 기록 요청과 웹에서 입력한 가계부 데이터만 처리합니다. 그룹방 전체 대화를 임의로 읽거나 광고주에게 가계부 기록을 제공하지 않습니다.", "가계부 참여자와 권한, 예산, 거래, 표시 이름, 단톡방 연결 상태는 서비스를 제공하는 데 필요한 범위에서 저장됩니다."] },
        { title: "자연어 개선 원칙", paragraphs: ["사용자 발화는 현재 요청에 응답하기 위해 사용하며 AI 모델 학습 데이터로 자동 전송하지 않습니다. 운영 집계는 의도, 결과, 지연시간처럼 문장 없는 통계부터 사용합니다.", "실패 문장을 제한적으로 저장하는 기능을 활성화할 경우 개인정보를 마스킹하고 보관 기간을 명시하며, 원문을 자동 학습시키지 않고 관리자가 일반화한 규칙과 합성 평가 문장으로 개선합니다."] },
        { title: "사용자가 할 수 있는 관리", bullets: ["참여자와 권한 정기 확인", "사용하지 않는 가계부와 초대코드 정리", "잘못 저장된 거래 즉시 수정·삭제", "정기적인 CSV 백업", "공용 기기 사용 후 로그아웃"] },
        { title: "서비스 데이터와 외부 제공", paragraphs: ["거래 내용, 가계부 구성원, 예산과 같은 서비스 데이터를 광고주에게 판매하지 않습니다. 외부 서비스와 쿠키에 관한 내용은 개인정보처리방침과 쿠키 정책에서 확인할 수 있습니다."] },
      ],
    },
    faq: {
      title: "자주 묻는 질문",
      description: "말해가계부의 시작, 기록, 공동 가계부, 예산, 카카오톡, 개인정보와 광고에 관한 질문과 답변입니다.",
      eyebrow: "처음 막히는 부분을 빠르게 해결",
      intro: "아래 답변은 서비스의 기본 동작을 설명합니다. 실제 화면과 기능은 배포된 최신 버전을 기준으로 하며, 중요한 거래는 저장 후 오늘 기록에서 다시 확인하는 것이 좋습니다.",
      sections: [],
      faqs: [
        ["가계부를 만들 때 종류를 꼭 골라야 하나요?", "아닙니다. 가족 생활비, 부부·커플, 모임, 여행 중 하나를 고를 수 있고, 원하는 가계부 이름을 바로 입력해 일반 가계부로 만들 수도 있습니다."],
        ["카카오톡에서 /기록을 꼭 붙여야 하나요?", "아닙니다. ‘점심 12000원 국민카드’처럼 자연어로 바로 입력하는 방식이 기본이며 /기록은 보조 명령입니다."],
        ["단톡방에 봇만 추가하면 바로 기록되나요?", "봇 추가 후 관리자 한 명이 초대코드로 단톡방과 가계부를 한 번 연결해야 합니다."],
        ["식비 50만원이라고 입력하면 어떻게 되나요?", "지출과 예산 두 가지 의미가 가능하므로 임의로 저장하지 않고 어떤 작업인지 확인합니다."],
        ["잘못 기록한 거래를 고칠 수 있나요?", "오늘 기록에서 번호를 확인한 뒤 번호와 수정할 항목을 입력하거나 웹 기록 관리 화면에서 수정할 수 있습니다."],
        ["여러 가계부를 사용할 수 있나요?", "목적별로 여러 가계부를 만들거나 초대코드로 참여하고 선택해 사용할 수 있습니다."],
        ["카카오톡 단톡방 전체 내용을 저장하나요?", "아닙니다. 봇에게 전달된 명령과 기록 요청만 처리합니다."],
        ["사용자 발화를 AI 모델 학습에 사용하나요?", "현재 요청 응답에 사용하며 자동 모델 학습 데이터로 활용하지 않습니다. 제한적 운영 로그를 켤 때는 비식별·보관기간·목적을 안내합니다."],
        ["서비스 화면에서 광고를 볼 수 있나요?", "서비스 운영 정책에 따라 광고가 표시될 수 있으며, 광고는 서비스 콘텐츠와 명확히 구분되도록 운영합니다."],
        ["데이터를 백업할 수 있나요?", "웹의 백업 기능에서 CSV를 내려받을 수 있습니다. 가져오기와 복구는 미리보기와 확인 절차를 거칩니다."],
      ],
    },
    about: {
      title: "말해가계부 소개",
      description: "말해가계부가 해결하려는 문제, 서비스 운영 원칙과 사업자 정보를 안내합니다.",
      eyebrow: "생활 속 기록을 덜 번거롭게",
      intro: "말해가계부는 가계부를 쓰고 싶지만 복잡한 화면과 반복 입력 때문에 중단하는 사람을 위해 시작했습니다. 카카오톡의 익숙한 대화 흐름과 웹의 분석 기능을 나누어 기록 부담을 줄이는 것이 목표입니다.",
      cards: [["말하듯 기록", "복잡한 입력 화면 대신 일상 문장으로 수입과 지출을 기록"], ["혼자 또는 함께", "개인·가족·부부·모임·여행 목적에 따라 가계부를 분리"], ["예산과 요약", "남은 예산과 날짜·구성원별 지출을 한눈에 확인"], ["지속 가능한 습관", "누구나 부담 없이 가계부를 계속 쓰도록 입력 단계를 단순화"]],
      sections: [
        { title: "누구나 꾸준히 쓸 수 있는 가계부", paragraphs: ["가계부는 일부 사람만 사용하는 복잡한 관리 도구가 아니라 누구나 생활 속에서 자연스럽게 이어갈 수 있어야 합니다. 말해가계부는 입력 시간을 줄이고 기록을 포기하게 만드는 장벽을 낮추는 데 집중합니다.", "혼자 쓰는 생활비부터 가족·부부 공동지출, 모임 회비와 여행 경비까지 목적에 맞는 가계부를 쉽게 만들고 함께 관리할 수 있도록 설계합니다."], bullets: ["말하듯 쉬운 수입·지출 기록", "개인과 공동 가계부의 자연스러운 전환", "구성원별 지출과 예산의 투명한 확인", "모바일과 카카오톡 중심의 낮은 진입 장벽", "기록 습관의 일상화와 보편화"] },
        { title: "혼자도 함께도 편한 구조", paragraphs: ["개인 가계부는 불필요한 참여 절차 없이 사용할 수 있고, 함께 쓰는 가계부는 초대코드와 권한으로 구성원을 구분합니다. 각 가계부의 거래와 설정은 서로 섞이지 않도록 분리됩니다.", "카카오톡에서는 빠르게 기록하고 조회하며, 웹에서는 기간·분류·결제수단·구성원별 분석과 백업을 이용합니다."] },
        { title: "안전하고 정직한 운영", paragraphs: ["모호한 금전 요청은 임의로 처리하지 않고 필요한 경우 한 번 확인합니다. 사용자가 직접 저장 결과를 확인하고 수정·삭제·백업할 수 있도록 관리 권한을 제공합니다.", "말해가계부는 카카오톡과 연동해 사용할 수 있는 독립 서비스이며 카카오가 직접 제공하는 공식 가계부 서비스는 아닙니다."] },
      ],
    },
    contact: {
      title: "문의 안내",
      description: "말해가계부의 사용 방법, 데이터 수정·삭제, 개인정보와 사업자 문의 경로를 안내합니다.",
      eyebrow: "문의 전 빠른 확인",
      intro: supportLine,
      cards: [["사용 방법", "카카오톡에서 ‘도움말’ 또는 ‘시작’을 입력해 단계별 안내 확인"], ["거래 수정", "오늘 기록의 번호 또는 웹 기록 관리 화면 이용"], ["데이터 요청", "개인정보처리방침의 열람·수정·삭제 기준 확인"], ["서면 문의", `${BUSINESS_FOOTER_INFO.address} · ${BUSINESS_FOOTER_INFO.company}`]],
      sections: [
        { title: "문의에 포함하면 좋은 정보", bullets: ["발생한 날짜와 시간", "사용한 화면 또는 카카오톡 명령", "오류 문구나 화면 캡처", "개인정보를 가린 요청 ID 또는 버전 정보"], paragraphs: ["초대코드, 전화번호, 이메일, 거래 세부 내용은 공개 게시물이나 단톡방에 그대로 올리지 마세요."] },
        { title: "개인정보 및 데이터 요청", paragraphs: ["가계부 기록은 웹에서 직접 수정·삭제할 수 있습니다. 계정이나 가계부 전체 데이터에 관한 요청은 본인 확인과 권한 확인 후 처리합니다.", "법령상 보존 의무가 있는 정보가 아니라면 처리 목적이 끝난 데이터는 정해진 기준에 따라 삭제합니다."] },
        { title: "서비스 제안과 개선 의견", paragraphs: ["사용 중 불편한 점, 이해하기 어려운 표현, 필요한 기능이나 개선 의견이 있다면 발생한 화면과 상황을 함께 알려주세요. 개인정보와 초대코드, 거래 세부 내용은 가린 뒤 전달해 주세요."] },
      ],
    },
    privacy: {
      title: "개인정보처리방침",
      description: "말해가계부가 처리하는 개인정보와 가계부 데이터, 처리 목적, 보관 기간, 광고 쿠키와 이용자 권리를 안내합니다.",
      eyebrow: "시행일 2026년 7월 13일",
      intro: "말해가계부는 서비스 제공에 필요한 범위에서 사용자와 가계부 데이터를 처리합니다. 처리 목적과 보유기간을 벗어나 임의로 이용하지 않으며, 사용자 발화를 AI 모델 학습에 자동 활용하지 않습니다.",
      sections: [
        { title: "1. 처리하는 항목과 목적", paragraphs: ["사용자 식별키와 로그인 정보는 사용자 구분과 세션 유지에 사용합니다. 가계부 이름, 참여자 권한, 초대코드, 표시 이름은 공동 가계부 운영에 사용합니다.", "수입·지출, 날짜, 분류, 결제수단, 메모, 예산과 설정값은 기록·조회·분석·백업 기능을 제공하기 위해 처리합니다. 단톡방 연결키는 사용자가 명시적으로 연결한 그룹방과 가계부를 구분하는 데 사용합니다."], bullets: ["회원 및 세션 관리", "가계부 생성·참여·권한 관리", "거래 기록·예산·요약·정산 제공", "중복 저장 방지와 장애 대응", "법적 의무와 분쟁 대응"] },
        { title: "2. 사용자 발화와 자연어 운영 로그", paragraphs: ["사용자 발화는 요청을 이해하고 응답하기 위해 사용합니다. 발화를 외부 AI 모델의 학습 데이터로 자동 전송하거나 자동 학습 데이터로 등록하지 않습니다.", "운영 통계는 의도, 처리 결과, 지연시간, 배포 버전 같은 문장 없는 집계를 우선합니다. 이해 실패 문장을 제한적으로 보관하는 기능을 활성화할 경우 URL, 이메일, 전화번호, 초대코드와 긴 숫자를 마스킹하고 도움말에 저장 사실과 기간을 안내합니다. 기본 보관기간은 최대 14일이며 운영 설정에 따라 더 짧게 적용할 수 있습니다."] },
        { title: "3. 보유기간과 삭제", paragraphs: ["가계부 거래와 설정은 사용자가 서비스를 이용하는 동안 보관하며 웹에서 직접 수정·삭제할 수 있습니다. 가계부 소유자가 영구 삭제를 완료하면 해당 가계부의 거래와 관련 설정을 삭제합니다. 가계부 나가기는 참여 권한을 종료하며 공동 거래 이력은 보존합니다. 현재 계정 자체를 탈퇴·삭제하는 온라인 기능은 제공하지 않으며 개인정보 삭제 요청은 서비스 문의 경로로 확인합니다.", "세션과 운영 로그는 목적에 필요한 기간만 보관합니다. 법령상 보존 의무가 있는 경우 해당 기간 동안 분리 보관할 수 있습니다."] },
        { title: "4. 제3자 광고와 쿠키", paragraphs: ["광고 기능이 활성화되면 Google을 포함한 제3자 광고 사업자가 쿠키를 사용해 사용자의 이전 방문 정보 등을 바탕으로 광고를 제공하고 성과를 측정할 수 있습니다.", "제3자는 광고 제공 과정에서 브라우저의 쿠키를 저장·조회하거나 웹 비콘과 IP 주소 같은 기술을 사용할 수 있습니다. 말해가계부는 거래 내용, 예산, 가계부 구성원 정보와 사용자 발화 원문을 광고주에게 판매하지 않습니다. 사용자는 Google 광고 설정과 브라우저 설정을 통해 광고 개인화와 쿠키를 관리할 수 있습니다."], links: [["Google 광고 및 데이터 이용 안내", "https://policies.google.com/technologies/ads?hl=ko"], ["Google 파트너 사이트 정보 이용 안내", "https://policies.google.com/technologies/partner-sites?hl=ko"], ["Google 개인정보처리방침", "https://policies.google.com/privacy?hl=ko"]] },
        { title: "5. 이용자의 권리", paragraphs: ["사용자는 자신의 기록과 설정을 열람·수정·삭제하고 백업할 수 있습니다. 개인정보 처리에 관한 문의와 권리 행사는 문의 안내에 표시된 경로로 요청할 수 있으며 본인과 권한 확인 후 처리합니다."] },
        { title: "6. 안전성 확보 조치", bullets: ["가계부별 권한 확인", "HTTPS 통신", "관리자 경로와 사용자 경로 분리", "중복 요청 방지", "민감 문자열 마스킹", "백업·복구 전 확인 절차"] },
      ],
    },
    terms: {
      title: "서비스 이용약관",
      description: "말해가계부의 서비스 목적, 사용자 책임, 공동 가계부 권한, 데이터 관리, 광고와 서비스 변경 기준을 안내합니다.",
      eyebrow: "시행일 2026년 7월 13일",
      intro: "본 약관은 말해가계부를 이용할 때 서비스와 사용자 사이의 기본 기준을 설명합니다. 사용자는 최신 약관과 개인정보처리방침을 확인한 뒤 서비스를 이용합니다.",
      sections: [
        { title: "1. 서비스 목적", paragraphs: ["말해가계부는 사용자가 직접 입력한 생활 수입·지출을 개인 또는 공동 가계부 단위로 기록하고 예산·요약·분석·백업 기능을 제공하는 서비스입니다.", "금융상품, 투자, 세무, 법률 자문을 제공하지 않으며 서비스의 계산값은 생활 기록을 돕는 참고자료입니다."] },
        { title: "2. 사용자 책임", paragraphs: ["사용자는 입력한 금액, 날짜, 결제수단, 메모와 분류의 정확성을 확인해야 합니다. 계정, 초대코드와 접근 수단을 안전하게 관리하고 다른 사람의 정보를 권한 없이 입력해서는 안 됩니다."] },
        { title: "3. 공동 가계부와 권한", paragraphs: ["가계부 소유자와 관리자는 참여자 초대, 승인, 역할과 표시 이름을 관리할 수 있습니다. 참여자는 부여된 권한 범위에서 조회·기록·수정 기능을 사용합니다.", "단톡방 연결은 해당 방의 관리자 또는 가계부 관리 권한을 가진 사용자가 수행해야 하며 잘못된 가계부 연결로 인한 기록 혼선을 예방할 책임이 있습니다."] },
        { title: "4. 데이터 수정·삭제와 백업", paragraphs: ["사용자는 거래와 설정을 수정·삭제할 수 있으며 중요한 변경 전 백업을 권장합니다. 가져오기, 일괄 수정, 삭제와 복구는 확인 절차를 제공하지만 모든 실수를 자동 복원한다고 보장하지 않습니다."] },
        { title: "5. 서비스 제한과 장애", paragraphs: ["보안, 과도 요청, 점검, 외부 서비스 장애 또는 법적 필요가 있는 경우 일부 기능을 일시 제한할 수 있습니다. 중복 저장과 데이터 손상을 줄이는 것을 우선하며 장애가 발생하면 안전 안내와 재시도 방법을 제공합니다."] },
        { title: "6. 광고와 외부 링크", paragraphs: ["서비스 운영 과정에서 광고 또는 외부 링크가 표시될 수 있으며 광고는 서비스 콘텐츠와 구분합니다.", "외부 사이트의 내용과 거래에는 해당 제공자의 정책이 적용됩니다."] },
        { title: "7. 약관 변경", paragraphs: ["서비스 운영이나 법령 변경에 따라 약관을 변경할 수 있으며 중요한 변경은 적용 전에 서비스 화면을 통해 안내합니다."] },
      ],
    },
    "site-map": {
      title: "사이트맵",
      description: "말해가계부의 공개 서비스 안내, 사용 가이드, 정책과 문의 페이지를 한곳에서 확인합니다.",
      eyebrow: "원하는 정보를 빠르게 찾기",
      intro: "서비스 소개와 사용 방법, 예산·공동 가계부 가이드, 데이터 보호 및 정책 문서를 주제별로 정리했습니다. 검색엔진용 XML 사이트맵은 별도로 제공됩니다.",
      cards: [["서비스 이해", "서비스 소개와 핵심 기능"], ["사용 시작", "처음부터 첫 기록까지"], ["함께 관리", "가족·부부·모임 가계부"], ["정책과 문의", "개인정보·약관·쿠키·문의"]],
      sections: [
        { title: "서비스와 사용 방법", links: [["서비스 홈", "/"], ["기능 안내", "/service-guide"], ["처음부터 첫 기록까지", "/how-it-works"], ["카카오톡 사용 가이드", "/kakao-guide"]] },
        { title: "예산과 공동 가계부", links: [["예산 관리 가이드", "/budget-guide"], ["가족·모임 가계부", "/group-accountbook"], ["데이터 보호", "/security"], ["자주 묻는 질문", "/faq"]] },
        { title: "서비스 정보와 정책", links: [["서비스 소개", "/about"], ["문의 안내", "/contact"], ["개인정보처리방침", "/privacy"], ["서비스 이용약관", "/terms"], ["쿠키 정책", "/cookies"]], note: "검색엔진 제출용 XML 사이트맵은 /sitemap.xml에서 확인할 수 있습니다." },
      ],
    },
    cookies: {
      title: "쿠키 및 광고 기술 안내",
      description: "말해가계부의 필수 쿠키, 광고 쿠키, 브라우저 설정과 광고 개인화와 쿠키 관리 방법을 안내합니다.",
      eyebrow: "서비스 이용과 광고를 구분",
      intro: "쿠키는 웹사이트가 브라우저에 저장하는 작은 정보입니다. 말해가계부는 로그인과 보안에 필요한 쿠키를 사용할 수 있으며, 광고 기능을 활성화한 경우 제3자 광고 쿠키가 사용될 수 있습니다.",
      sections: [
        { title: "필수 쿠키", paragraphs: ["로그인 세션 유지, 요청 위조 방지, 사용자 화면 설정과 보안 기능에 필요한 쿠키입니다. 필수 쿠키를 차단하면 로그인이나 가계부 기능이 정상 작동하지 않을 수 있습니다."] },
        { title: "광고 및 측정 기술", paragraphs: ["Google과 제3자 광고 사업자는 쿠키와 유사 기술을 사용해 광고를 제공하고 성과를 측정할 수 있습니다.", "사용자는 Google 광고 설정과 브라우저의 사이트별 쿠키 설정을 통해 광고 개인화와 저장된 쿠키를 관리할 수 있습니다."], links: [["Google 쿠키 사용 안내", "https://policies.google.com/technologies/cookies?hl=ko"], ["Google 광고 및 데이터 이용 안내", "https://policies.google.com/technologies/ads?hl=ko"], ["Google 개인정보처리방침", "https://policies.google.com/privacy?hl=ko"]] },
        { title: "쿠키 관리", bullets: ["브라우저 설정에서 쿠키 확인·삭제", "사이트별 쿠키 허용 또는 차단", "Google 광고 및 개인정보 안내 확인", "공용 기기 사용 후 로그아웃"] },
        { title: "지역별 동의", paragraphs: ["유럽경제지역, 영국, 스위스 등 별도의 동의 요건이 적용되는 지역에 광고를 제공할 경우 Google이 요구하는 인증된 동의 관리 플랫폼과 관련 절차를 적용합니다."] },
      ],
    },
  };
}

function renderPublicContentPage(env = {}, url = null, key = "home") {
  const catalog = publicPageCatalog(env, url);
  const page = catalog[key] || catalog.home;
  const origin = publicBaseUrl(env, url);
  const canonicalPath = key === "home" ? "/" : `/${key}`;
  const canonical = `${origin}${canonicalPath}`;
  const pageTitle = `${page.title} · ${appName(env)}`;
  const cards = safeArray(page.cards).map(([title, body]) => `<article class="pubFeature"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></article>`).join("");
  const sections = safeArray(page.sections).map((section) => `<section class="pubSection"><h2>${escapeHtml(section.title)}</h2>${safeArray(section.paragraphs).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}${safeArray(section.bullets).length ? `<ul>${safeArray(section.bullets).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}${safeArray(section.links).length ? `<div class="pubLinks">${safeArray(section.links).map(([label,href]) => { const external = /^https?:\/\//i.test(String(href || "")); return `<a href="${escapeHtml(href)}"${external ? ` target="_blank" rel="noopener noreferrer"` : ""}>${escapeHtml(label)}</a>`; }).join("")}</div>` : ""}${section.note ? `<div class="pubNote">${escapeHtml(section.note)}</div>` : ""}</section>`).join("");
  const faqs = safeArray(page.faqs).length ? `<section class="pubSection"><h2>자주 묻는 질문</h2><div class="pubFaq">${safeArray(page.faqs).map(([q,a]) => `<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join("")}</div></section>` : "";
  const structured = JSON.stringify({
    "@context": "https://schema.org",
    "@type": key === "home" ? "SoftwareApplication" : key === "faq" ? "FAQPage" : key === "site-map" ? "CollectionPage" : "Article",
    name: page.title,
    description: page.description,
    url: canonical,
    inLanguage: "ko-KR",
    publisher: { "@type": "Organization", name: BUSINESS_FOOTER_INFO.company, url: origin },
    ...(key === "home" ? { applicationCategory: "FinanceApplication", operatingSystem: "Web" } : {}),
    ...(key === "faq" ? { mainEntity: safeArray(page.faqs).map(([q,a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) } : {}),
  }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(pageTitle)}</title><meta name="description" content="${escapeHtml(page.description)}"/><meta name="robots" content="index,follow,max-image-preview:large"/><meta name="theme-color" content="#312e81"/><link rel="canonical" href="${escapeHtml(canonical)}"/><meta property="og:type" content="website"/><meta property="og:site_name" content="${escapeHtml(appName(env))}"/><meta property="og:locale" content="ko_KR"/><meta property="og:title" content="${escapeHtml(pageTitle)}"/><meta property="og:description" content="${escapeHtml(page.description)}"/><meta property="og:url" content="${escapeHtml(canonical)}"/>${publicAdsenseHead(env)}<script type="application/ld+json">${structured}</script><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f7f9fc;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.pubHeader{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.96);backdrop-filter:blur(16px);border-bottom:1px solid #e8edf4}.pubHeaderInner{max-width:1180px;margin:0 auto;min-height:66px;padding:10px 18px;display:flex;align-items:center;gap:18px}.pubBrand{display:flex;align-items:center;gap:9px;text-decoration:none;color:#111827;white-space:nowrap}.pubBrand span{width:36px;height:36px;border-radius:13px;background:#FEE500;display:flex;align-items:center;justify-content:center;font-weight:1000}.pubBrand b{font-size:18px}.pubDesktopNav{display:flex;align-items:center;gap:4px;flex:1;overflow:auto}.pubHeader nav a{color:#596579;text-decoration:none;font-size:13px;font-weight:900;padding:9px 10px;border-radius:12px;white-space:nowrap}.pubHeader nav a:hover,.pubHeader nav a.active{background:#eef2ff;color:#312e81}.pubStart{display:inline-flex;align-items:center;justify-content:center;min-height:44px;background:#111827;color:#fff;text-decoration:none;border-radius:13px;padding:0 14px;font-weight:1000;white-space:nowrap}.pubMobileMenu{display:none;position:relative}.pubMobileMenu summary{display:flex;align-items:center;justify-content:center;min-height:44px;list-style:none;border-radius:13px;background:#eef2f7;color:#111827;padding:0 12px;font-weight:900;cursor:pointer}.pubMobileMenu summary::-webkit-details-marker{display:none}.pubMobileMenu nav{position:absolute;right:0;top:50px;width:min(86vw,320px);display:grid;background:#fff;border:1px solid #e4eaf2;border-radius:18px;padding:8px;box-shadow:0 18px 44px rgba(15,23,42,.16)}.pubWrap{max-width:1080px;margin:0 auto;padding:24px 18px 56px}.pubHero{background:linear-gradient(135deg,#111827 0%,#312e81 58%,#6d28d9 100%);color:#fff;border-radius:32px;padding:42px;margin:14px 0 22px;box-shadow:0 24px 60px rgba(49,46,129,.22)}.pubEyebrow{display:inline-flex;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:7px 11px;font-size:13px;font-weight:1000}.pubHero h1{font-size:42px;line-height:1.12;letter-spacing:-.06em;margin:18px 0 14px;max-width:760px}.pubHero p{max-width:800px;color:#e5e7eb;line-height:1.82;font-size:17px}.pubHeroActions{display:flex;flex-wrap:wrap;gap:9px;margin-top:22px}.pubBtn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:14px;background:#FEE500;color:#191919;text-decoration:none;font-weight:1000;padding:0 16px}.pubBtn.secondary{background:#fff;color:#111827}.pubGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0 24px}.pubFeature,.pubSection{background:#fff;border:1px solid #e4eaf2;border-radius:24px;padding:20px;box-shadow:0 12px 32px rgba(15,23,42,.055)}.pubFeature h2,.pubSection h2{margin-top:0}.pubFeature h2{font-size:18px}.pubFeature p,.pubSection p,.pubSection li{color:#526075;line-height:1.78}.pubSection{margin:14px 0;padding:26px}.pubSection h2{font-size:26px;letter-spacing:-.045em}.pubSection ul{padding-left:22px}.pubLinks{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0}.pubLinks a{display:inline-flex;align-items:center;min-height:38px;border-radius:12px;background:#eef2ff;color:#3730a3;text-decoration:none;padding:0 12px;font-size:13px;font-weight:1000}.pubNote{background:#eefbf5;border:1px solid #b7ecd3;color:#116149;border-radius:17px;padding:14px;line-height:1.65;font-weight:800}.pubFaq{display:grid;gap:9px}.pubFaq details{border:1px solid #e4eaf2;border-radius:17px;padding:0 15px;background:#fbfcfe}.pubFaq summary{cursor:pointer;padding:15px 0;font-weight:1000}.pubFaq p{margin-top:0;padding-bottom:4px}.pubFooter{display:grid;grid-template-columns:1fr auto;gap:20px;margin-top:30px;padding:26px 4px;border-top:1px solid #dfe6ef;color:#596579}.pubFooter b{color:#263247}.pubFooter p{max-width:650px;line-height:1.65}.pubFooterLinks{display:flex;flex-wrap:wrap;align-content:flex-start;gap:10px}.pubFooterLinks a{color:#475569;text-decoration:none;font-size:13px;font-weight:900}@media(max-width:900px){.pubGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.pubDesktopNav{display:none}.pubMobileMenu{display:block}.pubHeaderInner{justify-content:space-between}.pubHero{padding:32px 25px}.pubHero h1{font-size:34px}.pubFooter{grid-template-columns:1fr}}@media(max-width:560px){.pubWrap{padding:12px 12px 42px}.pubHeaderInner{padding:8px 12px}.pubBrand b{font-size:16px}.pubStart{display:none}.pubHero{border-radius:24px;padding:27px 20px}.pubHero h1{font-size:29px}.pubHero p{font-size:15px}.pubGrid{grid-template-columns:1fr}.pubSection{padding:20px;border-radius:20px}.pubSection h2{font-size:22px}}
</style></head><body>${publicSiteNav(key)}<main class="pubWrap"><section class="pubHero"><span class="pubEyebrow">${escapeHtml(page.eyebrow || "말해가계부")}</span><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.intro)}</p><div class="pubHeroActions"><a class="pubBtn" href="/my">가계부 시작하기</a><a class="pubBtn secondary" href="/how-it-works">사용 방법 보기</a></div></section>${cards ? `<section class="pubGrid">${cards}</section>` : ""}${sections}${faqs}${publicSiteFooter()}</main></body></html>`;
}

async function handlePublicContentPage(request, env, url, key = "home") {
  return htmlResponse(renderPublicContentPage(env, url, key), 200, { "cache-control": "public, max-age=300, stale-while-revalidate=600" });
}

function handlePublicRobots(env = {}, url = null) {
  const origin = publicBaseUrl(env, url);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /admin-view",
    "Disallow: /manage",
    "Disallow: /app",
    "Disallow: /my",
    "Disallow: /api/",
    "Disallow: /skill",
    "Disallow: /nlu-ops",
    "Disallow: /operation-center",
    "Disallow: /u/",
    "Disallow: /auth/",
    "Disallow: /internal/",
    "Disallow: /ops-",
    "Disallow: /backup",
    "Disallow: /transactions/",
    "Disallow: /settings",
    "Disallow: /households",
    "Disallow: /diagnostics",
    "Disallow: /identity-audit",
    "Disallow: /kakao-recent",
    "Disallow: /kakao-login-check",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function handlePublicSitemap(env = {}, url = null) {
  const origin = publicBaseUrl(env, url);
  const lastmod = "2026-07-13";
  const items = PUBLIC_CONTENT_PATHS.map((path) => `  <url>
    <loc>${escapeHtml(`${origin}${path}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${path === "/" ? "weekly" : "monthly"}</changefreq>
    <priority>${path === "/" ? "1.0" : "0.7"}</priority>
  </url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>
`;
  return new Response(xml, { status: 200, headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" } });
}

function handlePublicSitemapStylesheet(env = {}, url = null) {
  const origin = publicBaseUrl(env, url);
  const xsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
<xsl:output method="html" encoding="UTF-8" omit-xml-declaration="yes"/>
<xsl:template match="/">
<html lang="ko"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,follow"/><title>말해가계부 XML 사이트맵</title><style>body{margin:0;background:#f7f9fc;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif}.wrap{max-width:1040px;margin:0 auto;padding:28px 18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#312e81));color:#fff;border-radius:26px;padding:28px;margin-bottom:16px}.hero p{color:#e5e7eb;line-height:1.65}.card{background:#fff;border:1px solid #e4eaf2;border-radius:22px;overflow:auto;box-shadow:0 12px 32px rgba(15,23,42,.055)}table{width:100%;border-collapse:collapse;min-width:680px}th,td{padding:13px;text-align:left;border-bottom:1px solid #e8edf4}th{background:#f1f5f9}a{color:#3730a3}.note{color:#64748b;font-size:13px;margin-top:14px}</style></head><body><main class="wrap"><section class="hero"><h1>XML 사이트맵</h1><p>검색엔진이 공개 페이지를 찾도록 제공하는 표준 XML 문서입니다. 일반 사용자는 <a style="color:#FEE500" href="${escapeHtml(origin)}/site-map">웹 사이트맵</a>을 이용할 수 있습니다.</p></section><section class="card"><table><thead><tr><th>주소</th><th>최근 수정</th><th>갱신 주기</th></tr></thead><tbody><xsl:for-each select="s:urlset/s:url"><tr><td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td><td><xsl:value-of select="s:lastmod"/></td><td><xsl:value-of select="s:changefreq"/></td></tr></xsl:for-each></tbody></table></section><p class="note">브라우저에서 표로 보이도록 스타일을 적용했으며 XML 구조 자체는 검색엔진용 표준 형식을 유지합니다.</p></main></body></html>
</xsl:template></xsl:stylesheet>`;
  return new Response(xsl, { status: 200, headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
}

function handleAdsTxt(env = {}) {
  const publisher = adsensePublisherIdForTxt(env);
  if (!publisher) return new Response("# AdSense publisher ID is not configured.\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  return new Response(`google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function renderBusinessInfoReviewCard(variant = "") {
  // V19.8.4: 카카오 심사용 본문 카드는 제거하고, 하단 사업자 푸터만 유지합니다.
  return "";
}
