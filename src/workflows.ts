import { makeId, nextOrderStatus, type Address, type CartItem, type DeliveryMethod, type Order, type OrderStatus, type Product } from "./domain";

export type QuickOrderRange = "today" | "last7Days" | "thisMonth";

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function quickOrderRange(range: QuickOrderRange, currentDate = new Date()) {
  const today = new Date(currentDate);
  today.setHours(0, 0, 0, 0);
  if (range === "today") {
    const value = localDateValue(today);
    return { from: `${value}T00:00:00`, to: `${value}T23:59:59` };
  }
  if (range === "last7Days") {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return {
      from: `${localDateValue(from)}T00:00:00`,
      to: `${localDateValue(today)}T23:59:59`,
    };
  }
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    from: `${localDateValue(firstDay)}T00:00:00`,
    to: `${localDateValue(lastDay)}T23:59:59`,
  };
}

export function addToCart(items: CartItem[], product: Product): CartItem[] {
  const existing = items.find((item) => item.id === product.id);
  if (existing) return items.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + product.minOrderQty } : item);
  return [...items, { ...product, quantity: product.minOrderQty }];
}

export function setCartQuantity(items: CartItem[], productId: string, quantity: number): CartItem[] {
  return items.map((item) => item.id !== productId ? item : { ...item, quantity: Math.max(item.minOrderQty, quantity) });
}

export function reconcileCartWithProducts(items: CartItem[], products: Product[]): CartItem[] {
  return items.map((item) => {
    const latest = products.find((product) => product.id === item.id);
    if (!latest) return { ...item, stockStatus: "out_of_stock" };
    return {
      ...latest,
      quantity: Math.max(item.quantity, latest.minOrderQty),
    };
  });
}

export function cartAmount(items: CartItem[]) { return items.reduce((sum, item) => sum + item.basePrice * item.quantity, 0); }

export function canChooseDesiredDeliveryAt(method: DeliveryMethod | null) { return method !== "courier"; }

export function resolveDesiredDeliveryAt(method: DeliveryMethod, date: string, time = "09:00") {
  if (method === "courier" || !date) return undefined;
  return `${date}T${time || "09:00"}:00`;
}

export function validateCartCheckout(input: { cart: CartItem[]; address?: Address; method: DeliveryMethod | null; bankAccountId?: string }) {
  if (!input.cart.length) return "장바구니가 비어있습니다.";
  const unavailable = input.cart.find((item) => item.stockStatus === "out_of_stock");
  if (unavailable) return `${unavailable.name}은(는) 품절되어 주문할 수 없습니다.`;
  if (!input.address) return "배송지를 선택해 주세요.";
  if (!input.method) return "배송 방법을 선택해 주세요.";
  const invalid = input.cart.find((item) => item.quantity < item.minOrderQty);
  if (invalid) return `${invalid.name}의 최소 주문 수량은 ${invalid.minOrderQty}개입니다.`;
  if (!input.bankAccountId) return "결제 계좌가 등록되지 않았습니다. 관리자에게 결제 계좌 등록을 요청해 주세요.";
  return undefined;
}

export function createMifOrder(input: { orders: Order[]; cart: CartItem[]; address: Address; deliveryMethod: Order["deliveryMethod"]; desiredDeliveryAt?: string; bankAccountId?: string; note?: string; companyName?: string }): Order {
  const checkoutError = validateCartCheckout({
    cart: input.cart,
    address: input.address,
    method: input.deliveryMethod,
    bankAccountId: input.bankAccountId,
  });
  if (checkoutError) throw new Error(checkoutError);
  const sequence = String(input.orders.length + 1).padStart(4, "0");
  return {
    id: makeId("ord"), orderNumber: `MIF-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${sequence}`,
    status: "RECEIVED", totalAmount: cartAmount(input.cart), createdAt: new Date().toISOString(), companyName: input.companyName,
    deliveryMethod: input.deliveryMethod, desiredDeliveryAt: input.desiredDeliveryAt, paymentBankAccountId: input.bankAccountId, note: input.note,
    address: input.address, addressSnapshot: { ...input.address }, items: input.cart,
  };
}

export function advanceOrder(order: Order, next?: OrderStatus): Order {
  const allowed = next ?? nextOrderStatus(order.status);
  if (!allowed) throw new Error("더 이상 진행할 수 없는 주문 상태입니다.");
  if (next && next !== "CANCELED" && nextOrderStatus(order.status) !== next) throw new Error("허용되지 않은 주문 상태 전환입니다.");
  return { ...order, status: allowed };
}

export function filterOrders(orders: Order[], filters: { status?: OrderStatus | "ALL"; from?: string; to?: string; companyName?: string; query?: string }) {
  const rangeBoundary = (value: string | undefined, edge: "start" | "end") => {
    if (!value) return undefined;
    const normalized = value.includes("T")
      ? value
      : `${value}T${edge === "start" ? "00:00:00" : "23:59:59.999"}`;
    const timestamp = Date.parse(normalized);
    return Number.isNaN(timestamp) ? undefined : timestamp;
  };
  const fromTimestamp = rangeBoundary(filters.from, "start");
  const toTimestamp = rangeBoundary(filters.to, "end");
  const query = filters.query?.trim().toLowerCase();
  return orders.filter((order) => {
    const createdAtTimestamp = Date.parse(order.createdAt);
    const searchable = `${order.companyName ?? ""} ${order.orderNumber}`.toLowerCase();
    return (!filters.status || filters.status === "ALL" || order.status === filters.status)
      && (fromTimestamp === undefined || createdAtTimestamp >= fromTimestamp)
      && (toTimestamp === undefined || createdAtTimestamp <= toTimestamp)
      && (!filters.companyName || (order.companyName ?? "").includes(filters.companyName))
      && (!query || searchable.includes(query));
  });
}
