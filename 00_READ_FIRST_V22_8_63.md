# V22.8.63 앱 아이콘 자원 적용 안내

버전: `V22.8.63-APP-ICON-ASSETS`

## 적용 파일

- `src/index.js` 전체 교체
- 신규 SQL 없음
- 환경변수·Secret·Kakao Developers·OpenBuilder 변경 없음

## 배경

브라우저는 링크 태그가 없어도 `/favicon.ico`를 스스로 요청하고, iOS는 홈 화면에
추가할 때 `/apple-touch-icon.png`를 요청합니다. 두 경로가 404여서 모든 화면에
콘솔 404가 남고 홈 화면 아이콘이 비어 있었습니다.

홈 초기 HTML은 기준 픽스처 35KB·실사용 44KB 예산이 있고 남은 여유가
396바이트·354바이트뿐이라, `<link rel="icon">` 마크업을 추가하지 않고
실제 아이콘 파일만 제공합니다.

## 제공하는 경로

| 경로 | 형식 | 크기 |
|---|---|---|
| `/favicon.ico` | ICO 32bpp | 32×32, 모서리 둥근 투명 |
| `/apple-touch-icon.png` | PNG 인덱스 컬러 | 180×180, 모서리까지 채운 정사각형 |
| `/apple-touch-icon-precomposed.png` | 위와 동일 | 구형 iOS 호환 |

아이콘은 기존 브랜드 마크(책등 + 3줄 장부선)를 코드에서 직접 래스터화하며
외부 이미지 파일이나 라이브러리를 추가하지 않습니다. iOS가 홈 화면 아이콘을
스스로 둥글게 마스킹하므로 apple-touch-icon에는 투명 모서리를 두지 않습니다.

## 적용 순서

1. 현재 운영 Worker 전체 소스를 별도 파일로 백업합니다.
2. 이 패키지의 `src/index.js` 전체를 복사해 운영 소스와 교체합니다.
3. 저장 후 배포합니다.
4. 저장소 루트에서 아래 명령을 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\10_VERIFY_AFTER_DEPLOY_V22_8_63.ps1
```

5. 브라우저 탭에 아이콘이 보이는지, 개발자도구 콘솔에 favicon 404가 사라졌는지
   확인합니다.
6. iPhone 사파리에서 `공유 → 홈 화면에 추가` 시 아이콘이 나오는지 확인합니다.

기존 V22.6.8·V22.7.0·V22.7.1·V22.8.46 SQL은 `/ready`가 정상이라면 다시 실행하지 않습니다.
