# V22.8.12 먼저 읽기

## 무엇을 적용하나요?

검증된 `src/index.js`를 현재 Cloudflare Worker 코드와 **전체 교체**합니다. 부분 붙여넣기는 하지 않습니다.

## 변경 범위

- 시스템·라이트·다크 화면 모드
- 블루·그린·바이올렛·앰버 컬러톤
- 홈 알림, 분석 보조 텍스트, 모바일 메뉴, placeholder 대비
- 새 정적 자원:
  - `/assets/accountbook-shell-v22812.css`
  - `/assets/accountbook-theme-v22812.js`

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

현재 배포 체크섬, 283개 자동 검사, ESM `default.fetch`가 모두 통과해야 합니다.

## 배포 후 확인

`RELEASE-CHECKLIST.md`에 따라 새 자원, 세 가지 화면 모드, 네 가지 컬러톤과 PC·iPhone·Android 실제 화면을 확인합니다.

문제가 생기면 V22.8.11 `src/index.js`로 코드만 전체 롤백합니다. SQL 롤백은 없습니다.
