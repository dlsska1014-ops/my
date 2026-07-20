# Codex 검증 하네스

이 문서는 회사 PC와 집 PC의 Codex CLI·IDE에서 동일한 저장소 검증 절차를
실행하기 위한 기준이다. 원본 V22.8.10 배포 묶음은 수정하지 않고 저장소 전용
하네스를 `.codex/scripts/`에 분리한다.

## 준비 조건

- 저장소 루트에서 실행한다.
- Node.js 18 이상과 Git이 `PATH`에 있어야 한다.
- 처음 받은 PC에서는 `git status --short --branch`로 브랜치가
  `kakao_accountbook_ttokttok`인지 확인한다.
- `node`를 찾지 못하면 Node.js 설치 후 새 터미널을 열거나 Codex 앱을
  재시작한다.

## 전체 검증

PowerShell, 명령 프롬프트, Git Bash에서 같은 명령을 사용한다.

```sh
node .codex/scripts/verify-repository.mjs
```

하네스는 다음 순서로 중단 우선 방식으로 실행한다.

1. `BUNDLE_FILE_CHECKSUMS_V22_8_10.sha256`의 원본 파일 31개 확인
2. `src/index.js` JavaScript 문법 확인
3. 영수증 55개, 카카오 그룹 18개, 가계부 보안 43개, UX 55개,
   홈 성능 32개 검사
4. ESM import와 `default.fetch` 진입점 확인
5. 작업 트리와 스테이징 영역의 Git 공백 오류 확인

성공 결과에는 총 203개 검사 통과, `default.fetch`, 소스 SHA-256이 표시되어야
한다. 어느 단계든 실패하면 종료 코드가 0이 아니며 이후 단계는 실행하지 않는다.

## 하네스 자체 점검

체크섬 파서가 정상 입력을 처리하고 잘못된 형식을 거부하는지는 다음 명령으로
확인한다.

```sh
node .codex/scripts/verify-repository.mjs --self-test
```

## 작업 범위별 실행

수정 중에는 관련 검사부터 실행하고, 완료 전 전체 하네스를 실행한다.

| 변경 영역 | 빠른 검사 |
|---|---|
| 영수증 | `npm run validate:receipt` |
| 카카오 응답 | `npm run validate:kakao-group` |
| 계정·가계부 보안 | `npm run validate:household-security` |
| 화면·행동 원칙 | `npm run validate:ux-principles` |
| 홈 성능·정적 자원 | `npm run validate:performance` |

기존 `npm run validate`와 `validate_v22810.sh`는 원본 배포 묶음 재현을 위해
보존한다. Windows에서 Bash 없이 전체 검사할 때는 저장소 하네스를 사용한다.

## 자동화할 수 없는 항목

하네스 성공은 운영 배포 승인이 아니다. 실제 Cloudflare·Supabase 환경,
PC Chrome, iPhone Safari, Android Chrome, 카카오 1:1·그룹, 영수증 OCR은
`RELEASE-CHECKLIST.md`의 미완료 항목을 별도로 확인한다.

운영 배포, SQL 실행, 환경변수·Secret 변경, Kakao Developers 또는
OpenBuilder 설정 변경은 이 하네스가 수행하지 않는다.
