import AsyncStorage from "@react-native-async-storage/async-storage";
import { emptyMifData, type MifData } from "./domain";

const STORAGE_KEY = "mif_order_talk_workspace_v1";

export async function loadMifData(): Promise<MifData> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMifData;
    return { ...emptyMifData, ...JSON.parse(raw) } as MifData;
  } catch {
    return emptyMifData;
  }
}

export async function saveMifData(data: MifData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
