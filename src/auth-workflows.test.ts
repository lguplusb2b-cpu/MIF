import { describe, expect, it } from "vitest";
import {
  accountFromApprovedApplication,
  findPreviewAccount,
  getSignupCredentialError,
} from "./auth-workflows";
import type { SignupApplication } from "./domain";

const application: SignupApplication = {
  id: "signup-test",
  companyName: "테스트 거래처",
  businessNumber: "123-45-67890",
  contactName: "테스트 담당자",
  phone: "010-0000-0000",
  requestedLoginId: "test-user",
  requestedPassword: "pass1234",
  documentName: "test.pdf",
  status: "approved",
  createdAt: "2026-08-19T00:00:00.000Z",
};

describe("MIF 인증·가입 승인 워크플로", () => {
  it("아이디·비밀번호·확인값을 검증한다", () => {
    expect(getSignupCredentialError("abc", "pass1234", "pass1234")).toContain(
      "4자",
    );
    expect(
      getSignupCredentialError("test-user", "pass1234", "different"),
    ).toContain("일치");
    expect(
      getSignupCredentialError("test-user", "pass1234", "pass1234"),
    ).toBeNull();
  });

  it("관리자 승인된 신청만 활성 거래처 계정으로 전환한다", () => {
    const account = accountFromApprovedApplication(application);
    expect(account?.role).toBe("customer");
    expect(
      findPreviewAccount([account!], "test-user", "pass1234")?.companyName,
    ).toBe("테스트 거래처");
    expect(
      findPreviewAccount([account!], "test-user", "wrong"),
    ).toBeUndefined();
    expect(
      accountFromApprovedApplication({ ...application, status: "pending" }),
    ).toBeNull();
  });
});
