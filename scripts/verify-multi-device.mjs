/**
 * MIF 서버 연동 다중 기기 검증 스크립트.
 * 관리자가 등록한 데이터가 거래처 기기의 스냅샷에 반영되고, 권한 격리가 지켜지는지 확인한다.
 */
const base = process.env.MIF_API_URL || "http://127.0.0.1:4000";
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} · ${name}${detail ? ` · ${detail}` : ""}`);
}

async function call(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

async function login(loginId, password) {
  const { status, payload } = await call("/api/auth/login", {
    method: "POST",
    body: { loginId, password },
  });
  if (status !== 200) throw new Error(`${loginId} 로그인 실패 (${status})`);
  return payload.token;
}

async function main() {
  // 1. 같은 계정을 두 기기에서 로그인해 서로 독립된 세션 토큰을 받는지 확인
  const adminDeviceA = await login("admin", "admin1234");
  const adminDeviceB = await login("admin", "admin1234");
  record(
    "같은 관리자 계정의 두 기기 세션이 각각 발급된다",
    adminDeviceA !== adminDeviceB && adminDeviceA.length === 64,
  );

  const customerDevice = await login("mif", "@mif");
  const sessionCheck = await call("/api/auth/session", { token: customerDevice });
  record(
    "거래처 기기 세션이 서버에서 확인된다",
    sessionCheck.status === 200 && sessionCheck.payload.user.role === "customer",
  );

  // 2. 잘못된 토큰은 거부
  const badToken = await call("/api/sync/snapshot", { token: "invalid-token-value" });
  record("잘못된 토큰의 스냅샷 요청은 401로 거부된다", badToken.status === 401);

  // 3. 관리자 기기 A에서 카테고리·상품 등록
  const category = await call("/api/categories", {
    token: adminDeviceA,
    method: "POST",
    body: { name: `검증카테고리-${Date.now()}`, sortOrder: 1 },
  });
  record("관리자 기기에서 카테고리를 등록한다", category.status === 200 || category.status === 201);

  const productName = `검증상품-${Date.now()}`;
  const product = await call("/api/products", {
    token: adminDeviceA,
    method: "POST",
    body: {
      name: productName,
      categoryId: category.payload?.id,
      categoryName: category.payload?.name,
      spec: "1박스",
      unit: "박스",
      basePrice: 15000,
      minOrderQty: 2,
      stockStatus: "in_stock",
      status: "active",
    },
  });
  record("관리자 기기에서 상품을 등록한다", product.status === 200 || product.status === 201);

  // 4. 다른 기기(거래처)에서 즉시 조회되는지 확인
  const customerSnapshot = await call("/api/sync/snapshot", { token: customerDevice });
  const visible = (customerSnapshot.payload?.products ?? []).some((item) => item.name === productName);
  record("거래처 기기 스냅샷에 관리자 등록 상품이 즉시 나타난다", visible);

  // 5. 거래처는 상품을 만들 수 없어야 함
  const forbidden = await call("/api/products", {
    token: customerDevice,
    method: "POST",
    body: { name: "권한위반상품", spec: "1", unit: "개", basePrice: 1000, minOrderQty: 1 },
  });
  record("거래처 토큰의 상품 등록은 403으로 차단된다", forbidden.status === 403);

  // 6. 거래처 배송지 등록 후 주문 생성
  const address = await call("/api/addresses", {
    token: customerDevice,
    method: "POST",
    body: {
      label: "검증 배송지",
      recipient: "홍길동",
      phone: "010-0000-0000",
      postalCode: "06236",
      address: "서울 강남구 테헤란로",
      addressDetail: "10층",
      isDefault: true,
    },
  });
  record("거래처가 배송지를 등록한다", address.status === 200 || address.status === 201);

  const order = await call("/api/orders", {
    token: customerDevice,
    method: "POST",
    body: {
      deliveryMethod: "courier",
      addressId: address.payload?.id,
      items: [
        {
          productId: product.payload?.id,
          productName,
          spec: "1박스",
          quantity: 2,
          unitPrice: 15000,
        },
      ],
    },
  });
  record(
    "거래처가 주문을 생성한다",
    (order.status === 200 || order.status === 201) && Boolean(order.payload?.orderNumber),
    order.payload?.orderNumber ?? "",
  );

  // 7. 관리자 기기 B에서 주문 확인 및 상태 변경
  const adminSnapshot = await call("/api/sync/snapshot", { token: adminDeviceB });
  const adminSeesOrder = (adminSnapshot.payload?.orders ?? []).some(
    (item) => item.orderNumber === order.payload?.orderNumber,
  );
  record("다른 관리자 기기에서 새 주문을 즉시 확인한다", adminSeesOrder);

  const statusChange = await call(`/api/orders/${order.payload?.id}/status`, {
    token: adminDeviceB,
    method: "PATCH",
    body: { status: "PAID" },
  });
  record("관리자 기기에서 주문 상태를 변경한다", statusChange.status === 200);

  const customerAfter = await call("/api/sync/snapshot", { token: customerDevice });
  const changed = (customerAfter.payload?.orders ?? []).find(
    (item) => item.orderNumber === order.payload?.orderNumber,
  );
  record("거래처 기기에서 변경된 주문 상태가 동기화된다", changed?.status === "PAID", changed?.status ?? "");

  // 8. 거래처는 상태 변경 불가
  const statusForbidden = await call(`/api/orders/${order.payload?.id}/status`, {
    token: customerDevice,
    method: "PATCH",
    body: { status: "DELIVERED" },
  });
  record("거래처 토큰의 주문 상태 변경은 403으로 차단된다", statusForbidden.status === 403);

  // 9. 로그아웃한 토큰은 재사용 불가
  await call("/api/auth/logout", { token: adminDeviceA, method: "POST" });
  const afterLogout = await call("/api/sync/snapshot", { token: adminDeviceA });
  record("로그아웃한 기기의 토큰은 즉시 무효화된다", afterLogout.status === 401);

  const stillValid = await call("/api/sync/snapshot", { token: adminDeviceB });
  record("한 기기 로그아웃이 다른 기기 세션을 끊지 않는다", stillValid.status === 200);

  // 10. 검증 데이터 정리
  await call(`/api/orders/${order.payload?.id}`, { token: adminDeviceB, method: "DELETE" });
  await call(`/api/products/${product.payload?.id}`, { token: adminDeviceB, method: "DELETE" });
  await call(`/api/categories/${category.payload?.id}`, { token: adminDeviceB, method: "DELETE" });
  await call(`/api/addresses/${address.payload?.id}`, { token: customerDevice, method: "DELETE" });

  // 상품 삭제는 서버에서 소프트 삭제(status=inactive)로 처리되므로,
  // 거래처 스냅샷에서 사라지는지로 검증한다.
  const customerCleaned = await call("/api/sync/snapshot", { token: customerDevice });
  record(
    "삭제한 상품은 거래처 스냅샷에서 즉시 제외된다",
    !(customerCleaned.payload?.products ?? []).some((item) => item.name === productName),
  );
  const adminCleaned = await call("/api/sync/snapshot", { token: adminDeviceB });
  record(
    "검증 주문·배송지가 삭제되어 빈 운영 상태로 복구된다",
    (adminCleaned.payload?.orders ?? []).length === 0 &&
      (adminCleaned.payload?.addresses ?? []).length === 0,
  );

  const failed = results.filter((item) => !item.passed);
  console.log(`\n총 ${results.length}건 중 ${results.length - failed.length}건 통과`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
