import { describe, expect, it } from "vitest";
import { emptyMifData } from "./domain";

describe("MIF 초기 운영 데이터", () => {
  it("거래처·상품·주문·문서·공지·문의·알림을 빈 상태로 시작한다", () => {
    expect(emptyMifData.products).toHaveLength(0);
    expect(emptyMifData.categories).toHaveLength(0);
    expect(emptyMifData.orders).toHaveLength(0);
    expect(emptyMifData.addresses).toHaveLength(0);
    expect(emptyMifData.banks).toHaveLength(0);
    expect(emptyMifData.favorites).toHaveLength(0);
    expect(emptyMifData.signupApplications).toHaveLength(0);
    expect(emptyMifData.vendorInquiries).toHaveLength(0);
    expect(emptyMifData.notices).toHaveLength(0);
    expect(emptyMifData.qaPosts).toHaveLength(0);
    expect(emptyMifData.notifications).toHaveLength(0);
  });

  it("미리보기 가입 심사 데이터는 운영 초기 데이터와 분리한다", async () => {
    const { createPreviewMifData } = await import("./domain");
    const preview = createPreviewMifData();

    expect(emptyMifData.signupApplications).toHaveLength(0);
    expect(preview.signupApplications).toHaveLength(1);
    expect(preview.signupApplications[0]).toMatchObject({
      requestedLoginId: "mif-review",
      documentName: "mif-preview-business.pdf",
      status: "pending",
    });
  });
});
