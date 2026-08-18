import { describe, expect, it } from "vitest";
import { emptyMifData } from "./domain";

describe("MIF 초기 운영 데이터", () => {
  it("거래처·상품·주문·배송지·가입 신청·입점 문의를 빈 상태로 시작한다", () => {
    expect(emptyMifData.products).toHaveLength(0);
    expect(emptyMifData.orders).toHaveLength(0);
    expect(emptyMifData.addresses).toHaveLength(0);
    expect(emptyMifData.signupApplications).toHaveLength(0);
    expect(emptyMifData.vendorInquiries).toHaveLength(0);
  });
});
