# V22.8.16 먼저 읽기

검증된 `src/index.js`를 현재 Cloudflare Worker 코드와 **전체 교체**합니다. 부분 붙여넣기는 하지 않습니다.

## 변경 범위

- 다크 입력 컨트롤을 레거시 CSS보다 높은 우선순위로 보정
- 메뉴·자산·적립계획·영수증·가계부 관리·참여자·키워드·백업·가계부 그룹·시작 안내·보고서의 표면과 텍스트 대비 보정
- 전역 글자색 강제를 제거하고 의미색·버튼 글자색 보호
- 라이트 적립계획 경고 보조문구 대비 보정
- 새 immutable CSS: `/assets/accountbook-shell-v22816.css`
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

체크섬 31개, 자동 검사 305개, ESM `default.fetch`가 모두 통과해야 합니다.

배포 후 `/health`, 새 CSS, 라이트·다크 주요 사용자 화면을 확인합니다. 실패 시 V22.8.15 Worker 소스로 코드만 롤백합니다.
