import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MIF_TEST_ACCOUNTS,
  emptyMifData,
  type MifData,
  type PreviewAccount,
} from "./domain";

const STORAGE_KEY = "mif_order_talk_workspace_v1";

function mergeLocalAccounts(accounts: PreviewAccount[] = []) {
  const requiredIds = new Set(MIF_TEST_ACCOUNTS.map((account) => account.loginId));
  const legacyPreviewIds = new Set(["mif-admin", "mif-customer"]);
  return [
    ...MIF_TEST_ACCOUNTS,
    ...accounts.filter(
      (account) =>
        !requiredIds.has(account.loginId) &&
        !legacyPreviewIds.has(account.loginId) &&
        typeof account.passwordHash === "string" &&
        account.passwordHash.length === 64,
    ),
  ];
}

export async function loadMifData(): Promise<MifData> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMifData;
    const parsed = JSON.parse(raw) as Partial<MifData>;
    return {
      ...emptyMifData,
      ...parsed,
      previewAccounts: mergeLocalAccounts(parsed.previewAccounts),
    } as MifData;
  } catch {
    return emptyMifData;
  }
}

export async function saveMifData(data: MifData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
