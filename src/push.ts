import Constants from "expo-constants";
import { Platform } from "react-native";

export type PushPermissionResult = { status: "granted" | "denied" | "unsupported" | "error"; token?: string; message: string };
export type MifPushPayload = { orderId?: string; type?: string };

export async function requestMifPushPermission(): Promise<PushPermissionResult> {
  if (Platform.OS === "web") return { status: "unsupported", message: "웹 미리보기에서는 인앱 알림만 테스트할 수 있습니다. 실제 Android/iOS 앱에서 푸시 권한을 허용해 주세요." };
  try {
    const Notifications = await import("expo-notifications");
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("mif-orders", { name: "MIF 주문 및 운영 알림", importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 150, 250] });
    const current = await Notifications.getPermissionsAsync();
    const finalStatus = current.status === "granted" ? current.status : (await Notifications.requestPermissionsAsync()).status;
    if (finalStatus !== "granted") return { status: "denied", message: "알림 권한이 허용되지 않았습니다. 기기 설정에서 MIF 알림을 허용해 주세요." };
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    return { status: "granted", token, message: "MIF 모바일 푸시 알림이 활성화되었습니다." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "푸시 알림을 준비하지 못했습니다." };
  }
}

export async function subscribeMifPush(
  onReceive: (payload: MifPushPayload) => void,
  onResponse: (payload: MifPushPayload) => void,
) {
  if (Platform.OS === "web") return () => undefined;
  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    const received = Notifications.addNotificationReceivedListener((notification) =>
      onReceive(notification.request.content.data as MifPushPayload),
    );
    const responded = Notifications.addNotificationResponseReceivedListener((response) =>
      onResponse(response.notification.request.content.data as MifPushPayload),
    );
    return () => {
      received.remove();
      responded.remove();
    };
  } catch {
    return () => undefined;
  }
}

export async function presentPreviewPush(title: string, body: string) {
  if (Platform.OS === "web") return false;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.scheduleNotificationAsync({ content: { title, body, sound: "default", data: { source: "mif-preview" } }, trigger: null });
    return true;
  } catch { return false; }
}
