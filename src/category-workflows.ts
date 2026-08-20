import type { Category, MifData } from "./domain";

function categoryNameKey(name: string) {
  return name.trim().toLocaleLowerCase("ko");
}

function isSyntheticAllCategory(category: Category) {
  return category.id.trim().toLocaleLowerCase("ko") === "all" || categoryNameKey(category.name) === "전체상품";
}

/** 카테고리는 노출 순서대로 정렬하고, 합성 전체상품·ID·이름 중복을 제거한다. */
export function deduplicateCategories(
  categories: Category[],
  options: { includeInactive?: boolean } = {},
) {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  return [...categories]
    .filter((category) => options.includeInactive || category.isActive)
    .filter((category) => !isSyntheticAllCategory(category))
    .sort(
      (left, right) =>
        Number(right.isActive) - Number(left.isActive) ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name, "ko"),
    )
    .filter((category) => {
      const idKey = category.id.trim();
      const nameKey = categoryNameKey(category.name);
      if (!idKey || !nameKey || seenIds.has(idKey) || seenNames.has(nameKey)) return false;
      seenIds.add(idKey);
      seenNames.add(nameKey);
      return true;
    });
}

export function orderedProductCategories(categories: Category[]) {
  return deduplicateCategories(categories);
}

/** 관리자 카테고리 관리 화면은 비활성 항목을 포함하되, 중복 항목은 한 번만 표시한다. */
export function orderedAdminCategories(categories: Category[]) {
  return deduplicateCategories(categories, { includeInactive: true });
}

export function reorderCategories(
  data: MifData,
  orderedCategoryIds: string[],
): MifData {
  const byId = new Map(data.categories.map((category) => [category.id, category]));
  const ordered = orderedCategoryIds
    .map((id) => byId.get(id))
    .filter((category): category is Category => Boolean(category));
  const remaining = data.categories.filter(
    (category) => !orderedCategoryIds.includes(category.id),
  );
  return {
    ...data,
    categories: [...ordered, ...remaining].map((category, index) => ({
      ...category,
      sortOrder: index + 1,
    })),
  };
}

export function moveCategory(
  data: MifData,
  categoryId: string,
  direction: "up" | "down",
): MifData {
  const ordered = [...data.categories].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko"),
  );
  const currentIndex = ordered.findIndex((category) => category.id === categoryId);
  const targetIndex = currentIndex + (direction === "up" ? -1 : 1);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return data;
  [ordered[currentIndex], ordered[targetIndex]] = [
    ordered[targetIndex],
    ordered[currentIndex],
  ];
  return reorderCategories(data, ordered.map((category) => category.id));
}

export function saveCategory(data: MifData, category: Category): MifData {
  const normalizedName = category.name.trim();
  if (!normalizedName) throw new Error("카테고리명을 입력해 주세요.");
  const duplicate = data.categories.some(
    (item) =>
      item.id !== category.id &&
      item.name.trim().toLocaleLowerCase("ko") === normalizedName.toLocaleLowerCase("ko"),
  );
  if (duplicate) throw new Error("같은 이름의 카테고리가 이미 있습니다.");

  const normalized = {
    ...category,
    name: normalizedName,
    icon: category.icon.trim() || "📦",
    sortOrder: Math.max(1, Math.floor(category.sortOrder || 1)),
  };
  const exists = data.categories.some((item) => item.id === normalized.id);
  return {
    ...data,
    categories: exists
      ? data.categories.map((item) =>
          item.id === normalized.id ? normalized : item,
        )
      : [...data.categories, normalized],
    products: data.products.map((product) =>
      product.categoryId === normalized.id
        ? { ...product, categoryName: normalized.name, updatedAt: new Date().toISOString() }
        : product,
    ),
  };
}

export function removeCategory(data: MifData, categoryId: string): MifData {
  return {
    ...data,
    categories: data.categories.filter((category) => category.id !== categoryId),
    products: data.products.map((product) =>
      product.categoryId === categoryId
        ? {
            ...product,
            categoryId: undefined,
            categoryName: "미분류",
            updatedAt: new Date().toISOString(),
          }
        : product,
    ),
  };
}
