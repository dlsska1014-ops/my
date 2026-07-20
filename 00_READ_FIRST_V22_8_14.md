# V22.8.14 먼저 읽기

검증된 `src/index.js`를 현재 Cloudflare Worker 코드와 **전체 교체**합니다. 부분 붙여넣기는 하지 않습니다.

## 변경 범위

- 홈 기록이 10건을 넘을 때 표시되는 `전체 N건 조회` 링크 버튼의 다크모드 대비 보정
- 실제 11건 QA 렌더링과 버튼 전용 범위 검증
- 새 immutable CSS: `/assets/accountbook-shell-v22814.css`
- 기존 테마 런타임 `/assets/accountbook-theme-v22812.js` 유지

## 변경하지 않는 항목

- Supabase SQL·스키마·RLS·RPC·인덱스
- Cloudflare 환경변수·Secret
- Kakao Developers
- OpenBuilder

## 배포 전

```sh
node .codex/scripts/verify-repository.mjs
```

체크섬 31개, 자동 검사 291개, ESM `default.fetch`가 모두 통과해야 합니다.

배포 후 `/health`, 새 CSS, 홈 11건 이상 상태의 라이트·다크 및 네 컬러톤을 확인합니다. 실패 시 V22.8.13 Worker 소스로 코드만 롤백합니다.
