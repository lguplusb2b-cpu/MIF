import { describe, expect, it } from "vitest";
import { createNotification, notificationsForOrderCreated, notificationsForOrderStatus, visibleNotifications } from "./notification-workflows";

describe("MIF 역할별 알림 워크플로", () => {
  it("신규 주문은 거래처 확인과 관리자 처리 알림을 분리한다", () => {
    const drafts = notificationsForOrderCreated("MIF-20260819-0001", "12,000원");
    expect(drafts.map((item) => item.recipientRole)).toEqual(["customer", "admin"]);
    expect(drafts[1]?.title).toContain("새 발주");
  });

  it("관리자 상태 변경 알림은 거래처에만 보인다", () => {
    const draft = notificationsForOrderStatus("MIF-1", "배송중", "SHIPPING")[0];
    if (!draft) throw new Error("주문 상태 알림 초안이 없습니다.");
    const notification = createNotification(draft, "2026-08-19T00:00:00.000Z");
    expect(visibleNotifications([notification], "customer")).toHaveLength(1);
    expect(visibleNotifications([notification], "admin")).toHaveLength(0);
  });
});
