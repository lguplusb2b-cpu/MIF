/**
 * 서로 다른 거래처 계정이 상대 거래처의 주문·배송지를 볼 수 없는지 검증한다.
 * 사전 조건: 서버 실행 + mif/@mif 계정과 두 번째 거래처 계정이 준비돼 있어야 한다.
 */
const base = process.env.MIF_API_URL || "http://127.0.0.1:4000";
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed });
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
  const { status, payload } = await call("/api/auth/login", { method: "POST", body: { loginId, password } });
  if (status !== 200) throw new Error(`${loginId} 로그인 실패 (${status}) ${JSON.stringify(payload)}`);
  return payload.token;
}

async function main() {
  const admin = await login("admin", "admin1234");
  const companyA = await login(process.env.MIF_TENANT_A || "mif", process.env.MIF_TENANT_A_PW || "@mif");
  const companyB = await login(process.env.MIF_TENANT_B || "mif2", process.env.MIF_TENANT_B_PW || "mif2pass");

  const product = await call("/api/products", {
    token: admin,
    method: "POST",
    body: {
      name: `격리검증상품-${Date.now()}`,
      spec: "1박스",
      unit: "박스",
      basePrice: 10000,
      minOrderQty: 1,
      stockStatus: "in_stock",
      status: "active",
    },
  });

  const addressA = await call("/api/addresses", {
    token: companyA,
    method: "POST",
    body: {
      label: "A 배송지",
      recipient: "A담당",
      phone: "010-1111-1111",
      postalCode: "06236",
      address: "서울 강남구",
      isDefault: true,
    },
  });

  const orderA = await call("/api/orders", {
    token: companyA,
    method: "POST",
    body: {
      deliveryMethod: "courier",
      addressId: addressA.payload?.id,
      items: [{ productId: product.payload?.id, productName: product.payload?.name, quantity: 1, unitPrice: 10000 }],
    },
  });
  record("거래처 A가 주문을 생성한다", orderA.status === 201, orderA.payload?.orderNumber ?? "");

  const snapshotB = await call("/api/sync/snapshot", { token: companyB });
  const sawOrder = (snapshotB.payload?.orders ?? []).some((item) => item.orderNumber === orderA.payload?.orderNumber);
  record("거래처 B 스냅샷에 거래처 A 주문이 노출되지 않는다", !sawOrder);

  const sawAddress = (snapshotB.payload?.addresses ?? []).some((item) => item.id === addressA.payload?.id);
  record("거래처 B 스냅샷에 거래처 A 배송지가 노출되지 않는다", !sawAddress);

  const crossDelete = await call(`/api/orders/${orderA.payload?.id}`, { token: companyB, method: "DELETE" });
  record("거래처 B는 거래처 A 주문을 삭제할 수 없다", crossDelete.status === 403 || crossDelete.status === 404);

  const crossAddressDelete = await call(`/api/addresses/${addressA.payload?.id}`, { token: companyB, method: "DELETE" });
  record(
    "거래처 B는 거래처 A 배송지를 삭제할 수 없다",
    crossAddressDelete.status === 403 || crossAddressDelete.status === 404,
  );

  const sharedProduct = (snapshotB.payload?.products ?? []).some((item) => item.id === product.payload?.id);
  record("상품 카탈로그는 두 거래처 모두에게 공유된다", sharedProduct);

  // 정리
  await call(`/api/orders/${orderA.payload?.id}`, { token: admin, method: "DELETE" });
  await call(`/api/addresses/${addressA.payload?.id}`, { token: companyA, method: "DELETE" });
  await call(`/api/products/${product.payload?.id}`, { token: admin, method: "DELETE" });

  const failed = results.filter((item) => !item.passed);
  console.log(`\n총 ${results.length}건 중 ${results.length - failed.length}건 통과`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
