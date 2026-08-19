import type { AppNotification, Product } from "./domain";

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

const baseUrl = (process.env.EXPO_PUBLIC_MIF_API_URL || "").replace(/\/$/, "");

export function isMifApiConfigured() {
  return Boolean(baseUrl);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) throw new Error("MIF API 주소가 아직 설정되지 않았습니다.");
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "MIF API 요청을 처리하지 못했습니다.");
  }
  return response.json() as Promise<T>;
}

export const mifApi = {
  listProducts: () => request<Product[]>("/api/products"),
  createProduct: (input: Omit<Product, "id" | "createdAt" | "stockStatus">) => request<Product>("/api/products", { method: "POST", body: JSON.stringify(input) }),
  login: (loginId: string, password: string) => request<{ user: MifSessionUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ loginId, password }) }),
  listManagedUsers: (actorLoginId: string, actorPassword: string) =>
    request<MifManagedUser[]>(
      `/api/admin/users?${new URLSearchParams({ actorLoginId, actorPassword }).toString()}`,
    ),
  updateManagedUserRole: (
    userId: string,
    actorLoginId: string,
    actorPassword: string,
    role: "admin" | "customer",
  ) =>
    request<{ user: MifManagedUser }>(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ actorLoginId, actorPassword, role }),
    }),
  listNotifications: (userId: string) => request<AppNotification[]>(`/api/notifications?userId=${encodeURIComponent(userId)}`),
  markNotificationRead: (id: string) => request<{ success: true }>(`/api/notifications/${id}/read`, { method: "PATCH" }),
  registerPushToken: (userId: string, token: string, platform: string) => request<{ success: true }>("/api/push-tokens", { method: "POST", body: JSON.stringify({ userId, token, platform }) }),
};
