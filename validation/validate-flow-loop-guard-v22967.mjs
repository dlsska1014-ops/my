// V22.9.67 — 단계형 흐름의 무한 반복 방지(2026-10-19 운영 단톡방 보고).
//
// 단톡방 메시지 버튼은 messageText 가 아니라 버튼 이름을 보낸다. 예전 예산 설정 버튼 이름
// ("카테고리별", "지난달 복사")이 그대로 오면 같은 질문("어떤 예산을 설정할까요?")만 되풀이됐다.
// 1) 예전 버튼 이름은 원래 명령으로 바뀌어 다음 단계로 간다.
// 2) 같은 단계에서 알아듣지 못한 답이 두 번 이어지면 흐름을 끝내고 다시 시작하는 버튼을 준다.
// 3) 흐름이 끝난 뒤의 말은 다시 그 질문으로 돌아가지 않는다.

import { fixture, skill, withClock } from "./lib-audit-v22934.mjs";

let checks = 0;
const ok = (value, label) => { if (!value) throw new Error(`FAIL: ${label}`); checks += 1; };

try {
  await withClock("2026-08-15", async () => {
    await fixture(async (fx) => {
      await skill(fx, "안녕");
      await skill(fx, "2");

      // 1) 예전 버튼 이름 "카테고리별" → 카테고리 단계로 진행.
      ok(/어떤 예산을 설정할까요/.test(await skill(fx, "예산 설정")), "예산 설정 시작");
      const category = await skill(fx, "카테고리별");
      ok(/카테고리를 선택해 주세요/.test(category) && !/어떤 예산을 설정할까요/.test(category), `예전 버튼 이름 ‘카테고리별’이 다음 단계로 간다 (${category.slice(0, 40)})`);
      await skill(fx, "취소");

      // 이모지가 붙은 예전 버튼 이름도 같은 명령으로 처리한다.
      ok(/어떤 예산을 설정할까요/.test(await skill(fx, "💰 예산 설정")), "이모지 붙은 ‘예산 설정’도 흐름 시작");
      const copy = await skill(fx, "지난달 복사");
      ok(/복사/.test(copy) && !/어떤 예산을 설정할까요/.test(copy), `예전 버튼 이름 ‘지난달 복사’가 복사로 처리된다 (${copy.slice(0, 40)})`);

      // 2) 알아듣지 못한 답이 두 번이면 흐름을 끝낸다.
      await skill(fx, "예산 설정");
      const first = await skill(fx, "음 글쎄");
      ok(/버튼 중 하나를 눌러/.test(first), `첫 번째 엉뚱한 답에는 짧게 다시 묻는다 (${first.slice(0, 40)})`);
      const second = await skill(fx, "잘 모르겠네");
      ok(/예산 설정을 멈췄어요/.test(second), `두 번째 엉뚱한 답에는 흐름을 끝낸다 (${second.slice(0, 40)})`);
      const after = await skill(fx, "잘 모르겠네");
      ok(!/어떤 예산을 설정할까요|버튼 중 하나를 눌러|예산 설정을 멈췄어요/.test(after), `흐름이 끝난 뒤에는 같은 질문으로 돌아가지 않는다 (${after.slice(0, 40)})`);

      // 금액 단계도 같은 방식으로 끝난다.
      await skill(fx, "예산 설정");
      await skill(fx, "전체 월 예산");
      ok(/금액을 확인하지 못했어요/.test(await skill(fx, "많이")), "금액 단계 첫 오답은 다시 묻는다");
      ok(/예산 설정을 멈췄어요/.test(await skill(fx, "아주 많이")), "금액 단계 두 번째 오답은 흐름을 끝낸다");
    });
  });
  console.log(`V22.9.67 흐름 무한 반복 방지 검사 통과 (${checks} checks)`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
