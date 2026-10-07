# 백업·복구 운영 절차

상태: 계획을 준비했으며 실제 dump, 외부 보관, 예약 작업 또는 복구 시험은 실행하지 않았습니다. 앱 CSV 내보내기를 서비스 전체 백업으로 취급하지 않습니다.

권장 목표는 금융 데이터 RPO 24시간, 격리 복구 RTO 1일입니다. 초기 운영에서 주 1회만 수행한다면 실제 RPO는 최대 7일이며 24시간 목표를 충족했다고 표시하지 않습니다. 예약 빈도·비공개 저장 위치·보관 기간·비용은 운영자가 결정해야 합니다. 처음에는 일별 7개와 주별 4개를 별도로 보존하는 안을 검토합니다.

Supabase Free의 backup 대책은 정기 export와 외부 보관을 별도로 준비해야 합니다. 유료 플랜의 제공 기능도 현재 콘솔에서 확인합니다. [Supabase 백업 안내](https://supabase.com/docs/guides/platform/backups)

## 승인 후 실행

1. 실제 dump와 외부 저장소 쓰기 승인을 확인하고 저장소 밖의 비공개 작업 디렉터리를 정합니다. 인증과 프로젝트 연결은 그 디렉터리에서 수행하며 비밀번호·접속 URI·dump를 Git·CI 로그·채팅에 노출하지 않습니다.
2. 현재 CLI 버전과 실제 연결 대상을 기록합니다. schema/data/roles를 각각 추출하고 체크섬과 종료 코드를 기록합니다. 아래는 이미 연결한 비공개 작업 디렉터리에서 실행하는 예시이며 이 작업에서는 실행하지 않았습니다.

```powershell
supabase --version
supabase db dump --help
supabase db dump --linked --file schema.sql
supabase db dump --linked --data-only --use-copy --file data.sql
supabase db dump --linked --role-only --file roles.sql
Get-FileHash -LiteralPath schema.sql,data.sql,roles.sql -Algorithm SHA256
```

기본 dump에는 data/custom roles가 포함되지 않으며 managed auth/storage/extension schema는 제외됩니다. 위 세 파일만으로 전체 복구가 완성됐다고 판단하지 않습니다. 사용 중인 managed schema와 Storage 실제 객체의 추가 export 절차를 공식 문서와 운영 metadata로 확인합니다. [CLI dump 문서](https://supabase.com/docs/reference/cli/supabase-db-dump)

3. 파일을 암호화하여 접근 권한을 제한한 오프사이트 위치에 복사하고 원본/사본 체크섬을 대조합니다. DB metadata만으로 Storage 사진·파일 본문을 복구할 수 없습니다. 기존 Storage 객체가 있다면 객체 사본과 inventory도 비공개로 보존합니다.
4. 운영과 연결되지 않은 별도 복구 대상에서 역할·schema·data를 복구합니다. 새 프로젝트의 default privileges가 원래 노출 범위를 넓힐 수 있으므로 RLS/ACL/Data API 자동 노출 OFF를 원본과 대조합니다. 복구 대상 생성·DDL·data restore도 별도 승인된 작업입니다.
5. 사용자/가계부/참여/거래/예산/정기 항목의 행 수와 집계, FK/역할, 주요 RPC 정의·권한과 애플리케이션 읽기/쓰기 smoke를 합성 테스트 계정으로 확인합니다. 원문 금융 행을 공개하지 않습니다. 복구 시간, 실제 최신 복구 시각, 누락 범위와 실패 원인을 기록합니다.

완료 기준은 실제 export + 별도 저장 + 격리 restore 검증입니다. 정책 문서 작성, 비어 있는 backup 화면 또는 schema-only 파일은 완료 증거가 아닙니다. 복구 시험은 최초 1회와 이후 분기마다 수행하는 안을 검토하며 실제 일정과 승인자는 운영 기록에 남깁니다.

## legacy-only 계정 복구

V22.9.30은 FNV 32비트 값으로 로그인 또는 삭제/자격 변경을 인증하지 않습니다. 강한 identity가 이미 있으면 이전 이름·옛 코드로 이를 덮어쓰지도 않습니다. legacy-only 계정은 금융 행과 사용자 ID를 삭제하지 않은 채 복구 대상으로 남습니다.

원래 연결한 카카오 계정이나 새로 발급받은 개인 1회용 웹 코드로 확인할 수 있으면 해당 계정의 5분 증명으로 강한 비밀번호를 설정합니다. 그것도 없는 계정은 기존 관리자 감사·복구 절차로 실제 소유 관계를 확인한 뒤 별도 승인된 연결/병합을 검토합니다. 약한 코드 충돌을 안전한 소유 증명으로 취급하거나 새 계정을 만들어 기존 행을 자동 옮기지 않습니다.
