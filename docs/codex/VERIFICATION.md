# Codex 검증 하네스

회사 PC와 집 PC의 Codex CLI·IDE에서 같은 저장소 검증을 실행하기 위한 기준입니다. 현재 저장소 하네스는 V22.8.44 배포 묶음을 확인합니다.

## 전체 검증

저장소 루트에서 실행합니다.

```sh
node .codex/scripts/verify-repository.mjs
```

하네스는 다음을 순서대로 확인합니다.

1. `BUNDLE_FILE_CHECKSUMS_V22_8_44.sha256`의 배포 파일
2. `src/index.js` JavaScript 문법
3. 영수증 56개
4. 카카오 그룹 22개
5. 카카오 수정·삭제·복구 V4 130개
6. 가계부·운영 보안 65개
7. UX·분석 보호 56개
8. 사용자 화면·홈 버튼·테마·성능 144개
9. AdSense 심사·V2·UI V5 공통 셸 261개
10. UI V5 권한·범위·저장 안정화 41개
11. 핵심 쓰기·권한 스모크 97개
12. ESM import와 `default.fetch`
13. 작업 트리·스테이징 영역의 공백 오류

성공 결과는 총 872개 자동 검사와 현재 `src/index.js` SHA-256을 표시합니다.

## 빠른 검사

| 영역 | 명령 |
|---|---|
| 영수증 | `npm run validate:receipt` |
| 카카오 | `npm run validate:kakao-group` |
| 카카오 수정·복구 | `npm run validate:kakao-edit` |
| 계정·가계부 보안 | `npm run validate:household-security` |
| UX·분석 보호 | `npm run validate:ux-principles` |
| 접근성 테마·홈 셸·성능 | `npm run validate:performance` |
| AdSense 심사·V2·UI V5 공통 셸 | `npm run validate:adsense-v2` |
| UI V5 권한·범위·저장 안정화 | `npm run validate:v5` |
| 핵심 쓰기·권한 스모크 | `npm run validate:core-write` |

## 하네스 자체 점검

```sh
node .codex/scripts/verify-repository.mjs --self-test
```

## 자동화할 수 없는 항목

하네스 성공은 운영 배포 승인이 아닙니다. Cloudflare 운영 배포, 운영 도메인의 `/health`·`/ready`, 실제 AdSense 메타와 `/ads.txt`, PC·iPhone·Android 실기기, 카카오 1:1·그룹, 영수증 OCR은 `RELEASE-CHECKLIST.md`에서 별도 확인합니다. V22.8.44는 신규 SQL 설계가 없으며 이미 `/ready`가 정상이라면 기존 복구 SQL을 다시 실행하지 않습니다.
