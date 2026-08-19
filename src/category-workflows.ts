import type { Category, MifData } from "./domain";

export function orderedProductCategories(categories: Category[]) {
  return [...categories]
    .filter((category) => category.isActive)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko"),
    );
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
