import type { PreviewAccount, SignupApplication } from "./domain";

export function getSignupCredentialError(
  loginId: string,
  password: string,
  confirmPassword: string,
) {
  if (loginId.trim().length < 4) return "아이디는 4자 이상 입력해 주세요.";
  if (password.length < 4) return "비밀번호는 4자 이상 입력해 주세요.";
  if (password !== confirmPassword) return "비밀번호 확인이 일치하지 않습니다.";
  return null;
}

export function findPreviewAccount(
  accounts: PreviewAccount[],
  loginId: string,
  password: string,
) {
  return accounts.find(
    (account) =>
      account.loginId === loginId.trim() &&
      account.password === password &&
      account.status === "active",
  );
}

export function accountFromApprovedApplication(
  application: SignupApplication,
): PreviewAccount | null {
  if (application.status !== "approved" || !application.requestedPassword)
    return null;
  return {
    id: `account_${application.id}`,
    loginId: application.requestedLoginId,
    password: application.requestedPassword,
    name: application.contactName,
    companyName: application.companyName,
    role: "customer",
    status: "active",
  };
}
