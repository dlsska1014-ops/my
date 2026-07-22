# V22.8.13 먼저 읽기

## 무엇을 적용하나요?

검증된 `src/index.js`를 현재 Cloudflare Worker 코드와 **전체 교체**합니다. 부분 붙여넣기는 하지 않습니다.

## 변경 범위

- 예산, 고급 정산, 내 설정의 다크모드 밝은 배경 누락 보정
- 키워드 편집기와 분석 비활성 필터의 텍스트 대비 보정
- 파란 링크 버튼의 글자색 충돌 보정
- 새 immutable CSS: `/assets/accountbook-shell-v22813.css`
- 기존 테마 런타임 `/assets/accountbook-theme-v22812.js` 유지

화면 설정은 개인정보 없는 브라우저 로컬 저장이며 기기 간 동기화되지 않습니다.

## 다른 작업이 필요한가요?

- Supabase SQL·스키마·RLS·RPC·인덱스: 없음
- Cloudflare 환경변수·Secret: 변경 없음
- Kakao Developers: 변경 없음
- OpenBuilder: 변경 없음

## 배포 전 확인

```sh
node .codex/scripts/verify-repository.mjs
```

현재 배포 체크섬, 289개 자동 검사, ESM `default.fetch`가 모두 통과해야 합니다.

## 배포 후 확인

`RELEASE-CHECKLIST.md`에 따라 새 CSS, 세 가지 화면 모드, 네 가지 컬러톤과 PC·iPhone·Android 실제 화면을 확인합니다.

문제가 생기면 직전 V22.8.12 `src/index.js`로 코드만 전체 롤백합니다. SQL 롤백은 없습니다.
