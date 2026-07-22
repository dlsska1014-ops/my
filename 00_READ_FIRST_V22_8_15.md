# V22.8.15 먼저 읽기

검증된 `src/index.js`를 현재 Cloudflare Worker 코드와 **전체 교체**합니다. 부분 붙여넣기는 하지 않습니다.

## 변경 범위

- 다크모드 전역 글자색 보정을 로그인·계정보안 화면에서 분리
- 카카오 배지·도움말·안내·경고·계정 식별·보조 버튼의 전경과 표면 대비 보정
- 라이트 로그인 `다른 방법으로 접속` 문구 대비 보정
- 새 immutable CSS: `/assets/accountbook-shell-v22815.css`
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

체크섬 31개, 자동 검사 294개, ESM `default.fetch`가 모두 통과해야 합니다.

배포 후 `/health`, 새 CSS, 라이트·다크 로그인과 내 계정·보안, 기존 주요 사용자 화면을 확인합니다. 실패 시 V22.8.14 Worker 소스로 코드만 롤백합니다.
