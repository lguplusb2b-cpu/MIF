import { describe, expect, it } from "vitest";
import {
  TOAST_MAX_VISIBLE,
  createToast,
  dismissToast,
  enqueueToast,
  expireToasts,
  toastAccessibilityLabel,
  toastDuration,
} from "./toast-workflows";

describe("MIF 인앱 토스트 규칙", () => {
  it("오류 토스트는 성공 토스트보다 오래 노출된다", () => {
    expect(toastDuration("error")).toBeGreaterThan(toastDuration("success"));
  });

  it("명시한 노출 시간이 있으면 그 값을 사용한다", () => {
    expect(toastDuration("success", 8000)).toBe(8000);
  });

  it("제목이 비어 있으면 기본 제목으로 보정한다", () => {
    const toast = createToast({ title: "   " }, 1000, 1);
    expect(toast.title).toBe("안내");
    expect(toast.tone).toBe("info");
  });

  it("같은 내용의 토스트는 중복 누적되지 않는다", () => {
    const first = createToast({ title: "저장 실패", tone: "error" }, 1000, 1);
    const second = createToast({ title: "저장 실패", tone: "error" }, 2000, 2);
    const queue = enqueueToast(enqueueToast([], first), second);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.createdAt).toBe(2000);
  });

  it("최대 노출 개수를 넘으면 가장 오래된 토스트를 밀어낸다", () => {
    let queue = [] as ReturnType<typeof createToast>[];
    for (let index = 0; index < TOAST_MAX_VISIBLE + 2; index += 1) {
      queue = enqueueToast(
        queue,
        createToast({ title: `알림 ${index}`, tone: "info" }, 1000 + index, index),
      );
    }
    expect(queue).toHaveLength(TOAST_MAX_VISIBLE);
    expect(queue[0]?.title).toBe("알림 2");
  });

  it("노출 시간이 지난 토스트만 정리한다", () => {
    const fresh = createToast({ title: "최근", tone: "info" }, 10_000, 1);
    const stale = createToast({ title: "지남", tone: "success" }, 1_000, 2);
    const remaining = expireToasts([stale, fresh], 10_500);
    expect(remaining.map((item) => item.title)).toEqual(["최근"]);
  });

  it("닫기 요청한 토스트만 제거한다", () => {
    const first = createToast({ title: "A" }, 1000, 1);
    const second = createToast({ title: "B" }, 1000, 2);
    expect(dismissToast([first, second], first.id).map((item) => item.title)).toEqual([
      "B",
    ]);
  });

  it("스크린 리더용 라벨에 상태와 본문을 포함한다", () => {
    const toast = createToast(
      { title: "주문 실패", message: "결제 계좌를 등록해 주세요.", tone: "error" },
      1000,
      1,
    );
    expect(toastAccessibilityLabel(toast)).toBe(
      "오류 알림: 주문 실패. 결제 계좌를 등록해 주세요.",
    );
  });
});
