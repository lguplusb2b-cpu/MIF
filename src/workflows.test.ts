import { describe, expect, it } from "vitest";
import { addToCart, advanceOrder, canChooseDesiredDeliveryAt, cartAmount, createMifOrder, filterOrders, quickOrderRange, reconcileCartWithProducts, resolveDesiredDeliveryAt, setCartQuantity, validateCartCheckout } from "./workflows";
import type { Address, Product } from "./domain";

const product: Product = { id: "p1", name: "MIF 상품", categoryName: "식품", spec: "1kg", unit: "개", basePrice: 1000, minOrderQty: 2, stockStatus: "in_stock", description: "", detailImageUris: [], badges: [], createdAt: "2026-08-19T00:00:00.000Z" };
const address: Address = { id: "a1", label: "본사", recipient: "담당자", phone: "010-0000-0000", postalCode: "", address: "서울시", addressDetail: "", isDefault: true };
const bankAccountId = "bank-1";

describe("MIF 발주 워크플로", () => {
  it("동일 상품을 합산하고 수량·금액을 계산한다", () => {
    const once = addToCart([], product);
    const twice = addToCart(once, product);
    expect(twice[0].quantity).toBe(4);
    expect(cartAmount(twice)).toBe(4000);
    expect(setCartQuantity(twice, "p1", 0)[0].quantity).toBe(2);
  });

  it("배송지 스냅샷으로 주문을 생성하고 정상 상태만 전이한다", () => {
    const order = createMifOrder({ orders: [], cart: addToCart([], product), address, deliveryMethod: "courier", bankAccountId });
    expect(order.status).toBe("RECEIVED");
    expect(order.addressSnapshot?.recipient).toBe("담당자");
    expect(advanceOrder(order).status).toBe("PAID");
    expect(advanceOrder(order, "CANCELED").status).toBe("CANCELED");
  });

  it("기간·상태·거래처 기준으로 주문을 필터링한다", () => {
    const first = createMifOrder({ orders: [], cart: addToCart([], product), address, deliveryMethod: "courier", bankAccountId, companyName: "MIF 거래처" });
    const second = { ...first, id: "ord_2", orderNumber: "MIF-20260818-0002", status: "PAID" as const, createdAt: "2026-08-18T00:00:00.000Z" };
    expect(filterOrders([first, second], { status: "PAID" })).toEqual([second]);
    expect(filterOrders([first, second], { companyName: "MIF" })).toHaveLength(2);
    expect(filterOrders([first, second], { query: "거래처", status: "PAID", to: "2026-08-18" })).toEqual([second]);
    expect(filterOrders([first, second], { query: second.orderNumber })).toEqual([second]);
  });

  it("기간 조회에서 날짜·시간 범위를 적용하고 날짜만 입력하면 하루 전체를 조회한다", () => {
    const morning = { ...createMifOrder({ orders: [], cart: addToCart([], product), address, deliveryMethod: "courier", bankAccountId }), id: "ord_morning", createdAt: "2026-08-19T09:00:00.000Z" };
    const afternoon = { ...morning, id: "ord_afternoon", createdAt: "2026-08-19T15:00:00.000Z" };
    expect(filterOrders([morning, afternoon], { from: "2026-08-19T12:00:00.000Z" })).toEqual([afternoon]);
    expect(filterOrders([morning, afternoon], { to: "2026-08-19" })).toEqual([morning, afternoon]);
  });

  it("오늘·최근 7일·이번 달 빠른 기간은 시작과 종료 시간을 함께 만든다", () => {
    const now = new Date(2026, 7, 19, 14, 30, 0);
    expect(quickOrderRange("today", now)).toEqual({ from: "2026-08-19T00:00:00", to: "2026-08-19T23:59:59" });
    expect(quickOrderRange("last7Days", now)).toEqual({ from: "2026-08-13T00:00:00", to: "2026-08-19T23:59:59" });
    expect(quickOrderRange("thisMonth", now)).toEqual({ from: "2026-08-01T00:00:00", to: "2026-08-31T23:59:59" });
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
    expect(validateCartCheckout({ cart: [{ ...product, quantity: 1 }], address, method: "truck", bankAccountId })).toBe("MIF 상품의 최소 주문 수량은 2개입니다.");
    expect(validateCartCheckout({ cart: addToCart([], product), address, method: "courier" })).toContain("결제 계좌");
  });

  it("관리자 상품 변경이 장바구니의 가격·최소 수량·재고 상태에 즉시 반영된다", () => {
    const cart = addToCart([], product);
    const updated = {
      ...product,
      basePrice: 1200,
      minOrderQty: 3,
      stockStatus: "out_of_stock" as const,
    };
    const synced = reconcileCartWithProducts(cart, [updated]);
    expect(synced[0]).toMatchObject({
      basePrice: 1200,
      minOrderQty: 3,
      quantity: 3,
      stockStatus: "out_of_stock",
    });
  });

  it("품절로 변경된 장바구니 상품은 주문 생성을 차단한다", () => {
    const unavailableCart = [{ ...product, stockStatus: "out_of_stock" as const, quantity: 2 }];
    expect(validateCartCheckout({ cart: unavailableCart, address, method: "courier" })).toBe("MIF 상품은(는) 품절되어 주문할 수 없습니다.");
    expect(() => createMifOrder({ orders: [], cart: unavailableCart, address, deliveryMethod: "courier", bankAccountId })).toThrow("품절되어 주문할 수 없습니다.");
  });
});
