import { describe, expect, it } from "vitest";
import { nextOrderStatus } from "./domain";

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
