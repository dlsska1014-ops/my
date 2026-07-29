# V22.8.46 참여자 역할 스키마 정합성 적용 안내

## 확정된 원인

V22.8.45 배포 후 Error 1101은 차단됐고, 화면에 `현재 데이터베이스 역할 규칙에서 선택한 권한을 저장할 수 없습니다`가 표시됐습니다. Worker와 기존 V22.7.0 RPC는 `admin`을 정상 역할로 사용하지만 운영 `household_members.role` 저장 규칙만 `admin`을 허용하지 않는 상태입니다.

## 적용 파일

1. Supabase SQL Editor: `01_APPLY_MEMBER_ROLE_SCHEMA_V22_8_46.sql` 전체 실행
2. Cloudflare Worker: ZIP의 `src/index.js` 전체 교체

부분 복사·부분 병합은 하지 않습니다.

## SQL이 하는 일

- `household_members.role`이 텍스트 CHECK인지 PostgreSQL enum인지 자동 판별
- 기존 역할 데이터에 알 수 없는 값이 있으면 변경 전에 즉시 중단
- 텍스트 CHECK이면 기존 역할 목록 제약만 교체하고 여섯 역할을 허용
- enum이면 `admin` 값을 없을 때만 추가
- 기존 참여자 행, 역할 값, RLS, GRANT, RPC, 인덱스를 변경하지 않음
- 5초 안에 테이블 잠금을 얻지 못하면 전체 transaction을 중단
- 마지막 결과에서 `admin_allowed=true`, `invalid_role_count=0`, `readiness_ok=true` 확인

허용 역할은 `owner`, `admin`, `member`, `viewer`, `pending`, `blocked`입니다.

## 적용 순서

1. Supabase 데이터베이스 백업 또는 복구 지점을 확인합니다.
2. `01_APPLY_MEMBER_ROLE_SCHEMA_V22_8_46.sql` 전체를 SQL Editor에서 한 번 실행합니다.
3. 결과 한 행의 `readiness_ok`가 `true`인지 확인합니다.
4. ZIP의 `src/index.js` 전체를 Worker에 붙여넣고 저장·배포합니다.
5. PowerShell에서 `14_VERIFY_AFTER_DEPLOY_V22_8_46.ps1`을 실행합니다.
6. `15_MEMBER_ROLE_SMOKE_GUIDE_V22_8_46.md`에 따라 승인대기 참여자를 관리자로 저장합니다.

## 중단 기준

- SQL이 `unexpected existing role values`, `unexpected role constraint`, `unsupported role type`을 보고하면 반복 실행하지 않습니다.
- `lock timeout`이면 데이터 변경 없이 transaction이 취소됩니다. 이용이 적은 시간에 한 번만 다시 시도합니다.
- 마지막 결과가 `readiness_ok=false`면 Worker를 V22.8.46으로 올리지 말고 결과 화면을 전달합니다.

환경변수·Secret·Kakao Developers·OpenBuilder 변경은 없습니다. 기존 V22.6.8·V22.7.0·V22.7.1 SQL은 재실행하지 않습니다.
