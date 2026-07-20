# V22.8.11 먼저 읽기

## 무엇을 적용하나요?

검증된 `src/index.js`를 현재 Cloudflare Worker 코드와 **전체 교체**합니다. 부분 붙여넣기는 하지 않습니다.

## 다른 작업이 필요한가요?

- Supabase SQL·스키마·RLS·RPC·인덱스: 없음
- Cloudflare 환경변수·Secret: 변경 없음
- Kakao Developers: 변경 없음
- OpenBuilder: 변경 없음

## 새 정적 자원

- `/assets/accountbook-shell-v22811.css`
- `/assets/mobile-home-shell-v22811.js`

V22.8.10의 `/assets/mobile-home-v22810.css`, `/assets/mobile-home-v22810.js`도 동일한 바이트와 ETag로 계속 제공됩니다.

## 배포 전 확인

```sh
node .codex/scripts/verify-repository.mjs
```

31개 체크섬, 265개 자동 검사, ESM `default.fetch`가 모두 통과해야 합니다.

## 배포 후 확인

`RELEASE-CHECKLIST.md`의 미완료 항목을 실제 운영 도메인과 PC·iPhone·Android에서 확인합니다. 저장소 검증 성공만으로 운영 배포가 완료된 것은 아닙니다.

문제가 생기면 V22.8.10 `src/index.js`로 코드만 전체 롤백합니다. SQL 롤백은 없습니다.
