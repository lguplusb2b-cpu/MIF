import { describe, expect, it } from "vitest";
import { nextOrderStatus, productStockStatusLabel } from "./domain";

describe("발주 상태 흐름", () => {
  it("접수부터 배송완료까지 순서대로 전환한다", () => {
    expect(nextOrderStatus("RECEIVED")).toBe("PAID");
    expect(nextOrderStatus("PAID")).toBe("CONFIRMED");
    expect(nextOrderStatus("CONFIRMED")).toBe("PREPARING");
    expect(nextOrderStatus("PREPARING")).toBe("SHIPPING");
    expect(nextOrderStatus("SHIPPING")).toBe("DELIVERED");
    expect(nextOrderStatus("DELIVERED")).toBeNull();
  });
});

describe("상품 재고 상태", () => {
  it("재고 상태를 거래처용 배지 문구로 변환한다", () => {
    expect(productStockStatusLabel.in_stock).toBe("재고 있음");
    expect(productStockStatusLabel.out_of_stock).toBe("품절");
  });
});
