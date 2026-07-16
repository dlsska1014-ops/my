import fs from "node:fs";
import assert from "node:assert/strict";
const src = fs.readFileSync(new URL("./src/index.js", import.meta.url), "utf8");
assert.match(src, /V22\.6\.9-SECURITY-SPENDER-PRIVACY-HOTFIX/);
assert.match(src, /const KAKAO_INTENT_REGISTRY/);
assert.match(src, /x-accountbook-version/);
assert.match(src, /nlu-intents\.json/);
assert.match(src, /닉내임\|닉넴/);
assert.match(src, /나를\|저를/);
assert.doesNotMatch(src, /const botGroupKey = getKakaoBotGroupKey\(payload\);[\s\S]{0,2000}const botGroupKey = getKakaoBotGroupKey\(payload\);/);

function n(s){return String(s).toLowerCase().replace(/닉내임|닉넴|닉냄/g,"닉네임").replace(/표시\s*이름/g,"표시명").replace(/\s+/g,"").trim()}
const aliasPos=["닉네임 변경","닉네임변경","닉넴 바꿔줘","별명 수정","내 이름 좀 바꿔","표시 이름 변경","사용자명 수정","결제자 이름 바꾸기","나를 인남이라고 불러줘"];
for(const t of aliasPos){const x=n(t); assert.ok(/닉네임|별명|내이름|표시명|사용자명|결제자이름|나를/.test(x),t)}
const negative=["가계부 이름 변경","결제자별 요약","엄마가 결제","닉네임이 예쁜 사람"];
for(const t of negative){assert.ok(!(/^(닉네임|별명|표시명)$/.test(n(t))),t)}
console.log(JSON.stringify({ok:true,version:"V22.1",alias_positive:aliasPos.length,negative:negative.length}));

assert.match(src, /detectKakaoAmbiguity/);
assert.match(src, /category_amount/);
