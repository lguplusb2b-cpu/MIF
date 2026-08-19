import { describe, expect, it } from "vitest";
import type { PreviewAccount } from "./domain";
import { changePreviewAccountRole, roleLabel } from "./role-workflows";

const accounts: PreviewAccount[] = [
  {
    id: "admin-1",
    loginId: "admin",
    passwordHash: "test-hash",
    name: "관리자",
    role: "admin",
    status: "active",
  },
  {
    id: "customer-1",
    loginId: "customer",
    passwordHash: "test-hash",
    name: "거래처 담당자",
    companyName: "MIF 거래처",
    role: "customer",
    status: "active",
  },
];

describe("계정 역할 관리 규칙", () => {
  it("관리자가 승인된 거래처 계정을 관리자로 지정할 수 있다", () => {
    const updated = changePreviewAccountRole(
      accounts,
      "admin",
      "customer-1",
      "admin",
    );
    expect(updated.find((account) => account.id === "customer-1")?.role).toBe(
      "admin",
    );
    expect(roleLabel.admin).toBe("관리자");
  });

  it("거래처는 역할을 변경할 수 없고 마지막 활성 관리자는 해제할 수 없다", () => {
    expect(() =>
      changePreviewAccountRole(accounts, "customer", "customer-1", "admin"),
    ).toThrow("관리자만");
    expect(() =>
      changePreviewAccountRole(accounts, "admin", "admin-1", "customer"),
    ).toThrow("최소 한 명");
  });
});
