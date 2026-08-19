import { describe, expect, it } from "vitest";
import { getPreviousPage, recordPageTransition } from "./navigation-workflows";

type TestPage = "home" | "more" | "addresses" | "admin" | "categories";

describe("화면 탐색 이력", () => {
  it("새 세부 화면으로 이동하면 현재 화면을 이력에 저장한다", () => {
    const history = recordPageTransition<TestPage>([], "more", "addresses");
    expect(history).toEqual(["more"]);
  });

  it("뒤로가기는 직전 화면을 반환하고 이력을 한 단계 제거한다", () => {
    const result = getPreviousPage<TestPage>(["home", "more", "admin"], "home");
    expect(result).toEqual({ page: "admin", history: ["home", "more"] });
  });

  it("이력이 없으면 홈으로 가되 앱 이탈을 요구하지 않는다", () => {
    const result = getPreviousPage<TestPage>([], "home");
    expect(result).toEqual({ page: "home", history: [] });
  });
});
