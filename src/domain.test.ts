import { describe, expect, it } from "vitest";
import {
  getVisibleNotices,
  isVisibleNotice,
  koreanDateKey,
  nextOrderStatus,
  productStockStatusLabel,
  type Notice,
} from "./domain";

describe("발주 상태 흐름", () => {
  it("접수부터 배송완료까지 순서대로 전환한다", () => {
    expect(nextOrderStatus("RECEIVED")).toBe("PAID");
    expect(nextOrderStatus("PAID")).toBe("CONFIRMED");
    expect(nextOrderStatus("CONFIRMED")).toBe("PREPARING");
    expect(nextOrderStatus("PREPARING")).toBe("SHIPPING");
    expect(nextOrderStatus("SHIPPING")).toBe("DELIVERED");
    expect(nextOrderStatus("DELIVERED")).toBeNull();
  });
});

describe("상품 재고 상태", () => {
  it("재고 상태를 거래처용 배지 문구로 변환한다", () => {
    expect(productStockStatusLabel.in_stock).toBe("재고 있음");
    expect(productStockStatusLabel.out_of_stock).toBe("품절");
  });
});

describe("공지 활성화와 노출 기간", () => {
  const published: Notice = {
    id: "notice-now",
    title: "운영 공지",
    content: "내용",
    isVisible: true,
    startDate: "2026-08-19",
    endDate: "2026-08-19",
    createdAt: "2026-08-19T01:00:00.000Z",
  };

  it("한국 운영일 기준으로 시작일·종료일 당일 공지를 홈에 노출한다", () => {
    const koreaMorning = new Date("2026-08-18T15:30:00.000Z");
    expect(koreanDateKey(koreaMorning)).toBe("2026-08-19");
    expect(isVisibleNotice(published, koreaMorning)).toBe(true);
  });

  it("비노출·기간 외 공지를 제외하고 최신순으로 정렬한다", () => {
    const now = new Date("2026-08-19T03:00:00.000Z");
    const notices: Notice[] = [
      published,
      { ...published, id: "hidden", isVisible: false, updatedAt: "2026-08-19T08:00:00.000Z" },
      { ...published, id: "recent", title: "최신 공지", updatedAt: "2026-08-19T07:00:00.000Z" },
      { ...published, id: "expired", endDate: "2026-08-18" },
    ];
    expect(getVisibleNotices(notices, now).map((notice) => notice.id)).toEqual([
      "recent",
      "notice-now",
    ]);
  });
});
