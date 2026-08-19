import { describe, expect, it } from "vitest";
import type { Address } from "./domain";
import { removeAddress, saveAddress, setDefaultAddress } from "./address-workflows";

const home: Address = {
  id: "addr-home",
  label: "본사",
  recipient: "담당자",
  phone: "010-0000-0000",
  postalCode: "04524",
  address: "서울특별시 중구 세종대로 110",
  addressDetail: "5층",
  isDefault: true,
};

const warehouse: Address = {
  ...home,
  id: "addr-warehouse",
  label: "물류센터",
  isDefault: false,
};

describe("배송지 관리 업무 규칙", () => {
  it("새 기본 배송지를 저장하면 기존 기본 배송지는 해제한다", () => {
    const result = saveAddress([home], { ...warehouse, isDefault: true });
    expect(result.find((item) => item.id === home.id)?.isDefault).toBe(false);
    expect(result.find((item) => item.id === warehouse.id)?.isDefault).toBe(true);
  });

  it("기본 배송지를 삭제하면 남은 배송지를 기본으로 지정한다", () => {
    const result = removeAddress([home, warehouse], home.id);
    expect(result).toEqual([{ ...warehouse, isDefault: true }]);
  });

  it("선택한 배송지만 기본 배송지로 지정한다", () => {
    const result = setDefaultAddress([home, warehouse], warehouse.id);
    expect(result.map((item) => item.isDefault)).toEqual([false, true]);
  });
});
