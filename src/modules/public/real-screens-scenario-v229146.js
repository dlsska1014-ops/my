// V22.9.146 애드센스 B4: 실제 화면 사진을 만든 예시 시나리오(보낸 날·카카오톡 문장·저장 기대값). 다른 모듈을 읽지 않는다 —
// tools/build-real-screens.mjs 가 사진을 만들기 전에 이 파일만 읽고, 공개 화면(real-screens-v229146.js)과 검사가 같은 값을 쓴다.
// 금요일 정오(KST)에 찍었다. 개인 가계부 문장은 보낸 날 정오에, 모임 문장은 아래 날짜를 적어 그날 보냈다.
const REAL_SCREENS_CLOCK_V229146 = "2026-11-20";

// 1:1 채팅(민지 한 사람) → 개인 가계부. 가계부 이름은 웹에서 ‘우리집 생활비’ 로 바꾼 것으로 둔다(예시 데이터).
// expect = 그 문장으로 저장된 기록(날짜·구분·금액·분류·결제수단·메모). 예산·이름 문장은 기록이 아니라 expect 가 없다.
const REAL_SCREENS_PERSONAL_V229146 = Object.freeze({
  householdName: "우리집 생활비",
  member: "민지",
  messages: Object.freeze([
    Object.freeze({ day: "2026-11-14", text: "마트 장보기 38000원 카드", expect: Object.freeze({ type: "expense", amount: 38000, category: "장보기", payment: "카드", memo: "마트 장보기" }) }),
    Object.freeze({ day: "2026-11-15", text: "점심 9000원 현금", expect: Object.freeze({ type: "expense", amount: 9000, category: "외식", payment: "현금", memo: "점심" }) }),
    Object.freeze({ day: "2026-11-16", text: "주유 5만원 카드", expect: Object.freeze({ type: "expense", amount: 50000, category: "주유/충전", payment: "카드", memo: "주유" }) }),
    Object.freeze({ day: "2026-11-17", text: "커피 4500원", expect: Object.freeze({ type: "expense", amount: 4500, category: "카페/간식", payment: "", memo: "커피" }) }),
    Object.freeze({ day: "2026-11-18", text: "휴대폰 요금 55000원", expect: Object.freeze({ type: "expense", amount: 55000, category: "통신비", payment: "", memo: "휴대폰 요금" }) }),
    Object.freeze({ day: "2026-11-19", text: "택시 14500원", expect: Object.freeze({ type: "expense", amount: 14500, category: "택시", payment: "", memo: "택시" }) }),
    Object.freeze({ day: "2026-11-19", text: "저녁 배달 23000원 카드", expect: Object.freeze({ type: "expense", amount: 23000, category: "배달", payment: "카드", memo: "저녁 배달" }) }),
    Object.freeze({ day: "2026-11-20", text: "월 예산 80만원" }),
    Object.freeze({ day: "2026-11-20", text: "내 이름 설정 민지" }),
    Object.freeze({ day: "2026-11-20", text: "점심 국수 12000원", expect: Object.freeze({ type: "expense", amount: 12000, category: "외식", payment: "", memo: "점심 국수" }) }),
    Object.freeze({ day: "2026-11-20", text: "아메리카노 4500원", expect: Object.freeze({ type: "expense", amount: 4500, category: "카페/간식", payment: "", memo: "아메리카노" }) }),
  ]),
});

// 단톡방(네 사람) → 그 방의 공동 가계부. 가계부 이름은 웹에서 ‘11월 여행 모임’ 으로 바꾼 것으로 둔다(예시 데이터).
// 기록 뒤 저마다 ‘@말해가계부 내 이름 …’ 으로 이름을 정하고 민지가 ‘정산’ 을 보냈다(/demo 의 정산 예시와 같은 금액·이름, 달만 11월).
const REAL_SCREENS_ROOM_V229146 = Object.freeze({
  householdName: "11월 여행 모임",
  members: Object.freeze(["민지", "준호", "서연", "도윤"]),
  messages: Object.freeze([
    Object.freeze({ day: "2026-11-15", who: 0, text: "@말해가계부 숙소 200000원", expect: Object.freeze({ type: "expense", amount: 200000, category: "여행", payment: "", memo: "숙소" }) }),
    Object.freeze({ day: "2026-11-15", who: 1, text: "@말해가계부 저녁 120000원", expect: Object.freeze({ type: "expense", amount: 120000, category: "외식", payment: "", memo: "저녁" }) }),
    Object.freeze({ day: "2026-11-16", who: 2, text: "@말해가계부 렌터카 60000원", expect: Object.freeze({ type: "expense", amount: 60000, category: "교통", payment: "", memo: "렌터카" }) }),
    Object.freeze({ day: "2026-11-16", who: 3, text: "@말해가계부 커피 20000원", expect: Object.freeze({ type: "expense", amount: 20000, category: "카페/간식", payment: "", memo: "커피" }) }),
    Object.freeze({ day: "2026-11-20", who: 0, text: "@말해가계부 내 이름 민지" }),
    Object.freeze({ day: "2026-11-20", who: 1, text: "@말해가계부 내 이름 준호" }),
    Object.freeze({ day: "2026-11-20", who: 2, text: "@말해가계부 내 이름 서연" }),
    Object.freeze({ day: "2026-11-20", who: 3, text: "@말해가계부 내 이름 도윤" }),
    Object.freeze({ day: "2026-11-20", who: 0, text: "@말해가계부 정산" }),
  ]),
  // 정산 답과 웹 정산 화면이 보이는 송금 제안(검사가 실제 답·화면과 대조한다).
  transfers: Object.freeze([["도윤", "민지", 80000], ["서연", "민지", 20000], ["서연", "준호", 20000]].map((row) => Object.freeze(row))),
});

// 사진 네 장(찍는 법은 tools/build-real-screens.mjs 의 SHOTS). label = 사진 아래 짧은 이름, alt = 사진에 보이는 숫자와 글.
// checks = 그 화면을 지금 코드로 그린 HTML 에 있어야 하는 글(검사가 대조한다 — 사진과 지금 화면이 어긋나면 사진을 다시 찍는다).
const REAL_SCREENS_SHOTS_V229146 = Object.freeze([
  Object.freeze({ key: "home", label: "개인 가계부 홈", alt: "우리집 생활비 가계부의 11월 홈 화면. 이번 달 쓸 수 있는 돈 589,500원, 예산 사용률 26%, 예산 800,000원 중 쓴 돈 210,500원, 오늘 쓴 돈 16,500원. ‘이번 달의 67%가 지났고 예산은 26%만 썼어요. 하루 53,590원씩 쓰면 돼요’ 안내와 11월 14일부터 20일까지의 지출 막대가 보인다.", checks: Object.freeze(["우리집 생활비", "589,500", "26%", "800,000원", "210,500원", "16,500원", "53,590원"]) }),
  Object.freeze({ key: "list", label: "카톡으로 넣은 내역", alt: "우리집 생활비 가계부의 11월 거래내역 화면. 9건, 지출 210,500원. 오늘 아메리카노 4,500원(카페/간식)과 점심 국수 12,000원(외식), 어제 저녁 배달 23,000원(배달, 카드)과 택시 14,500원(택시), 11월 18일 휴대폰 요금 55,000원(통신비)이 날짜별로 보인다.", checks: Object.freeze(["9건", "210,500원", "아메리카노", "점심 국수", "저녁 배달", "휴대폰 요금", "통신비"]) }),
  Object.freeze({ key: "room", label: "단톡방 공동 가계부 내역", alt: "11월 여행 모임 가계부의 11월 거래내역 화면. 4건, 지출 400,000원. 11월 16일 커피 20,000원(도윤)과 렌터카 60,000원(서연), 11월 15일 저녁 120,000원(준호)과 숙소 200,000원(민지)이 누가 낸 돈인지와 함께 보인다.", checks: Object.freeze(["11월 여행 모임", "4건", "400,000원", "렌터카", "숙소", "도윤", "서연", "준호", "민지"]) }),
  Object.freeze({ key: "settle", label: "정산 송금 제안", alt: "11월 여행 모임의 정산 화면 중 ‘송금 횟수를 줄인 제안’. 도윤이 민지에게 80,000원, 서연이 민지에게 20,000원, 서연이 준호에게 20,000원을 보내면 된다고 보인다.", checks: Object.freeze(["송금 횟수를 줄인 제안", "80,000원", "20,000원"]) }),
]);

// @build:exports-start
export {
  REAL_SCREENS_CLOCK_V229146, REAL_SCREENS_PERSONAL_V229146, REAL_SCREENS_ROOM_V229146,
  REAL_SCREENS_SHOTS_V229146,
};
// @build:exports-end
