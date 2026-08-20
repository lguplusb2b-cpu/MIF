import { describe, expect, it } from "vitest";
import { getNoticeDateRangeError, isNoticeDateSelectable } from "./notice-workflows";

describe("공지 노출 기간 규칙", () => {
  it("시작일과 종료일의 날짜 형식 및 순서를 검증한다", () => {
    expect(getNoticeDateRangeError("", "")).toBe("노출 시작일을 달력에서 선택해 주세요.");
    expect(getNoticeDateRangeError("2026-08-20", "2026-08-19")).toBe(
      "노출 종료일은 시작일보다 빠를 수 없습니다.",
    );
    expect(getNoticeDateRangeError("2026-08-20", "2026-08-20")).toBeUndefined();
    expect(getNoticeDateRangeError("2026-08-20", "")).toBeUndefined();
  });

  it("달력에서 시작일 전 종료일과 종료일 후 시작일을 선택하지 못하게 한다", () => {
    expect(isNoticeDateSelectable("2026-08-19", { minimumDate: "2026-08-20" })).toBe(false);
    expect(isNoticeDateSelectable("2026-08-20", { minimumDate: "2026-08-20" })).toBe(true);
    expect(isNoticeDateSelectable("2026-08-21", { maximumDate: "2026-08-20" })).toBe(false);
  });
});
