# V22.9.36 검증 기록

저장소 자동 검증을 마쳤습니다. 운영 배포와 실제 Cloudflare API 호출은 하지 않았습니다.

- **작업 위치:** git worktree `D:\Github_Kakao_Account\my-v22936`, 브랜치 `claude/v22936-kakao-category-fallback`
- **기준:** V22.9.35 main `25a2db2`, 운영 버전 `4f9da854…`(배포 `994d2f22…`)
- **동결 소스:** SHA-256 `b8b93790bbdb277673502c9c4d454bcb849fbc61a27e05bcc6a2ca67f9ced9f4`, 3,515,821 bytes

## 원인 재현

운영 `/ready`는 V22.9.32 부터 매번 `unavailable_optional_tables: ["accountbook_categories"]`를 돌려줬습니다(배포 기록 네 건 모두 "예전부터 없었다"). 그 조건을 픽스처에 흉내 냈습니다: `accountbook_categories` 조회에 PostgREST 404 `PGRST205 Could not find the table`을 돌려줍니다.

- **V22.9.35 코드(`25a2db2`):** 카카오 "점심 9000 운영표없음"이 `fetchKakaoInputSettings`의 `Promise.all`에서 `Supabase 404`로 던지고 저장 0건입니다. Node 에서는 `allSettled`가 붙기 전에 거절돼 처리되지 않은 거절로 프로세스가 끝났습니다(운영 workerd 에서는 실패 안내로 끝납니다).
- **V22.9.36:** 같은 조건에서 "저장했어요" 답장과 거래 행 1건, 기본 분류 규칙 적용, 운영 이벤트 `kakao_category_table_unavailable` 1건입니다.

## 바뀐 범위

`tools/compare-worker-statements.mjs`로 V22.9.35 운영 소스(`636cab5c…`)와 최상위 문장을 구문 트리로 비교했습니다. 결과는 아래 "바뀐 문장" 절에 있습니다. Worker 내보내기 목록과 1년 캐시 자산의 바이트는 같습니다.

## 새 검사

| 검사 | 검사 수 | 고치기 전(V22.9.35) 결과 |
|---|---|---|
| `validate-kakao-category-fallback-v22936`(새 검사) | 26 | 2절 "표가 없어도 카카오 새 기록이 저장된다"에서 실패(`main` checkout 에 복사해 실행) |

검사 내용: 소스 7개(대체·이벤트·1회 표시·설정 필수·거절 표시), 표 없음(404) 저장 2건·이벤트 1회, 설정 저장 분류·키워드 적용, 표 장애(503) 저장, 설정 장애 시 저장 안 함, 표 있음 동작 유지, 웹 빠른 입력 동작 유지.

## 전체 검증

- **새 manifest:** `BUNDLE_FILE_CHECKSUMS_V22_9_36.sha256`은 V22_9_35 의 352개 경로를 모두 보존하고 새 파일 5개(판 문서 3개, V22.9.35 배포 기록, 새 검사)를 더한 **357개**입니다.
- **전체 하네스:** `node .codex/scripts/verify-repository.mjs`가 자동 검사 **8,795개**(하한 8,795), Worker 문법, ESM `default.fetch`, 작업 트리와 스테이징 공백 검사를 통과했습니다.
- **SQLite:** `node monitoring/test-d1.mjs`는 관제 코드가 바뀌지 않아 이 판에서 다시 돌리지 않았습니다(V22.9.35 에서 Node.js v22.23.1 로 45개 통과).
- **CI:** Ubuntu·Windows 결과는 병합 뒤 배포 기록에 남깁니다.

## 바뀐 문장

`node tools/compare-worker-statements.mjs <V22.9.35 src/index.js> src/index.js`:
- 최상위 문장 1,660개 → 1,660개, 같은 문장 1,657개, 순서 같음.
- 바뀐 문장 3개: `APP_VERSION`(판 번호), `saveKakaoParsedTransactionsReply`(거절 표시 한 줄), `fetchKakaoInputSettings`(표 조회 대체·이벤트).
- 없어진 문장 0개, 새 문장 0개.

## 운영과 한계

- 운영 카카오 대화에서 실패를 직접 보지는 않았습니다. 배포 뒤 `docs/ASIDE_V22_9_36.md` 4절 C1 과 2절 ②로 확인합니다.
- 메모리 픽스처의 기본값에는 표가 그대로 있습니다. 표 없는 모드의 전체 하네스는 V22.9.37 에서 더합니다.
