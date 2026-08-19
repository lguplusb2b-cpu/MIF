import type { PreviewAccount, UserRole } from "./domain";

export const roleLabel: Record<UserRole, string> = {
  admin: "관리자",
  customer: "거래처",
};

export function changePreviewAccountRole(
  accounts: PreviewAccount[],
  actorRole: UserRole,
  targetAccountId: string,
  nextRole: UserRole,
) {
  if (actorRole !== "admin")
    throw new Error("관리자만 계정 권한을 변경할 수 있습니다.");

  const target = accounts.find((account) => account.id === targetAccountId);
  if (!target) throw new Error("변경할 계정을 찾을 수 없습니다.");
  if (target.role === nextRole) return accounts;

  const activeAdminCount = accounts.filter(
    (account) => account.role === "admin" && account.status === "active",
  ).length;
  if (
    target.role === "admin" &&
    nextRole === "customer" &&
    target.status === "active" &&
    activeAdminCount <= 1
  ) {
    throw new Error("활성 관리자가 최소 한 명은 필요합니다.");
  }

  return accounts.map((account) =>
    account.id === targetAccountId ? { ...account, role: nextRole } : account,
  );
}
