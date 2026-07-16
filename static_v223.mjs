import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync('./src/index.js','utf8');
for (const token of ['/nlu-ops','/nlu-ops.json','/nlu-failures.csv','record_nlu_metric','record_nlu_failure_sample','x-accountbook-nlu-result','redactNluOpsSample']) assert.ok(src.includes(token), token);
assert.ok(!/user_key.*nlu_failure_samples/i.test(fs.readFileSync('./schema_v22_3_nlu_ops_optional.sql','utf8')));
console.log(JSON.stringify({ok:true,tokens:7}));
