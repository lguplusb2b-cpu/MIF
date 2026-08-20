import { describe, expect, it } from "vitest";
import { createPreviewMifData } from "./domain";
import {
  deduplicateCategories,
  moveCategory,
  orderedAdminCategories,
  orderedProductCategories,
  reorderCategories,
  removeCategory,
  saveCategory,
} from "./category-workflows";

describe("카테고리 관리 워크플로", () => {
  it("활성 카테고리를 노출 순서대로 상품 화면에 제공한다", () => {
    const data = createPreviewMifData();
    const categories = orderedProductCategories([
      ...data.categories,
      { id: "hidden", name: "숨김", icon: "🙈", sortOrder: 0, isActive: false },
    ]);
    expect(categories.map((item) => item.name)).toEqual([
      "신선식품",
      "가공식품",
      "소모품",
    ]);
  });

  it("전체상품 합성 항목을 제외하고 실제 카테고리는 ID·이름별로 한 번만 노출한다", () => {
    const categories = deduplicateCategories([
      { id: "ALL", name: "전체상품", icon: "", sortOrder: 0, isActive: true },
      { id: "cat-1", name: "양념육", icon: "🥩", sortOrder: 1, isActive: true },
      { id: "cat-1", name: "다른 이름", icon: "", sortOrder: 2, isActive: true },
      { id: "cat-2", name: " 양념육 ", icon: "", sortOrder: 3, isActive: true },
      { id: "cat-3", name: "포장육", icon: "", sortOrder: 4, isActive: true },
    ]);
    expect(categories.map((item) => item.id)).toEqual(["cat-1", "cat-3"]);
    expect(orderedAdminCategories([
      ...categories,
      { id: "hidden", name: "숨김", icon: "", sortOrder: 5, isActive: false },
    ]).map((item) => item.id)).toEqual(["cat-1", "cat-3", "hidden"]);
  });

  it("카테고리 이름 수정은 연결된 상품의 분류명에도 즉시 반영한다", () => {
    const data = createPreviewMifData();
    const next = saveCategory(data, {
      ...data.categories[0],
      name: "친환경 신선식품",
    });
    expect(next.products.find((item) => item.categoryId === "preview-cat-fresh")?.categoryName).toBe(
      "친환경 신선식품",
    );
  });

  it("카테고리 삭제는 연결 상품을 미분류로 안전하게 전환한다", () => {
    const data = createPreviewMifData();
    const next = removeCategory(data, "preview-cat-pack");
    const product = next.products.find((item) => item.id === "preview-prd-rice");
    expect(product?.categoryId).toBeUndefined();
    expect(product?.categoryName).toBe("미분류");
  });

  it("중복 카테고리명은 저장하지 않는다", () => {
    const data = createPreviewMifData();
    expect(() =>
      saveCategory(data, {
        id: "new-category",
        name: "신선식품",
        icon: "🥬",
        sortOrder: 4,
        isActive: true,
      }),
    ).toThrow("같은 이름의 카테고리가 이미 있습니다.");
  });

  it("드래그 재배치 순서를 상품 필터 노출 순서로 저장한다", () => {
    const data = createPreviewMifData();
    const next = reorderCategories(data, [
      "preview-cat-supply",
      "preview-cat-fresh",
      "preview-cat-pack",
    ]);
    expect(orderedProductCategories(next.categories).map((item) => item.id)).toEqual([
      "preview-cat-supply",
      "preview-cat-fresh",
      "preview-cat-pack",
    ]);
  });

  it("위·아래 이동은 경계에서 유지되고 이동한 항목의 노출 순서를 갱신한다", () => {
    const data = createPreviewMifData();
    const moved = moveCategory(data, "preview-cat-pack", "up");
    expect(moved.categories.map((item) => item.id)).toEqual([
      "preview-cat-pack",
      "preview-cat-fresh",
      "preview-cat-supply",
    ]);
    expect(moveCategory(moved, "preview-cat-pack", "up")).toEqual(moved);
  });
});
