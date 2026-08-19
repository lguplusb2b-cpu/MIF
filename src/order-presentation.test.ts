import { describe, expect, it } from "vitest";
import type { Order } from "./domain";
import {
  deliveryMethodPresentation,
  formatOrderAddress,
  formatOrderDate,
  orderShippingInfoLines,
} from "./order-presentation";

const courierOrder: Order = {
  id: "order-1",
  orderNumber: "MIF-20260819-0001",
  status: "SHIPPING",
  totalAmount: 24000,
  createdAt: "2026-08-19T10:15:00",
  deliveryMethod: "courier",
  courierCompany: "한진택배",
  trackingNumber: "1234-5678",
  addressSnapshot: {
    id: "address-1",
    label: "매장",
    recipient: "홍길동",
    phone: "010-1234-5678",
    postalCode: "06236",
    address: "서울특별시 강남구 테헤란로 152",
    addressDetail: "3층",
    isDefault: true,
  },
  items: [],
};

describe("order presentation", () => {
  it("shows source-style delivery method and delivery address", () => {
    expect(deliveryMethodPresentation("courier")).toBe("📦 택배");
    expect(formatOrderAddress(courierOrder)).toBe(
      "(06236) 서울특별시 강남구 테헤란로 152 3층",
    );
  });

  it("formats source-style order dates and method-specific shipping info", () => {
    expect(formatOrderDate(courierOrder.createdAt, true)).toBe("2026.08.19 10:15");
    expect(orderShippingInfoLines(courierOrder)).toEqual([
      "택배사: 한진택배",
      "송장번호: 1234-5678",
    ]);
  });
});
