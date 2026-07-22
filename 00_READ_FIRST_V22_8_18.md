# V22.8.18 먼저 읽기

검증된 `src/index.js`를 현재 Cloudflare Worker 코드와 **전체 교체**합니다. 부분 붙여넣기는 하지 않습니다.

## 변경 범위

- 웹앱-속도피드백-개선지침서 (B)·(B-0)·(C) 반영 (기존 기능 삭제 없음)
- (B) 제출 위치 인라인 결과: 저장·수정·삭제 후 상단 결과 배너를 제출한 폼 아래로 이동, 화면 밖이면 그 자리로 스크롤
- (B-0) 응답 규약: `message` 없던 실패 JSON 13곳에 사용자용 한국어 `message` + 분기용 `reason` 추가
- (A) 속도·(C-1) 로딩은 기존 구현 확인(정적 자산 immutable·병렬 조회·페이지네이션·버튼 잠금·스피너) — 추가 변경 없음
- 클라이언트 개선은 HTML `attachUiUxRuntime` 단계 인라인 주입, 새 정적 자산 파일 없음

## 안전장치

- JavaScript·`sessionStorage` 미지원 시 상단 표시로 폴백(기능 손실 없음)
- 같은 `action` POST 폼이 여러 개면 배너를 이동하지 않음(오배치 방지)
- 서버가 이스케이프한 노드를 그대로 이동, `innerHTML` 미사용(XSS 안전)
- 셸 CSS를 마지막 스타일 캐스케이드로 보존(다크모드 보호), `prefers-reduced-motion` 존중

## 변경하지 않는 항목

- Supabase SQL·스키마·RLS·RPC·인덱스
- Cloudflare 환경변수·Secret
- Kakao Developers / OpenBuilder
- 정적 자산 경로(V22.8.15 이하 전부 보존)

## 배포 전

```sh
node .codex/scripts/verify-repository.mjs
```

체크섬 32개, 자동 검사 429개(UX 69개·영수증 56개·수정 플로우 120개 포함), ESM `default.fetch`가 모두 통과해야 합니다.

배포 후 `/health` 버전(`V22.8.18-WEBAPP-INLINE-FEEDBACK`)과, 웹앱에서 저장·검증 실패 시 결과가 제출 자리에 인라인으로 보이는지 확인합니다. 실패 시 V22.8.17 Worker 소스로 코드만 롤백합니다(인라인 주입이라 코드 롤백만으로 완전 복구).
