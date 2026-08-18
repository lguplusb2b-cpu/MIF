export const ORDER_STATUSES = ["RECEIVED", "PAID", "CONFIRMED", "PREPARING", "SHIPPING", "DELIVERED", "CANCELED"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusLabel: Record<OrderStatus, string> = {
  RECEIVED: "접수",
  PAID: "결제확인",
  CONFIRMED: "주문확정",
  PREPARING: "상품준비",
  SHIPPING: "배송중",
  DELIVERED: "배송완료",
  CANCELED: "취소",
};

export const nextOrderStatus = (status: OrderStatus): OrderStatus | null => {
  const flow: Partial<Record<OrderStatus, OrderStatus>> = {
    RECEIVED: "PAID",
    PAID: "CONFIRMED",
    CONFIRMED: "PREPARING",
    PREPARING: "SHIPPING",
    SHIPPING: "DELIVERED",
  };
  return flow[status] ?? null;
};

export type Product = {
  id: string;
  name: string;
  categoryName: string;
  spec: string;
  unit: string;
  basePrice: number;
  minOrderQty: number;
  stockStatus: "in_stock" | "out_of_stock";
  createdAt: string;
};

export type CartItem = Product & { quantity: number };

export type Address = {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  postalCode: string;
  address: string;
  addressDetail: string;
  isDefault: boolean;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
  deliveryMethod: "courier" | "truck" | "pickup";
  trackingNumber?: string;
  courierCompany?: string;
  address?: Address;
  items: CartItem[];
};

export type SignupApplication = {
  id: string;
  companyName: string;
  businessNumber: string;
  contactName: string;
  phone: string;
  requestedLoginId: string;
  documentName?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type VendorInquiry = {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  categories: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type MifData = {
  products: Product[];
  addresses: Address[];
  orders: Order[];
  signupApplications: SignupApplication[];
  vendorInquiries: VendorInquiry[];
};

export const emptyMifData: MifData = {
  products: [],
  addresses: [],
  orders: [],
  signupApplications: [],
  vendorInquiries: [],
};

export const makeId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
