const apiBase = (process.env.MIF_API_URL ?? "https://mifordtalk-txy54ooe.manus.space/api/trpc/mif").replace(/\/$/, "");
const temporaryPrefixes = ["MIF-CRUD-VERIFY-", "MIF-DELETE-HEADER-DEBUG-"];

async function request(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}

const login = await request("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ loginId: "admin", password: "admin1234" }),
});
const snapshot = await request("/api/sync/snapshot", {
  headers: { Authorization: `Bearer ${login.token}` },
});
const temporaryProducts = snapshot.products.filter(product =>
  temporaryPrefixes.some(prefix => String(product.name ?? "").startsWith(prefix)),
);

for (const product of temporaryProducts) {
  await request(`/api/products/${product.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${login.token}` },
  });
}

console.log(`정리 완료: ${temporaryProducts.length}개 임시 상품 삭제`);
