import { describe, expect, it } from "vitest";
import { createPreviewMifData, makeId, type Product } from "./domain";
import { getProductSaveError, saveProduct } from "./product-workflows";

const createProduct = (): Product => ({
  id: makeId("prd"),
  name: "  검증 냉장 두부  ",
  categoryId: "preview-cat-fresh",
  categoryName: "",
  spec: " 300g × 10 ",
  unit: " 박스 ",
  basePrice: 12800,
  minOrderQty: 2,
  stockStatus: "in_stock",
  storageType: "refrigerated",
  description: " 검증용 상품입니다. ",
  imageUri: "file://main.jpg",
  detailImageUris: ["file://detail-1.jpg"],
  badges: ["BEST"],
  createdAt: "2026-08-19T00:00:00.000Z",
});

describe("상품 등록 업무 규칙", () => {
  it("필수 항목과 가격·최소 주문 수량을 검증한다", () => {
    const data = createPreviewMifData();
    expect(getProductSaveError({ ...createProduct(), name: "" }, data.categories)).toBe(
      "상품명을 입력해 주세요.",
    );
    expect(getProductSaveError({ ...createProduct(), basePrice: 0 }, data.categories)).toBe(
      "단가는 0원보다 큰 숫자로 입력해 주세요.",
    );
    expect(getProductSaveError({ ...createProduct(), minOrderQty: 1.5 }, data.categories)).toBe(
      "최소 주문 수량은 1개 이상의 정수여야 합니다.",
    );
  });

  it("저장한 상품은 활성 카테고리명·재고·상세 이미지를 보존한다", () => {
    const data = createPreviewMifData();
    const next = saveProduct(data, createProduct(), data.categories);
    const saved = next.products[0];
    expect(saved.categoryName).toBe("신선식품");
    expect(saved.name).toBe("검증 냉장 두부");
    expect(saved.stockStatus).toBe("in_stock");
    expect(saved.storageType).toBe("refrigerated");
    expect(saved.detailImageUris).toEqual(["file://detail-1.jpg"]);
  });
});
