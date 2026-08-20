import type {
  Address,
  AppNotification,
  BankAccount,
  Category,
  DeliveryMethod,
  MifData,
  Notice,
  Order,
  OrderStatus,
  PasswordResetRequest,
  Product,
  QAPost,
  SignupApplication,
  VendorInquiry,
} from "./domain";

export type MifSessionUser = {
  id: string;
  loginId: string;
  name?: string;
  companyId?: string;
  companyName?: string;
  role: "admin" | "customer";
  status: "active" | "inactive";
};

export type MifManagedUser = MifSessionUser;

/** 서버 스냅샷은 공용 업무 데이터만 담고, 장바구니·찜·로컬 계정은 기기별 로컬 값으로 남긴다. */
export type MifServerSnapshot = {
  user: MifSessionUser;
  syncedAt: string;
  products: Product[];
  categories: Category[];
  banks: BankAccount[];
  notices: Notice[];
  addresses: Address[];
  orders: Order[];
  qaPosts: QAPost[];
  notifications: AppNotification[];
  signupApplications: SignupApplication[];
  vendorInquiries: VendorInquiry[];
  passwordResetRequests: PasswordResetRequest[];
};

export type MifSyncData = Pick<
  MifData,
  | "products"
  | "categories"
  | "banks"
  | "notices"
  | "addresses"
  | "orders"
  | "qaPosts"
  | "notifications"
  | "signupApplications"
  | "vendorInquiries"
  | "passwordResetRequests"
>;

const baseUrl = (process.env.EXPO_PUBLIC_MIF_API_URL || "").replace(/\/$/, "");

export function isMifApiConfigured() {
  return Boolean(baseUrl);
}

let sessionToken = "";
let onUnauthorized: (() => void) | undefined;

export function setMifSessionToken(token: string) {
  sessionToken = token;
}

export function getMifSessionToken() {
  return sessionToken;
}

export function setMifUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export class MifApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) throw new MifApiError("MIF API 주소가 아직 설정되지 않았습니다.", 0);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new MifApiError("MIF 서버에 연결할 수 없습니다.", 0);
  }
  if (response.status === 401) {
    sessionToken = "";
    onUnauthorized?.();
    throw new MifApiError("로그인이 필요합니다.", 401);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new MifApiError(payload.message || "MIF API 요청을 처리하지 못했습니다.", response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type MifOrderInput = {
  deliveryMethod: DeliveryMethod;
  addressId?: string;
  addressSnapshot?: Record<string, unknown>;
  desiredDeliveryAt?: string;
  note?: string;
  items: { productId?: string; productName: string; spec?: string; quantity: number; unitPrice: number }[];
};

export const mifApi = {
  login: (loginId: string, password: string) =>
    request<{ user: MifSessionUser; token: string; expiresAt: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginId, password }),
    }),
  session: () => request<{ user: MifSessionUser }>("/api/auth/session"),
  logout: () => request<{ success: true }>("/api/auth/logout", { method: "POST" }),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<{ success: true }>("/api/auth/password", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  snapshot: () => request<MifServerSnapshot>("/api/sync/snapshot"),

  listProducts: () => request<Product[]>("/api/products"),
  createProduct: (input: Record<string, unknown>) =>
    request<Product>("/api/products", { method: "POST", body: JSON.stringify(input) }),
  updateProduct: (id: string, input: Record<string, unknown>) =>
    request<Product>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteProduct: (id: string) => request<void>(`/api/products/${id}`, { method: "DELETE" }),

  createCategory: (input: { name: string; sortOrder: number }) =>
    request<Category>("/api/categories", { method: "POST", body: JSON.stringify(input) }),
  updateCategory: (id: string, input: { name: string; sortOrder: number }) =>
    request<Category>(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteCategory: (id: string) => request<void>(`/api/categories/${id}`, { method: "DELETE" }),

  createOrder: (input: MifOrderInput) =>
    request<{ id: string; orderNumber: string; status: OrderStatus; totalAmount: number }>("/api/orders", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateOrderStatus: (
    id: string,
    input: { status: OrderStatus; courierCompany?: string; trackingNumber?: string; truckDriverPhone?: string },
  ) => request<{ id: string; status: OrderStatus }>(`/api/orders/${id}/status`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteOrder: (id: string) => request<void>(`/api/orders/${id}`, { method: "DELETE" }),

  createAddress: (input: Record<string, unknown>) =>
    request<Address>("/api/addresses", { method: "POST", body: JSON.stringify(input) }),
  updateAddress: (id: string, input: Record<string, unknown>) =>
    request<Address>(`/api/addresses/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteAddress: (id: string) => request<void>(`/api/addresses/${id}`, { method: "DELETE" }),

  createBankAccount: (input: Omit<BankAccount, "id">) =>
    request<BankAccount>("/api/bank-accounts", { method: "POST", body: JSON.stringify(input) }),
  updateBankAccount: (id: string, input: Omit<BankAccount, "id">) =>
    request<BankAccount>(`/api/bank-accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteBankAccount: (id: string) => request<void>(`/api/bank-accounts/${id}`, { method: "DELETE" }),

  createNotice: (input: Record<string, unknown>) =>
    request<Notice>("/api/notices", { method: "POST", body: JSON.stringify(input) }),
  updateNotice: (id: string, input: Record<string, unknown>) =>
    request<Notice>(`/api/notices/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteNotice: (id: string) => request<void>(`/api/notices/${id}`, { method: "DELETE" }),

  createQaPost: (input: Record<string, unknown>) =>
    request<QAPost>("/api/qa-posts", { method: "POST", body: JSON.stringify(input) }),
  createQaComment: (postId: string, input: Record<string, unknown>) =>
    request<unknown>(`/api/qa-posts/${postId}/comments`, { method: "POST", body: JSON.stringify(input) }),

  createSignupApplication: (input: Record<string, unknown>) =>
    request<SignupApplication>("/api/signup-applications", { method: "POST", body: JSON.stringify(input) }),
  createVendorInquiry: (input: Record<string, unknown>) =>
    request<VendorInquiry>("/api/vendor-inquiries", { method: "POST", body: JSON.stringify(input) }),
  createPasswordResetRequest: (input: Record<string, unknown>) =>
    request<PasswordResetRequest>("/api/password-reset-requests", { method: "POST", body: JSON.stringify(input) }),
  reviewSignupApplication: (id: string, input: { decision: "approved" | "rejected"; reviewNote?: string }) =>
    request<unknown>(`/api/admin/onboarding/${id}/review`, { method: "POST", body: JSON.stringify(input) }),
  reviewVendorInquiry: (id: string, input: { decision: "approved" | "rejected"; reviewNote?: string }) =>
    request<unknown>(`/api/admin/vendor-inquiries/${id}/review`, { method: "POST", body: JSON.stringify(input) }),
  reviewPasswordResetRequest: (id: string, input: { status: "completed" | "rejected" }) =>
    request<unknown>(`/api/admin/password-reset-requests/${id}/review`, { method: "POST", body: JSON.stringify(input) }),

  listManagedUsers: (actorLoginId?: string, actorPassword?: string) =>
    request<MifManagedUser[]>(
      actorLoginId && actorPassword
        ? `/api/admin/users?${new URLSearchParams({ actorLoginId, actorPassword }).toString()}`
        : "/api/admin/users",
    ),
  updateManagedUserRole: (userId: string, role: "admin" | "customer") =>
    request<{ user: MifManagedUser }>(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  updateManagedUserStatus: (userId: string, status: "active" | "inactive") =>
    request<{ user: MifManagedUser }>(`/api/admin/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  listNotifications: (userId: string) =>
    request<AppNotification[]>(`/api/notifications?userId=${encodeURIComponent(userId)}`),
  markNotificationRead: (id: string) =>
    request<{ success: true }>(`/api/notifications/${id}/read`, { method: "PATCH" }),
  registerPushToken: (token: string, platform: string) =>
    request<{ success: true }>("/api/push-tokens", { method: "POST", body: JSON.stringify({ token, platform }) }),

  /** 관리자 주문 CSV 내보내기 주소. 세션 토큰을 쿼리로 전달해 브라우저·앱에서 바로 열 수 있다. */
  orderExportUrl: (params?: { from?: string; to?: string }) => {
    if (!baseUrl) return "";
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (sessionToken) query.set("token", sessionToken);
    const search = query.toString();
    return `${baseUrl}/api/orders/export${search ? `?${search}` : ""}`;
  },

  uploadProductImage: async (uri: string, fileName = "product.jpg") => {
    if (!baseUrl) throw new MifApiError("MIF API 주소가 아직 설정되지 않았습니다.", 0);
    const form = new FormData();
    const response = await fetch(uri);
    const blob = await response.blob();
    form.append("file", blob, fileName);
    const uploaded = await fetch(`${baseUrl}/api/uploads/product-image`, {
      method: "POST",
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : undefined,
      body: form,
    });
    if (!uploaded.ok) {
      const payload = (await uploaded.json().catch(() => ({}))) as { message?: string };
      throw new MifApiError(payload.message || "이미지를 업로드하지 못했습니다.", uploaded.status);
    }
    return (await uploaded.json()) as { key: string; url?: string };
  },
};
