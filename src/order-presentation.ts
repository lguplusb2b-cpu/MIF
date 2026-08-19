import { deliveryLabel, type DeliveryMethod, type Order } from "./domain";

const deliveryIcon: Record<DeliveryMethod, string> = {
  courier: "📦",
  truck: "🚛",
  pickup: "🏪",
};

export function deliveryMethodPresentation(method: DeliveryMethod) {
  return `${deliveryIcon[method]} ${deliveryLabel[method]}`;
}

export function formatOrderAddress(order: Order) {
  const address = order.addressSnapshot ?? order.address;
  if (!address) return "배송지 정보가 없습니다.";
  const postal = address.postalCode ? `(${address.postalCode}) ` : "";
  return `${postal}${address.address}${address.addressDetail ? ` ${address.addressDetail}` : ""}`.trim();
}

export function formatOrderRecipient(order: Order) {
  const address = order.addressSnapshot ?? order.address;
  if (!address) return "수령인 정보가 없습니다.";
  return `${address.recipient} · ${address.phone}`;
}

export function formatOrderDate(value: string, includeTime = false) {
  const [date, time] = value.replace("T", " ").split(" ");
  const dotted = date.replace(/-/g, ".");
  return includeTime && time ? `${dotted} ${time.slice(0, 5)}` : dotted;
}

export function formatDesiredDelivery(value?: string) {
  return value ? formatOrderDate(value, true) : "희망 배송일 미지정";
}

export function orderShippingInfoLines(order: Order) {
  if (order.deliveryMethod === "courier") {
    return [
      order.courierCompany ? `택배사: ${order.courierCompany}` : "",
      order.trackingNumber ? `송장번호: ${order.trackingNumber}` : "",
    ].filter(Boolean);
  }
  if (order.deliveryMethod === "truck" && order.truckDriverPhone)
    return [`기사 전화: ${order.truckDriverPhone}`];
  if (order.deliveryMethod === "pickup") return ["픽업 장소·시간은 주문 승인 후 안내됩니다."];
  return [];
}
