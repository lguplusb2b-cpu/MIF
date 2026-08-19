import { makeId, type AppNotification, type NotificationAudience, type NotificationType, type OrderStatus, type UserRole } from "./domain";

export type NotificationDraft = {
  title: string;
  body: string;
  type: NotificationType;
  recipientRole: NotificationAudience;
  data?: Record<string, string>;
};

export function createNotification(draft: NotificationDraft, now = new Date().toISOString()): AppNotification {
  return { id: makeId("noti"), ...draft, isRead: false, createdAt: now };
}

export function notificationsForOrderCreated(orderNumber: string, totalAmount: string): NotificationDraft[] {
  return [
    { title: "주문이 접수되었습니다", body: `${orderNumber} · ${totalAmount}`, type: "order", recipientRole: "customer", data: { event: "order-created", orderNumber } },
    { title: "새 발주가 접수되었습니다", body: `${orderNumber} · 관리자 확인이 필요합니다.`, type: "order", recipientRole: "admin", data: { event: "order-created", orderNumber } },
  ];
}

export function notificationsForOrderStatus(orderNumber: string, statusLabel: string, status: OrderStatus): NotificationDraft[] {
  return [{ title: "주문 상태가 변경되었습니다", body: `${orderNumber} · ${statusLabel}`, type: "order", recipientRole: "customer", data: { event: "order-status", orderNumber, status } }];
}

export function notificationsForQa(title: string, isAdminReply: boolean): NotificationDraft[] {
  return [{ title: isAdminReply ? "Q&A 답변이 등록되었습니다" : "새 Q&A 문의가 접수되었습니다", body: title, type: "qa", recipientRole: isAdminReply ? "customer" : "admin", data: { event: isAdminReply ? "qa-answer" : "qa-created" } }];
}

export function visibleNotifications(notifications: AppNotification[], role: UserRole) {
  return notifications.filter((item) => item.recipientRole === "all" || item.recipientRole === role);
}
