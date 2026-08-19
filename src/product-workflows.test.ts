import { describe, expect, it } from "vitest";
import { createPreviewMifData, makeId, type Product } from "./domain";
import {
  ALL_PRODUCT_CATEGORY_ID,
  filterProductsForListing,
  getCategoryAfterSearchInput,
  getProductSaveError,
  saveProduct,
  sortProductsForListing,
} from "./product-workflows";

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

describe("상품 검색·카테고리·정렬 업무 규칙", () => {
  const products: Product[] = [
    {
      ...createProduct(),
      id: "fresh-tofu",
      name: "국산 냉장 두부",
      categoryName: "신선식품",
      basePrice: 6200,
      featuredPriority: 3,
      createdAt: "2026-08-10T00:00:00.000Z",
    },
    {
      ...createProduct(),
      id: "frozen-pork",
      name: "냉동 삼겹살",
      categoryId: "preview-cat-frozen",
      categoryName: "냉동식품",
      basePrice: 15800,
      featuredPriority: 1,
      createdAt: "2026-08-19T00:00:00.000Z",
    },
    {
      ...createProduct(),
      id: "fresh-milk",
      name: "무항생제 우유",
      categoryName: "신선식품",
      basePrice: 8900,
      featuredPriority: 0,
      createdAt: "2026-08-15T00:00:00.000Z",
    },
  ];

  it("검색어 입력 시 전체상품으로 전환하고 상품명·규격·카테고리를 검색한다", () => {
    expect(getCategoryAfterSearchInput("preview-cat-fresh", "두부")).toBe(
      ALL_PRODUCT_CATEGORY_ID,
    );
    expect(getCategoryAfterSearchInput("preview-cat-fresh", " ")).toBe("preview-cat-fresh");
    expect(
      filterProductsForListing(products, {
        categoryId: ALL_PRODUCT_CATEGORY_ID,
        query: "냉동식품",
      }).map((product) => product.id),
    ).toEqual(["frozen-pork"]);
    expect(
      filterProductsForListing(products, {
        categoryId: "preview-cat-fresh",
        query: "",
      }).map((product) => product.id),
    ).toEqual(["fresh-tofu", "fresh-milk"]);
  });

  it("인기순·가격 높은순·가격 낮은순·최신순을 각각 적용한다", () => {
    expect(sortProductsForListing(products, "popular").map((product) => product.id)).toEqual([
      "fresh-tofu",
      "frozen-pork",
      "fresh-milk",
    ]);
    expect(sortProductsForListing(products, "priceHigh").map((product) => product.id)).toEqual([
      "frozen-pork",
      "fresh-milk",
      "fresh-tofu",
    ]);
    expect(sortProductsForListing(products, "priceLow").map((product) => product.id)).toEqual([
      "fresh-tofu",
      "fresh-milk",
      "frozen-pork",
    ]);
    expect(sortProductsForListing(products, "newest").map((product) => product.id)).toEqual([
      "frozen-pork",
      "fresh-milk",
      "fresh-tofu",
    ]);
  });
});
