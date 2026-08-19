import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MIF_TEST_ACCOUNTS,
  emptyMifData,
  type MifData,
  type PreviewAccount,
} from "./domain";

const STORAGE_KEY = "mif_order_talk_workspace_v1";
const SESSION_KEY = "mif_order_talk_session_v1";

export type StoredSession = {
  token: string;
  user: {
    id: string;
    loginId: string;
    name: string;
    companyName?: string;
    role: "admin" | "customer";
    status: "active" | "inactive";
  };
};

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

/** 서버 세션 토큰과 사용자 정보를 저장해 앱 재실행 시 로그인을 유지한다. */
export async function saveSession(session: StoredSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.token && parsed.user?.loginId ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}
