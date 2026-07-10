# 카카오 로그인 우선 접속 설정

## 필수

```text
KAKAO_REST_API_KEY=카카오 Developers REST API 키
KAKAO_REDIRECT_URI=${PUBLIC_BASE_URL}/auth/kakao/callback
```

`KAKAO_LOGIN_ENABLED`는 선택입니다. REST API 키가 있으면 기본적으로 카카오 로그인이 켜집니다.

명시적으로 끄고 싶을 때만:

```text
KAKAO_LOGIN_ENABLED=0
```

## 기존 사용자
기존 이름+접속코드 계정으로 먼저 로그인한 뒤 카카오 계정 연동을 하면 기존 가계부 권한을 유지합니다.

## 신규 사용자
카카오로 로그인한 뒤 백업 로그인 화면에서 가계부 아이디/비밀번호를 설정합니다.
