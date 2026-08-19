export const ORDER_STATUSES = [
  "RECEIVED",
  "PAID",
  "CONFIRMED",
  "PREPARING",
  "SHIPPING",
  "DELIVERED",
  "CANCELED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type UserRole = "customer" | "admin";
export type DeliveryMethod = "courier" | "truck" | "pickup";
export type ApplicationStatus = "pending" | "approved" | "rejected";

export const orderStatusLabel: Record<OrderStatus, string> = {
  RECEIVED: "접수",
  PAID: "결제확인",
  CONFIRMED: "주문확정",
  PREPARING: "상품준비",
  SHIPPING: "배송중",
  DELIVERED: "배송완료",
  CANCELED: "취소",
};

export const statusColor: Record<OrderStatus, string> = {
  RECEIVED: "#475467",
  PAID: "#B54708",
  CONFIRMED: "#175CD3",
  PREPARING: "#6941C6",
  SHIPPING: "#027A48",
  DELIVERED: "#087443",
  CANCELED: "#B42318",
};

const orderStatusTransition: Partial<Record<OrderStatus, OrderStatus>> = {
  RECEIVED: "PAID",
  PAID: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "SHIPPING",
  SHIPPING: "DELIVERED",
};

export const nextOrderStatus = (status: OrderStatus): OrderStatus | null =>
  orderStatusTransition[status] ?? null;

export type Category = {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
};
export type ProductBadge = "BEST" | "시즌" | "할인" | "품절임박";
export type ProductStockStatus = "in_stock" | "out_of_stock";
export type ProductStorageType = "refrigerated" | "frozen" | "room_temp";
export const productStockStatusLabel: Record<ProductStockStatus, string> = {
  in_stock: "재고 있음",
  out_of_stock: "품절",
};

export type Product = {
  id: string;
  name: string;
  categoryId?: string;
  categoryName: string;
  spec: string;
  unit: string;
  basePrice: number;
  minOrderQty: number;
  stockStatus: ProductStockStatus;
  storageType?: ProductStorageType;
  description: string;
  imageUri?: string;
  detailImageUris: string[];
  badges: ProductBadge[];
  featuredPriority?: number;
  createdAt: string;
  updatedAt?: string;
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
  roadAddress?: string;
  jibunAddress?: string;
  isDefault: boolean;
};

export type BankAccount = {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isActive: boolean;
};

export type Order = {
  id: string;
  orderNumber: string;
  companyId?: string;
  companyName?: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
  deliveryMethod: DeliveryMethod;
  desiredDeliveryAt?: string;
  courierCompany?: string;
  trackingNumber?: string;
  truckDriverPhone?: string;
  address?: Address;
  addressSnapshot?: Address;
  paymentBankAccountId?: string;
  note?: string;
  items: CartItem[];
};

export type SignupApplication = {
  id: string;
  companyName: string;
  businessNumber: string;
  contactName: string;
  phone: string;
  email?: string;
  requestedLoginId: string;
  /** 미리보기 승인 흐름에서만 활성 거래처 계정을 만드는 값이며 운영 API는 해시만 저장한다. */
  requestedPassword: string;
  documentName?: string;
  documentMimeType?: string;
  documentUri?: string;
  status: ApplicationStatus;
  reviewNote?: string;
  createdAt: string;
};

export type PreviewAccount = {
  id: string;
  loginId: string;
  password: string;
  name: string;
  companyName?: string;
  role: UserRole;
  status: "active" | "inactive";
};

export type PasswordResetRequest = {
  id: string;
  loginId: string;
  companyName: string;
  contactPhone: string;
  message?: string;
  status: "pending" | "completed" | "rejected";
  createdAt: string;
};

export type VendorInquiry = {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email?: string;
  categories: string[];
  serviceArea?: string;
  message: string;
  status: ApplicationStatus;
  reviewNote?: string;
  createdAt: string;
};

export type Notice = {
  id: string;
  title: string;
  content: string;
  isVisible: boolean;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt?: string;
};
export type QAComment = {
  id: string;
  authorName: string;
  isAdmin: boolean;
  content: string;
  attachmentNames: string[];
  createdAt: string;
};
export type QAPost = {
  id: string;
  authorName: string;
  companyId?: string;
  title: string;
  content: string;
  isPrivate: boolean;
  attachmentNames: string[];
  isAnswered: boolean;
  createdAt: string;
  comments: QAComment[];
};
export type NotificationAudience = "admin" | "customer" | "all";
export type NotificationType =
  | "order"
  | "notice"
  | "qa"
  | "onboarding"
  | "system";
export type AppNotification = {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  recipientRole: NotificationAudience;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, string>;
};
export type SessionUser = {
  id: string;
  loginId: string;
  name: string;
  companyName?: string;
  role: UserRole;
  status: "active" | "inactive";
};

export type MifData = {
  categories: Category[];
  products: Product[];
  addresses: Address[];
  orders: Order[];
  banks: BankAccount[];
  favorites: string[];
  signupApplications: SignupApplication[];
  vendorInquiries: VendorInquiry[];
  notices: Notice[];
  qaPosts: QAPost[];
  notifications: AppNotification[];
  /** 로컬 인증 계정이며 운영 API·DB 사용자와 분리된다. */
  previewAccounts: PreviewAccount[];
  passwordResetRequests: PasswordResetRequest[];
};

export const MIF_TEST_ACCOUNTS: PreviewAccount[] = [
  {
    id: "mif-test-customer",
    loginId: "mif",
    password: "mif",
    name: "MIF 거래처 테스트",
    companyName: "MIF 거래처",
    role: "customer",
    status: "active",
  },
  {
    id: "mif-test-admin",
    loginId: "admin",
    password: "admin1234",
    name: "MIF 관리자 테스트",
    role: "admin",
    status: "active",
  },
];

export const emptyMifData: MifData = {
  categories: [],
  products: [],
  addresses: [],
  orders: [],
  banks: [],
  favorites: [],
  signupApplications: [],
  vendorInquiries: [],
  notices: [],
  qaPosts: [],
  notifications: [],
  previewAccounts: MIF_TEST_ACCOUNTS,
  passwordResetRequests: [],
};

export const makeId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const money = (amount: number) =>
  `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
export const deliveryLabel: Record<DeliveryMethod, string> = {
  courier: "택배",
  truck: "용달",
  pickup: "픽업",
};

export function statusCounts(orders: Order[]) {
  return ORDER_STATUSES.reduce(
    (counts, status) => ({
      ...counts,
      [status]: orders.filter((order) => order.status === status).length,
    }),
    {} as Record<OrderStatus, number>,
  );
}

export function isVisibleNotice(notice: Notice, now = new Date()) {
  const today = koreanDateKey(now);
  return (
    notice.isVisible &&
    (!notice.startDate || notice.startDate <= today) &&
    (!notice.endDate || notice.endDate >= today)
  );
}

/** 날짜만 저장하는 공지의 노출 기준을 한국 운영일 기준으로 통일한다. */
export function koreanDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** 홈·거래처 공지 목록에서 사용할 활성 공지의 기간 필터와 최신순 정렬 규칙이다. */
export function getVisibleNotices(notices: Notice[], now = new Date()) {
  return notices
    .filter((notice) => isVisibleNotice(notice, now))
    .sort((left, right) => {
      const leftDate = left.updatedAt ?? left.createdAt;
      const rightDate = right.updatedAt ?? right.createdAt;
      return rightDate.localeCompare(leftDate);
    });
}

/**
 * Manus 미리보기에서만 사용자가 명시적으로 불러오는 로컬 테스트 시나리오다.
 * emptyMifData의 초기 상태나 독립 API·DB에는 절대 삽입하지 않는다.
 */
export function createPreviewMifData(): MifData {
  const now = new Date().toISOString();
  const categories: Category[] = [
    {
      id: "preview-cat-fresh",
      name: "신선식품",
      icon: "🥬",
      sortOrder: 1,
      isActive: true,
    },
    {
      id: "preview-cat-pack",
      name: "가공식품",
      icon: "📦",
      sortOrder: 2,
      isActive: true,
    },
    {
      id: "preview-cat-supply",
      name: "소모품",
      icon: "🧴",
      sortOrder: 3,
      isActive: true,
    },
  ];
  const products: Product[] = [
    {
      id: "preview-prd-vegetable",
      name: "테스트 친환경 채소",
      categoryId: "preview-cat-fresh",
      categoryName: "신선식품",
      spec: "1kg",
      unit: "박스",
      basePrice: 12000,
      minOrderQty: 1,
      stockStatus: "in_stock",
      description: "Manus 미리보기 전용 상품입니다. 운영 상품이 아닙니다.",
      detailImageUris: [],
      badges: ["BEST"],
      featuredPriority: 1,
      createdAt: now,
    },
    {
      id: "preview-prd-rice",
      name: "테스트 즉석밥",
      categoryId: "preview-cat-pack",
      categoryName: "가공식품",
      spec: "210g × 12",
      unit: "박스",
      basePrice: 15800,
      minOrderQty: 1,
      stockStatus: "in_stock",
      description:
        "주문·장바구니·찜 테스트에 사용하는 미리보기 전용 상품입니다.",
      detailImageUris: [],
      badges: ["시즌"],
      featuredPriority: 2,
      createdAt: now,
    },
    {
      id: "preview-prd-glove",
      name: "테스트 위생장갑",
      categoryId: "preview-cat-supply",
      categoryName: "소모품",
      spec: "100매",
      unit: "팩",
      basePrice: 3900,
      minOrderQty: 2,
      stockStatus: "in_stock",
      description:
        "관리자 상품·카테고리 기능을 검증하는 미리보기 전용 상품입니다.",
      detailImageUris: [],
      badges: ["할인"],
      createdAt: now,
    },
  ];
  const addresses: Address[] = [
    {
      id: "preview-address",
      label: "테스트 본사",
      recipient: "테스트 담당자",
      phone: "010-0000-0000",
      postalCode: "00000",
      address: "테스트시 미리보기로 1",
      addressDetail: "MIF 테스트",
      roadAddress: "테스트시 미리보기로 1",
      isDefault: true,
    },
  ];
  const banks: BankAccount[] = [
    {
      id: "preview-bank",
      bankName: "MIF 테스트은행",
      accountNumber: "000-0000-0000",
      accountHolder: "MIF 테스트",
      isActive: true,
    },
  ];
  const notices: Notice[] = [
    {
      id: "preview-notice",
      title: "MIF 미리보기 테스트 안내",
      content: "이 공지는 Manus 미리보기 전용이며 실제 운영 공지가 아닙니다.",
      isVisible: true,
      startDate: now.slice(0, 10),
      createdAt: now,
    },
  ];
  const signupApplications: SignupApplication[] = [
    {
      id: "preview-signup-application",
      companyName: "MIF 가입 심사 테스트 거래처",
      businessNumber: "987-65-43210",
      contactName: "가입 심사 담당자",
      phone: "010-9876-5432",
      email: "signup-preview@mif.local",
      requestedLoginId: "mif-review",
      requestedPassword: "MifReview!2026",
      documentName: "mif-preview-business.pdf",
      documentMimeType: "application/pdf",
      documentUri: "preview://mif-preview-business.pdf",
      status: "pending",
      createdAt: now,
    },
  ];
  return {
    ...emptyMifData,
    categories,
    products,
    addresses,
    banks,
    notices,
    previewAccounts: MIF_TEST_ACCOUNTS,
    signupApplications,
  };
}
