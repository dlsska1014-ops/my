# Codex 검증 하네스

회사 PC와 집 PC의 Codex CLI·IDE에서 같은 저장소 검증을 실행하기 위한 기준입니다. 현재 저장소 하네스는 V22.8.18 배포 묶음을 확인합니다.

## 전체 검증

저장소 루트에서 실행합니다.

```sh
node .codex/scripts/verify-repository.mjs
```

하네스는 다음을 순서대로 확인합니다.

1. `BUNDLE_FILE_CHECKSUMS_V22_8_18.sha256`의 배포 파일
2. `src/index.js` JavaScript 문법
3. 영수증 55개
4. 카카오 그룹 18개
5. 가계부 보안 43개
6. UX·분석 보호 55개
7. 사용자 화면·홈 버튼·테마·성능 141개
8. AdSense 심사·V2·UI·UX 4단계 화면 246개
9. ESM import와 `default.fetch`
10. 작업 트리·스테이징 영역의 공백 오류

성공 결과는 총 558개 자동 검사와 현재 `src/index.js` SHA-256을 표시합니다.

## 빠른 검사

| 영역 | 명령 |
|---|---|
| 영수증 | `npm run validate:receipt` |
| 카카오 | `npm run validate:kakao-group` |
| 계정·가계부 보안 | `npm run validate:household-security` |
| UX·분석 보호 | `npm run validate:ux-principles` |
| 접근성 테마·홈 셸·성능 | `npm run validate:performance` |
| AdSense 심사·V2·UI·UX 4단계 | `npm run validate:adsense-v2` |

## 하네스 자체 점검

```sh
node .codex/scripts/verify-repository.mjs --self-test
```

## 자동화할 수 없는 항목

하네스 성공은 운영 배포 승인이 아닙니다. Cloudflare 운영 배포, 운영 도메인의 실제 AdSense 메타와 `/ads.txt`, PC·iPhone·Android 실기기, 카카오 1:1·그룹, 영수증 OCR은 `RELEASE-CHECKLIST.md`에서 별도 확인합니다. SQL, 환경변수·Secret, Kakao Developers, OpenBuilder 변경은 V22.8.18에 필요하지 않습니다.
