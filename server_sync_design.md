# MIF 서버 연동(다중 사용자·다중 기기) 설계 기준

작성일: 2026-08-19 (Asia/Seoul)

## 현재 구조 요약

| 구분 | 현황 |
| --- | --- |
| 서버 라우트 | `server/index.ts` 452줄, Express 라우트 47개 (`/api/products`, `/api/categories`, `/api/orders`, `/api/addresses`, `/api/bank-accounts`, `/api/notices`, `/api/qa-posts`, `/api/notifications`, `/api/orders/export`, `/api/uploads/product-image` 등) |
| 앱 API 클라이언트 | `src/api.ts` 55줄, 호출 8개(`listProducts`, `createProduct`, `login`, `listManagedUsers`, `updateManagedUserRole`, `listNotifications`, `markNotificationRead`, `registerPushToken`) |
| 앱 데이터 원본 | `App.tsx`의 `data: MifData` 단일 상태 + `persist()` → AsyncStorage 단일 키(`mif_order_talk_workspace_v1`) |
| 세션 | `session` in-memory 상태만 존재. 앱 재실행 시 소멸 |
| 관리자 인증 | 서버는 요청마다 `actorLoginId` + `actorPassword` 검증(`requireAdmin`) |

## 서버 응답 필드 대조 (앱 도메인 ↔ 서버)

| 리소스 | 서버 필드 | 앱 도메인 차이 |
| --- | --- | --- |
| products | `categoryId`, `categoryName`, `spec`, `unit`, `basePrice`, `minOrderQty`, `stockStatus`, `imageKey`, `description`, `detailImageKeys`, `marketingBadges`, `createdAt`, `updatedAt` | 앱은 `imageUri`, `detailImageUris`, `badges`, `isActive`, `storageType` 사용 → 매핑 필요 |
| categories | `id`, `name`, `sortOrder`, `createdAt` | 앱은 `icon`, `isActive` 추가 보유 → 기본값 매핑 |
| orders | `orderNumber`, `status`, `totalAmount`, `deliveryMethod`, `courierCompany`, `trackingNumber`, `createdAt` (목록에 items 없음) | 앱은 `items`, `address`, `companyName`, `desiredDeliveryAt`, `paymentBankAccountId` 필요 → 서버 목록 응답 확장 필요 |
| addresses | `label`, `recipient`, `phone`, `postalCode`, `address`, `addressDetail`, `isDefault` | `companyId` 쿼리 필수(uuid) |
| bank-accounts | `bankName`, `accountNumber`, `accountHolder`, `isActive` | 일치 |
| notices | `title`, `content`, `isVisible`, `startDate`, `endDate`, `createdAt` | GET은 활성 공지만 반환 → 관리자용 전체 목록 필요 |
| qa-posts | `companyId`, `authorId`, `authorName`, `title`, `content`, `isPrivate`, `isAnswered`, `imageKeys` | 앱은 `comments` 내포 → 댓글 포함 응답 필요 |
| notifications | `title`, `body`, `type`, `recipientRole`, `data`, `isRead`, `createdAt` | 일치 |

## 다중 기기 지원을 막고 있는 요인

1. `EXPO_PUBLIC_MIF_API_URL`이 없으면 전체가 로컬 모드로 동작한다.
2. 서버 주소가 있어도 상품 조회·생성 외에는 로컬 상태만 갱신한다.
3. 세션이 메모리에만 있어 재실행 시 매번 로그인해야 하고, 서버 요청에 사용할 자격 증명이 유지되지 않는다.
4. 주문 목록 응답에 품목·배송지·거래처명이 없어 앱 주문 화면을 서버 데이터만으로 렌더링할 수 없다.
5. 관리자 API가 요청마다 평문 비밀번호를 요구해, 앱이 비밀번호를 보관해야 하는 구조다.

## 채택 설계

1. **서버 세션 토큰 도입**: `POST /api/auth/login`이 세션 토큰을 발급하고, 서버는 `Authorization: Bearer` 로 사용자·역할을 판별한다. 관리자 라우트는 토큰 기반 `requireAdminSession`으로 전환하고, 기존 `actorLoginId`/`actorPassword` 경로는 하위 호환으로 유지한다.
2. **동기화 스냅샷 API**: `GET /api/sync/snapshot`이 역할·소속 기준으로 상품·카테고리·주문(품목 포함)·배송지·결제계좌·공지·Q&A·알림·심사 목록을 한 번에 반환한다. 앱은 로그인 직후와 주기적으로 이 스냅샷을 받아 공용 데이터를 덮어쓴다.
3. **쓰기 경로 서버 우선**: 상품·카테고리·주문·배송지·계좌·공지·Q&A·문의·가입신청 쓰기는 서버 API를 먼저 호출하고, 성공 시 스냅샷을 다시 받아 상태를 갱신한다.
4. **오프라인 대체**: 서버 미설정 또는 요청 실패 시 기존 로컬 처리로 자동 대체하고, 화면에 연결 상태를 표시한다.
5. **세션 유지**: 발급된 토큰과 사용자 정보를 AsyncStorage에 저장해 재실행 시 자동 로그인하고, 401 응답 시 토큰을 폐기해 로그인 화면으로 되돌린다.

## 구현 진행 기록

| 단계 | 상태 |
| --- | --- |
| `mif_sessions` 테이블과 토큰 발급·조회·폐기 라우트 | 완료 (`/api/auth/login`, `/api/auth/session`, `/api/auth/logout`) |
| `GET /api/sync/snapshot` 역할별 공용 데이터 통합 응답 | 완료 (주문 품목·Q&A 댓글 포함) |
| 관리자 라우트 세션 토큰 인증 전환 (`resolveAdmin`) | 완료, 기존 자격 증명 방식 하위 호환 유지 |
| 상품·카테고리·계좌·공지 쓰기 관리자 권한 강제 | 완료 |
| 주문 생성 서버 측 관리자 차단·활성 계좌 검증·거래처 스코프 | 완료 |
| 배송지·주문·Q&A 소유권 검증(다중 거래처 격리) | 완료 |
| 앱 API 클라이언트 토큰 주입·401 처리·오류 상태 코드 | 완료 (`src/api.ts`) |
| 서버 스냅샷 → 앱 도메인 매핑·병합 규칙 | 완료 (`src/sync-workflows.ts`) |
| 세션 토큰 영속화·자동 로그인 | 완료 (`src/storage.ts`, `App.tsx` bootstrap) |
| 20초 주기 스냅샷 폴링(다중 기기 반영) | 완료 |
| 주문 생성·상태 변경·상품·배송지·계좌·카테고리 서버 우선 쓰기 | 완료 |

## P1 항목 진행 현황 (2026-08-19)

| P1 항목 | 상태 |
| --- | --- |
| 서버 API 연동 전환(상품·주문·배송지·계좌·공지·Q&A) | 완료 |
| 자동 로그인(세션 유지) | 완료 (`loadSession` → `/api/auth/session` 검증) |
| 로그인 후 비밀번호 변경 화면 | 진행 필요 (ProfilePage L3192, `onPassword`는 현재 재설정 요청 시트) |
| 송장 번호·택배사 입력 UI, 배송조회 진입 | 완료 (OrderSheet 배송 정보 입력 + Linking 배송조회) |
| 용달 기사 연락처 전화 연결 | 완료 (`tel:` Linking) |
| 관리자 주문 CSV 내보내기 | 진행 필요 (`GET /api/orders/export`) |
| 상품 이미지 S3 업로드 연결 | 진행 필요 (`POST /api/uploads/product-image`) |
| 알림 딥링크 이동 | 완료 (order/notice/qa/onboarding 분기) |
| 알림 삭제·보관 정책 | 완료 (개별 삭제 + 읽은 알림 정리) |
| 관리자 상품 상세 보기 경로 | 완료 (상품 수정 ↔ 거래처 화면 보기 토글) |

### 남은 작업 메모
- 비밀번호 변경: 서버에 `PATCH /api/auth/password` 없음 → 라우트 추가 필요(현재 비밀번호 확인 후 해시 갱신), 앱은 `passwordChange` 시트 신설.
- CSV 내보내기: 관리자 주문 화면(OrdersPage, isAdmin)에서 `Linking.openURL(`${API}/api/orders/export?...`)` 또는 fetch 후 공유.
- 이미지 업로드: ProductSheet `pickMainImage`/`pickDetailImages` 후 multipart 업로드하여 반환 key 사용.

## 다중 기기 검증 환경 (2026-08-19)

- 로컬 PostgreSQL 16 설치 후 `mif` DB/`mif` 사용자 생성, `db/schema.sql` 적용 완료.
- 서버 실행: `DATABASE_URL="postgres://mif:mifpass@127.0.0.1:5432/mif" PORT=4000 setsid nohup npx tsx server/index.ts >/tmp/mif-server.log 2>&1 &`
- 테스트 계정 시드: `DATABASE_URL=... npx tsx server/seed-test-accounts.ts` (mif/@mif, admin/admin1234)
- 검증 스크립트: `node scripts/verify-multi-device.mjs` (16개 시나리오)

### 1차 결과 (10/16 통과)

통과: 기기별 세션 분리, 세션 확인, 잘못된 토큰 401, 관리자 카테고리·상품 등록, 거래처 스냅샷 즉시 반영,
거래처 상품 등록 403, 거래처 주문 상태변경 403, 로그아웃 토큰 무효화, 다른 기기 세션 유지.

실패: 거래처 배송지 등록이 400(`companyId` 필수)으로 거부됨. `addressInput`을 optional로 수정했지만
실행 중 서버가 이전 모듈을 사용하는 것으로 보이며, 배송지 실패로 주문 생성 이후 시나리오가 연쇄 실패했다.

### 다음 조치
1. 서버를 완전히 종료·재기동한 뒤 `/api/addresses` 400 재확인 (tsx 모듈 캐시 확인).
2. 주문 생성 전 활성 결제 계좌 시드 필요 (`mif_bank_accounts`) — 없으면 서버가 409로 차단한다.
