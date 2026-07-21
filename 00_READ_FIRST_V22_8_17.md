# V22.8.17 먼저 읽기

검증된 `src/index.js`를 현재 Cloudflare Worker 코드와 **전체 교체**합니다. 부분 붙여넣기는 하지 않습니다.

## 변경 범위

- V22.8.16 운영 확인에서 발견된 `복구 NN번` 실패 핫픽스
- 원인: 복구 버퍼의 행에 NOT NULL 컬럼 `household_id`가 빠져 재삽입 INSERT가 항상 거부됨
- 삭제 시 버퍼에 `household_id` 명시 저장 + 기존 레거시 버퍼도 복구 시점에 보충
- 복구 재삽입 전 존재 확인(중복 방지)과 `id`·`created_at` 제외 순차 재시도
- 복구 최종 실패 시 `restore_error` 텔레메트리 적재
- 그 외 V22.8.16의 수정 플로우 V4 동작은 동일

## 변경하지 않는 항목

- Supabase 스키마·RLS·RPC·인덱스 (V22.8.16의 선택 텔레메트리 테이블 판정 유지)
- Cloudflare 환경변수·Secret
- Kakao Developers
- OpenBuilder

## 배포 전

```sh
node .codex/scripts/verify-repository.mjs
```

체크섬 32개, 자동 검사 414개(수정 플로우 120개 포함), ESM `default.fetch`가 모두 통과해야 합니다.

배포 후 `/health` 버전과, 챗봇에서 `삭제 NN번` → `복구 NN번` 시나리오를 확인합니다. V22.8.16에서 삭제한 기록도 24시간 안이라면 배포 후 같은 `복구 NN번`으로 복구됩니다. 실패 시 V22.8.16 Worker 소스로 롤백하되, 복구 기능이 필요하면 V22.8.17 이상을 유지합니다.
