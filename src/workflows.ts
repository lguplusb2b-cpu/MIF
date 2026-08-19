import { makeId, nextOrderStatus, type Address, type CartItem, type DeliveryMethod, type Order, type OrderStatus, type Product } from "./domain";

export function addToCart(items: CartItem[], product: Product): CartItem[] {
  const existing = items.find((item) => item.id === product.id);
  if (existing) return items.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + product.minOrderQty } : item);
  return [...items, { ...product, quantity: product.minOrderQty }];
}

export function setCartQuantity(items: CartItem[], productId: string, quantity: number): CartItem[] {
  return items.map((item) => item.id !== productId ? item : { ...item, quantity: Math.max(item.minOrderQty, quantity) });
}

export function cartAmount(items: CartItem[]) { return items.reduce((sum, item) => sum + item.basePrice * item.quantity, 0); }

export function canChooseDesiredDeliveryAt(method: DeliveryMethod | null) { return method !== "courier"; }

export function resolveDesiredDeliveryAt(method: DeliveryMethod, date: string, time = "09:00") {
  if (method === "courier" || !date) return undefined;
  return `${date}T${time || "09:00"}:00`;
}

export function validateCartCheckout(input: { cart: CartItem[]; address?: Address; method: DeliveryMethod | null }) {
  if (!input.cart.length) return "장바구니가 비어있습니다.";
  if (!input.address) return "배송지를 선택해 주세요.";
  if (!input.method) return "배송 방법을 선택해 주세요.";
  const invalid = input.cart.find((item) => item.quantity < item.minOrderQty);
  return invalid ? `${invalid.name}의 최소 주문 수량은 ${invalid.minOrderQty}개입니다.` : undefined;
}

export function createMifOrder(input: { orders: Order[]; cart: CartItem[]; address: Address; deliveryMethod: Order["deliveryMethod"]; desiredDeliveryAt?: string; bankAccountId?: string; note?: string; companyName?: string }): Order {
  if (!input.cart.length) throw new Error("장바구니에 상품을 담아 주세요.");
  if (!input.address.address.trim() || !input.address.recipient.trim()) throw new Error("배송지를 선택해 주세요.");
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

export function filterOrders(orders: Order[], filters: { status?: OrderStatus | "ALL"; from?: string; to?: string; companyName?: string }) {
  return orders.filter((order) => {
    const day = order.createdAt.slice(0, 10);
    return (!filters.status || filters.status === "ALL" || order.status === filters.status)
      && (!filters.from || day >= filters.from)
      && (!filters.to || day <= filters.to)
      && (!filters.companyName || (order.companyName ?? "").includes(filters.companyName));
  });
}
