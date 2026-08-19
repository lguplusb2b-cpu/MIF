# Android 안전 영역 수정 APK 빌드 검증

## 빌드 대상

| 항목 | 값 |
| --- | --- |
| EAS 빌드 ID | `66b666de-2373-4c16-ab1a-3ed1f32bf352` |
| 앱 버전 | `1.0.1` |
| Android version code | `2` |
| 패키지 | `com.lguplusb2b.mif` |
| 소스 커밋 | `baab393` |
| 배포 방식 | 내부 배포 APK (`preview`) |

## 현재 확인

EAS 대시보드에서 버전 `1.0.1 (2)`로 Android 내부 배포 빌드가 실행 중인 것을 확인했다. 환경 준비, 의존성 설치, Expo 구성 읽기, 자격 증명 설정, JavaScript 번들링이 완료됐으며 Android Gradle 패키징이 진행 중이다. `react-native-safe-area-context` 관련 로그는 기존 Android API 사용에 대한 경고이며 현재 빌드 실패 메시지는 없다.

빌드 7~8분 경과 시점에도 Gradle 릴리스 패키징은 정상 진행 중이다. Android 에뮬레이터 ABI용 네이티브 CMake 컴파일과 릴리스 리소스 최적화가 이어지고 있으며, 경고 외 실패·중단 로그는 확인되지 않았다.

## 완료 결과

EAS 빌드가 `FINISHED` 상태로 성공했다. 생성된 설치용 APK는 Android version code `2`를 사용하므로 기존 version code `1` MIF 설치본 위에 업데이트로 설치할 수 있다.

- **APK 다운로드:** https://expo.dev/artifacts/eas/HBimDYHTrQbj3-YLq0WwYeRBhG60aI3GGAC-1j8T2Jk.apk
- **빌드 상세:** https://expo.dev/accounts/greencart7/projects/mif/builds/66b666de-2373-4c16-ab1a-3ed1f32bf352
- **만료 예정:** 2026-11-17
