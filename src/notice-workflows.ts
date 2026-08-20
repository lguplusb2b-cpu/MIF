function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

/** 공지 노출 기간은 날짜 형식이 올바르고 종료일이 시작일보다 빠를 수 없다. */
export function getNoticeDateRangeError(startDate: string, endDate: string): string | undefined {
  if (!isDateOnly(startDate)) return "노출 시작일을 달력에서 선택해 주세요.";
  if (endDate && !isDateOnly(endDate)) return "노출 종료일을 달력에서 선택해 주세요.";
  if (endDate && endDate < startDate) return "노출 종료일은 시작일보다 빠를 수 없습니다.";
  return undefined;
}

/** 종료일은 시작일과 같거나 이후의 날짜만 선택할 수 있다. */
export function isNoticeDateSelectable(
  value: string,
  options: { minimumDate?: string; maximumDate?: string },
) {
  if (options.minimumDate && value < options.minimumDate) return false;
  if (options.maximumDate && value > options.maximumDate) return false;
  return true;
}
