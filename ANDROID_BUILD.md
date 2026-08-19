# MIF Android 빌드 안내

MIF의 Android 패키지 식별자는 `com.lguplusb2b.mif`이며, 미리보기·사내 배포용 APK와 Google Play 배포용 AAB를 구분해 구성했습니다. 운영 거래처·주문·사업자 문서는 앱 빌드에 포함되지 않습니다.

| 목적 | 실행 명령 | 결과물 |
| --- | --- | --- |
| 내부 테스트·기기 설치 | `pnpm build:apk` | 설치 가능한 APK |
| Google Play 배포 준비 | `pnpm build:aab` | Play Console 업로드용 AAB |

처음 빌드할 때는 Expo 계정 로그인이 필요합니다. 명령 실행 뒤 안내되는 로그인 절차를 완료하고, Android 서명 키 생성 또는 관리를 Expo에 맡길지 선택합니다. 테스트 APK가 완료되면 제공되는 빌드 링크에서 파일을 내려받아 Android 기기에 설치할 수 있습니다.

> Android 기기에서 외부 APK 설치를 허용해야 할 수 있습니다. 배포용 AAB는 기기에 직접 설치하지 않고 Google Play Console에 업로드합니다.
