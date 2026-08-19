export type ToastTone = "success" | "error" | "info" | "warning";

export type MifToast = {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
  durationMs: number;
  createdAt: number;
};

export const TOAST_MAX_VISIBLE = 3;

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 2600,
  info: 3000,
  warning: 3600,
  error: 4200,
};

export function toastDuration(tone: ToastTone, override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  return DEFAULT_DURATION[tone];
}

export type ToastRequest = {
  title: string;
  message?: string;
  tone?: ToastTone;
  durationMs?: number;
};

export function createToast(
  request: ToastRequest,
  now: number,
  sequence: number,
): MifToast {
  const tone = request.tone ?? "info";
  const title = request.title.trim();
  const message = request.message?.trim();
  return {
    id: `toast-${now}-${sequence}`,
    title: title.length > 0 ? title : "안내",
    message: message && message.length > 0 ? message : undefined,
    tone,
    durationMs: toastDuration(tone, request.durationMs),
    createdAt: now,
  };
}

/**
 * 같은 제목·본문·톤의 토스트가 이미 떠 있으면 중복으로 쌓지 않고 갱신한다.
 * 최대 노출 개수를 넘으면 가장 오래된 항목을 밀어낸다.
 */
export function enqueueToast(current: MifToast[], next: MifToast): MifToast[] {
  const duplicateIndex = current.findIndex(
    (item) =>
      item.title === next.title &&
      item.message === next.message &&
      item.tone === next.tone,
  );
  const base =
    duplicateIndex >= 0
      ? current.filter((_, index) => index !== duplicateIndex)
      : current;
  const appended = [...base, next];
  if (appended.length <= TOAST_MAX_VISIBLE) return appended;
  return appended.slice(appended.length - TOAST_MAX_VISIBLE);
}

export function dismissToast(current: MifToast[], id: string): MifToast[] {
  return current.filter((item) => item.id !== id);
}

export function expireToasts(current: MifToast[], now: number): MifToast[] {
  return current.filter((item) => now - item.createdAt < item.durationMs);
}

export function toastAccessibilityLabel(toast: MifToast): string {
  const prefix =
    toast.tone === "error"
      ? "오류"
      : toast.tone === "warning"
        ? "주의"
        : toast.tone === "success"
          ? "완료"
          : "안내";
  return toast.message
    ? `${prefix} 알림: ${toast.title}. ${toast.message}`
    : `${prefix} 알림: ${toast.title}`;
}
