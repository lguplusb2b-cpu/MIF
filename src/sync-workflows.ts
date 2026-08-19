import type { MifServerSnapshot, MifSyncData } from "./api";
import type {
  Address,
  Category,
  MifData,
  Order,
  Product,
  QAPost,
} from "./domain";

/** 서버 상품 응답을 앱 상품 도메인으로 변환한다. */
export function toAppProduct(row: Record<string, unknown>): Product {
  const badges = Array.isArray(row.marketingBadges) ? (row.marketingBadges as Product["badges"]) : [];
  const detailImages = Array.isArray(row.detailImageKeys) ? (row.detailImageKeys as string[]) : [];
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    categoryId: row.categoryId ? String(row.categoryId) : undefined,
    categoryName: String(row.categoryName ?? "미분류"),
    spec: String(row.spec ?? ""),
    unit: String(row.unit ?? ""),
    basePrice: Number(row.basePrice ?? 0),
    minOrderQty: Number(row.minOrderQty ?? 1),
    stockStatus: row.stockStatus === "out_of_stock" ? "out_of_stock" : "in_stock",
    isActive: row.status ? row.status === "active" : true,
    description: String(row.description ?? ""),
    imageUri: row.imageKey ? String(row.imageKey) : undefined,
    detailImageUris: detailImages,
    badges,
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}

/** 서버 카테고리 응답에 앱 전용 표시 속성을 채운다. */
export function toAppCategory(row: Record<string, unknown>, fallback?: Category): Category {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    icon: fallback?.icon ?? "",
    sortOrder: Number(row.sortOrder ?? 0),
    isActive: fallback?.isActive ?? true,
  };
}

export function toAppAddress(row: Record<string, unknown>): Address {
  return {
    id: String(row.id),
    label: String(row.label ?? ""),
    recipient: String(row.recipient ?? ""),
    phone: String(row.phone ?? ""),
    postalCode: String(row.postalCode ?? ""),
    address: String(row.address ?? ""),
    addressDetail: String(row.addressDetail ?? ""),
    isDefault: Boolean(row.isDefault),
  };
}

/** 서버 주문 응답을 앱 주문 도메인으로 변환한다. 품목은 서버 스냅샷의 items를 사용한다. */
export function toAppOrder(row: Record<string, unknown>): Order {
  const rawItems = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
  const snapshot = row.addressSnapshot as Record<string, unknown> | null | undefined;
  return {
    id: String(row.id),
    orderNumber: String(row.orderNumber ?? ""),
    companyId: row.companyId ? String(row.companyId) : undefined,
    companyName: row.companyName ? String(row.companyName) : undefined,
    status: (row.status as Order["status"]) ?? "RECEIVED",
    totalAmount: Number(row.totalAmount ?? 0),
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    deliveryMethod: (row.deliveryMethod as Order["deliveryMethod"]) ?? "courier",
    desiredDeliveryAt: row.desiredDeliveryAt ? String(row.desiredDeliveryAt) : undefined,
    courierCompany: row.courierCompany ? String(row.courierCompany) : undefined,
    trackingNumber: row.trackingNumber ? String(row.trackingNumber) : undefined,
    truckDriverPhone: row.truckDriverPhone ? String(row.truckDriverPhone) : undefined,
    address: snapshot ? toAppAddress(snapshot) : undefined,
    addressSnapshot: snapshot ? toAppAddress(snapshot) : undefined,
    note: row.note ? String(row.note) : undefined,
    items: rawItems.map((item) => ({
      id: String(item.productId ?? item.orderId ?? ""),
      name: String(item.productName ?? ""),
      categoryName: "",
      spec: String(item.spec ?? ""),
      unit: "",
      basePrice: Number(item.unitPrice ?? 0),
      minOrderQty: 1,
      stockStatus: "in_stock",
      description: "",
      detailImageUris: [],
      badges: [],
      createdAt: String(row.createdAt ?? new Date().toISOString()),
      quantity: Number(item.quantity ?? 1),
    })),
  };
}

export function toAppQaPost(row: Record<string, unknown>): QAPost {
  const comments = Array.isArray(row.comments) ? (row.comments as Record<string, unknown>[]) : [];
  return {
    id: String(row.id),
    authorName: String(row.authorName ?? ""),
    companyId: row.companyId ? String(row.companyId) : undefined,
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    isPrivate: Boolean(row.isPrivate),
    attachmentNames: Array.isArray(row.imageKeys) ? (row.imageKeys as string[]) : [],
    isAnswered: Boolean(row.isAnswered),
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    comments: comments.map((comment) => ({
      id: String(comment.id),
      authorName: String(comment.authorName ?? ""),
      isAdmin: Boolean(comment.isAdmin),
      content: String(comment.content ?? ""),
      attachmentNames: Array.isArray(comment.fileKeys) ? (comment.fileKeys as string[]) : [],
      createdAt: String(comment.createdAt ?? new Date().toISOString()),
    })),
  };
}

/** 서버 스냅샷을 앱 데이터 형태로 변환한다. */
export function snapshotToSyncData(snapshot: MifServerSnapshot, current: MifData): MifSyncData {
  const categoryById = new Map(current.categories.map((item) => [item.id, item]));
  return {
    products: (snapshot.products as unknown as Record<string, unknown>[]).map(toAppProduct),
    categories: (snapshot.categories as unknown as Record<string, unknown>[]).map((row) =>
      toAppCategory(row, categoryById.get(String(row.id))),
    ),
    banks: snapshot.banks ?? [],
    notices: snapshot.notices ?? [],
    addresses: (snapshot.addresses as unknown as Record<string, unknown>[]).map(toAppAddress),
    orders: (snapshot.orders as unknown as Record<string, unknown>[]).map(toAppOrder),
    qaPosts: (snapshot.qaPosts as unknown as Record<string, unknown>[]).map(toAppQaPost),
    notifications: snapshot.notifications ?? [],
    signupApplications: (snapshot.signupApplications ?? []).map((row) => ({
      ...(row as unknown as Record<string, unknown>),
      requestedPassword: "",
    })) as MifSyncData["signupApplications"],
    vendorInquiries: (snapshot.vendorInquiries ?? []).map((row) => {
      const raw = row as unknown as Record<string, unknown>;
      return {
        ...raw,
        categories: Array.isArray(raw.productCategories) ? (raw.productCategories as string[]) : [],
      };
    }) as MifSyncData["vendorInquiries"],
    passwordResetRequests: snapshot.passwordResetRequests ?? [],
  };
}

/**
 * 서버 공용 데이터로 앱 상태를 교체하고, 기기 로컬 값(장바구니 찜·로컬 계정)은 유지한다.
 * 서버에서 사라진 상품을 찜 목록에 남기지 않도록 함께 정리한다.
 */
export function mergeServerSnapshot(current: MifData, snapshot: MifServerSnapshot): MifData {
  const synced = snapshotToSyncData(snapshot, current);
  const productIds = new Set(synced.products.map((product) => product.id));
  return {
    ...current,
    ...synced,
    favorites: current.favorites.filter((id) => productIds.has(id)),
    previewAccounts: current.previewAccounts,
  };
}

/** 서버 연동이 불가능한 상황을 사용자에게 알릴 표시 문구를 만든다. */
export function describeSyncState(input: {
  configured: boolean;
  online: boolean;
  syncedAt?: string;
}): { label: string; tone: "ok" | "warn" | "local" } {
  if (!input.configured) return { label: "로컬 모드", tone: "local" };
  if (!input.online) return { label: "서버 연결 끊김", tone: "warn" };
  if (!input.syncedAt) return { label: "동기화 준비 중", tone: "warn" };
  return { label: "서버 동기화", tone: "ok" };
}
