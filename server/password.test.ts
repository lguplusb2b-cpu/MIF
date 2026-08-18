import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("MIF 비밀번호 처리", () => {
  it("원문을 저장하지 않고 올바른 비밀번호만 검증한다", async () => {
    const encoded = await hashPassword("mif-password-2026");

    expect(encoded).not.toContain("mif-password-2026");
    await expect(verifyPassword("mif-password-2026", encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", encoded)).resolves.toBe(false);
  });
});
