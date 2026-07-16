import fs from 'node:fs';
import { detectKakaoNaturalIntent, detectKakaoAmbiguity } from './src/index.js';

const file = process.argv[2] || './nlu_eval_dataset_v221.jsonl';
const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((x) => JSON.parse(x));
let checked = 0, passed = 0;
const failures = [];
const byIntent = new Map();
for (const row of rows) {
  let ok = true;
  let actual = '';
  if (row.expected_intent) {
    actual = detectKakaoNaturalIntent(row.utterance).intent;
    ok = actual === row.expected_intent;
    const k = row.expected_intent;
    const stat = byIntent.get(k) || { total: 0, pass: 0 };
    stat.total += 1; if (ok) stat.pass += 1; byIntent.set(k, stat);
  } else if (row.expected_ambiguity) {
    actual = detectKakaoAmbiguity(row.utterance)?.type || 'NONE';
    ok = actual === row.expected_ambiguity;
  }
  checked += 1;
  if (ok) passed += 1;
  else if (failures.length < 80) failures.push({ utterance: row.utterance, expected: row.expected_intent || row.expected_ambiguity, actual, kind: row.kind });
}
const accuracy = checked ? passed / checked : 0;
const summary = {
  version: 'V22.1', dataset: file, synthetic_dataset: true,
  checked, passed, failed: checked - passed,
  accuracy: Number(accuracy.toFixed(6)),
  by_intent: Object.fromEntries([...byIntent.entries()].map(([k,v]) => [k, { ...v, accuracy: Number((v.pass/v.total).toFixed(6)) }])),
  failures,
};
console.log(JSON.stringify(summary, null, 2));
if (accuracy < 0.97) process.exit(1);
