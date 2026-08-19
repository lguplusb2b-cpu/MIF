import type { Address } from "./domain";

/** 배송지를 추가 또는 수정하며, 기본 배송지는 항상 하나만 유지한다. */
export function saveAddress(addresses: Address[], address: Address): Address[] {
  const shouldBeDefault = address.isDefault || addresses.length === 0;
  const withoutCurrent = addresses.filter((item) => item.id !== address.id);
  return [
    ...withoutCurrent.map((item) =>
      shouldBeDefault ? { ...item, isDefault: false } : item,
    ),
    { ...address, isDefault: shouldBeDefault },
  ];
}

/** 기본 배송지가 삭제되면 남은 첫 배송지를 기본 배송지로 승격한다. */
export function removeAddress(addresses: Address[], id: string): Address[] {
  const remaining = addresses.filter((item) => item.id !== id);
  if (!remaining.length || remaining.some((item) => item.isDefault)) return remaining;
  return remaining.map((item, index) =>
    index === 0 ? { ...item, isDefault: true } : item,
  );
}

/** 선택한 배송지를 기본 배송지로 지정한다. */
export function setDefaultAddress(addresses: Address[], id: string): Address[] {
  return addresses.map((item) => ({ ...item, isDefault: item.id === id }));
}
