import type { Category, MifData, Product } from "./domain";

export function getProductSaveError(product: Product, categories: Category[]): string | null {
  if (!product.name.trim()) return "상품명을 입력해 주세요.";
  if (!product.categoryId && !product.categoryName.trim()) return "카테고리를 선택하거나 입력해 주세요.";
  if (!product.spec.trim()) return "규격을 입력해 주세요.";
  if (!product.unit.trim()) return "단위를 입력해 주세요.";
  if (!Number.isFinite(product.basePrice) || product.basePrice <= 0)
    return "단가는 0원보다 큰 숫자로 입력해 주세요.";
  if (!Number.isInteger(product.minOrderQty) || product.minOrderQty < 1)
    return "최소 주문 수량은 1개 이상의 정수여야 합니다.";
  const category = categories.find((item) => item.id === product.categoryId);
  if (product.categoryId && (!category || !category.isActive))
    return "사용 중인 카테고리를 선택해 주세요.";
  if (product.detailImageUris.length > 5) return "상세 이미지는 최대 5장까지 등록할 수 있습니다.";
  return null;
}

export function normalizeProductForSave(product: Product, categories: Category[]): Product {
  const category = categories.find((item) => item.id === product.categoryId);
  return {
    ...product,
    name: product.name.trim(),
    categoryId: category?.id,
    categoryName: category?.name ?? (product.categoryName.trim() || "미분류"),
    spec: product.spec.trim(),
    unit: product.unit.trim(),
    basePrice: Math.floor(product.basePrice),
    minOrderQty: Math.max(1, Math.floor(product.minOrderQty)),
    description: product.description.trim(),
    detailImageUris: product.detailImageUris.filter(Boolean).slice(0, 5),
    updatedAt: new Date().toISOString(),
  };
}

export function saveProduct(data: MifData, product: Product, categories: Category[]): MifData {
  const error = getProductSaveError(product, categories);
  if (error) throw new Error(error);
  const normalized = normalizeProductForSave(product, categories);
  const exists = data.products.some((item) => item.id === normalized.id);
  return {
    ...data,
    products: exists
      ? data.products.map((item) => (item.id === normalized.id ? normalized : item))
      : [normalized, ...data.products],
  };
}
