# tools/vendor

저장소 도구와 검증이 쓰는 외부 코드를 원본 그대로 담는다. 설치 단계(`npm install`)가 없는
저장소라서, 검증 하네스가 자식 Node 에 `--expose-internals` 같은 플래그를 넘기지 않고도
같은 파서를 쓰게 하려는 것이다(docs/refactor/modularization-v1/PLAN.md 10장 4번).

## acorn 8.16.0 (MIT)

- 파일: `acorn.mjs` = npm 패키지 `acorn@8.16.0`의 `package/dist/acorn.mjs`, 한 바이트도 고치지 않음.
  SHA-256 `efb0124a960b34d53f9928c4926bfcfd300bb6a3d7ab64ee949b3a8bed1c7e5f` (230,975 bytes).
- 라이선스: `acorn-LICENSE.txt` = 같은 패키지의 `package/LICENSE` 원본.
- 출처: https://registry.npmjs.org/acorn/-/acorn-8.16.0.tgz
  - npm `dist.integrity` `sha512-UVJyE9MttOsBQIDKw1skb9nAwQuR5wuGD3+82K6JgJlm/Y+KI92oNsMNGZCYdDsVtRHSak0pcV5Dno5+4jh9sw==`
  - npm `dist.shasum` `4ce79c89be40afe7afe8f3adb902a1f1ce9ac08a`
- 판: Node.js 22.23.1 내장 acorn(`process.versions.acorn`)과 같은 8.16.0.
- 쓰는 곳: `tools/worker-analysis.mjs` 를 거쳐 `tools/annotate-modules.mjs`,
  `tools/compare-worker-statements.mjs`, 모듈 문법·클라이언트 직렬화·초기화 순서 검증.
  배포되는 Worker(`src/index.js`)에는 들어가지 않는다.

갱신 절차: 레지스트리 메타데이터(`https://registry.npmjs.org/acorn/<판>`)의 `dist.integrity`와
받은 tarball 의 sha512 가 같은지 확인한 뒤 `dist/acorn.mjs`와 `LICENSE`를 그대로 복사하고, 이 문서와
`validation/validate-module-syntax-v22932.mjs` 에 고정한 SHA-256 을 함께 바꾼다.
