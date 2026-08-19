import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { type PreviewAccount, type SignupApplication } from "./domain";

const LOCAL_AUTH_NAMESPACE = "mif-local-auth-v1";

export function hashLocalPassword(password: string) {
  return bytesToHex(sha256(utf8ToBytes(`${LOCAL_AUTH_NAMESPACE}:${password}`)));
}

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
  const passwordHash = hashLocalPassword(password);
  return accounts.find(
    (account) =>
      account.loginId === loginId.trim() &&
      account.passwordHash === passwordHash &&
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
    passwordHash: hashLocalPassword(application.requestedPassword),
    name: application.contactName,
    companyName: application.companyName,
    role: "customer",
    status: "active",
  };
}
