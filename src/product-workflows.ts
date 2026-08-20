import type { Category, MifData, Product } from "./domain";

export const ALL_PRODUCT_CATEGORY_ID = "ALL" as const;

export type ProductSortOption = "popular" | "priceHigh" | "priceLow" | "newest";
export type ProductSaveField =
  | "name"
  | "category"
  | "spec"
  | "unit"
  | "basePrice"
  | "minOrderQty"
  | "detailImages";

/** 같은 상품 시트가 열린 동안에는 서버 스냅샷 갱신으로 작성 중인 값을 다시 초기화하지 않는다. */
export function shouldInitializeProductSheet(
  visible: boolean,
  initializedProductKey: string | null,
  productId?: string,
): boolean {
  if (!visible) return false;
  return initializedProductKey !== (productId ?? "new-product");
}

export const PRODUCT_SORT_OPTIONS: ReadonlyArray<{
  id: ProductSortOption;
  label: string;
  description: string;
}> = [
  { id: "popular", label: "인기순", description: "우선 노출 상품과 최신 상품 순" },
  { id: "priceHigh", label: "가격 높은순", description: "판매가가 높은 상품 순" },
  { id: "priceLow", label: "가격 낮은순", description: "판매가가 낮은 상품 순" },
  { id: "newest", label: "최신순", description: "최근 등록·수정 상품 순" },
];

export function getCategoryAfterSearchInput(
  currentCategoryId: string,
  query: string,
): string {
  return query.trim() ? ALL_PRODUCT_CATEGORY_ID : currentCategoryId;
}

export function filterProductsForListing(
  products: Product[],
  input: { categoryId: string; query: string },
): Product[] {
  const normalizedQuery = input.query.trim().toLocaleLowerCase("ko");
  return products.filter((product) => {
    const matchesCategory =
      input.categoryId === ALL_PRODUCT_CATEGORY_ID ||
      product.categoryId === input.categoryId ||
      product.categoryName === input.categoryId;
    const searchableText = `${product.name} ${product.categoryName} ${product.spec}`.toLocaleLowerCase("ko");
    return matchesCategory && (!normalizedQuery || searchableText.includes(normalizedQuery));
  });
}

function newestFirst(left: Product, right: Product) {
  const leftDate = left.updatedAt ?? left.createdAt;
  const rightDate = right.updatedAt ?? right.createdAt;
  return rightDate.localeCompare(leftDate);
}

export function sortProductsForListing(
  products: Product[],
  sortOption: ProductSortOption,
): Product[] {
  return [...products].sort((left, right) => {
    if (sortOption === "priceHigh") return right.basePrice - left.basePrice || newestFirst(left, right);
    if (sortOption === "priceLow") return left.basePrice - right.basePrice || newestFirst(left, right);
    if (sortOption === "newest") return newestFirst(left, right);
    return (right.featuredPriority ?? 0) - (left.featuredPriority ?? 0) || newestFirst(left, right);
  });
}

export function getProductSaveErrors(
  product: Product,
  categories: Category[],
): Partial<Record<ProductSaveField, string>> {
  const errors: Partial<Record<ProductSaveField, string>> = {};
  if (!product.name.trim()) errors.name = "상품명을 입력해 주세요.";
  if (!product.categoryId && !product.categoryName.trim()) errors.category = "카테고리를 선택하거나 입력해 주세요.";
  if (!product.spec.trim()) errors.spec = "규격을 입력해 주세요.";
  if (!product.unit.trim()) errors.unit = "단위를 입력해 주세요.";
  if (!Number.isFinite(product.basePrice) || product.basePrice <= 0)
    errors.basePrice = "단가는 0원보다 큰 숫자로 입력해 주세요.";
  if (!Number.isInteger(product.minOrderQty) || product.minOrderQty < 1)
    errors.minOrderQty = "최소 주문 수량은 1개 이상의 정수여야 합니다.";
  const category = categories.find((item) => item.id === product.categoryId);
  if (product.categoryId && (!category || !category.isActive))
    errors.category = "사용 중인 카테고리를 선택해 주세요.";
  if (product.detailImageUris.length > 5) errors.detailImages = "상세 이미지는 최대 5장까지 등록할 수 있습니다.";
  return errors;
}

export function getProductSaveError(product: Product, categories: Category[]): string | null {
  return Object.values(getProductSaveErrors(product, categories))[0] ?? null;
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
    isActive: product.isActive !== false,
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
