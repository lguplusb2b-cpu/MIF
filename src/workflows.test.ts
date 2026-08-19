import { describe, expect, it } from "vitest";
import { addToCart, advanceOrder, canChooseDesiredDeliveryAt, cartAmount, createMifOrder, filterOrders, resolveDesiredDeliveryAt, setCartQuantity, validateCartCheckout } from "./workflows";
import type { Address, Product } from "./domain";

const product: Product = { id: "p1", name: "MIF 상품", categoryName: "식품", spec: "1kg", unit: "개", basePrice: 1000, minOrderQty: 2, stockStatus: "in_stock", description: "", detailImageUris: [], badges: [], createdAt: "2026-08-19T00:00:00.000Z" };
const address: Address = { id: "a1", label: "본사", recipient: "담당자", phone: "010-0000-0000", postalCode: "", address: "서울시", addressDetail: "", isDefault: true };

describe("MIF 발주 워크플로", () => {
  it("동일 상품을 합산하고 수량·금액을 계산한다", () => {
    const once = addToCart([], product);
    const twice = addToCart(once, product);
    expect(twice[0].quantity).toBe(4);
    expect(cartAmount(twice)).toBe(4000);
    expect(setCartQuantity(twice, "p1", 0)[0].quantity).toBe(2);
  });

  it("배송지 스냅샷으로 주문을 생성하고 정상 상태만 전이한다", () => {
    const order = createMifOrder({ orders: [], cart: addToCart([], product), address, deliveryMethod: "courier" });
    expect(order.status).toBe("RECEIVED");
    expect(order.addressSnapshot?.recipient).toBe("담당자");
    expect(advanceOrder(order).status).toBe("PAID");
    expect(advanceOrder(order, "CANCELED").status).toBe("CANCELED");
  });

  it("기간·상태·거래처 기준으로 주문을 필터링한다", () => {
    const first = createMifOrder({ orders: [], cart: addToCart([], product), address, deliveryMethod: "courier", companyName: "MIF 거래처" });
    const second = { ...first, id: "ord_2", status: "PAID" as const, createdAt: "2026-08-18T00:00:00.000Z" };
    expect(filterOrders([first, second], { status: "PAID" })).toEqual([second]);
    expect(filterOrders([first, second], { companyName: "MIF" })).toHaveLength(2);
  });

  it("기간 조회에서 날짜·시간 범위를 적용하고 날짜만 입력하면 하루 전체를 조회한다", () => {
    const morning = { ...createMifOrder({ orders: [], cart: addToCart([], product), address, deliveryMethod: "courier" }), id: "ord_morning", createdAt: "2026-08-19T09:00:00.000Z" };
    const afternoon = { ...morning, id: "ord_afternoon", createdAt: "2026-08-19T15:00:00.000Z" };
    expect(filterOrders([morning, afternoon], { from: "2026-08-19T12:00:00.000Z" })).toEqual([afternoon]);
    expect(filterOrders([morning, afternoon], { to: "2026-08-19" })).toEqual([morning, afternoon]);
  });

  it("택배는 희망일을 저장하지 않고 용달·픽업은 날짜와 시간을 저장한다", () => {
    expect(canChooseDesiredDeliveryAt("courier")).toBe(false);
    expect(resolveDesiredDeliveryAt("courier", "2026-08-20", "10:30")).toBeUndefined();
    expect(resolveDesiredDeliveryAt("truck", "2026-08-20", "10:30")).toBe("2026-08-20T10:30:00");
    expect(resolveDesiredDeliveryAt("pickup", "2026-08-20", "09:00")).toBe("2026-08-20T09:00:00");
  });

  it("장바구니 결제 전에 배송지·배송 방식·최소 수량을 검증한다", () => {
    expect(validateCartCheckout({ cart: [], address, method: "courier" })).toBe("장바구니가 비어있습니다.");
    expect(validateCartCheckout({ cart: addToCart([], product), method: "courier" })).toBe("배송지를 선택해 주세요.");
    expect(validateCartCheckout({ cart: addToCart([], product), address, method: null })).toBe("배송 방법을 선택해 주세요.");
    expect(validateCartCheckout({ cart: [{ ...product, quantity: 1 }], address, method: "truck" })).toBe("MIF 상품의 최소 주문 수량은 2개입니다.");
  });
});
