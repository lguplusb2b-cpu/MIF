import { describe, expect, it } from "vitest";
import { emptyMifData } from "./domain";
import { describeSyncState, mergeServerSnapshot, snapshotToSyncData } from "./sync-workflows";
import type { MifServerSnapshot } from "./api";

const snapshot: MifServerSnapshot = {
  user: {
    id: "user-1",
    loginId: "mif",
    name: "MIF 거래처",
    companyId: "company-1",
    companyName: "MIF 상사",
    role: "customer",
    status: "active",
  },
  syncedAt: "2026-08-19T05:00:00.000Z",
  products: [
    {
      id: "prd-1",
      name: "서버 상품",
      categoryName: "가공식품",
      spec: "1박스",
      unit: "박스",
      basePrice: 12000,
      minOrderQty: 2,
      stockStatus: "in_stock",
      description: "",
      detailImageUris: [],
      badges: [],
      createdAt: "2026-08-19T04:00:00.000Z",
    },
  ],
  categories: [{ id: "cat-1", name: "가공식품", icon: "🍱", isActive: true, sortOrder: 1 }],
  banks: [
    {
      id: "bank-1",
      bankName: "국민은행",
      accountNumber: "1234",
      accountHolder: "MIF",
      isActive: true,
    },
  ],
  notices: [],
  addresses: [],
  orders: [],
  qaPosts: [],
  notifications: [],
  signupApplications: [],
  vendorInquiries: [],
  passwordResetRequests: [],
};

describe("서버 스냅샷 동기화 규칙", () => {
  it("서버 공용 데이터를 앱 데이터로 교체한다", () => {
    const merged = mergeServerSnapshot(emptyMifData, snapshot);
    expect(merged.products).toHaveLength(1);
    expect(merged.products[0].name).toBe("서버 상품");
    expect(merged.categories[0].name).toBe("가공식품");
    expect(merged.banks[0].bankName).toBe("국민은행");
  });

  it("장바구니·찜·로컬 계정 등 기기별 값은 보존한다", () => {
    const local = {
      ...emptyMifData,
      favorites: ["prd-1"],
    };
    const merged = mergeServerSnapshot(local, snapshot);
    expect(merged.favorites).toEqual(["prd-1"]);
    expect(merged.previewAccounts).toEqual(local.previewAccounts);
  });

  it("스냅샷에서 동기화 대상 필드만 추출한다", () => {
    const sync = snapshotToSyncData(snapshot, emptyMifData);
    expect(Object.keys(sync)).toContain("products");
    expect(Object.keys(sync)).not.toContain("user");
    expect(Object.keys(sync)).not.toContain("syncedAt");
  });

  it("서버 연동 상태를 사용자 표시 문구로 구분한다", () => {
    expect(describeSyncState({ configured: false, online: false })).toEqual({
      label: "로컬 모드",
      tone: "local",
    });
    expect(describeSyncState({ configured: true, online: false })).toEqual({
      label: "서버 연결 끊김",
      tone: "warn",
    });
    expect(
      describeSyncState({ configured: true, online: true, syncedAt: "2026-08-19T05:00:00.000Z" }),
    ).toEqual({ label: "서버 동기화", tone: "ok" });
  });

  it("서버에서 사라진 상품은 찜 목록에서 제거한다", () => {
    const merged = mergeServerSnapshot(
      { ...emptyMifData, favorites: ["prd-1", "prd-deleted"] },
      snapshot,
    );
    expect(merged.favorites).toEqual(["prd-1"]);
  });
});
