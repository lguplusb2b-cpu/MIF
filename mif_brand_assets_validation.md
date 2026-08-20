# MIF 앱 아이콘·시작 로딩 화면 자산 검증 기록

| 자산 | 파일 | 규격 | 적용 목적 | 확인 결과 |
| --- | --- | --- | --- | --- |
| 앱 아이콘 | `assets/mif-icon.png` | 1024 × 1024 RGBA | iOS·Android 기본 앱 아이콘 | 첨부한 MIF 로고의 흰 배경과 버건디 워드마크를 그대로 유지했다. |
| Android 전경 아이콘 | `assets/mif-android-foreground.png` | 432 × 432 RGBA | Android 적응형 아이콘 전경 | 중앙에 MIF 워드마크가 배치돼 원형·둥근 사각형 마스크에서도 식별 가능하다. |
| Android 배경 아이콘 | `assets/mif-android-background.png` | 432 × 432 RGB | Android 적응형 아이콘 배경 | 로고 원본과 일치하는 흰색 배경이다. |
| 시작 로딩 로고 | `assets/mif-splash-icon.png` | 1024 × 1024 RGBA | iOS·Android 시작 화면 | 중앙 MIF 워드마크가 흰색 배경에서 충분한 여백과 대비를 가진다. |

Expo 공개 설정 검사에서 기본 아이콘, Android 적응형 아이콘, `expo-splash-screen` 플러그인이 모두 새 MIF 자산을 가리키는 것을 확인했다. TypeScript 검사와 단위 테스트 62건도 통과했다.
