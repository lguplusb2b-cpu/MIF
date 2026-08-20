import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import DraggableFlatList from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  isMifApiConfigured,
  getMifSessionToken,
  MifApiError,
  mifApi,
  setMifSessionToken,
  setMifUnauthorizedHandler,
  type MifManagedUser,
  type MifSessionUser,
} from "./src/api";
import { describeSyncState, mergeServerSnapshot } from "./src/sync-workflows";
import {
  createToast,
  dismissToast as dismissToastItem,
  enqueueToast,
  expireToasts,
  toastAccessibilityLabel,
  type MifToast,
  type ToastRequest,
  type ToastTone,
} from "./src/toast-workflows";
import {
  accountFromApprovedApplication,
  findPreviewAccount,
  getSignupCredentialError,
} from "./src/auth-workflows";
import { changePreviewAccountRole, roleLabel } from "./src/role-workflows";
import {
  removeAddress,
  saveAddress,
  setDefaultAddress,
} from "./src/address-workflows";
import {
  moveCategory,
  orderedProductCategories,
  reorderCategories,
  removeCategory,
  saveCategory,
} from "./src/category-workflows";
import { cartStyles } from "./src/cart-styles";
import {
  deliveryLabel,
  emptyMifData,
  getVisibleNotices,
  makeId,
  money,
  nextOrderStatus,
  orderStatusLabel,
  productStockStatusLabel,
  statusColor,
  statusCounts,
  type Address,
  type ApplicationStatus,
  type AppNotification,
  type BankAccount,
  type CartItem,
  type Category,
  type DeliveryMethod,
  type MifData,
  type Notice,
  type NotificationAudience,
  type NotificationType,
  type Order,
  type OrderStatus,
  type Product,
  type ProductBadge,
  type PasswordResetRequest,
  type PreviewAccount,
  type QAPost,
  type SessionUser,
  type SignupApplication,
  type UserRole,
  type VendorInquiry,
} from "./src/domain";
import {
  notificationsForOrderCreated,
  notificationsForOrderStatus,
  visibleNotifications,
} from "./src/notification-workflows";
import {
  presentPreviewPush,
  requestMifPushPermission,
  subscribeMifPush,
} from "./src/push";
import {
  ALL_PRODUCT_CATEGORY_ID,
  filterProductsForListing,
  getCategoryAfterSearchInput,
  getProductSaveErrors,
  PRODUCT_SORT_OPTIONS,
  saveProduct,
  shouldInitializeProductSheet,
  sortProductsForListing,
  type ProductSortOption,
} from "./src/product-workflows";
import {
  deliveryMethodPresentation,
  formatDesiredDelivery,
  formatOrderAddress,
  formatOrderDate,
  formatOrderRecipient,
  orderShippingInfoLines,
} from "./src/order-presentation";
import {
  getPreviousPage,
  recordPageTransition,
} from "./src/navigation-workflows";
import {
  clearSession,
  loadMifData,
  loadSession,
  saveMifData,
  saveSession,
} from "./src/storage";
import {
  addToCart,
  advanceOrder,
  canChooseDesiredDeliveryAt,
  cartAmount,
  createMifOrder,
  filterOrders,
  quickOrderRange,
  reconcileCartWithProducts,
  resolveDesiredDeliveryAt,
  setCartQuantity,
  validateCartCheckout,
} from "./src/workflows";

const palette = {
  navy: "#102A43",
  teal: "#007C91",
  aqua: "#E8F7F8",
  bg: "#F4F7F9",
  surface: "#FFFFFF",
  ink: "#1D2939",
  muted: "#667085",
  line: "#DCE5EB",
  success: "#087443",
  warning: "#B54708",
  error: "#B42318",
  purple: "#6941C6",
};
const stockStatusPresentation: Record<
  Product["stockStatus"],
  { label: string; icon: string; color: string; backgroundColor: string }
> = {
  in_stock: {
    label: productStockStatusLabel.in_stock,
    icon: "checkmark-circle",
    color: palette.success,
    backgroundColor: "#ECFDF3",
  },
  out_of_stock: {
    label: productStockStatusLabel.out_of_stock,
    icon: "close-circle",
    color: palette.error,
    backgroundColor: "#FEF3F2",
  },
};

const timePickerOptions = [
  "00:00",
  "06:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "21:00",
  "23:59",
];

function dateAtOffset(offset: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return localDateValue(date);
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStartFor(value?: string) {
  const parsed = value ? new Date(`${value}T00:00:00`) : new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function calendarMonthLabel(monthStart: Date) {
  return `${monthStart.getFullYear()}년 ${monthStart.getMonth() + 1}월`;
}

function dateChoiceLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${month}/${day} (${weekday})`;
}

function dateTimeInputLabel(value: string, placeholder: string) {
  if (!value) return placeholder;
  const [date, rawTime] = value.split("T");
  return `${date} ${rawTime?.slice(0, 5) ?? "00:00"}`;
}
type Tab = "home" | "products" | "orders" | "cart" | "more";
type Page =
  | Tab
  | "admin"
  | "profile"
  | "appInfo"
  | "addresses"
  | "notices"
  | "qa"
  | "favorites"
  | "inquiry"
  | "applications"
  | "accountRoles"
  | "passwordRequests"
  | "banks"
  | "categories"
  | "notifications";
type Sheet =
  | "login"
  | "signup"
  | "password"
  | "passwordChange"
  | "product"
  | "address"
  | "bank"
  | "notice"
  | "noticeDetail"
  | "qa"
  | "inquiry"
  | "order"
  | "category"
  | null;

const today = () => new Date().toISOString().slice(0, 10);
const orderTotal = (items: CartItem[]) => cartAmount(items);
const icon = (name: string, color = palette.teal, size = 20) => (
  <Ionicons name={name as never} color={color} size={size} />
);

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MifApp />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function MifApp() {
  const insets = useSafeAreaInsets();
  const pageRef = useRef<Page>("home");
  const pageHistoryRef = useRef<Page[]>([]);
  const [data, setData] = useState<MifData>(emptyMifData);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartFeedback, setCartFeedback] = useState<{
    productName: string;
    quantity: number;
    amount: number;
  } | null>(null);
  const [page, setCurrentPage] = useState<Page>("home");
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [editingAddress, setEditingAddress] = useState<Address | undefined>();
  const [editingNotice, setEditingNotice] = useState<Notice | undefined>();
  const [selectedNotice, setSelectedNotice] = useState<Notice | undefined>();
  const [editingCategory, setEditingCategory] = useState<Category | undefined>();
  const [selectedOrder, setSelectedOrder] = useState<Order | undefined>();
  const [selectedQa, setSelectedQa] = useState<QAPost | undefined>();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [managedUsers, setManagedUsers] = useState<MifManagedUser[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productCategory, setProductCategory] = useState<string>(
    ALL_PRODUCT_CATEGORY_ID,
  );
  const [productSort, setProductSort] = useState<ProductSortOption>("popular");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | "ALL">("ALL");
  const [orderFrom, setOrderFrom] = useState("");
  const [orderTo, setOrderTo] = useState("");
  const [adminCompanyQuery, setAdminCompanyQuery] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<MifToast[]>([]);
  const toastSequenceRef = useRef(0);
  const pushUnsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const [pushAccessState, setPushAccessState] = useState<
    "idle" | "requesting" | "granted" | "denied" | "unsupported" | "error"
  >("idle");
  const [pushAccessMessage, setPushAccessMessage] = useState(
    "알림 권한을 허용하면 주문 상태 변경을 받을 수 있습니다.",
  );
  const [syncedAt, setSyncedAt] = useState<string | undefined>();
  const [serverOnline, setServerOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const serverMode = isMifApiConfigured();
  const syncState = describeSyncState({
    configured: serverMode,
    online: serverOnline,
    syncedAt,
  });

  const showToast = (request: ToastRequest) => {
    toastSequenceRef.current += 1;
    const toast = createToast(request, Date.now(), toastSequenceRef.current);
    setToasts((current) => enqueueToast(current, toast));
  };

  const notify = (title: string, message?: string, tone: ToastTone = "info") =>
    showToast({ title, message, tone });

  const notifySuccess = (title: string, message?: string) =>
    showToast({ title, message, tone: "success" });

  const notifyError = (title: string, message?: string) =>
    showToast({ title, message, tone: "error" });

  const notifyWarning = (title: string, message?: string) =>
    showToast({ title, message, tone: "warning" });

  /** 이전 단일 배너 API 호환용: 기존 호출부를 토스트로 흘려보낸다. */
  const showFeedback = (
    title: string,
    message: string,
    tone: "error" | "success" = "error",
  ) => showToast({ title, message, tone });

  const dismissToast = (id: string) =>
    setToasts((current) => dismissToastItem(current, id));

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      setToasts((current) => {
        const next = expireToasts(current, Date.now());
        return next.length === current.length ? current : next;
      });
    }, 250);
    return () => clearInterval(timer);
  }, [toasts.length]);

  const setPage = (next: Page) => {
    pageRef.current = next;
    setCurrentPage(next);
  };

  const goToPage = (next: Page) => {
    pageHistoryRef.current = recordPageTransition(
      pageHistoryRef.current,
      pageRef.current,
      next,
    );
    setPage(next);
  };

  const goHome = () => {
    setSheet(null);
    setCartFeedback(null);
    pageHistoryRef.current = [];
    setPage("home");
  };

  const goBack = () => {
    if (cartFeedback) {
      setCartFeedback(null);
      return;
    }
    if (sheet) {
      if (sheet === "login" && !session) return;
      setSheet(null);
      return;
    }
    const previous = getPreviousPage(pageHistoryRef.current, "home" as Page);
    pageHistoryRef.current = previous.history;
    setPage(previous.page);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [cartFeedback, page, sheet]);

  const persist = async (next: MifData) => {
    setData(next);
    await saveMifData(next);
  };

  /** 서버 공용 데이터를 다시 받아 로컬 상태와 저장소를 갱신한다. */
  const syncFromServer = async (options?: { silent?: boolean }) => {
    if (!serverMode) return false;
    if (!options?.silent) setSyncing(true);
    try {
      const snapshot = await mifApi.snapshot();
      setServerOnline(true);
      setSyncedAt(snapshot.syncedAt);
      setData((current) => {
        const merged = mergeServerSnapshot(current, snapshot);
        void saveMifData(merged);
        return merged;
      });
      return true;
    } catch (error) {
      if (error instanceof MifApiError && error.status === 401) return false;
      setServerOnline(false);
      if (!options?.silent)
        showFeedback(
          "서버 동기화",
          "서버에 연결할 수 없어 이 기기에 저장된 데이터를 표시합니다.",
        );
      return false;
    } finally {
      if (!options?.silent) setSyncing(false);
    }
  };

  /**
   * 서버 연동이 설정된 경우 서버 쓰기를 먼저 수행하고 최신 스냅샷으로 상태를 갱신한다.
   * 서버 미설정이나 네트워크 오류 시 로컬 처리로 대체해 단일 기기 사용을 계속 지원한다.
   */
  const runServerFirst = async (
    action: () => Promise<unknown>,
    fallback: () => Promise<void>,
  ) => {
    if (!serverMode) {
      await fallback();
      return;
    }
    try {
      await action();
      await syncFromServer({ silent: true });
    } catch (error) {
      if (error instanceof MifApiError && error.status === 0) {
        setServerOnline(false);
        await fallback();
        showFeedback(
          "오프라인 저장",
          "서버에 연결할 수 없어 이 기기에만 저장했습니다. 연결 후 다시 시도해 주세요.",
        );
        return;
      }
      throw error;
    }
  };

  const refreshManagedUsers = async () => {
    if (!serverMode || session?.role !== "admin") return [];
    const users = await mifApi.listManagedUsers();
    setManagedUsers(users);
    return users;
  };

  useEffect(() => {
    setMifUnauthorizedHandler(() => {
      setSession(null);
      setSheet("login");
      void clearSession();
    });
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const saved = await loadMifData();
      setData(saved);
      const stored = serverMode ? await loadSession() : null;
      if (stored) {
        setMifSessionToken(stored.token);
        try {
          const current = await mifApi.session();
          setSession({
            id: current.user.id,
            loginId: current.user.loginId,
            name: current.user.name || current.user.loginId,
            companyName: current.user.companyName,
            role: current.user.role,
            status: current.user.status,
          });
          setSheet(null);
          await syncFromServer({ silent: true });
        } catch {
          setMifSessionToken("");
          await clearSession();
          setSheet("login");
        }
      } else {
        setSheet("login");
      }
      setReady(true);
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!serverMode || session?.role !== "admin") {
      setManagedUsers([]);
      return;
    }
    void refreshManagedUsers().catch(() => undefined);
  }, [serverMode, session?.id, session?.role]);

  /** 다중 기기 사용 시 다른 기기의 변경을 반영하기 위해 주기적으로 스냅샷을 갱신한다. */
  useEffect(() => {
    if (!serverMode || !session) return;
    const timer = setInterval(() => void syncFromServer({ silent: true }), 20000);
    return () => clearInterval(timer);
  }, [serverMode, session]);
  useEffect(() => {
    setCart((current) => reconcileCartWithProducts(current, data.products));
  }, [data.products]);
  const role = session?.role ?? "customer";
  const isAdmin = role === "admin";
  const roleNotifications = useMemo(
    () => visibleNotifications(data.notifications, role),
    [data.notifications, role],
  );
  const cartTotal = useMemo(() => orderTotal(cart), [cart]);
  const visibleNotices = useMemo(() => getVisibleNotices(data.notices), [data.notices]);
  const productCategories = useMemo(
    () => orderedProductCategories(data.categories),
    [data.categories],
  );
  const adminCategories = useMemo(
    () =>
      [...data.categories].sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.name.localeCompare(right.name, "ko"),
      ),
    [data.categories],
  );

  const publishNotifications = async (
    next: MifData,
    drafts: Array<{
      title: string;
      body: string;
      type: NotificationType;
      recipientRole: NotificationAudience;
      data?: Record<string, string>;
    }>,
  ) => {
    const notifications: AppNotification[] = drafts.map((draft) => ({
      id: makeId("noti"),
      ...draft,
      isRead: false,
      createdAt: new Date().toISOString(),
    }));
    await persist({
      ...next,
      notifications: [...notifications, ...next.notifications],
    });
    for (const notice of notifications)
      if (notice.recipientRole === "all" || notice.recipientRole === role)
        await presentPreviewPush(notice.title, notice.body);
  };
  const pushNotice = async (
    next: MifData,
    title: string,
    body: string,
    type: NotificationType,
    recipientRole: NotificationAudience = "all",
  ) => {
    await publishNotifications(next, [{ title, body, type, recipientRole }]);
  };
  useEffect(() => {
    if (!session || !isMifApiConfigured()) return;
    let active = true;
    const sync = async () => {
      try {
        const remote = await mifApi.listNotifications(session.id);
        if (!active) return;
        setData((current) => ({
          ...current,
          notifications: [
            ...remote,
            ...current.notifications.filter(
              (local) => !remote.some((item) => item.id === local.id),
            ),
          ],
        }));
      } catch {
        /* API 미연결 상태에서는 로컬 미리보기 알림을 유지한다. */
      }
    };
    void sync();
    const timer = setInterval(() => void sync(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session]);

  const requestAndRegisterPush = async (manual = false) => {
    if (!serverMode || !session) {
      setPushAccessState("error");
      setPushAccessMessage("서버 로그인 후 푸시 알림을 설정할 수 있습니다.");
      notifyWarning("푸시 알림", "서버 로그인 후 다시 시도해 주세요.");
      return false;
    }
    if (manual && pushAccessState === "denied") {
      try {
        await Linking.openSettings();
        setPushAccessMessage("기기 설정에서 알림을 허용한 뒤 앱으로 돌아와 다시 눌러 주세요.");
      } catch {
        setPushAccessMessage("기기 설정에서 MIF 알림을 허용해 주세요.");
      }
      return false;
    }
    setPushAccessState("requesting");
    setPushAccessMessage("푸시 알림 권한과 기기 등록을 확인하고 있습니다.");
    const permission = await requestMifPushPermission();
    if (permission.status === "unsupported") {
      setPushAccessState("unsupported");
      setPushAccessMessage(permission.message);
      if (manual) notifyWarning("푸시 알림", permission.message);
      return false;
    }
    if (permission.status !== "granted" || !permission.token) {
      setPushAccessState(permission.status === "denied" ? "denied" : "error");
      setPushAccessMessage(permission.message);
      if (manual) notifyWarning("푸시 알림", permission.message);
      return false;
    }
    try {
      await mifApi.registerPushToken(permission.token, Platform.OS);
      pushUnsubscribeRef.current?.();
      pushUnsubscribeRef.current = await subscribeMifPush(
        () => {
          void syncFromServer({ silent: true });
          notify("주문 상태 알림", "주문 상태가 변경되어 최신 정보를 동기화했습니다.");
        },
        (payload) => {
          void syncFromServer({ silent: true });
          if (payload.orderId) goToPage("orders");
        },
      );
      setPushAccessState("granted");
      setPushAccessMessage("알림 권한이 허용됐고 이 기기가 등록되었습니다.");
      if (manual) notifySuccess("푸시 알림 설정", "이 기기에서 주문 상태 알림을 받을 수 있습니다.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "푸시 알림을 등록하지 못했습니다.";
      setPushAccessState("error");
      setPushAccessMessage(message);
      if (manual) notifyWarning("푸시 알림 등록", message);
      return false;
    }
  };

  useEffect(() => {
    if (!serverMode || !session) return;
    void requestAndRegisterPush();
    return () => {
      pushUnsubscribeRef.current?.();
      pushUnsubscribeRef.current = undefined;
    };
  }, [serverMode, session?.id]);
  const addProductToCart = (product: Product) => {
    if (!session)
      return showFeedback("로그인 필요", "로그인 후 발주할 수 있습니다.");
    if (isAdmin)
      return showFeedback(
        "관리자 발주 제한",
        "관리자 계정은 상품 관리와 주문 처리만 할 수 있으며 발주를 생성할 수 없습니다.",
      );
    if (product.stockStatus === "out_of_stock")
      return showFeedback(
        "품절 상품",
        "품절된 상품은 장바구니에 담을 수 없습니다.",
      );
    setCart((current) => addToCart(current, product));
    setCartFeedback({
      productName: product.name,
      quantity: product.minOrderQty,
      amount: product.basePrice * product.minOrderQty,
    });
  };
  const toggleFavorite = async (productId: string) => {
    if (!session)
      return showFeedback("로그인 필요", "로그인 후 찜 목록을 사용할 수 있습니다.");
    const exists = data.favorites.includes(productId);
    await persist({
      ...data,
      favorites: exists
        ? data.favorites.filter((id) => id !== productId)
        : [...data.favorites, productId],
    });
  };

  /** 서버 세션과 저장된 토큰을 함께 정리한 뒤 로그인 화면으로 돌아간다. */
  const signOut = async () => {
    if (serverMode) {
      try {
        await mifApi.logout();
      } catch {
        /* 서버 연결이 끊겨도 로컬 세션은 정리한다. */
      }
      setMifSessionToken("");
      await clearSession();
    }
    setSession(null);
    setCart([]);
    setSyncedAt(undefined);
    goHome();
    setSheet("login");
  };
  const createOrder = async (input: {
    address: Address;
    deliveryMethod: DeliveryMethod;
    desiredDeliveryAt?: string;
    bankAccountId?: string;
    note?: string;
  }) => {
    try {
      if (isAdmin)
        throw new Error("관리자 계정은 주문을 생성할 수 없습니다.");
      if (serverMode && serverOnline) {
        const created = await mifApi.createOrder({
          deliveryMethod: input.deliveryMethod,
          addressId: input.address.id,
          addressSnapshot: input.address as unknown as Record<string, unknown>,
          desiredDeliveryAt: input.desiredDeliveryAt,
          note: input.note,
          items: cart.map((item) => ({
            productName: item.name,
            spec: item.spec,
            quantity: item.quantity,
            unitPrice: item.basePrice,
          })),
        });
        setCart([]);
        await syncFromServer({ silent: true });
        setSheet(null);
        goToPage("orders");
        return showFeedback(
          "주문 접수 완료",
          `${created.orderNumber} 주문이 서버에 접수되었습니다.`,
          "success",
        );
      }
      const order = createMifOrder({
        orders: data.orders,
        cart,
        address: input.address,
        deliveryMethod: input.deliveryMethod,
        desiredDeliveryAt: input.desiredDeliveryAt,
        bankAccountId: input.bankAccountId,
        note: input.note,
        companyName:
          session?.companyName ||
          data.previewAccounts.find(
            (account) => account.role === "customer" && account.status === "active",
          )?.companyName ||
          "MIF 거래처",
      });
      const next = { ...data, orders: [order, ...data.orders] };
      setCart([]);
      setSelectedOrder(order);
      setSheet("order");
      await publishNotifications(
        next,
        notificationsForOrderCreated(
          order.orderNumber,
          money(order.totalAmount),
        ),
      );
    } catch (error) {
      showFeedback(
        "주문 확인",
        error instanceof Error ? error.message : "주문을 생성할 수 없습니다.",
      );
    }
  };
  const changeOrderStatus = async (order: Order, status?: OrderStatus) => {
    try {
      const changed = advanceOrder(order, status);
      const previousLabel = orderStatusLabel[order.status];
      const changedLabel = orderStatusLabel[changed.status];
      if (serverMode && serverOnline) {
        await mifApi.updateOrderStatus(order.id, {
          status: changed.status,
          courierCompany: changed.courierCompany,
          trackingNumber: changed.trackingNumber,
          truckDriverPhone: changed.truckDriverPhone,
        });
        setSelectedOrder((current) =>
          current?.id === changed.id ? changed : current,
        );
        await syncFromServer({ silent: true });
        showFeedback(
          "주문 상태 변경",
          `${order.orderNumber} 주문을 ${previousLabel}에서 ${changedLabel} 단계로 변경했습니다.`,
          "success",
        );
        return;
      }
      const next = {
        ...data,
        orders: data.orders.map((item) =>
          item.id === order.id ? changed : item,
        ),
      };
      setSelectedOrder((current) =>
        current?.id === changed.id ? changed : current,
      );
      await publishNotifications(
        next,
        notificationsForOrderStatus(
          changed.orderNumber,
          orderStatusLabel[changed.status],
          changed.status,
        ),
      );
      showFeedback(
        "주문 상태 변경",
        `${order.orderNumber} 주문을 ${previousLabel}에서 ${changedLabel} 단계로 변경했습니다.`,
        "success",
      );
    } catch (error) {
      showFeedback(
        "상태 변경",
        error instanceof Error ? error.message : "상태를 변경할 수 없습니다.",
      );
    }
  };
  const reviewSignup = async (
    application: SignupApplication,
    decision: "approved" | "rejected",
  ) => {
    if (serverMode) {
      try {
        await mifApi.reviewSignupApplication(application.id, { decision });
        await syncFromServer({ silent: true });
        await refreshManagedUsers();
        notifySuccess(
          "거래처 가입 신청 검토",
          `${application.companyName} 신청을 ${decision === "approved" ? "승인" : "반려"}했습니다.`,
        );
      } catch (error) {
        notifyError(
          "거래처 가입 신청 검토",
          error instanceof Error ? error.message : "가입 신청을 처리하지 못했습니다.",
        );
      }
      return;
    }
    const approvedAccount =
      decision === "approved"
        ? await accountFromApprovedApplication({ ...application, status: "approved" })
        : null;
    const next = {
      ...data,
      signupApplications: data.signupApplications.map((item) =>
        item.id === application.id ? { ...item, status: decision } : item,
      ),
      previewAccounts:
        approvedAccount &&
        !data.previewAccounts.some(
          (account) => account.loginId === approvedAccount.loginId,
        )
          ? [...data.previewAccounts, approvedAccount]
          : data.previewAccounts,
    };
    await pushNotice(
      next,
      "거래처 가입 신청 검토",
      `${application.companyName} 신청이 ${decision === "approved" ? "승인" : "반려"}되었습니다.`,
      "onboarding",
      "customer",
    );
  };
  const reviewInquiry = async (
    inquiry: VendorInquiry,
    decision: ApplicationStatus,
  ) => {
    const next = {
      ...data,
      vendorInquiries: data.vendorInquiries.map((item) =>
        item.id === inquiry.id ? { ...item, status: decision } : item,
      ),
    };
    await pushNotice(
      next,
      "입점 문의 처리",
      `${inquiry.companyName} 문의가 ${decision === "approved" ? "처리" : "반려"}되었습니다.`,
      "onboarding",
      "customer",
    );
  };
  const updatePreviewAccountRole = async (
    accountId: string,
    nextRole: UserRole,
  ) => {
    try {
      if (serverMode) {
        const { user } = await mifApi.updateManagedUserRole(accountId, nextRole);
        setManagedUsers((current) =>
          current.map((account) => (account.id === user.id ? user : account)),
        );
        if (session?.id === accountId) {
          setSession({ ...session, role: nextRole });
          if (nextRole !== "admin") goToPage("more");
        }
        notifySuccess(
          "권한 변경 완료",
          `선택한 계정을 ${roleLabel[nextRole]}로 지정했습니다.`,
        );
        return;
      }
      const previewAccounts = changePreviewAccountRole(
        data.previewAccounts,
        role,
        accountId,
        nextRole,
      );
      await persist({ ...data, previewAccounts });
      if (session?.id === accountId) {
        setSession({ ...session, role: nextRole });
        if (nextRole !== "admin") goToPage("more");
      }
      notifySuccess(
        "권한 변경 완료",
        `선택한 계정을 ${roleLabel[nextRole]}로 지정했습니다.`,
      );
    } catch (error) {
      notifyError(
        "권한 변경 불가",
        error instanceof Error ? error.message : "권한을 변경할 수 없습니다.",
      );
    }
  };
  const updateManagedUserStatus = async (
    accountId: string,
    status: "active" | "inactive",
  ) => {
    try {
      if (!serverMode) {
        notifyWarning(
          "서버 연결 필요",
          "계정 활성 상태는 서버 연동 모드에서만 변경할 수 있습니다.",
        );
        return;
      }
      const { user } = await mifApi.updateManagedUserStatus(accountId, status);
      setManagedUsers((current) =>
        current.map((account) => (account.id === user.id ? user : account)),
      );
      notifySuccess(
        "계정 상태 변경",
        `${user.companyName || user.name} 계정을 ${status === "active" ? "활성화" : "비활성화"}했습니다.`,
      );
    } catch (error) {
      notifyError(
        "계정 상태 변경",
        error instanceof Error ? error.message : "계정 상태를 변경하지 못했습니다.",
      );
    }
  };
  const updateOrderSelection = (id: string) =>
    setSelectedOrderIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  const shareFavorites = async (products: Product[]) => {
    if (!products.length) {
      notifyWarning("찜 공유", "공유할 찜 상품이 없습니다.");
      return;
    }
    try {
      await Share.share({
        title: "MIF 찜한 상품",
        message: `MIF 찜한 상품\n${products.map((product) => `• ${product.name} (${product.spec})`).join("\n")}`,
      });
    } catch {
      notifyError("찜 공유", "공유를 완료하지 못했습니다.");
    }
  };
  const bulkAdvanceOrders = async () => {
    if (!selectedOrderIds.length) {
      notifyWarning("일괄 처리", "처리할 주문을 선택해 주세요.");
      return;
    }
    const target = data.orders.filter((order) =>
      selectedOrderIds.includes(order.id),
    );
    const nextOrders = data.orders.map((order) => {
      if (!selectedOrderIds.includes(order.id)) return order;
      const next = nextOrderStatus(order.status);
      return next ? { ...order, status: next } : order;
    });
    await persist({ ...data, orders: nextOrders });
    setSelectedOrderIds([]);
    notifySuccess(
      "일괄 처리 완료",
      `${target.length}건의 다음 주문 상태를 반영했습니다.`,
    );
  };

  const productList = useMemo(() => {
    const source = filterProductsForListing(data.products, {
      categoryId: productCategory,
      query: productQuery,
    }).filter(
      (product) =>
        (isAdmin || product.isActive !== false) &&
        (!favoritesOnly || data.favorites.includes(product.id)),
    );
    return sortProductsForListing(source, productSort);
  }, [
    data.products,
    data.favorites,
    favoritesOnly,
    isAdmin,
    productCategory,
    productQuery,
    productSort,
  ]);
  const filteredOrders = useMemo(
    () =>
      filterOrders(data.orders, {
        status: orderStatus,
        from: orderFrom || undefined,
        to: orderTo || undefined,
        companyName: isAdmin ? undefined : session?.companyName || undefined,
        query: isAdmin ? adminCompanyQuery || undefined : undefined,
      }),
    [
      data.orders,
      orderStatus,
      orderFrom,
      orderTo,
      isAdmin,
      adminCompanyQuery,
      session?.companyName,
    ],
  );

  if (!ready)
    return (
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.loading}>
        <ActivityIndicator size="large" color={palette.teal} />
        <Text style={styles.muted}>MIF 앱을 준비하는 중입니다.</Text>
      </SafeAreaView>
    );

  const isTabPage = (["home", "products", "orders", "cart", "more"] as Page[]).includes(
    page,
  );
  const content = (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.app}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.surface} translucent={false} />
      <AppBar
        role={role}
        unread={roleNotifications.filter((item) => !item.isRead).length}
        onNotifications={() => goToPage("notifications")}
        onAccount={() => (session ? goToPage("profile") : setSheet("login"))}
        onBack={isTabPage && page !== "home" ? goBack : undefined}
        onClose={isTabPage && page !== "home" ? goBack : undefined}
      />
      <View style={[styles.content, !isTabPage && { paddingBottom: insets.bottom }]}> 
        {page === "home" && (
          <HomePage
            data={data}
            notices={visibleNotices}
            isAdmin={isAdmin}
            cartCount={cart.length}
            onPage={goToPage}
            onProduct={(product) => {
              setEditingProduct(product);
              setSheet("product");
            }}
            onAdd={addProductToCart}
            onOpenNotice={(notice) => {
              setSelectedNotice(notice);
              setSheet("noticeDetail");
            }}
          />
        )}
        {page === "products" && (
          <ProductsPage
            categories={productCategories}
            products={productList}
            totalProductCount={data.products.filter((product) => isAdmin || product.isActive !== false).length}
            favorites={data.favorites}
            query={productQuery}
            category={productCategory}
            sort={productSort}
            favoritesOnly={favoritesOnly}
            isAdmin={isAdmin}
            onQuery={(value) => {
              setProductQuery(value);
              setProductCategory(
                getCategoryAfterSearchInput(productCategory, value),
              );
            }}
            onCategory={setProductCategory}
            onSort={setProductSort}
            onFavoritesOnly={setFavoritesOnly}
            onToggleFavorite={toggleFavorite}
            onAdd={addProductToCart}
            onOpen={(product) => {
              setEditingProduct(product);
              setSheet("product");
            }}
            onAddProduct={() => {
              setEditingProduct(undefined);
              setSheet("product");
            }}
          />
        )}
        {page === "cart" && (
          <CartPage
            cart={cart}
            isAdmin={isAdmin}
            addresses={data.addresses}
            banks={data.banks}
            total={cartTotal}
            onQuantity={(id, quantity) =>
              setCart((current) => setCartQuantity(current, id, quantity))
            }
            onClear={() => setCart([])}
            onRemove={(id) =>
              setCart((current) => current.filter((item) => item.id !== id))
            }
            onOrder={createOrder}
            onAddress={() => {
              setEditingAddress(undefined);
              setSheet("address");
            }}
            onContinueShopping={() => goToPage("products")}
            onNotice={(title, message, tone) => notify(title, message, tone)}
          />
        )}
        {page === "orders" && (
          <OrdersPage
            orders={filteredOrders}
            allCounts={statusCounts(data.orders)}
            selectedStatus={orderStatus}
            from={orderFrom}
            to={orderTo}
            isAdmin={isAdmin}
            companyQuery={adminCompanyQuery}
            selectedIds={selectedOrderIds}
            onStatus={setOrderStatus}
            onFrom={setOrderFrom}
            onTo={setOrderTo}
            onCompanyQuery={setAdminCompanyQuery}
            onSelect={updateOrderSelection}
            onOpen={(order) => {
              setSelectedOrder(order);
              setSheet("order");
            }}
            onBulk={bulkAdvanceOrders}
            onExport={
              isAdmin
                ? () => {
                    if (!isMifApiConfigured() || !getMifSessionToken()) {
                      showFeedback(
                        "주문 내보내기",
                        "서버에 연결된 상태에서만 CSV를 내보낼 수 있습니다.",
                      );
                      return;
                    }
                    const url = mifApi.orderExportUrl({
                      from: orderFrom ? orderFrom.slice(0, 10) : undefined,
                      to: orderTo ? orderTo.slice(0, 10) : undefined,
                    });
                    if (!url) {
                      showFeedback("주문 내보내기", "내보내기 주소를 만들 수 없습니다.");
                      return;
                    }
                    Linking.openURL(url).catch(() =>
                      showFeedback("주문 내보내기", "CSV 파일을 열지 못했습니다."),
                    );
                  }
                : undefined
            }
          />
        )}
        {page === "more" && (
          <MorePage
            data={data}
            role={role}
            session={session}
            onPage={goToPage}
            onSheet={setSheet}
            onLogout={() => {
              void signOut();
            }}
          />
        )}
        {page === "profile" && (
          <ProfilePage
            session={session}
            role={role}
            onBack={goBack}
            onClose={goBack}
            onLogin={() => setSheet("login")}
            onPassword={() => setSheet("password")}
            onChangePassword={() => setSheet("passwordChange")}
            onLogout={() => {
              void signOut();
            }}
          />
        )}
        {page === "appInfo" && (
          <AppInfoPage
            onBack={goBack}
            onClose={goBack}
            pushAccessState={pushAccessState}
            pushAccessMessage={pushAccessMessage}
            onRequestPush={() => void requestAndRegisterPush(true)}
          />
        )}
        {page === "addresses" && (
          <AddressesPage
            addresses={data.addresses}
            onBack={goBack}
            onClose={goBack}
            onAdd={() => {
              setEditingAddress(undefined);
              setSheet("address");
            }}
            onEdit={(address) => {
              setEditingAddress(address);
              setSheet("address");
            }}
            onDelete={async (id) =>
              await persist({
                ...data,
                addresses: removeAddress(data.addresses, id),
              })
            }
            onSetDefault={async (id) =>
              await persist({
                ...data,
                addresses: setDefaultAddress(data.addresses, id),
              })
            }
          />
        )}
        {page === "favorites" && (
          <ProductsPage
            categories={productCategories}
            products={data.products.filter((product) =>
              data.favorites.includes(product.id),
            )}
            favorites={data.favorites}
            query=""
            totalProductCount={data.products.filter((product) => data.favorites.includes(product.id)).length}
            category={ALL_PRODUCT_CATEGORY_ID}
            sort="popular"
            favoritesOnly
            isAdmin={false}
            onQuery={() => undefined}
            onCategory={() => undefined}
            onSort={() => undefined}
            onFavoritesOnly={() => undefined}
            onToggleFavorite={toggleFavorite}
            onAdd={addProductToCart}
            onOpen={(product) => {
              setEditingProduct(product);
              setSheet("product");
            }}
            onShareFavorites={shareFavorites}
            title="찜한 상품"
            onBack={goBack}
            onClose={goBack}
          />
        )}
        {page === "notices" && (
          <NoticesPage
            notices={isAdmin ? data.notices : visibleNotices}
            isAdmin={isAdmin}
            onBack={goBack}
            onClose={goBack}
            onEdit={(notice) => {
              setEditingNotice(notice);
              setSheet("notice");
            }}
            onCreate={() => {
              setEditingNotice(undefined);
              setSheet("notice");
            }}
            onOpen={(notice) => {
              setSelectedNotice(notice);
              setSheet("noticeDetail");
            }}
            onDelete={async (id) =>
              await persist({
                ...data,
                notices: data.notices.filter((notice) => notice.id !== id),
              })
            }
          />
        )}
        {page === "qa" && (
          <QaPage
            posts={data.qaPosts}
            isAdmin={isAdmin}
            onBack={goBack}
            onClose={goBack}
            onCreate={() => {
              setSelectedQa(undefined);
              setSheet("qa");
            }}
            onOpen={(post) => {
              setSelectedQa(post);
              setSheet("qa");
            }}
          />
        )}
        {page === "inquiry" && (
          <InquiryPage
            inquiries={data.vendorInquiries}
            isAdmin={isAdmin}
            onBack={goBack}
            onClose={goBack}
            onCreate={() => setSheet("inquiry")}
            onReview={reviewInquiry}
          />
        )}
        {page === "notifications" && (
          <NotificationsPage
            notifications={roleNotifications}
            onBack={goBack}
            onClose={goBack}
            onRead={async (id) => {
              await persist({
                ...data,
                notifications: data.notifications.map((item) =>
                  item.id === id ? { ...item, isRead: true } : item,
                ),
              });
              if (session && isMifApiConfigured())
                void mifApi.markNotificationRead(id).catch(() => undefined);
            }}
            onReadAll={async () =>
              await persist({
                ...data,
                notifications: data.notifications.map((item) =>
                  roleNotifications.some((notice) => notice.id === item.id)
                    ? { ...item, isRead: true }
                    : item,
                ),
              })
            }
            onOpenTarget={(item) => {
              const orderNumber = item.data?.orderNumber;
              if (item.type === "order") {
                const target = orderNumber
                  ? data.orders.find((order) => order.orderNumber === orderNumber)
                  : undefined;
                if (target) {
                  setSelectedOrder(target);
                  setSheet("order");
                  return;
                }
                goToPage("orders");
                return;
              }
              if (item.type === "notice") {
                const notice = data.notices.find(
                  (entry) => entry.title === item.body || entry.title === item.title,
                );
                if (notice) {
                  setSelectedNotice(notice);
                  setSheet("noticeDetail");
                  return;
                }
                goToPage("notices");
                return;
              }
              if (item.type === "qa") {
                goToPage("qa");
                return;
              }
              if (item.type === "onboarding" && isAdmin) goToPage("applications");
            }}
            onDelete={async (id) =>
              await persist({
                ...data,
                notifications: data.notifications.filter((item) => item.id !== id),
              })
            }
            onClearRead={async () => {
              const removed = data.notifications.filter((item) => item.isRead).length;
              await persist({
                ...data,
                notifications: data.notifications.filter((item) => !item.isRead),
              });
              showFeedback(
                "알림 정리",
                removed
                  ? `읽은 알림 ${removed}건을 정리했습니다.`
                  : "정리할 읽은 알림이 없습니다.",
                removed ? "success" : "error",
              );
            }}
          />
        )}
        {page === "admin" && (
          <AdminPage
            data={data}
            accounts={serverMode ? managedUsers : data.previewAccounts}
            onBack={goBack}
            onClose={goBack}
            onPage={goToPage}
            onSheet={setSheet}
            onBulk={bulkAdvanceOrders}
          />
        )}
        {page === "applications" && (
          <ApplicationsPage
            applications={data.signupApplications}
            onBack={goBack}
            onClose={goBack}
            onReview={reviewSignup}
          />
        )}
        {page === "accountRoles" && isAdmin && (
          <AccountRolesPage
            accounts={serverMode ? managedUsers : data.previewAccounts}
            currentAccountId={session?.id}
            onBack={goBack}
            onClose={goBack}
            onChangeRole={updatePreviewAccountRole}
            onChangeStatus={updateManagedUserStatus}
          />
        )}
        {page === "passwordRequests" && (
          <PasswordRequestsPage
            requests={data.passwordResetRequests}
            onBack={goBack}
            onClose={goBack}
            onReview={async (request, status) =>
              await persist({
                ...data,
                passwordResetRequests: data.passwordResetRequests.map((item) =>
                  item.id === request.id ? { ...item, status } : item,
                ),
              })
            }
          />
        )}
        {page === "banks" && (
          <BanksPage
            banks={data.banks}
            onBack={goBack}
            onClose={goBack}
            onEdit={(bank) => {
              editingBankRef.current = bank;
              setSheet("bank");
            }}
            onAdd={() => {
              editingBankRef.current = undefined;
              setSheet("bank");
            }}
            onDelete={async (id) => {
              await runServerFirst(
                () => mifApi.deleteBankAccount(id),
                () =>
                  persist({
                    ...data,
                    banks: data.banks.filter((bank) => bank.id !== id),
                  }),
              );
            }}
          />
        )}
        {page === "categories" && (
          <CategoriesPage
            categories={adminCategories}
            onBack={goBack}
            onClose={goBack}
            onEdit={(category) => {
              setEditingCategory(category);
              setSheet("category");
            }}
            onAdd={() => {
              setEditingCategory(undefined);
              setSheet("category");
            }}
            onDelete={async (id) => {
              if (productCategory === id) setProductCategory("ALL");
              await persist(removeCategory(data, id));
            }}
            onReorder={async (ids) =>
              await persist(reorderCategories(data, ids))
            }
            onMove={async (id, direction) =>
              await persist(moveCategory(data, id, direction))
            }
          />
        )}
      </View>
      {(["home", "products", "orders", "cart", "more"] as Page[]).includes(
        page,
      ) && (
          <TabBar
            active={page as Tab}
            cartCount={cart.length}
            isAdmin={isAdmin}
            bottomInset={insets.bottom}
          onSelect={goToPage}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <LoginSheet
        visible={sheet === "login"}
        locked={!session}
        onClose={() => {
          if (session) setSheet(null);
        }}
        onSignup={() => setSheet("signup")}
        onPassword={() => setSheet("password")}
        onLogin={async (loginId, password) => {
          const previewAccount = await findPreviewAccount(
            data.previewAccounts,
            loginId,
            password,
          );
          if (!serverMode && previewAccount) {
            setSession({
              id: previewAccount.id,
              loginId: previewAccount.loginId,
              name: previewAccount.name,
              companyName: previewAccount.companyName,
              role: previewAccount.role,
              status: previewAccount.status,
            });
            setSheet(null);
            return showFeedback(
              "로그인 완료",
              `${previewAccount.name} ${previewAccount.role === "admin" ? "관리자" : "거래처"} 계정으로 로그인했습니다.`,
              "success",
            );
          }
          if (!isMifApiConfigured())
            return showFeedback(
              "로그인",
              "아이디 또는 비밀번호가 올바르지 않습니다.",
            );
          try {
            const result = await mifApi.login(loginId, password);
            const user: MifSessionUser = result.user;
            setMifSessionToken(result.token);
            await saveSession({
              token: result.token,
              user: {
                id: user.id,
                loginId: user.loginId,
                name: user.name || user.loginId,
                companyName: user.companyName,
                role: user.role,
                status: user.status,
              },
            });
            setSession({
              id: user.id,
              loginId: user.loginId,
              name: user.name || user.loginId,
              companyName: user.companyName,
              role: user.role,
              status: user.status,
            });
            setSheet(null);
            await syncFromServer({ silent: true });
            showFeedback("로그인 완료", "승인된 MIF 계정으로 로그인했습니다.", "success");
          } catch (error) {
            showFeedback(
              "로그인",
              error instanceof Error ? error.message : "로그인할 수 없습니다.",
            );
          }
        }}
      />
      <SignupSheet
        onNotice={notify}
        visible={sheet === "signup"}
        onClose={() => setSheet("login")}
        onSubmit={async (input) => {
          const application: SignupApplication = {
            id: makeId("signup"),
            ...input,
            status: "pending",
            createdAt: new Date().toISOString(),
          };
          try {
            await runServerFirst(
              () =>
                mifApi.createSignupApplication({
                  companyName: application.companyName,
                  businessNumber: application.businessNumber,
                  contactName: application.contactName,
                  phone: application.phone,
                  email: application.email,
                  requestedLoginId: application.requestedLoginId,
                  requestedPassword: application.requestedPassword,
                }),
              async () => {
                const next = {
                  ...data,
                  signupApplications: [application, ...data.signupApplications],
                };
                await pushNotice(
                  next,
                  "거래처 가입 신청",
                  `${application.companyName} 가입 신청이 접수되었습니다.`,
                  "onboarding",
                  "admin",
                );
              },
            );
            setSheet("login");
            showFeedback(
              "가입 신청 완료",
              "관리자 승인 후 등록한 아이디와 비밀번호로 로그인할 수 있습니다.",
              "success",
            );
          } catch (error) {
            showFeedback(
              "가입 신청",
              error instanceof Error ? error.message : "가입 신청을 접수하지 못했습니다.",
            );
          }
        }}
      />
      <PasswordSheet
        onNotice={notify}
        visible={sheet === "password"}
        onClose={() => setSheet("login")}
        onSubmit={async (input) => {
          const request: PasswordResetRequest = {
            id: makeId("reset"),
            ...input,
            status: "pending",
            createdAt: new Date().toISOString(),
          };
          try {
            await runServerFirst(
              () =>
                mifApi.createPasswordResetRequest({
                  loginId: request.loginId,
                  companyName: request.companyName,
                  contactPhone: request.contactPhone,
                  message: request.message,
                }),
              async () => {
                const next = {
                  ...data,
                  passwordResetRequests: [request, ...data.passwordResetRequests],
                };
                await pushNotice(
                  next,
                  "비밀번호 재설정 요청",
                  `${request.companyName}(${request.loginId})에서 재설정을 요청했습니다.`,
                  "onboarding",
                  "admin",
                );
              },
            );
            setSheet("login");
            showFeedback(
              "재설정 요청 접수",
              "등록 정보를 확인한 뒤 관리자에게 재설정 요청이 전달되었습니다.",
              "success",
            );
          } catch (error) {
            showFeedback(
              "재설정 요청",
              error instanceof Error ? error.message : "요청을 접수하지 못했습니다.",
            );
          }
        }}
      />
      <PasswordChangeSheet
        visible={sheet === "passwordChange"}
        onClose={() => setSheet(null)}
        onSubmit={async (input) => {
          if (!isMifApiConfigured() || !getMifSessionToken()) {
            showFeedback(
              "비밀번호 변경",
              "서버에 연결된 상태에서만 비밀번호를 변경할 수 있습니다.",
            );
            return;
          }
          try {
            await mifApi.changePassword(input);
            setSheet(null);
            showFeedback(
              "비밀번호 변경 완료",
              "새 비밀번호로 변경했습니다. 다른 기기는 다시 로그인해야 합니다.",
              "success",
            );
          } catch (error) {
            showFeedback(
              "비밀번호 변경",
              error instanceof Error ? error.message : "비밀번호를 변경하지 못했습니다.",
            );
          }
        }}
      />
      <ProductSheet
        visible={sheet === "product"}
        product={editingProduct}
        categories={productCategories}
        isAdmin={isAdmin}
        onClose={() => setSheet(null)}
        onSave={async (product) => {
          try {
            const localSave = () => persist(saveProduct(data, product, productCategories));
            const exists = data.products.some((item) => item.id === product.id);
            const payload = {
              name: product.name,
              categoryId: product.categoryId,
              categoryName: product.categoryName,
              spec: product.spec,
              unit: product.unit,
              basePrice: product.basePrice,
              minOrderQty: product.minOrderQty,
              stockStatus: product.stockStatus,
              description: product.description,
              imageKey: product.imageUri,
              detailImageKeys: product.detailImageUris,
              marketingBadges: product.badges,
              isActive: product.isActive !== false,
              storageType: product.storageType ?? "room_temp",
              featuredPriority: product.featuredPriority,
            };
            await runServerFirst(
              () =>
                exists
                  ? mifApi.updateProduct(product.id, payload)
                  : mifApi.createProduct(payload),
              localSave,
            );
            setEditingProduct(undefined);
            setSheet(null);
            showFeedback(
              exists ? "상품 수정 완료" : "상품 등록 완료",
              "저장한 상품 정보를 서버에 반영했습니다.",
              "success",
            );
          } catch (error) {
            showFeedback(
              "상품 저장",
              error instanceof Error ? error.message : "상품을 저장하지 못했습니다.",
            );
          }
        }}
        onDelete={async (productId) => {
          try {
            setCart((current) => current.filter((item) => item.id !== productId));
            await runServerFirst(
              () => mifApi.deleteProduct(productId),
              () =>
                persist({
                  ...data,
                  products: data.products.filter((item) => item.id !== productId),
                  favorites: data.favorites.filter((id) => id !== productId),
                }),
            );
            setEditingProduct(undefined);
            setSheet(null);
            showFeedback("상품 삭제 완료", "상품과 장바구니·찜 연결 정보를 정리했습니다.", "success");
          } catch (error) {
            showFeedback(
              "상품 삭제",
              error instanceof Error ? error.message : "상품을 삭제하지 못했습니다.",
            );
          }
        }}
        onAdd={addProductToCart}
        onFavorite={toggleFavorite}
        isFavorite={
          editingProduct ? data.favorites.includes(editingProduct.id) : false
        }
      />
      <AddressSheet
        onNotice={notify}
        visible={sheet === "address"}
        address={editingAddress}
        onClose={() => setSheet(null)}
        onSave={async (address) => {
          try {
            const exists = data.addresses.some((item) => item.id === address.id);
            const payload = {
              label: address.label,
              recipient: address.recipient,
              phone: address.phone,
              postalCode: address.postalCode,
              address: address.address,
              addressDetail: address.addressDetail,
              isDefault: address.isDefault,
            };
            await runServerFirst(
              () =>
                exists
                  ? mifApi.updateAddress(address.id, payload)
                  : mifApi.createAddress(payload),
              () =>
                persist({
                  ...data,
                  addresses: saveAddress(data.addresses, address),
                }),
            );
            setSheet(null);
          } catch (error) {
            showFeedback(
              "배송지 저장",
              error instanceof Error ? error.message : "배송지를 저장하지 못했습니다.",
            );
          }
        }}
      />
      <BankSheet
        onNotice={notify}
        visible={sheet === "bank"}
        bank={editingBankRef.current}
        onClose={() => setSheet(null)}
        onSave={async (bank) => {
          try {
            const exists = data.banks.some((item) => item.id === bank.id);
            const payload = {
              bankName: bank.bankName,
              accountNumber: bank.accountNumber,
              accountHolder: bank.accountHolder,
              isActive: bank.isActive,
              isDefault: bank.isDefault === true,
            };
            await runServerFirst(
              () =>
                exists
                  ? mifApi.updateBankAccount(bank.id, payload)
                  : mifApi.createBankAccount(payload),
              () =>
                persist({
                  ...data,
                  banks: exists
                    ? data.banks.map((item) => (item.id === bank.id ? bank : item))
                    : [...data.banks, bank],
                }),
            );
            setSheet(null);
          } catch (error) {
            showFeedback(
              "결제 계좌 저장",
              error instanceof Error ? error.message : "결제 계좌를 저장하지 못했습니다.",
            );
          }
        }}
      />
      <CategorySheet
        onNotice={notify}
        visible={sheet === "category"}
        category={editingCategory}
        nextSortOrder={
          Math.max(0, ...data.categories.map((item) => item.sortOrder)) + 1
        }
        onClose={() => setSheet(null)}
        onSave={async (category) => {
          try {
            const exists = data.categories.some((item) => item.id === category.id);
            const payload = { name: category.name, sortOrder: category.sortOrder };
            await runServerFirst(
              () =>
                exists
                  ? mifApi.updateCategory(category.id, payload)
                  : mifApi.createCategory(payload),
              () => persist(saveCategory(data, category)),
            );
            setSheet(null);
          } catch (error) {
            showFeedback(
              "카테고리 저장",
              error instanceof Error
                ? error.message
                : "카테고리를 저장할 수 없습니다.",
            );
          }
        }}
      />
      <NoticeSheet
        onNotice={notify}
        visible={sheet === "notice"}
        notice={editingNotice}
        onClose={() => setSheet(null)}
        onSave={async (notice) => {
          try {
            const exists = data.notices.some((item) => item.id === notice.id);
            const payload = {
              title: notice.title,
              content: notice.content,
              isVisible: notice.isVisible,
              startDate: notice.startDate,
              endDate: notice.endDate,
            };
            await runServerFirst(
              () =>
                exists
                  ? mifApi.updateNotice(notice.id, payload)
                  : mifApi.createNotice(payload),
              async () => {
                const next = {
                  ...data,
                  notices: exists
                    ? data.notices.map((item) =>
                        item.id === notice.id ? notice : item,
                      )
                    : [notice, ...data.notices],
                };
                await pushNotice(next, "새 공지", notice.title, "notice", "customer");
              },
            );
            setSheet(null);
          } catch (error) {
            showFeedback(
              "공지 저장",
              error instanceof Error ? error.message : "공지를 저장하지 못했습니다.",
            );
          }
        }}
      />
      <NoticeDetailSheet
        visible={sheet === "noticeDetail"}
        notice={selectedNotice}
        onClose={() => setSheet(null)}
      />
      <QaSheet
        onNotice={notify}
        visible={sheet === "qa"}
        post={selectedQa}
        isAdmin={isAdmin}
        onClose={() => setSheet(null)}
        onSave={async (post) => {
          try {
            const exists = data.qaPosts.some((item) => item.id === post.id);
            const latestComment = post.comments[post.comments.length - 1];
            await runServerFirst(
              () =>
                exists
                  ? mifApi.createQaComment(post.id, {
                      authorName: latestComment?.authorName ?? session?.name ?? "MIF",
                      isAdmin,
                      content: latestComment?.content ?? "",
                    })
                  : mifApi.createQaPost({
                      authorName: post.authorName,
                      title: post.title,
                      content: post.content,
                      isPrivate: post.isPrivate,
                    }),
              async () => {
                const next = {
                  ...data,
                  qaPosts: exists
                    ? data.qaPosts.map((item) => (item.id === post.id ? post : item))
                    : [post, ...data.qaPosts],
                };
                await pushNotice(
                  next,
                  isAdmin ? "Q&A 답변 등록" : "Q&A 문의 등록",
                  post.title,
                  "qa",
                  isAdmin ? "customer" : "admin",
                );
              },
            );
            setSheet(null);
          } catch (error) {
            showFeedback(
              "Q&A 저장",
              error instanceof Error ? error.message : "Q&A를 저장하지 못했습니다.",
            );
          }
        }}
      />
      <InquirySheet
        onNotice={notify}
        visible={sheet === "inquiry"}
        onClose={() => setSheet(null)}
        onSave={async (inquiry) => {
          try {
            await runServerFirst(
              () =>
                mifApi.createVendorInquiry({
                  companyName: inquiry.companyName,
                  contactName: inquiry.contactName,
                  phone: inquiry.phone,
                  email: inquiry.email,
                  productCategories: inquiry.categories,
                  serviceArea: inquiry.serviceArea,
                  message: inquiry.message,
                }),
              async () => {
                const next = {
                  ...data,
                  vendorInquiries: [inquiry, ...data.vendorInquiries],
                };
                await pushNotice(
                  next,
                  "입점 문의 접수",
                  `${inquiry.companyName} 문의가 접수되었습니다.`,
                  "onboarding",
                  "admin",
                );
              },
            );
            setSheet(null);
          } catch (error) {
            showFeedback(
              "입점 문의",
              error instanceof Error ? error.message : "문의를 접수하지 못했습니다.",
            );
          }
        }}
      />
      <OrderSheet
        visible={sheet === "order"}
        order={selectedOrder}
        banks={data.banks}
        isAdmin={isAdmin}
        onClose={() => setSheet(null)}
        onStatus={changeOrderStatus}
        onShipping={async (order, input) => {
          try {
            const updated: Order = {
              ...order,
              courierCompany: input.courierCompany || undefined,
              trackingNumber: input.trackingNumber || undefined,
              truckDriverPhone: input.truckDriverPhone || undefined,
            };
            await runServerFirst(
              () =>
                mifApi.updateOrderStatus(order.id, {
                  status: order.status,
                  courierCompany: updated.courierCompany,
                  trackingNumber: updated.trackingNumber,
                  truckDriverPhone: updated.truckDriverPhone,
                }),
              () =>
                persist({
                  ...data,
                  orders: data.orders.map((item) =>
                    item.id === order.id ? updated : item,
                  ),
                }),
            );
            setSelectedOrder((current) =>
              current?.id === order.id ? updated : current,
            );
            showFeedback("배송 정보 저장", "배송 정보를 저장했습니다.", "success");
          } catch (error) {
            showFeedback(
              "배송 정보",
              error instanceof Error ? error.message : "배송 정보를 저장하지 못했습니다.",
            );
          }
        }}
        onReorder={(order) => {
          setCart(order.items);
          goToPage("cart");
          setSheet(null);
        }}
        onDelete={async (id) => {
          try {
            await runServerFirst(
              () => mifApi.deleteOrder(id),
              () =>
                persist({
                  ...data,
                  orders: data.orders.filter((order) => order.id !== id),
                }),
            );
            setSheet(null);
          } catch (error) {
            showFeedback(
              "주문 삭제",
              error instanceof Error ? error.message : "주문을 삭제하지 못했습니다.",
            );
          }
        }}
      />
      <CartFeedbackModal
        feedback={cartFeedback}
        cartCount={cart.length}
        onContinue={() => setCartFeedback(null)}
        onGoCart={() => {
          setCartFeedback(null);
          goToPage("cart");
        }}
      />
    </SafeAreaView>
  );

  return Platform.OS === "web" ? (
    <View style={styles.canvas}>
      <View style={styles.previewTag}>
        <Text style={styles.previewTagText}>MIF APP PREVIEW</Text>
      </View>
      <View style={styles.device}>{content}</View>
    </View>
  ) : (
    content
  );
}

const editingBankRef: { current?: BankAccount } = {};

function AppBar({
  role,
  unread,
  onNotifications,
  onAccount,
  onBack,
  onClose,
}: {
  role: UserRole;
  unread: number;
  onNotifications: () => void;
  onAccount: () => void;
  onBack?: () => void;
  onClose?: () => void;
}) {
  return (
    <View style={styles.appbar}>
      <View style={styles.brand}>
        <View style={styles.mark}>
          <Text style={styles.markText}>M</Text>
        </View>
        <View>
          <Text style={styles.brandName}>MIF</Text>
          <Text style={styles.brandSub}>ORDER TALK</Text>
        </View>
      </View>
      <View style={styles.appActions}>
        {onBack && (
          <Pressable
            accessibilityLabel="이전 화면으로 이동"
            onPress={onBack}
            style={styles.iconButton}
          >
            {icon("chevron-back", palette.navy, 23)}
          </Pressable>
        )}
        <Pressable
          onPress={onAccount}
          style={[
            styles.roleChip,
            role === "admin" && { backgroundColor: "#F4EBFF" },
          ]}
        >
          <Text
            style={[
              styles.roleText,
              role === "admin" && { color: palette.purple },
            ]}
          >
            {role === "admin" ? "관리자" : "거래처"}
          </Text>
        </Pressable>
        <Pressable onPress={onNotifications} style={styles.iconButton}>
          {icon("notifications-outline", palette.navy, 21)}
          {unread > 0 && (
            <View style={styles.badgeDot}>
              <Text style={styles.badgeDotText}>
                {unread > 9 ? "9+" : unread}
              </Text>
            </View>
          )}
        </Pressable>
        {onClose && (
          <Pressable
            accessibilityLabel="이전 화면으로 닫기"
            onPress={onClose}
            style={styles.iconButton}
          >
            {icon("close-outline", palette.navy, 22)}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function HomePage({
  data,
  notices,
  isAdmin,
  cartCount,
  onPage,
  onProduct,
  onAdd,
  onOpenNotice,
}: {
  data: MifData;
  notices: Notice[];
  isAdmin: boolean;
  cartCount: number;
  onPage: (page: Page) => void;
  onProduct: (product: Product) => void;
  onAdd: (product: Product) => void;
  onOpenNotice: (notice: Notice) => void;
}) {
  const counts = statusCounts(data.orders);
  const featured = [...data.products]
    .filter(
      (product) =>
        (isAdmin || product.isActive !== false) &&
        (product.featuredPriority !== undefined || product.badges.length),
    )
    .sort((a, b) => (a.featuredPriority ?? 99) - (b.featuredPriority ?? 99))
    .slice(0, 4);
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>MIF B2B ORDER</Text>
          <Text style={styles.heroTitle}>
            발주부터 배송까지{`\n`}MIF에서 관리하세요.
          </Text>
          <Text style={styles.heroCopy}>
            거래처별 발주 업무를 MIF 전용 데이터 공간에서 관리합니다.
          </Text>
        </View>
        <View style={styles.heroMark}>
          <Text style={styles.heroMarkText}>M</Text>
        </View>
      </View>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>주문 현황</Text>
        <Pressable onPress={() => onPage("orders")}>
          <Text style={styles.link}>주문 조회</Text>
        </Pressable>
      </View>
      <View style={styles.statGrid}>
        {(["RECEIVED", "PAID", "PREPARING", "SHIPPING"] as OrderStatus[]).map(
          (status) => (
            <Pressable
              key={status}
              style={styles.statCard}
              onPress={() => onPage("orders")}
            >
              <Text style={styles.statNumber}>{counts[status]}</Text>
              <Text style={styles.statLabel}>{orderStatusLabel[status]}</Text>
            </Pressable>
          ),
        )}
      </View>
      <View style={styles.quickGrid}>
        <QuickCard
          icon="cube-outline"
          label="상품 탐색"
          onPress={() => onPage("products")}
        />
        {!isAdmin && (
          <QuickCard
            icon="cart-outline"
            label={`장바구니 ${cartCount}`}
            onPress={() => onPage("cart")}
          />
        )}
        <QuickCard
          icon={isAdmin ? "speedometer-outline" : "business-outline"}
          label={isAdmin ? "관리자" : "입점 문의"}
          onPress={() => onPage(isAdmin ? "admin" : "inquiry")}
        />
      </View>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>추천 상품</Text>
        <Pressable onPress={() => onPage("products")}>
          <Text style={styles.link}>전체 보기</Text>
        </Pressable>
      </View>
      {featured.length ? (
        featured.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            favorite={data.favorites.includes(product.id)}
            onOpen={() => onProduct(product)}
            onAdd={() => onAdd(product)}
          />
        ))
      ) : (
        <InlineEmpty
          icon="sparkles-outline"
          title="추천 상품이 없습니다"
          copy="관리자가 상품에 BEST·시즌·할인 배지 또는 우선 노출을 설정하면 표시됩니다."
        />
      )}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>공지</Text>
        <Pressable onPress={() => onPage("notices")}>
          <Text style={styles.link}>전체 보기</Text>
        </Pressable>
      </View>
      {notices.slice(0, 3)
        .map((notice) => (
          <Pressable
            key={notice.id}
            style={({ pressed }) => [styles.noticeRow, pressed && styles.noticeRowPressed]}
            onPress={() => onOpenNotice(notice)}
            accessibilityLabel={`${notice.title} 공지 상세 보기`}
          >
            {icon("megaphone-outline", palette.teal, 17)}
            <Text style={styles.noticeTitle} numberOfLines={1}>
              {notice.title}
            </Text>
            <Text style={styles.noticeDate}>
              {notice.startDate ?? notice.createdAt.slice(0, 10)}
            </Text>
          </Pressable>
        ))}
      {!notices.length && (
        <InlineEmpty
          icon="notifications-outline"
          title="게시 중인 공지가 없습니다"
          copy="새 공지가 등록되면 이곳에서 확인할 수 있습니다."
        />
      )}
    </ScrollView>
  );
}

function ProductsPage({
  categories,
  products,
  totalProductCount,
  favorites,
  query,
  category,
  sort,
  favoritesOnly,
  isAdmin,
  onQuery,
  onCategory,
  onSort,
  onFavoritesOnly,
  onToggleFavorite,
  onAdd,
  onOpen,
  onAddProduct,
  onShareFavorites,
  title = "상품",
  onBack,
  onClose,
}: {
  categories: Category[];
  products: Product[];
  totalProductCount: number;
  favorites: string[];
  query: string;
  category: string;
  sort: ProductSortOption;
  favoritesOnly: boolean;
  isAdmin: boolean;
  onQuery: (value: string) => void;
  onCategory: (value: string) => void;
  onSort: (value: ProductSortOption) => void;
  onFavoritesOnly: (value: boolean) => void;
  onToggleFavorite: (id: string) => void;
  onAdd: (product: Product) => void;
  onOpen: (product: Product) => void;
  onAddProduct?: () => void;
  onShareFavorites?: (products: Product[]) => void;
  title?: string;
  onBack?: () => void;
  onClose?: () => void;
}) {
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const visibleCategories = categories.filter((item) => item.isActive);
  const selectedSort =
    PRODUCT_SORT_OPTIONS.find((option) => option.id === sort) ??
    PRODUCT_SORT_OPTIONS[0];
  const headerAction =
    isAdmin && onAddProduct
      ? { icon: "add", onPress: onAddProduct }
      : favoritesOnly && onShareFavorites
        ? {
            icon: "share-social-outline",
            onPress: () => onShareFavorites(products),
          }
        : undefined;
  return (
    <View style={styles.page}>
      {onBack && onClose ? (
        <BackHeader title={title} onBack={onBack} onClose={onClose} action={headerAction} />
      ) : (
        <PageHeader
          title={title}
          subtitle={
            favoritesOnly
              ? "저장한 상품을 확인하거나 공유하세요."
              : "카테고리·검색·정렬로 상품을 찾으세요."
          }
          action={headerAction}
        />
      )}
      {!favoritesOnly && (
        <>
          <View style={styles.searchBox}>
            {icon("search-outline", palette.muted, 18)}
            <TextInput
              value={query}
              onChangeText={onQuery}
              placeholder="상품명 검색"
              placeholderTextColor="#98A2B3"
              style={styles.searchInput}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable
                accessibilityLabel="상품 검색어 지우기"
                onPress={() => onQuery("")}
                style={styles.searchClearButton}
              >
                {icon("close-circle", palette.muted, 18)}
              </Pressable>
            )}
          </View>
          <View style={styles.categoryFilterRow}>
            <Chip
              label="전체상품"
              active={category === ALL_PRODUCT_CATEGORY_ID}
              onPress={() => onCategory(ALL_PRODUCT_CATEGORY_ID)}
            />
            <View style={styles.categoryFilterDivider} />
            <ScrollView
              horizontal
              style={styles.categoryFilterScroll}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryFilterScrollContent}
            >
              {visibleCategories.map((item) => (
                <Chip
                  key={item.id}
                  label={`${item.icon} ${item.name}`}
                  active={category === item.id || category === item.name}
                  onPress={() => onCategory(item.id)}
                />
              ))}
            </ScrollView>
          </View>
          <View style={styles.filterRow}>
            <Text style={styles.productCount}>
              상품 {products.length}/{totalProductCount}개
            </Text>
            <Pressable
              accessibilityLabel={`상품 정렬 ${selectedSort.label}`}
              onPress={() => setSortMenuVisible(true)}
              style={styles.sortSelector}
            >
              <Text style={styles.sortSelectorText}>{selectedSort.label}</Text>
              {icon("chevron-down", palette.muted, 15)}
            </Pressable>
            <Chip
              label="찜한 상품"
              active={favoritesOnly}
              onPress={() => onFavoritesOnly(!favoritesOnly)}
            />
          </View>
        </>
      )}
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <InlineEmpty
            icon="cube-outline"
            title={
              favoritesOnly ? "찜한 상품이 없습니다" : "등록된 상품이 없습니다"
            }
            copy={
              isAdmin
                ? "오른쪽 상단 + 버튼으로 상품을 등록하세요."
                : "관리자가 상품을 등록하면 이곳에 표시됩니다."
            }
          />
        }
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            favorite={favorites.includes(item.id)}
            onFavorite={() => onToggleFavorite(item.id)}
            onOpen={() => onOpen(item)}
            onAdd={() => onAdd(item)}
          />
        )}
      />
      <Modal
        visible={sortMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuVisible(false)}
      >
        <Pressable
          style={styles.sortModalBackdrop}
          onPress={() => setSortMenuVisible(false)}
        >
          <View
            style={styles.sortModalCard}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.sortModalHeader}>
              <Text style={styles.sortModalTitle}>상품 정렬</Text>
              <Pressable
                accessibilityLabel="상품 정렬 닫기"
                onPress={() => setSortMenuVisible(false)}
                style={styles.iconButton}
              >
                {icon("close-outline", palette.muted, 22)}
              </Pressable>
            </View>
            {PRODUCT_SORT_OPTIONS.map((option) => {
              const active = sort === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityLabel={`${option.label} 정렬 선택`}
                  style={[styles.sortOption, active && styles.sortOptionActive]}
                  onPress={() => {
                    onSort(option.id);
                    setSortMenuVisible(false);
                  }}
                >
                  <View style={styles.sortOptionCopy}>
                    <Text style={[styles.sortOptionLabel, active && styles.sortOptionLabelActive]}>
                      {option.label}
                    </Text>
                    <Text style={styles.sortOptionDescription}>{option.description}</Text>
                  </View>
                  {active && icon("checkmark-circle", palette.teal, 20)}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function CartPage({
  cart,
  isAdmin,
  addresses,
  banks,
  total,
  onQuantity,
  onClear,
  onRemove,
  onOrder,
  onAddress,
  onContinueShopping,
  onNotice,
}: {
  cart: CartItem[];
  isAdmin: boolean;
  addresses: Address[];
  banks: BankAccount[];
  total: number;
  onQuantity: (id: string, quantity: number) => void;
  onClear: () => void;
  onRemove: (id: string) => void;
  onOrder: (input: {
    address: Address;
    deliveryMethod: DeliveryMethod;
    desiredDeliveryAt?: string;
    bankAccountId?: string;
    note?: string;
  }) => void;
  onAddress: () => void;
  onContinueShopping: () => void;
  onNotice?: (title: string, message: string, tone?: ToastTone) => void;
}) {
  const [addressId, setAddressId] = useState(
    addresses.find((item) => item.isDefault)?.id ?? "",
  );
  const [method, setMethod] = useState<DeliveryMethod | null>(null);
  const [desiredDate, setDesiredDate] = useState("");
  const [desiredTime, setDesiredTime] = useState("09:00");
  const [bankId, setBankId] = useState(
    banks.find((item) => item.isActive)?.id ?? "",
  );
  const [note, setNote] = useState("");
  const [courierConfirmVisible, setCourierConfirmVisible] = useState(false);
  const [deliveryDateVisible, setDeliveryDateVisible] = useState(false);
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CartItem | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const hasUnavailableItems = cart.some(
    (item) => item.stockStatus === "out_of_stock",
  );
  const selectedAddress =
    addresses.find((item) => item.id === addressId) ??
    addresses.find((item) => item.isDefault) ??
    addresses[0];
  const selectMethod = (next: DeliveryMethod) => {
    setMethod(next);
    if (next === "courier") {
      setDesiredDate("");
      setCourierConfirmVisible(true);
    }
  };
  const checkout = () => {
    const error = validateCartCheckout({
      cart,
      address: selectedAddress,
      method,
      bankAccountId: bankId || undefined,
    });
    if (error) {
      setCheckoutError(error);
      return;
    }
    setCheckoutError("");
    onOrder({
      address: selectedAddress!,
      deliveryMethod: method!,
      desiredDeliveryAt: resolveDesiredDeliveryAt(
        method!,
        desiredDate,
        desiredTime,
      ),
      bankAccountId: bankId || undefined,
      note: note || undefined,
    });
  };
  const defaultAddress = addresses.find((address) => address.isDefault);
  return (
    <View style={styles.page}>
      <PageHeader
        title="장바구니"
        subtitle="품목·배송·결제 정보를 확인한 뒤 주문하세요."
        action={
          cart.length
            ? {
                icon: "trash-outline",
                onPress: () => setClearConfirmVisible(true),
              }
            : undefined
        }
      />
      {isAdmin ? (
        <View style={styles.emptyWithAction}>
          <InlineEmpty
            icon="shield-checkmark-outline"
            title="관리자 계정은 발주를 생성할 수 없습니다"
            copy="관리자 업무 메뉴에서 상품·주문·결제 계좌를 관리해 주세요."
          />
        </View>
      ) : !cart.length ? (
        <View style={styles.emptyWithAction}>
          <InlineEmpty
            icon="cart-outline"
            title="장바구니가 비어 있습니다"
            copy="상품 탭에서 발주할 상품을 담아 보세요."
          />
          <Pressable style={styles.primaryButton} onPress={onContinueShopping}>
            <Text style={styles.primaryText}>상품 계속 보기</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            data={cart}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListFooterComponent={
              <View style={styles.checkoutPanel}>
                {checkoutError ? (
                  <Text style={styles.formError}>{checkoutError}</Text>
                ) : null}
                <Text style={styles.panelTitle}>📍 배송지 선택</Text>
                {selectedAddress ? (
                  <View style={styles.addressSummary}>
                    <View style={styles.sectionRow}>
                      <Text style={styles.strong}>
                        {selectedAddress.label} · {selectedAddress.recipient}
                      </Text>
                      {selectedAddress.isDefault && (
                        <Text style={styles.defaultLabel}>기본</Text>
                      )}
                    </View>
                    <Text style={styles.muted}>
                      ({selectedAddress.postalCode}) {selectedAddress.address}{" "}
                      {selectedAddress.addressDetail}
                    </Text>
                    <Text style={styles.muted}>{selectedAddress.phone}</Text>
                  </View>
                ) : (
                  <InlineEmpty
                    icon="location-outline"
                    title="배송지를 등록해 주세요"
                    copy="결제 전 수령 주소가 필요합니다."
                  />
                )}
                <Pressable style={styles.outlineButton} onPress={onAddress}>
                  <Text style={styles.outlineText}>배송지 관리·추가</Text>
                </Pressable>
                {addresses.length > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {addresses.map((address) => (
                      <Chip
                        key={address.id}
                        label={`${address.isDefault ? "기본 · " : ""}${address.label}`}
                        active={selectedAddress?.id === address.id}
                        onPress={() => setAddressId(address.id)}
                      />
                    ))}
                  </ScrollView>
                )}
                <Text style={styles.panelTitle}>🚚 배송 방법</Text>
                <View style={styles.deliveryOptions}>
                  {(
                    [
                      {
                        id: "courier",
                        icon: "📦",
                        label: "택배",
                        desc: "택배사를 통한 배송",
                      },
                      {
                        id: "truck",
                        icon: "🚛",
                        label: "용달",
                        desc: "용달 차량 직접 배송",
                      },
                      {
                        id: "pickup",
                        icon: "🏪",
                        label: "픽업",
                        desc: "직접 방문 수령",
                      },
                    ] as const
                  ).map((option) => (
                    <Pressable
                      key={option.id}
                      style={[
                        styles.deliveryOption,
                        method === option.id && styles.deliveryOptionActive,
                      ]}
                      onPress={() => selectMethod(option.id)}
                    >
                      <Text style={styles.deliveryIcon}>{option.icon}</Text>
                      <Text
                        style={[
                          styles.deliveryLabel,
                          method === option.id && styles.deliveryLabelActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      <Text style={styles.deliveryDesc}>{option.desc}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.panelTitle}>📅 배송 희망일·시간</Text>
                <Pressable
                  style={[
                    styles.dateSelect,
                    !canChooseDesiredDeliveryAt(method) &&
                      styles.dateSelectDisabled,
                  ]}
                  onPress={() =>
                    canChooseDesiredDeliveryAt(method)
                      ? setDeliveryDateVisible(true)
                      : onNotice?.(
                          "택배 주문",
                          "택배 배송은 배송희망일과 시간을 지정할 수 없습니다.",
                          "info",
                        )
                  }
                >
                  <Text style={styles.dateSelectText}>
                    {method === "courier"
                      ? "택배 선택 시 배송희망일·시간 지정 불가"
                      : desiredDate
                        ? `${desiredDate} ${desiredTime}`
                        : "날짜와 시간을 선택해 주세요."}
                  </Text>
                </Pressable>
                <Text style={styles.panelTitle}>결제 계좌</Text>
                {banks.some((bank) => bank.isActive) ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {banks
                      .filter((bank) => bank.isActive)
                      .map((bank) => (
                        <Chip
                          key={bank.id}
                          label={`${bank.bankName} ${bank.accountNumber}`}
                          active={bankId === bank.id}
                          onPress={() => setBankId(bank.id)}
                        />
                      ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.formError}>
                    결제 계좌가 등록되지 않아 주문할 수 없습니다. 관리자에게 결제 계좌 등록을 요청해 주세요.
                  </Text>
                )}
                <Field
                  label="주문 메모"
                  value={note}
                  onChangeText={setNote}
                  placeholder="배송 요청사항을 입력하세요. (선택)"
                  multiline
                />
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.cartRow}>
                <View style={styles.productIcon}>
                  {icon("cube-outline", palette.teal, 24)}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.muted}>
                    {item.spec} · {money(item.basePrice)} · 최소{" "}
                    {item.minOrderQty}
                    {item.unit}
                  </Text>
                  <Text style={styles.productPrice}>
                    {money(item.basePrice * item.quantity)}
                  </Text>
                  {item.stockStatus === "out_of_stock" && (
                    <Text style={styles.cartStockWarning}>
                      관리자 재고 상태 변경으로 품절된 상품입니다.
                    </Text>
                  )}
                </View>
                <View style={styles.quantity}>
                  <Pressable
                    accessibilityLabel={`${item.name} 수량 감소`}
                    disabled={item.stockStatus === "out_of_stock"}
                    onPress={() => onQuantity(item.id, item.quantity - 1)}
                    style={
                      item.stockStatus === "out_of_stock"
                        ? styles.quantityDisabled
                        : undefined
                    }
                  >
                    {icon("remove-circle-outline")}
                  </Pressable>
                  <Text style={styles.quantityText}>{item.quantity}</Text>
                  <Pressable
                    accessibilityLabel={`${item.name} 수량 증가`}
                    disabled={item.stockStatus === "out_of_stock"}
                    onPress={() => onQuantity(item.id, item.quantity + 1)}
                    style={
                      item.stockStatus === "out_of_stock"
                        ? styles.quantityDisabled
                        : undefined
                    }
                  >
                    {icon("add-circle-outline")}
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`${item.name} 삭제`}
                    onPress={() => setRemoveTarget(item)}
                    style={{ marginLeft: 5 }}
                  >
                    {icon("close-circle-outline", palette.muted, 18)}
                  </Pressable>
                </View>
              </View>
            )}
          />
          <View style={styles.checkoutBar}>
            <View>
              <Text style={styles.muted}>총 주문금액</Text>
              <Text style={styles.total}>{money(total)}</Text>
              {method && (
                <Text style={styles.deliverySummary}>
                  {method === "courier"
                    ? "📦 택배"
                    : method === "truck"
                      ? "🚛 용달"
                      : "🏪 픽업"}
                  {desiredDate ? ` · ${desiredDate} ${desiredTime}` : ""}
                </Text>
              )}
            </View>
            <Pressable
              disabled={hasUnavailableItems}
              style={[
                styles.primaryButton,
                hasUnavailableItems && styles.primaryButtonDisabled,
              ]}
              onPress={checkout}
            >
              <Text style={styles.primaryText}>
                {hasUnavailableItems ? "품절 상품 확인" : "주문하기"}
              </Text>
            </Pressable>
          </View>
        </>
      )}
      <Modal
        visible={courierConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCourierConfirmVisible(false);
          setMethod(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmModal}>
            <ModalCloseButton
              accessibilityLabel="택배 배송 안내 닫기"
              onPress={() => {
                setCourierConfirmVisible(false);
                setMethod(null);
              }}
            />
            <Text style={styles.modalTitle}>📦 택배 배송</Text>
            <Text style={styles.modalCopy}>
              택배 배송은 기본 배송지를 사용하며, 희망일과 시간은 지정할 수
              없습니다.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                if (defaultAddress) {
                  setAddressId(defaultAddress.id);
                  setCourierConfirmVisible(false);
                } else {
                  setCourierConfirmVisible(false);
                  onAddress();
                  onNotice?.(
                    "기본 배송지 없음",
                    "기본 배송지가 없어 새 배송지를 등록해 주세요.",
                    "warning",
                  );
                }
              }}
            >
              <Text style={styles.primaryText}>기본 배송지 사용</Text>
            </Pressable>
            <Pressable
              style={styles.outlineButton}
              onPress={() => {
                setCourierConfirmVisible(false);
                onAddress();
              }}
            >
              <Text style={styles.outlineText}>새 배송지 등록</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setCourierConfirmVisible(false);
                setMethod(null);
              }}
            >
              <Text style={styles.textButton}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={deliveryDateVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDeliveryDateVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmModal}>
            <ModalCloseButton
              accessibilityLabel="배송 희망일 선택 닫기"
              onPress={() => setDeliveryDateVisible(false)}
            />
            <Text style={styles.modalTitle}>📅 배송 희망일 선택</Text>
            <DateTimeOptionPicker
              date={desiredDate}
              time={desiredTime}
              onDateChange={setDesiredDate}
              onTimeChange={setDesiredTime}
              minimumDate={dateAtOffset(0)}
            />
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                if (!desiredDate) {
                  onNotice?.("배송 희망일", "날짜를 선택해 주세요.", "warning");
                  return;
                }
                setDeliveryDateVisible(false);
              }}
            >
              <Text style={styles.primaryText}>선택 완료</Text>
            </Pressable>
            <Pressable onPress={() => setDeliveryDateVisible(false)}>
              <Text style={styles.textButton}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ConfirmModal
        visible={clearConfirmVisible}
        title="장바구니 비우기"
        message="담긴 상품을 모두 삭제할까요?"
        confirmLabel="모두 삭제"
        onCancel={() => setClearConfirmVisible(false)}
        onConfirm={() => {
          setClearConfirmVisible(false);
          onClear();
        }}
      />
      <ConfirmModal
        visible={Boolean(removeTarget)}
        title="상품 삭제"
        message={
          removeTarget
            ? `${removeTarget.name}을(를) 장바구니에서 삭제할까요?`
            : ""
        }
        confirmLabel="삭제"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) onRemove(removeTarget.id);
          setRemoveTarget(null);
        }}
      />
    </View>
  );
}

function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "확인",
  cancelLabel = "취소",
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmCopy}>{message}</Text>
          <View style={styles.confirmActions}>
            <Pressable style={styles.confirmCancel} onPress={onCancel}>
              <Text style={styles.confirmCancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable style={styles.confirmDelete} onPress={onConfirm}>
              <Text style={styles.confirmDeleteText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CartFeedbackModal({
  feedback,
  cartCount,
  onContinue,
  onGoCart,
}: {
  feedback: { productName: string; quantity: number; amount: number } | null;
  cartCount: number;
  onContinue: () => void;
  onGoCart: () => void;
}) {
  return (
    <Modal
      visible={Boolean(feedback)}
      transparent
      animationType="fade"
      onRequestClose={onContinue}
    >
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmModal}>
          <ModalCloseButton
            accessibilityLabel="장바구니 담기 안내 닫기"
            onPress={onContinue}
          />
          <Text style={styles.modalIcon}>🛒</Text>
          <Text style={styles.modalTitle}>장바구니에 담았습니다!</Text>
          <Text style={styles.modalCopy}>{feedback?.productName}</Text>
          <View style={styles.cartFeedbackInfo}>
            <View style={styles.sectionRow}>
              <Text style={styles.muted}>수량</Text>
              <Text style={styles.strong}>{feedback?.quantity ?? 0}개</Text>
            </View>
            <View style={styles.sectionRow}>
              <Text style={styles.muted}>금액</Text>
              <Text style={styles.productPrice}>
                {money(feedback?.amount ?? 0)}
              </Text>
            </View>
            <View style={styles.sectionRow}>
              <Text style={styles.muted}>장바구니</Text>
              <Text style={styles.strong}>총 {cartCount}개 상품</Text>
            </View>
          </View>
          <View style={styles.modalActionRow}>
            <Pressable style={styles.outlineButton} onPress={onContinue}>
              <Text style={styles.outlineText}>계속 담기</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={onGoCart}>
              <Text style={styles.primaryText}>장바구니로 이동</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OrdersPage({
  orders,
  allCounts,
  selectedStatus,
  from,
  to,
  isAdmin,
  companyQuery,
  selectedIds,
  onStatus,
  onFrom,
  onTo,
  onCompanyQuery,
  onSelect,
  onOpen,
  onBulk,
  onExport,
}: {
  orders: Order[];
  allCounts: Record<OrderStatus, number>;
  selectedStatus: OrderStatus | "ALL";
  from: string;
  to: string;
  isAdmin: boolean;
  companyQuery: string;
  selectedIds: string[];
  onStatus: (status: OrderStatus | "ALL") => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onCompanyQuery: (value: string) => void;
  onSelect: (id: string) => void;
  onOpen: (order: Order) => void;
  onBulk: () => void;
  onExport?: () => void;
}) {
  const [periodPickerVisible, setPeriodPickerVisible] = useState(false);
  const [periodPickerTarget, setPeriodPickerTarget] = useState<"from" | "to">("from");
  const [periodDate, setPeriodDate] = useState("");
  const [periodTime, setPeriodTime] = useState("00:00");
  const [periodMonth, setPeriodMonth] = useState(() => monthStartFor());
  const openPeriodPicker = (target: "from" | "to") => {
    const selected = target === "from" ? from : to;
    const [selectedDate, selectedTime] = selected.split("T");
    setPeriodPickerTarget(target);
    setPeriodDate(selectedDate || dateAtOffset(target === "from" ? -30 : 0));
    setPeriodTime(selectedTime?.slice(0, 5) || (target === "from" ? "00:00" : "23:59"));
    setPeriodMonth(monthStartFor(selectedDate));
    setPeriodPickerVisible(true);
  };
  const applyQuickRange = (range: "today" | "last7Days" | "thisMonth") => {
    const value = quickOrderRange(range);
    onFrom(value.from);
    onTo(value.to);
  };
  const savePeriodPicker = () => {
    const value = `${periodDate}T${periodTime}:00`;
    if (periodPickerTarget === "from") onFrom(value);
    else onTo(value);
    setPeriodPickerVisible(false);
  };
  return (
    <View style={styles.page}>
      <PageHeader
        title={isAdmin ? "주문 관리" : "주문 조회"}
        subtitle="기간과 상태 기준으로 주문을 확인하세요."
      />
      <View style={styles.periodBox}>
        <View style={styles.periodHead}>
          {icon("calendar-outline", palette.teal, 19)}
          <Text style={styles.strong}>기간별 주문 조회</Text>
        </View>
        <View style={styles.dateRow}>
          <Pressable
            style={styles.periodDateInput}
            onPress={() => openPeriodPicker("from")}
          >
            {icon("calendar-outline", palette.teal, 16)}
            <Text style={[styles.periodDateText, !from && styles.periodDatePlaceholder]}>
              {dateTimeInputLabel(from, "시작일·시간")}
            </Text>
          </Pressable>
          <Text style={styles.muted}>~</Text>
          <Pressable
            style={styles.periodDateInput}
            onPress={() => openPeriodPicker("to")}
          >
            {icon("calendar-outline", palette.teal, 16)}
            <Text style={[styles.periodDateText, !to && styles.periodDatePlaceholder]}>
              {dateTimeInputLabel(to, "종료일·시간")}
            </Text>
          </Pressable>
        </View>
        <View style={styles.quickRangeRow}>
          <Text style={styles.quickRangeLabel}>빠른 선택</Text>
          <Pressable style={styles.quickRangeButton} onPress={() => applyQuickRange("today")}>
            <Text style={styles.quickRangeText}>오늘</Text>
          </Pressable>
          <Pressable style={styles.quickRangeButton} onPress={() => applyQuickRange("last7Days")}>
            <Text style={styles.quickRangeText}>최근 7일</Text>
          </Pressable>
          <Pressable style={styles.quickRangeButton} onPress={() => applyQuickRange("thisMonth")}>
            <Text style={styles.quickRangeText}>이번 달</Text>
          </Pressable>
        </View>
        {isAdmin && onExport ? (
          <Pressable style={styles.exportButton} onPress={onExport}>
            {icon("download-outline", palette.navy, 16)}
            <Text style={styles.exportButtonText}>조회 기간 주문 CSV 내보내기</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label={`전체 ${Object.values(allCounts).reduce((a, b) => a + b, 0)}`}
          active={selectedStatus === "ALL"}
          onPress={() => onStatus("ALL")}
        />
        {(
          [
            "RECEIVED",
            "PAID",
            "CONFIRMED",
            "PREPARING",
            "SHIPPING",
            "DELIVERED",
            "CANCELED",
          ] as OrderStatus[]
        ).map((status) => (
          <Chip
            key={status}
            label={`${orderStatusLabel[status]} ${allCounts[status]}`}
            active={selectedStatus === status}
            onPress={() => onStatus(status)}
          />
        ))}
      </ScrollView>
      {isAdmin ? (
        <View style={styles.orderSearchBox}>
          {icon("business-outline", palette.teal, 18)}
          <TextInput
            value={companyQuery}
            onChangeText={onCompanyQuery}
            placeholder="거래처명 또는 주문번호 검색"
            placeholderTextColor={palette.muted}
            style={styles.orderSearchInput}
            accessibilityLabel="거래처별 주문 검색"
          />
          {companyQuery ? (
            <Pressable
              accessibilityLabel="거래처 주문 검색어 지우기"
              onPress={() => onCompanyQuery("")}
            >
              {icon("close-circle", palette.muted, 19)}
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {isAdmin && companyQuery ? (
        <Text style={styles.orderSearchResult}>"{companyQuery}" 검색 결과 {orders.length}건</Text>
      ) : null}
      {isAdmin && selectedIds.length > 0 && (
        <Pressable style={styles.bulkButton} onPress={onBulk}>
          <Text style={styles.bulkText}>
            {selectedIds.length}건 다음 상태로 일괄 변경
          </Text>
        </Pressable>
      )}
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <InlineEmpty
            icon="receipt-outline"
            title="조건에 맞는 주문이 없습니다"
            copy="기간 또는 주문 상태를 바꿔 보세요."
          />
        }
        renderItem={({ item, index }) => (
          <OrderRow
            order={item}
            isLatest={index === 0}
            isAdmin={isAdmin}
            selected={selectedIds.includes(item.id)}
            onSelect={() => onSelect(item.id)}
            onOpen={() => onOpen(item)}
          />
        )}
      />
      <Modal
        visible={periodPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPeriodPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmModal}>
            <ModalCloseButton
              accessibilityLabel="기간 선택 닫기"
              onPress={() => setPeriodPickerVisible(false)}
            />
            <Text style={styles.modalTitle}>
              {periodPickerTarget === "from" ? "📅 시작일·시간 선택" : "📅 종료일·시간 선택"}
            </Text>
            <DateTimeOptionPicker
              date={periodDate}
              time={periodTime}
              onDateChange={setPeriodDate}
              onTimeChange={setPeriodTime}
              month={periodMonth}
              onMonthChange={setPeriodMonth}
            />
            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.outlineButton}
                onPress={() => {
                  if (periodPickerTarget === "from") onFrom("");
                  else onTo("");
                  setPeriodPickerVisible(false);
                }}
              >
                <Text style={styles.outlineText}>초기화</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={savePeriodPicker}>
                <Text style={styles.primaryText}>선택 완료</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MorePage({
  data,
  role,
  session,
  onPage,
  onSheet,
  onLogout,
}: {
  data: MifData;
  role: UserRole;
  session: SessionUser | null;
  onPage: (page: Page) => void;
  onSheet: (sheet: Sheet) => void;
  onLogout: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>더보기</Text>
      <Text style={styles.subtitle}>계정, 거래처, 고객지원을 관리하세요.</Text>
      <View style={styles.account}>
        <View style={styles.accountMark}>
          <Text style={styles.accountMarkText}>
            {role === "admin" ? "A" : "M"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.accountTitle}>
            {session?.name ?? "MIF 계정"}
          </Text>
          <Text style={styles.accountCopy}>
            {session
              ? `${session.loginId} · ${role === "admin" ? "관리자" : "거래처"}`
              : "로그인 후 계정과 업무 메뉴를 이용할 수 있습니다."}
          </Text>
        </View>
        <Pressable onPress={() => onPage("profile")}>
          {icon("person-circle-outline", "#D9EDF0", 21)}
        </Pressable>
      </View>
      <MenuGroup title="내 계정">
        <MenuRow
          icon="person-circle-outline"
          title="내 계정과 보안"
          copy={session ? `${session.loginId} · ${role === "admin" ? "관리자" : "거래처"}` : "로그인, 비밀번호 재설정, 보안 정보를 관리합니다."}
          onPress={() => onPage("profile")}
        />
        {role === "customer" && (
          <>
            <MenuRow
              icon="person-add-outline"
              title="거래처 가입 신청"
              copy="사업자등록증을 첨부해 거래처 가입 심사를 신청합니다."
              onPress={() => onSheet("signup")}
            />
            <MenuRow
              icon="key-outline"
              title="비밀번호 재설정"
              copy="등록 정보로 재설정 요청을 남깁니다."
              onPress={() => onSheet("password")}
            />
          </>
        )}
      </MenuGroup>
      <MenuGroup title="주문·배송">
        <MenuRow
          icon="receipt-outline"
          title="주문 내역"
          copy="주문 상태, 배송 조회, 재주문을 확인합니다."
          onPress={() => onPage("orders")}
        />
        <MenuRow
          icon="location-outline"
          title="배송지 관리"
          copy={`${data.addresses.length}개의 배송지가 등록되어 있습니다.`}
          onPress={() => onPage("addresses")}
        />
        <MenuRow
          icon="heart-outline"
          title="찜한 상품"
          copy={`${data.favorites.length}개의 상품을 저장했습니다.`}
          onPress={() => onPage("favorites")}
        />
      </MenuGroup>
      <MenuGroup title="고객지원">
        <MenuRow
          icon="megaphone-outline"
          title="공지사항"
          copy="중요 공지와 운영 안내를 확인합니다."
          onPress={() => onPage("notices")}
        />
        <MenuRow
          icon="chatbubbles-outline"
          title="Q&A 게시판"
          copy="문의 작성과 답변을 확인합니다."
          onPress={() => onPage("qa")}
        />
        <MenuRow
          icon="storefront-outline"
          title="입점 문의"
          copy="공급·입점 관련 문의를 접수합니다."
          onPress={() => onPage("inquiry")}
        />
      </MenuGroup>
      <MenuGroup title="알림·앱 설정">
        <MenuRow
          icon="notifications-outline"
          title="알림함"
          copy={`${data.notifications.filter((item) => (item.recipientRole === "all" || item.recipientRole === role) && !item.isRead).length}개의 읽지 않은 알림이 있습니다.`}
          onPress={() => onPage("notifications")}
        />
        <MenuRow
          icon="information-circle-outline"
          title="앱 정보"
          copy="MIF 앱 버전, 알림 및 데이터 분리 원칙을 확인합니다."
          onPress={() => onPage("appInfo")}
        />
      </MenuGroup>
      {role === "admin" && (
        <MenuGroup title="관리자">
          <MenuRow
            icon="speedometer-outline"
            title="관리자 업무"
            copy="주문·상품·가입 심사·공지·결제 계좌를 관리합니다."
            onPress={() => onPage("admin")}
          />
        </MenuGroup>
      )}
      {session && (
        <Pressable style={styles.outlineButton} onPress={onLogout}>
          <Text style={[styles.outlineText, { color: palette.error }]}>
            로그아웃
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function ProfilePage({
  session,
  role,
  onBack,
  onClose,
  onLogin,
  onPassword,
  onChangePassword,
  onLogout,
}: {
  session: SessionUser | null;
  role: UserRole;
  onBack: () => void;
  onClose: () => void;
  onLogin: () => void;
  onPassword: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const isSignedIn = Boolean(session);
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <BackHeader title="내 계정과 보안" onBack={onBack} onClose={onClose} />
      <View style={styles.account}>
        <View style={styles.accountMark}>
          <Text style={styles.accountMarkText}>{role === "admin" ? "A" : "M"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.accountTitle}>{session?.name ?? "로그인이 필요합니다"}</Text>
          <Text style={styles.accountCopy}>
            {session
              ? `${session.companyName ?? "MIF 거래처"} · ${session.loginId}`
              : "승인된 MIF 거래처 또는 관리자 계정으로 로그인하세요."}
          </Text>
        </View>
      </View>
      <MenuGroup title="계정 보안">
        {isSignedIn && (
          <MenuRow
            icon="key-outline"
            title="비밀번호 변경"
            copy="현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다."
            onPress={onChangePassword}
          />
        )}
        {role === "customer" && (
          <MenuRow
            icon="lock-closed-outline"
            title="비밀번호 재설정"
            copy="등록 정보로 본인 확인 요청을 남깁니다."
            onPress={onPassword}
          />
        )}
        <MenuRow
          icon="shield-checkmark-outline"
          title="권한 상태"
          copy={isSignedIn ? `${role === "admin" ? "관리자" : "승인 거래처"} 권한으로 로그인했습니다.` : "승인된 계정만 주문·관리 기능을 이용할 수 있습니다."}
          onPress={isSignedIn ? onBack : onLogin}
        />
      </MenuGroup>
      {isSignedIn ? (
        <Pressable style={styles.outlineButton} onPress={onLogout}>
          <Text style={[styles.outlineText, { color: palette.error }]}>로그아웃</Text>
        </Pressable>
      ) : (
        <Primary text="MIF 계정 로그인" onPress={onLogin} />
      )}
    </ScrollView>
  );
}

function AppInfoPage({
  onBack,
  onClose,
  pushAccessState,
  pushAccessMessage,
  onRequestPush,
}: {
  onBack: () => void;
  onClose: () => void;
  pushAccessState: "idle" | "requesting" | "granted" | "denied" | "unsupported" | "error";
  pushAccessMessage: string;
  onRequestPush: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <BackHeader title="앱 정보" onBack={onBack} onClose={onClose} />
      <View style={styles.dashboard}>
        <Text style={styles.eyebrow}>MIF B2B ORDER</Text>
        <Text style={styles.dashboardTitle}>MIF ORDER TALK</Text>
        <Text style={styles.dashboardCopy}>
          버전 1.0.0 · Android com.lguplusb2b.mif
        </Text>
      </View>
      <MenuGroup title="데이터 및 알림">
        <MenuRow
          icon="cloud-outline"
          title="MIF 전용 데이터 공간"
          copy="운영 데이터는 MIF 전용 API·DB·파일 저장소에서 분리 관리합니다."
          onPress={() => undefined}
        />
        <View style={styles.pushPermissionCard}>
          <View style={styles.pushPermissionHeader}>
            {icon("notifications-outline", palette.teal, 20)}
            <View style={styles.pushPermissionCopy}>
              <Text style={styles.strong}>푸시 알림</Text>
              <Text style={styles.helper}>{pushAccessMessage}</Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="푸시 알림 권한 허용 및 기기 등록"
            disabled={pushAccessState === "requesting" || pushAccessState === "unsupported"}
            onPress={onRequestPush}
            style={[
              styles.primaryButton,
              styles.pushPermissionButton,
              (pushAccessState === "requesting" || pushAccessState === "unsupported") && styles.primaryButtonDisabled,
            ]}
          >
            <Text style={styles.primaryText}>
              {pushAccessState === "granted"
                ? "알림 설정 다시 확인"
                : pushAccessState === "denied"
                  ? "기기 설정에서 알림 허용"
                  : pushAccessState === "requesting"
                    ? "권한 확인 중"
                    : "푸시 알림 권한 허용"}
            </Text>
          </Pressable>
        </View>
      </MenuGroup>
      <Text style={styles.helper}>
        MIF는 전용 API·DB·파일 저장소를 사용하며 거래처와 주문 데이터는 독립적으로 관리합니다.
      </Text>
    </ScrollView>
  );
}

function AdminPage({
  data,
  accounts,
  onBack,
  onClose,
  onPage,
  onSheet,
  onBulk,
}: {
  data: MifData;
  accounts: Array<{ role: UserRole }>;
  onBack: () => void;
  onClose: () => void;
  onPage: (page: Page) => void;
  onSheet: (sheet: Sheet) => void;
  onBulk: () => void;
}) {
  const todayOrders = data.orders.filter(
    (order) => order.createdAt.slice(0, 10) === today(),
  );
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <BackHeader title="관리자 업무" onBack={onBack} onClose={onClose} />
      <View style={styles.dashboard}>
        <Text style={styles.eyebrow}>TODAY MIF DASHBOARD</Text>
        <Text style={styles.dashboardTitle}>
          금일 발주 {todayOrders.length}건
        </Text>
        <Text style={styles.dashboardCopy}>
          결제 대기{" "}
          {todayOrders.filter((order) => order.status === "RECEIVED").length}건
          · 배송 중{" "}
          {todayOrders.filter((order) => order.status === "SHIPPING").length}건
        </Text>
      </View>
      <AdminGrid
        icon="receipt-outline"
        label="주문 관리"
        copy="기간·상태 필터, 일괄 처리"
        onPress={() => onPage("orders")}
      />
      <AdminGrid
        icon="cube-outline"
        label="상품 관리"
        copy="등록·수정·우선 노출·배지"
        onPress={() => onPage("products")}
      />
      <AdminGrid
        icon="grid-outline"
        label="카테고리 관리"
        copy="카테고리 등록·수정·삭제"
        onPress={() => onPage("categories")}
      />
      <AdminGrid
        icon="card-outline"
        label="결제은행 관리"
        copy="결제 계좌 등록·수정·삭제"
        onPress={() => onPage("banks")}
      />
      <AdminGrid
        icon="people-outline"
        label="가입 신청 심사"
        copy={`대기 ${data.signupApplications.filter((item) => item.status === "pending").length}건`}
        onPress={() => onPage("applications")}
      />
      <AdminGrid
        icon="shield-checkmark-outline"
        label="계정 권한 관리"
        copy={`관리자 ${accounts.filter((account) => account.role === "admin").length}명 · 거래처 ${accounts.filter((account) => account.role === "customer").length}명`}
        onPress={() => onPage("accountRoles")}
      />
      <AdminGrid
        icon="key-outline"
        label="비밀번호 재설정 요청"
        copy={`대기 ${data.passwordResetRequests.filter((item) => item.status === "pending").length}건`}
        onPress={() => onPage("passwordRequests")}
      />
      <AdminGrid
        icon="storefront-outline"
        label="입점 문의 관리"
        copy={`대기 ${data.vendorInquiries.filter((item) => item.status === "pending").length}건`}
        onPress={() => onPage("inquiry")}
      />
      <AdminGrid
        icon="megaphone-outline"
        label="공지 관리"
        copy="노출 기간과 공지 CRUD"
        onPress={() => onPage("notices")}
      />
      <AdminGrid
        icon="chatbubbles-outline"
        label="Q&A 관리"
        copy="거래처 문의 답변·첨부"
        onPress={() => onPage("qa")}
      />
      <Pressable style={styles.bulkButton} onPress={onBulk}>
        <Text style={styles.bulkText}>선택 주문 일괄 상태 처리</Text>
      </Pressable>
    </ScrollView>
  );
}

function AccountRolesPage({
  accounts,
  currentAccountId,
  onBack,
  onClose,
  onChangeRole,
  onChangeStatus,
}: {
  accounts: Array<{
    id: string;
    loginId: string;
    name?: string;
    companyName?: string;
    role: UserRole;
    status: "active" | "inactive";
  }>;
  currentAccountId?: string;
  onBack: () => void;
  onClose: () => void;
  onChangeRole: (accountId: string, role: UserRole) => void;
  onChangeStatus: (accountId: string, status: "active" | "inactive") => void;
}) {
  const sortedAccounts = [...accounts].sort(
    (left, right) => Number(right.role === "admin") - Number(left.role === "admin"),
  );
  return (
    <View style={styles.page}>
      <BackHeader title="계정 권한 관리" onBack={onBack} onClose={onClose} />
      <FlatList
        data={sortedAccounts}
        keyExtractor={(account) => account.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.roleIntro}>
            <View style={styles.roleIntroIcon}>
              {icon("shield-checkmark-outline", palette.teal, 21)}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>승인 계정 권한 지정</Text>
              <Text style={styles.muted}>
                승인된 거래처와 가입 계정을 관리자 또는 거래처로 지정합니다.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <InlineEmpty
            icon="people-outline"
            title="관리할 승인 계정이 없습니다"
            copy="가입 신청을 승인하면 계정 권한 관리 목록에 표시됩니다."
          />
        }
        renderItem={({ item: account }) => {
          const isCurrentAccount = currentAccountId === account.id;
          return (
            <View style={styles.accountRoleCard}>
              <View style={styles.sectionRow}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.strong}>{account.name || account.loginId}</Text>
                  <Text style={styles.muted}>
                    {account.companyName ? `${account.companyName} · ` : ""}
                    {account.loginId}
                  </Text>
                </View>
                <View
                  style={[
                    styles.roleBadge,
                    account.role === "admin"
                      ? styles.roleBadgeAdmin
                      : styles.roleBadgeCustomer,
                  ]}
                >
                  <Text
                    style={[
                      styles.roleBadgeText,
                      { color: account.role === "admin" ? palette.purple : palette.teal },
                    ]}
                  >
                    {roleLabel[account.role]}
                  </Text>
                </View>
              </View>
              <Text style={styles.noticeDate}>
                상태: {account.status === "active" ? "활성" : "비활성"}
                {isCurrentAccount ? " · 현재 로그인 계정" : ""}
              </Text>
              <View style={styles.roleActionRow}>
                <Pressable
                  disabled={isCurrentAccount || account.role === "customer"}
                  onPress={() => onChangeRole(account.id, "customer")}
                  style={[
                    styles.roleActionButton,
                    account.role === "customer" && styles.roleActionButtonActive,
                    isCurrentAccount && styles.roleActionButtonDisabled,
                  ]}
                >
                  <Text style={styles.roleActionText}>거래처 지정</Text>
                </Pressable>
                <Pressable
                  disabled={isCurrentAccount || account.role === "admin"}
                  onPress={() => onChangeRole(account.id, "admin")}
                  style={[
                    styles.roleActionButton,
                    account.role === "admin" && styles.roleActionButtonActive,
                    isCurrentAccount && styles.roleActionButtonDisabled,
                  ]}
                >
                  <Text style={styles.roleActionText}>관리자 지정</Text>
                </Pressable>
                <Pressable
                  disabled={isCurrentAccount}
                  onPress={() =>
                    onChangeStatus(
                      account.id,
                      account.status === "active" ? "inactive" : "active",
                    )
                  }
                  style={[
                    styles.roleActionButton,
                    account.status === "inactive" && styles.roleActionButtonDisabled,
                    isCurrentAccount && styles.roleActionButtonDisabled,
                  ]}
                >
                  <Text style={styles.roleActionText}>
                    {account.status === "active" ? "사용 중지" : "사용 재개"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function AddressesPage({
  addresses,
  onBack,
  onClose,
  onAdd,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  addresses: Address[];
  onBack: () => void;
  onClose: () => void;
  onAdd: () => void;
  onEdit: (address: Address) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  return (
    <View style={styles.page}>
      <BackHeader
        title="배송지 관리"
        onBack={onBack}
        onClose={onClose}
        action={{ icon: "add", onPress: onAdd }}
      />
      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <InlineEmpty
            icon="location-outline"
            title="등록된 배송지가 없습니다"
            copy="오른쪽 상단 + 버튼으로 첫 배송지를 등록하세요."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.sectionRow}>
              <Text style={styles.strong}>
                {item.label}{" "}
                {item.isDefault && <Text style={styles.defaultTag}>기본</Text>}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => onEdit(item)}>
                  {icon("create-outline")}
                </Pressable>
                <Pressable onPress={() => onDelete(item.id)}>
                  {icon("trash-outline", palette.error)}
                </Pressable>
              </View>
            </View>
            <Text style={styles.muted}>
              {item.recipient} · {item.phone}
            </Text>
            <Text style={styles.muted}>
              {item.postalCode ? `(${item.postalCode}) ` : ""}
              {item.address} {item.addressDetail}
            </Text>
            {!item.isDefault && (
              <Pressable
                accessibilityLabel={`${item.label} 기본 배송지로 설정`}
                style={styles.setDefaultAddressButton}
                onPress={() => onSetDefault(item.id)}
              >
                {icon("location-outline", palette.teal, 15)}
                <Text style={styles.setDefaultAddressText}>기본 배송지로 설정</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}

function NoticesPage({
  notices,
  isAdmin,
  onBack,
  onClose,
  onEdit,
  onCreate,
  onDelete,
  onOpen,
}: {
  notices: Notice[];
  isAdmin: boolean;
  onBack: () => void;
  onClose: () => void;
  onEdit: (notice: Notice) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onOpen: (notice: Notice) => void;
}) {
  return (
    <View style={styles.page}>
      <BackHeader
        title="공지사항"
        onBack={onBack}
        onClose={onClose}
        action={isAdmin ? { icon: "add", onPress: onCreate } : undefined}
      />
      <FlatList
        data={notices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <InlineEmpty
            icon="megaphone-outline"
            title="공지사항이 없습니다"
            copy={
              isAdmin
                ? "오른쪽 상단 + 버튼으로 첫 공지를 등록하세요."
                : "게시된 공지가 이곳에 표시됩니다."
            }
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => (isAdmin ? onEdit(item) : onOpen(item))}
          >
            <View style={styles.sectionRow}>
              <Text style={styles.strong}>{item.title}</Text>
              {isAdmin && (
                <Pressable onPress={() => onDelete(item.id)}>
                  {icon("trash-outline", palette.error, 18)}
                </Pressable>
              )}
            </View>
            <Text style={styles.noticeContent} numberOfLines={2}>
              {item.content}
            </Text>
            <Text style={styles.noticeDate}>
              {item.startDate || item.createdAt.slice(0, 10)}{" "}
              {item.endDate ? `~ ${item.endDate}` : ""} ·{" "}
              {item.isVisible ? "노출" : "비노출"}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function QaPage({
  posts,
  isAdmin,
  onBack,
  onClose,
  onCreate,
  onOpen,
}: {
  posts: QAPost[];
  isAdmin: boolean;
  onBack: () => void;
  onClose: () => void;
  onCreate: () => void;
  onOpen: (post: QAPost) => void;
}) {
  return (
    <View style={styles.page}>
      <BackHeader
        title={isAdmin ? "Q&A 관리" : "Q&A 게시판"}
        onBack={onBack}
        onClose={onClose}
        action={
          !isAdmin ? { icon: "create-outline", onPress: onCreate } : undefined
        }
      />
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <InlineEmpty
            icon="chatbubbles-outline"
            title="문의가 없습니다"
            copy={
              isAdmin
                ? "거래처 문의가 접수되면 이곳에서 답변합니다."
                : "문의 작성 버튼으로 새 질문을 남겨 보세요."
            }
          />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => onOpen(item)}>
            <View style={styles.sectionRow}>
              <Text style={styles.strong}>{item.title}</Text>
              <Text
                style={[
                  styles.qaState,
                  {
                    color: item.isAnswered ? palette.success : palette.warning,
                  },
                ]}
              >
                {item.isAnswered ? "답변완료" : "답변대기"}
              </Text>
            </View>
            <Text style={styles.noticeContent} numberOfLines={2}>
              {item.content}
            </Text>
            <Text style={styles.noticeDate}>
              {item.authorName} · {item.createdAt.slice(0, 10)} · 첨부{" "}
              {item.attachmentNames.length}개
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function InquiryPage({
  inquiries,
  isAdmin,
  onBack,
  onClose,
  onCreate,
  onReview,
}: {
  inquiries: VendorInquiry[];
  isAdmin: boolean;
  onBack: () => void;
  onClose: () => void;
  onCreate: () => void;
  onReview: (inquiry: VendorInquiry, decision: ApplicationStatus) => void;
}) {
  return (
    <View style={styles.page}>
      <BackHeader
        title={isAdmin ? "입점 문의 관리" : "입점 문의"}
        onBack={onBack}
        onClose={onClose}
        action={
          !isAdmin ? { icon: "create-outline", onPress: onCreate } : undefined
        }
      />
      <FlatList
        data={inquiries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <InlineEmpty
            icon="storefront-outline"
            title="입점 문의가 없습니다"
            copy={
              isAdmin
                ? "새 문의가 접수되면 이곳에 표시됩니다."
                : "입점·공급 문의를 작성해 주세요."
            }
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.sectionRow}>
              <Text style={styles.strong}>{item.companyName}</Text>
              <StatusPill value={item.status} />
            </View>
            <Text style={styles.noticeContent}>{item.message}</Text>
            <Text style={styles.noticeDate}>
              {item.contactName} · {item.phone} · {item.categories.join(", ")}
            </Text>
            {isAdmin && item.status === "pending" && (
              <View style={styles.actionRow}>
                <Secondary
                  text="반려"
                  tone="error"
                  onPress={() => onReview(item, "rejected")}
                />
                <Primary
                  text="처리 완료"
                  onPress={() => onReview(item, "approved")}
                />
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

function ApplicationsPage({
  applications,
  onBack,
  onClose,
  onReview,
}: {
  applications: SignupApplication[];
  onBack: () => void;
  onClose: () => void;
  onReview: (
    application: SignupApplication,
    decision: "approved" | "rejected",
  ) => void;
}) {
  return (
    <View style={styles.page}>
      <BackHeader title="거래처 가입 신청" onBack={onBack} onClose={onClose} />
      <FlatList
        data={applications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <InlineEmpty
            icon="people-outline"
            title="가입 신청이 없습니다"
            copy="거래처가 가입을 신청하면 이곳에 표시됩니다."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.sectionRow}>
              <Text style={styles.strong}>{item.companyName}</Text>
              <StatusPill value={item.status} />
            </View>
            <Text style={styles.muted}>
              {item.businessNumber} · {item.contactName} · {item.phone}
            </Text>
            <Text style={styles.muted}>
              {item.requestedLoginId} · {item.documentName || "문서 없음"}
            </Text>
            {item.status === "pending" && (
              <View style={styles.actionRow}>
                <Secondary
                  text="반려"
                  tone="error"
                  onPress={() => onReview(item, "rejected")}
                />
                <Primary
                  text="승인"
                  onPress={() => onReview(item, "approved")}
                />
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

function PasswordRequestsPage({
  requests,
  onBack,
  onClose,
  onReview,
}: {
  requests: PasswordResetRequest[];
  onBack: () => void;
  onClose: () => void;
  onReview: (
    request: PasswordResetRequest,
    status: "completed" | "rejected",
  ) => void;
}) {
  return (
    <View style={styles.page}>
      <BackHeader title="비밀번호 재설정 요청" onBack={onBack} onClose={onClose} />
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <InlineEmpty
            icon="key-outline"
            title="재설정 요청이 없습니다"
            copy="거래처의 본인 확인 요청이 접수되면 이곳에서 처리합니다."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.sectionRow}>
              <Text style={styles.strong}>{item.companyName}</Text>
              <StatusPill
                value={
                  item.status === "completed"
                    ? "approved"
                    : item.status === "rejected"
                      ? "rejected"
                      : "pending"
                }
              />
            </View>
            <Text style={styles.muted}>
              {item.loginId} · {item.contactPhone}
            </Text>
            {item.message ? (
              <Text style={styles.noticeContent}>{item.message}</Text>
            ) : null}
            {item.status === "pending" && (
              <View style={styles.actionRow}>
                <Secondary
                  text="반려"
                  tone="error"
                  onPress={() => onReview(item, "rejected")}
                />
                <Primary
                  text="본인 확인 완료"
                  onPress={() => onReview(item, "completed")}
                />
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

function BanksPage({
  banks,
  onBack,
  onClose,
  onEdit,
  onAdd,
  onDelete,
}: {
  banks: BankAccount[];
  onBack: () => void;
  onClose: () => void;
  onEdit: (bank: BankAccount) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <View style={styles.page}>
      <BackHeader
        title="결제은행 관리"
        onBack={onBack}
        onClose={onClose}
        action={{ icon: "add", onPress: onAdd }}
      />
      <FlatList
        data={banks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <InlineEmpty
            icon="card-outline"
            title="등록된 결제 계좌가 없습니다"
            copy="오른쪽 상단 + 버튼으로 거래처 결제 계좌를 등록하세요."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.sectionRow}>
              <Text style={styles.strong}>
                {item.bankName} · {item.accountHolder}
                {item.isDefault ? <Text style={styles.defaultTag}> 기본</Text> : null}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => onEdit(item)}>
                  {icon("create-outline")}
                </Pressable>
                <Pressable onPress={() => onDelete(item.id)}>
                  {icon("trash-outline", palette.error)}
                </Pressable>
              </View>
            </View>
            <Text style={styles.muted}>
              {item.accountNumber} · {item.isActive ? "사용" : "중지"}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

function CategoriesPage({
  categories,
  onBack,
  onClose,
  onEdit,
  onAdd,
  onDelete,
  onReorder,
  onMove,
}: {
  categories: Category[];
  onBack: () => void;
  onClose: () => void;
  onEdit: (category: Category) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  return (
    <View style={styles.page}>
      <BackHeader
        title="카테고리 관리"
        onBack={onBack}
        onClose={onClose}
        action={{ icon: "add", onPress: onAdd }}
      />
      <DraggableFlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        activationDistance={10}
        onDragEnd={({ data: nextCategories }) =>
          onReorder(nextCategories.map((category) => category.id))
        }
        ListHeaderComponent={
          categories.length ? (
            <Text style={styles.categoryOrderHint}>
              ⋮⋮ 핸들을 길게 눌러 드래그하거나 화살표로 노출 순서를 변경하세요.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <InlineEmpty
            icon="grid-outline"
            title="카테고리가 없습니다"
            copy="오른쪽 상단 + 버튼으로 카테고리를 등록하세요."
          />
        }
        renderItem={({ item, drag, isActive, getIndex }) => {
          const index = getIndex() ?? 0;
          return (
          <View style={[styles.card, isActive && styles.categoryDraggingCard]}>
            <View style={styles.sectionRow}>
              <View style={styles.categoryTitleRow}>
                <Pressable
                  accessibilityLabel={`${item.name} 드래그하여 순서 변경`}
                  onLongPress={drag}
                  delayLongPress={120}
                  style={styles.categoryDragHandle}
                >
                  {icon("reorder-three-outline", palette.muted, 22)}
                </Pressable>
                <Text style={styles.strong}>
                  {item.icon} {item.name}
                </Text>
              </View>
              <View style={styles.categoryOrderActions}>
                <Pressable
                  accessibilityLabel={`${item.name} 위로 이동`}
                  disabled={index === 0}
                  onPress={() => onMove(item.id, "up")}
                  style={[
                    styles.categoryMoveButton,
                    index === 0 && styles.categoryMoveButtonDisabled,
                  ]}
                >
                  {icon("chevron-up-outline", index === 0 ? palette.line : palette.teal, 18)}
                </Pressable>
                <Pressable
                  accessibilityLabel={`${item.name} 아래로 이동`}
                  disabled={index === categories.length - 1}
                  onPress={() => onMove(item.id, "down")}
                  style={[
                    styles.categoryMoveButton,
                    index === categories.length - 1 && styles.categoryMoveButtonDisabled,
                  ]}
                >
                  {icon(
                    "chevron-down-outline",
                    index === categories.length - 1 ? palette.line : palette.teal,
                    18,
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel={`${item.name} 수정`}
                  onPress={() => onEdit(item)}
                  style={styles.categoryMoveButton}
                >
                  {icon("create-outline")}
                </Pressable>
                <Pressable
                  accessibilityLabel={`${item.name} 삭제`}
                  onPress={() => onDelete(item.id)}
                  style={styles.categoryMoveButton}
                >
                  {icon("trash-outline", palette.error)}
                </Pressable>
              </View>
            </View>
            <Text style={styles.muted}>
              노출 순서 {item.sortOrder} · {item.isActive ? "사용" : "숨김"}
            </Text>
          </View>
          );
        }}
      />
    </View>
  );
}

function NotificationsPage({
  notifications,
  onBack,
  onClose,
  onRead,
  onReadAll,
  onOpenTarget,
  onDelete,
  onClearRead,
}: {
  notifications: MifData["notifications"];
  onBack: () => void;
  onClose: () => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onOpenTarget: (item: AppNotification) => void;
  onDelete: (id: string) => void;
  onClearRead: () => void;
}) {
  return (
    <View style={styles.page}>
      <BackHeader
        title="알림"
        onBack={onBack}
        onClose={onClose}
        action={{ icon: "checkmark-done-outline", onPress: onReadAll }}
      />
      <View style={styles.notificationToolbar}>
        <Text style={styles.helper}>
          읽은 알림은 30일 후 자동 정리되며, 지금 바로 정리할 수도 있습니다.
        </Text>
        <Pressable style={styles.smallOutlineButton} onPress={onClearRead}>
          <Text style={styles.smallOutlineButtonText}>읽은 알림 정리</Text>
        </Pressable>
      </View>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <InlineEmpty
            icon="notifications-outline"
            title="새 알림이 없습니다"
            copy="주문·공지·Q&A 관련 알림이 표시됩니다."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, !item.isRead && styles.unread]}
            onPress={() => {
              onRead(item.id);
              onOpenTarget(item);
            }}
          >
            <Text style={styles.strong}>{item.title}</Text>
            <Text style={styles.noticeContent}>{item.body}</Text>
            <View style={styles.notificationFooter}>
              <Text style={styles.noticeDate}>
                {item.createdAt.slice(0, 16).replace("T", " ")}
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => onDelete(item.id)}
                accessibilityLabel="알림 삭제"
              >
                <Ionicons name="trash-outline" size={16} color={palette.muted} />
              </Pressable>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function ProductRow({
  product,
  favorite,
  onFavorite,
  onOpen,
  onAdd,
}: {
  product: Product;
  favorite?: boolean;
  onFavorite?: () => void;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.productRow}>
      <Pressable onPress={onOpen} style={styles.productTap}>
        <View style={styles.productImage}>
          {product.imageUri ? (
            <Image
              source={{ uri: product.imageUri }}
              style={styles.productImageFill}
            />
          ) : (
            icon("cube-outline", palette.teal, 28)
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.categoryLabel}>
            {product.categoryName || "미분류"}
          </Text>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.muted}>
            {product.spec || "규격 미입력"} · {product.unit}
          </Text>
          <View style={styles.badgeRow}>
            <StockStatusBadge status={product.stockStatus} />
            <StorageTypeBadge storageType={product.storageType} />
            {product.badges.map((badge) => (
              <Text key={badge} style={styles.marketingBadge}>
                {badge}
              </Text>
            ))}
          </View>
          <Text style={styles.productPrice}>{money(product.basePrice)}</Text>
        </View>
      </Pressable>
      <View style={styles.productActions}>
        {onFavorite && (
          <Pressable onPress={onFavorite}>
            {icon(
              favorite ? "heart" : "heart-outline",
              favorite ? palette.error : palette.muted,
              21,
            )}
          </Pressable>
        )}
        <Pressable
          style={[
            styles.addCart,
            product.stockStatus === "out_of_stock" && {
              backgroundColor: "#98A2B3",
            },
          ]}
          onPress={onAdd}
        >
          {icon(
            product.stockStatus === "out_of_stock" ? "close" : "add",
            "#fff",
            18,
          )}
        </Pressable>
      </View>
    </View>
  );
}

function StorageTypeBadge({ storageType }: { storageType?: Product["storageType"] }) {
  if (!storageType) return null;
  const labels: Record<NonNullable<Product["storageType"]>, string> = {
    refrigerated: "냉장",
    frozen: "냉동",
    room_temp: "실온",
  };
  return <Text style={styles.marketingBadge}>{labels[storageType]}</Text>;
}

function StockStatusBadge({
  status,
  compact = false,
}: {
  status: Product["stockStatus"];
  compact?: boolean;
}) {
  const presentation = stockStatusPresentation[status];
  return (
    <View
      accessibilityLabel={`상품 ${presentation.label}`}
      style={[
        styles.stockStatusBadge,
        compact && styles.stockStatusBadgeCompact,
        { backgroundColor: presentation.backgroundColor },
      ]}
    >
      {icon(presentation.icon, presentation.color, compact ? 11 : 13)}
      <Text
        style={[
          styles.stockStatusBadgeText,
          compact && styles.stockStatusBadgeTextCompact,
          { color: presentation.color },
        ]}
      >
        {presentation.label}
      </Text>
    </View>
  );
}

function OrderRow({
  order,
  isLatest,
  isAdmin,
  selected,
  onSelect,
  onOpen,
}: {
  order: Order;
  isLatest: boolean;
  isAdmin: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const shippingInfo = orderShippingInfoLines(order);
  return (
    <Pressable
      style={[styles.orderCard, isLatest && styles.latest]}
      onPress={onOpen}
    >
      <View style={styles.sectionRow}>
        {
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            {isAdmin && (
              <Pressable onPress={onSelect}>
                {icon(
                  selected ? "checkbox" : "square-outline",
                  selected ? palette.teal : palette.muted,
                  20,
                )}
              </Pressable>
            )}
            <Text style={styles.strong}>{order.orderNumber}</Text>
          </View>
        }
        <View
          style={[
            styles.statusPill,
            { backgroundColor: `${statusColor[order.status]}18` },
          ]}
        >
          <Text
            style={[styles.statusText, { color: statusColor[order.status] }]}
          >
            {orderStatusLabel[order.status]}
          </Text>
        </View>
      </View>
      {isLatest && <Text style={styles.latestText}>가장 최근 주문</Text>}
      {isAdmin && order.companyName && <Text style={styles.orderCardCompany}>거래처 · {order.companyName}</Text>}
      <Text style={styles.orderDate}>{formatOrderDate(order.createdAt)}</Text>
      <View style={styles.orderDeliveryPanel}>
        <View style={styles.orderDeliveryLine}>
          <View style={styles.deliveryInfoIcon}>{icon("cube-outline", "#1D4ED8", 16)}</View>
          <View style={styles.orderDeliveryCopy}>
            <Text style={styles.orderDeliveryLabel}>배송 방법</Text>
            <Text style={styles.orderDeliveryValue}>{deliveryMethodPresentation(order.deliveryMethod)}</Text>
          </View>
        </View>
        <View style={styles.orderDeliveryLine}>
          <View style={[styles.deliveryInfoIcon, styles.deliveryAddressIcon]}>{icon("location-outline", palette.success, 16)}</View>
          <View style={styles.orderDeliveryCopy}>
            <Text style={styles.orderDeliveryLabel}>배송지</Text>
            <Text style={styles.orderDeliveryAddress} numberOfLines={2}>{formatOrderAddress(order)}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.orderItems} numberOfLines={1}>
        {order.items.map((item) => item.name).join(", ")}
      </Text>
      {order.desiredDeliveryAt && (
        <Text style={styles.orderDesiredDelivery}>📅 희망 배송일 {formatDesiredDelivery(order.desiredDeliveryAt)}</Text>
      )}
      {shippingInfo.map((line) => <Text key={line} style={styles.orderShippingInfo}>🚚 {line}</Text>)}
      <Text style={styles.orderAmount}>{money(order.totalAmount)}</Text>
    </Pressable>
  );
}

function LoginSheet({
  visible,
  onClose,
  locked,
  onSignup,
  onPassword,
  onLogin,
}: {
  visible: boolean;
  onClose: () => void;
  locked: boolean;
  onSignup: () => void;
  onPassword: () => void;
  onLogin: (loginId: string, password: string) => Promise<void>;
}) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  return (
    <Sheet
      visible={visible}
      title="MIF 로그인"
      onClose={onClose}
      showClose={!locked}
    >
      <Text style={styles.helper}>
        운영 환경에서는 MIF 전용 API의 승인된 계정으로 로그인합니다.
      </Text>
      <Field
        label="아이디"
        value={loginId}
        onChangeText={setLoginId}
        placeholder="아이디를 입력하세요"
        autoCapitalize="none"
      />
      <Field
        label="비밀번호"
        value={password}
        onChangeText={setPassword}
        placeholder="비밀번호를 입력하세요"
        secureTextEntry
      />
      <Primary text="로그인" onPress={() => onLogin(loginId, password)} />
      <View style={styles.authLinkRow}>
        <Pressable onPress={onSignup}>
          <Text style={styles.authLinkText}>회원가입하기</Text>
        </Pressable>
        <View style={styles.authLinkDivider} />
        <Pressable onPress={onPassword}>
          <Text style={styles.authLinkText}>비밀번호 찾기</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function SignupSheet({
  visible,
  onClose,
  onSubmit,
  onNotice,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (
    input: Omit<SignupApplication, "id" | "status" | "createdAt">,
  ) => Promise<void>;
  onNotice: (title: string, message: string, tone?: ToastTone) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [documentMimeType, setDocumentMimeType] = useState("");
  const [documentUri, setDocumentUri] = useState("");
  const [agreed, setAgreed] = useState(false);
  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setDocumentName(asset.name);
      setDocumentMimeType(asset.mimeType || "application/octet-stream");
      setDocumentUri(asset.uri);
    }
  };
  const submit = () => {
    const credentialError = getSignupCredentialError(
      loginId,
      password,
      confirmPassword,
    );
    if (credentialError) {
      onNotice("입력 확인", credentialError, "warning");
      return;
    }
    if (
      ![
        companyName,
        businessNumber,
        contactName,
        phone,
        loginId,
        documentName,
      ].every(Boolean) ||
      !agreed
    ) {
      onNotice(
        "입력 확인",
        "필수 정보, 사업자등록증, 약관 동의를 확인해 주세요.",
        "warning",
      );
      return;
    }
    onSubmit({
      companyName,
      businessNumber,
      contactName,
      phone,
      email: email || undefined,
      requestedLoginId: loginId,
      requestedPassword: password,
      documentName,
      documentMimeType,
      documentUri,
    });
  };
  return (
    <Sheet visible={visible} title="거래처 가입 신청" onClose={onClose}>
      <Field
        label="상호명"
        value={companyName}
        onChangeText={setCompanyName}
        placeholder="상호명을 입력하세요"
      />
      <Field
        label="사업자등록번호"
        value={businessNumber}
        onChangeText={setBusinessNumber}
        placeholder="숫자 또는 - 포함"
      />
      <Field
        label="담당자명"
        value={contactName}
        onChangeText={setContactName}
        placeholder="담당자명"
      />
      <Field
        label="연락처"
        value={phone}
        onChangeText={setPhone}
        placeholder="010-0000-0000"
        keyboardType="phone-pad"
      />
      <Field
        label="이메일 (선택)"
        value={email}
        onChangeText={setEmail}
        placeholder="email@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Field
        label="희망 아이디"
        value={loginId}
        onChangeText={setLoginId}
        placeholder="4자 이상"
        autoCapitalize="none"
      />
      <Field
        label="비밀번호"
        value={password}
        onChangeText={setPassword}
        placeholder="4자 이상"
        secureTextEntry
      />
      <Field
        label="비밀번호 확인"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="비밀번호를 다시 입력하세요"
        secureTextEntry
      />
      <Pressable style={styles.attach} onPress={pick}>
        {icon("attach-outline")}
        <Text style={styles.attachText}>
          {documentName
            ? `첨부됨: ${documentName}`
            : "사업자등록증 첨부 (필수)"}
        </Text>
      </Pressable>
      {documentUri ? (
        <Text style={styles.helper}>
          {documentMimeType || "파일"} · 미리보기 및 교체 가능
        </Text>
      ) : null}
      <Pressable style={styles.checkRow} onPress={() => setAgreed(!agreed)}>
        {icon(
          agreed ? "checkbox" : "square-outline",
          agreed ? palette.teal : palette.muted,
        )}
        <Text style={styles.muted}>
          개인정보 및 사업자 정보 처리에 동의합니다.
        </Text>
      </Pressable>
      <Primary text="가입 신청" onPress={submit} />
    </Sheet>
  );
}

function PasswordSheet({
  visible,
  onClose,
  onSubmit,
  onNotice,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (
    input: Omit<PasswordResetRequest, "id" | "status" | "createdAt">,
  ) => Promise<void>;
  onNotice: (title: string, message: string, tone?: ToastTone) => void;
}) {
  const [loginId, setLoginId] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <Sheet visible={visible} title="비밀번호 재설정" onClose={onClose}>
      <Text style={styles.helper}>
        등록된 거래처 정보와 함께 재설정 요청을 남깁니다.
      </Text>
      <Field
        label="아이디"
        value={loginId}
        onChangeText={setLoginId}
        placeholder="아이디"
      />
      <Field
        label="상호명"
        value={company}
        onChangeText={setCompany}
        placeholder="상호명"
      />
      <Field
        label="담당자 연락처"
        value={phone}
        onChangeText={setPhone}
        placeholder="연락처"
      />
      <Primary
        text="재설정 요청"
        onPress={() => {
          if (![loginId, company, phone].every(Boolean)) {
            onNotice("입력 확인", "필수 정보를 입력해 주세요.", "warning");
            return;
          }
          void onSubmit({
            loginId,
            companyName: company,
            contactPhone: phone,
          });
        }}
      />
    </Sheet>
  );
}

function PasswordChangeSheet({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (visible) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
    }
  }, [visible]);
  return (
    <Sheet visible={visible} title="비밀번호 변경" onClose={onClose}>
      <Text style={styles.helper}>
        현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다. 변경하면 다른 기기의 로그인은 해제됩니다.
      </Text>
      <Field
        label="현재 비밀번호"
        value={currentPassword}
        onChangeText={(value) => {
          setCurrentPassword(value);
          setError("");
        }}
        placeholder="현재 비밀번호"
        secureTextEntry
      />
      <Field
        label="새 비밀번호"
        value={newPassword}
        onChangeText={(value) => {
          setNewPassword(value);
          setError("");
        }}
        placeholder="새 비밀번호 (4자 이상)"
        secureTextEntry
      />
      <Field
        label="새 비밀번호 확인"
        value={confirmPassword}
        onChangeText={(value) => {
          setConfirmPassword(value);
          setError("");
        }}
        placeholder="새 비밀번호 확인"
        secureTextEntry
      />
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <Primary
        text="비밀번호 변경"
        onPress={() => {
          if (!currentPassword || !newPassword) {
            setError("현재 비밀번호와 새 비밀번호를 입력해 주세요.");
            return;
          }
          if (newPassword.length < 4) {
            setError("새 비밀번호는 4자 이상이어야 합니다.");
            return;
          }
          if (newPassword !== confirmPassword) {
            setError("새 비밀번호가 서로 일치하지 않습니다.");
            return;
          }
          if (newPassword === currentPassword) {
            setError("현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
            return;
          }
          void onSubmit({ currentPassword, newPassword });
        }}
      />
    </Sheet>
  );
}

function ProductSheet({
  visible,
  product,
  categories,
  isAdmin,
  onClose,
  onSave,
  onDelete,
  onAdd,
  onFavorite,
  isFavorite,
}: {
  visible: boolean;
  product?: Product;
  categories: Category[];
  isAdmin: boolean;
  onClose: () => void;
  onSave: (product: Product) => Promise<void>;
  onDelete: (productId: string) => Promise<void>;
  onAdd: (product: Product) => void;
  onFavorite: (id: string) => void;
  isFavorite: boolean;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [categoryName, setCategoryName] = useState(product?.categoryName ?? "");
  const [spec, setSpec] = useState(product?.spec ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "개");
  const [price, setPrice] = useState(product ? String(product.basePrice) : "");
  const [minQty, setMinQty] = useState(
    product ? String(product.minOrderQty) : "1",
  );
  const [description, setDescription] = useState(product?.description ?? "");
  const [stockStatus, setStockStatus] = useState(
    product?.stockStatus ?? "in_stock",
  );
  const [isActive, setIsActive] = useState(product?.isActive !== false);
  const [storageType, setStorageType] = useState<Product["storageType"]>(
    product?.storageType ?? "room_temp",
  );
  const [imageUri, setImageUri] = useState(product?.imageUri ?? "");
  const [detailImageUris, setDetailImageUris] = useState<string[]>(
    product?.detailImageUris ?? [],
  );
  const [badges, setBadges] = useState<ProductBadge[]>(product?.badges ?? []);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [adminPreview, setAdminPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  /** 같은 상품 시트를 열어 둔 동안 서버 스냅샷 갱신으로 작성 중인 값을 덮어쓰지 않는다. */
  const initializedProductKeyRef = useRef<string | null>(null);
  const visibleCategories = categories.filter((item) => item.isActive);
  useEffect(() => {
    if (!visible) {
      initializedProductKeyRef.current = null;
      return;
    }
    const productKey = product?.id ?? "new-product";
    if (
      !shouldInitializeProductSheet(
        visible,
        initializedProductKeyRef.current,
        product?.id,
      )
    )
      return;

    const defaultCategory = categories.find((item) => item.isActive);
    setName(product?.name ?? "");
    setCategoryId(product?.categoryId ?? defaultCategory?.id ?? "");
    setCategoryName(product?.categoryName ?? defaultCategory?.name ?? "");
    setSpec(product?.spec ?? "");
    setUnit(product?.unit ?? "개");
    setPrice(product ? String(product.basePrice) : "");
    setMinQty(product ? String(product.minOrderQty) : "1");
    setDescription(product?.description ?? "");
    setStockStatus(product?.stockStatus ?? "in_stock");
    setIsActive(product?.isActive !== false);
    setStorageType(product?.storageType ?? "room_temp");
    setImageUri(product?.imageUri ?? "");
    setDetailImageUris(product?.detailImageUris ?? []);
    setBadges(product?.badges ?? []);
    setFieldErrors({});
    setDeleteConfirmVisible(false);
    setAdminPreview(false);
    setIsSaving(false);
    setIsDeleting(false);
    initializedProductKeyRef.current = productKey;
  }, [visible, product?.id]);
  const pickMainImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled) return;
    const localUri = result.assets[0].uri;
    setImageUri(localUri);
    /** 서버 연동 시에는 S3에 업로드해 다른 기기에서도 같은 이미지를 볼 수 있게 한다. */
    if (isMifApiConfigured() && getMifSessionToken()) {
      try {
        const uploaded = await mifApi.uploadProductImage(localUri, "product-main.jpg");
        setImageUri(uploaded.url || uploaded.key);
      } catch {
        setImageUri(localUri);
      }
    }
  };
  const pickDetailImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (result.canceled) return;
    const localUris = result.assets.map((asset) => asset.uri).filter(Boolean).slice(0, 5);
    setDetailImageUris(localUris);
    if (isMifApiConfigured() && getMifSessionToken()) {
      const uploads = await Promise.all(
        localUris.map(async (uri, index) => {
          try {
            const uploaded = await mifApi.uploadProductImage(uri, `product-detail-${index + 1}.jpg`);
            return uploaded.url || uploaded.key;
          } catch {
            return uri;
          }
        }),
      );
      setDetailImageUris(uploads);
    }
  };
  const save = async () => {
    const category = categories.find((item) => item.id === categoryId);
    const nextProduct: Product = {
      id: product?.id ?? makeId("prd"),
      name: name.trim(),
      categoryId: category?.id || undefined,
      categoryName: category?.name || categoryName.trim() || "미분류",
      spec,
      unit,
      basePrice: Number(price),
      minOrderQty: Math.max(1, Number(minQty) || 1),
      stockStatus,
      isActive,
      storageType,
      description,
      imageUri: imageUri || undefined,
      detailImageUris,
      badges,
      featuredPriority: product?.featuredPriority,
      createdAt: product?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const errors = getProductSaveErrors(nextProduct, categories);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setIsSaving(true);
    try {
      await onSave(nextProduct);
    } finally {
      setIsSaving(false);
    }
  };
  const confirmDelete = async () => {
    if (!product || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(product.id);
    } finally {
      setIsDeleting(false);
    }
  };
  if (!visible) return null;
  return (
    <Sheet
      visible={visible}
      title={
        isAdmin
          ? product
            ? "상품 수정"
            : "상품 등록"
          : product?.name || "상품 상세"
      }
      onClose={onClose}
    >
      {isAdmin && product ? (
        <View style={styles.adminPreviewToggle}>
          <Pressable
            style={[styles.previewToggleTab, !adminPreview && styles.previewToggleTabActive]}
            onPress={() => setAdminPreview(false)}
          >
            <Text
              style={[
                styles.previewToggleText,
                !adminPreview && styles.previewToggleTextActive,
              ]}
            >
              상품 수정
            </Text>
          </Pressable>
          <Pressable
            style={[styles.previewToggleTab, adminPreview && styles.previewToggleTabActive]}
            onPress={() => setAdminPreview(true)}
          >
            <Text
              style={[
                styles.previewToggleText,
                adminPreview && styles.previewToggleTextActive,
              ]}
            >
              거래처 화면 보기
            </Text>
          </Pressable>
        </View>
      ) : null}
      {isAdmin && !adminPreview ? (
        <>
          <Field
            label="상품명"
            value={name}
            onChangeText={(value) => {
              setName(value);
              setFieldErrors((current) => ({ ...current, name: "" }));
            }}
            placeholder="상품명"
          />
          {fieldErrors.name ? <Text style={styles.formError}>{fieldErrors.name}</Text> : null}
          <Text style={styles.fieldLabel}>카테고리</Text>
          <ScrollView
            horizontal
            style={styles.categoryChipScroller}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryChipRow}
          >
            {visibleCategories.map((item) => (
              <Chip
                key={item.id}
                label={`${item.icon} ${item.name}`}
                active={categoryId === item.id}
                onPress={() => {
                  setCategoryId(item.id);
                  setCategoryName(item.name);
                  setFieldErrors((current) => ({ ...current, category: "" }));
                }}
              />
            ))}
            <Chip
              label="직접 입력"
              active={!categoryId}
              onPress={() => {
                setCategoryId("");
                setFieldErrors((current) => ({ ...current, category: "" }));
              }}
            />
          </ScrollView>
          {fieldErrors.category ? <Text style={styles.formError}>{fieldErrors.category}</Text> : null}
          {!categoryId && (
            <Field
              label="카테고리명"
              value={categoryName}
              onChangeText={setCategoryName}
              placeholder="카테고리명"
            />
          )}
          <Field
            label="규격"
            value={spec}
            onChangeText={(value) => {
              setSpec(value);
              setFieldErrors((current) => ({ ...current, spec: "" }));
            }}
            placeholder="예: 1kg"
          />
          {fieldErrors.spec ? <Text style={styles.formError}>{fieldErrors.spec}</Text> : null}
          <View style={styles.twoFields}>
            <View style={{ flex: 1 }}>
              <Field
                label="단위"
                value={unit}
                onChangeText={(value) => {
                  setUnit(value);
                  setFieldErrors((current) => ({ ...current, unit: "" }));
                }}
                placeholder="개"
              />
              {fieldErrors.unit ? <Text style={styles.formError}>{fieldErrors.unit}</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="최소 수량"
                value={minQty}
                onChangeText={(value) => {
                  setMinQty(value);
                  setFieldErrors((current) => ({ ...current, minOrderQty: "" }));
                }}
                placeholder="1"
                keyboardType="numeric"
              />
              {fieldErrors.minOrderQty ? <Text style={styles.formError}>{fieldErrors.minOrderQty}</Text> : null}
            </View>
          </View>
          <Field
            label="단가"
            value={price}
            onChangeText={(value) => {
              setPrice(value);
              setFieldErrors((current) => ({ ...current, basePrice: "" }));
            }}
            placeholder="숫자만 입력"
            keyboardType="numeric"
          />
          {fieldErrors.basePrice ? <Text style={styles.formError}>{fieldErrors.basePrice}</Text> : null}
          <Field
            label="상품 설명"
            value={description}
            onChangeText={setDescription}
            placeholder="상품 상세 설명"
            multiline
          />
          <Pressable style={styles.attach} onPress={pickMainImage}>
            {icon("image-outline")}
            <Text style={styles.attachText}>
              {imageUri ? "대표 이미지 선택됨" : "대표 이미지 선택"}
            </Text>
          </Pressable>
          <Pressable style={styles.attach} onPress={pickDetailImages}>
            {icon("images-outline")}
            <Text style={styles.attachText}>
              상세 이미지 {detailImageUris.length ? `${detailImageUris.length}장 선택됨` : "선택"} (최대 5장)
            </Text>
          </Pressable>
          <Text style={styles.fieldLabel}>재고 상태</Text>
          <View style={styles.filterRow}>
            <Chip
              label="재고 있음"
              active={stockStatus === "in_stock"}
              onPress={() => setStockStatus("in_stock")}
            />
            <Chip
              label="품절"
              active={stockStatus === "out_of_stock"}
              onPress={() => setStockStatus("out_of_stock")}
            />
          </View>
          <Text style={styles.helper}>
            선택한 상태는 상품 목록과 상세 화면의 재고 배지에 즉시 표시됩니다.
          </Text>
          <Text style={styles.fieldLabel}>판매 상태</Text>
          <View style={styles.filterRow}>
            <Chip
              label="판매중"
              active={isActive}
              onPress={() => setIsActive(true)}
            />
            <Chip
              label="판매중지"
              active={!isActive}
              onPress={() => setIsActive(false)}
            />
          </View>
          {!isActive ? (
            <Text style={styles.formError}>
              판매중지 상품은 거래처 상품 목록과 주문 대상에서 제외됩니다.
            </Text>
          ) : null}
          <Text style={styles.fieldLabel}>보관 상태</Text>
          <View style={styles.filterRow}>
            {([
              ["refrigerated", "냉장"],
              ["frozen", "냉동"],
              ["room_temp", "실온"],
            ] as const).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                active={storageType === value}
                onPress={() => setStorageType(value)}
              />
            ))}
          </View>
          <Text style={styles.fieldLabel}>마케팅 배지</Text>
          <View style={styles.filterRow}>
            {(["BEST", "시즌", "할인", "품절임박"] as ProductBadge[]).map(
              (badge) => (
                <Chip
                  key={badge}
                  label={badge}
                  active={badges.includes(badge)}
                  onPress={() =>
                    setBadges((current) =>
                      current.includes(badge)
                        ? current.filter((item) => item !== badge)
                        : [...current, badge],
                    )
                  }
                />
              ),
            )}
          </View>
          <Primary
            text={isSaving ? "저장 중..." : "저장"}
            onPress={save}
            disabled={isSaving || isDeleting}
          />
          {product ? (
            <Pressable
              style={[styles.deleteProductButton, isSaving && styles.buttonDisabled]}
              disabled={isSaving || isDeleting}
              onPress={() => setDeleteConfirmVisible(true)}
            >
              <Text style={styles.deleteProductText}>
                {isDeleting ? "삭제 중..." : "상품 삭제"}
              </Text>
            </Pressable>
          ) : null}
          <Modal
            visible={deleteConfirmVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setDeleteConfirmVisible(false)}
          >
            <View style={styles.confirmOverlay}>
              <View style={styles.confirmCard}>
                <Text style={styles.confirmTitle}>상품을 삭제할까요?</Text>
                <Text style={styles.confirmCopy}>
                  삭제한 상품은 복구할 수 없으며 장바구니와 찜 목록에서도 함께 제거됩니다.
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    style={styles.confirmCancel}
                    onPress={() => setDeleteConfirmVisible(false)}
                  >
                    <Text style={styles.confirmCancelText}>취소</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.confirmDelete, isDeleting && styles.buttonDisabled]}
                    disabled={isDeleting}
                    onPress={() => void confirmDelete()}
                  >
                    <Text style={styles.confirmDeleteText}>
                      {isDeleting ? "삭제 중..." : "삭제"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </>
      ) : (
        <>
          <View style={styles.detailImage}>
            {product?.imageUri ? (
              <Image
                source={{ uri: product.imageUri }}
                style={styles.detailImageFill}
              />
            ) : (
              icon("cube-outline", palette.teal, 54)
            )}
          </View>
          <View style={styles.sectionRow}>
            <Text style={styles.categoryLabel}>{product?.categoryName}</Text>
            <Pressable onPress={() => product && onFavorite(product.id)}>
              {icon(
                isFavorite ? "heart" : "heart-outline",
                isFavorite ? palette.error : palette.muted,
                25,
              )}
            </Pressable>
          </View>
          <Text style={styles.detailTitle}>{product?.name}</Text>
          <Text style={styles.muted}>
            {product?.spec} · {product?.unit}
          </Text>
          <View style={styles.badgeRow}>
            {product && <StockStatusBadge status={product.stockStatus} />}
            <StorageTypeBadge storageType={product?.storageType} />
          </View>
          <Text style={styles.detailPrice}>
            {money(product?.basePrice || 0)}
          </Text>
          <Text style={styles.detailCopy}>
            {product?.description || "등록된 상품 설명이 없습니다."}
          </Text>
          <Text style={styles.helper}>
            {product?.stockStatus === "out_of_stock"
              ? "현재 품절 상품입니다."
              : `최소 주문 수량 ${product?.minOrderQty}${product?.unit}`}
          </Text>
          <Primary
            text={
              product?.stockStatus === "out_of_stock"
                ? "품절 상품"
                : "장바구니 담기"
            }
            disabled={product?.stockStatus === "out_of_stock"}
            onPress={() => {
              if (product) {
                onAdd(product);
                onClose();
              }
            }}
          />
        </>
      )}
    </Sheet>
  );
}

function AddressSheet({
  visible,
  address,
  onClose,
  onSave,
  onNotice,
}: {
  visible: boolean;
  address?: Address;
  onClose: () => void;
  onSave: (address: Address) => Promise<void>;
  onNotice: (title: string, message: string, tone?: ToastTone) => void;
}) {
  const [label, setLabel] = useState(address?.label ?? "");
  const [recipient, setRecipient] = useState(address?.recipient ?? "");
  const [phone, setPhone] = useState(address?.phone ?? "");
  const [postalCode, setPostalCode] = useState(address?.postalCode ?? "");
  const [road, setRoad] = useState(
    address?.roadAddress ?? address?.address ?? "",
  );
  const [jibun, setJibun] = useState(address?.jibunAddress ?? "");
  const [detail, setDetail] = useState(address?.addressDetail ?? "");
  const [isDefault, setIsDefault] = useState(address?.isDefault ?? true);
  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  useEffect(() => {
    if (visible) {
      setLabel(address?.label ?? "");
      setRecipient(address?.recipient ?? "");
      setPhone(address?.phone ?? "");
      setPostalCode(address?.postalCode ?? "");
      setRoad(address?.roadAddress ?? address?.address ?? "");
      setJibun(address?.jibunAddress ?? "");
      setDetail(address?.addressDetail ?? "");
      setIsDefault(address?.isDefault ?? true);
    }
  }, [visible, address]);
  const save = () => {
    if (![label, recipient, phone, road].every(Boolean)) {
      onNotice(
        "입력 확인",
        "배송지명, 수령인, 연락처, 도로명 주소를 입력해 주세요.",
        "warning",
      );
      return;
    }
    if (postalCode && !/^\d{5}$/.test(postalCode)) {
      onNotice("우편번호", "우편번호는 5자리 숫자여야 합니다.", "warning");
      return;
    }
    onSave({
      id: address?.id ?? makeId("addr"),
      label,
      recipient,
      phone,
      postalCode,
      address: road,
      addressDetail: detail,
      roadAddress: road,
      jibunAddress: jibun || undefined,
      isDefault,
    });
  };
  return (
    <>
    <Sheet
      visible={visible}
      title={address ? "배송지 수정" : "배송지 등록"}
      onClose={onClose}
    >
      <Text style={styles.helper}>
        주소 선택 모달에서 우편번호·도로명·지번 주소를 입력하고 적용하세요.
      </Text>
      <Field
        label="배송지명"
        value={label}
        onChangeText={setLabel}
        placeholder="예: 본사"
      />
      <Field
        label="수령인"
        value={recipient}
        onChangeText={setRecipient}
        placeholder="수령인"
      />
      <Field
        label="연락처"
        value={phone}
        onChangeText={setPhone}
        placeholder="010-0000-0000"
        keyboardType="phone-pad"
      />
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>주소</Text>
        <Pressable
          accessibilityLabel="주소 선택 모달 열기"
          style={styles.addressLookupButton}
          onPress={() => setAddressPickerVisible(true)}
        >
          <View style={{ flex: 1 }}>
            {road ? (
              <>
                <Text style={styles.addressLookupValue}>
                  {postalCode ? `(${postalCode}) ` : ""}{road}
                </Text>
                {jibun ? <Text style={styles.addressLookupSub}>지번 {jibun}</Text> : null}
              </>
            ) : (
              <Text style={styles.addressLookupPlaceholder}>주소를 검색·선택하세요</Text>
            )}
          </View>
          {icon("search-outline", palette.teal, 21)}
        </Pressable>
      </View>
      <Field
        label="상세 주소"
        value={detail}
        onChangeText={setDetail}
        placeholder="상세 주소"
      />
      <View style={styles.switchRow}>
        <Text style={styles.strong}>기본 배송지로 설정</Text>
        <Switch
          value={isDefault}
          onValueChange={setIsDefault}
          trackColor={{ true: palette.teal }}
        />
      </View>
      <Primary text="저장" onPress={save} />
    </Sheet>
      <AddressLookupSheet
        onNotice={onNotice}
        visible={addressPickerVisible}
        postalCode={postalCode}
        roadAddress={road}
        jibunAddress={jibun}
        onClose={() => setAddressPickerVisible(false)}
        onApply={(next) => {
          setPostalCode(next.postalCode);
          setRoad(next.roadAddress);
          setJibun(next.jibunAddress);
          setAddressPickerVisible(false);
        }}
      />
    </>
  );
}

function AddressLookupSheet({
  visible,
  postalCode,
  roadAddress,
  jibunAddress,
  onClose,
  onApply,
  onNotice,
}: {
  visible: boolean;
  postalCode: string;
  roadAddress: string;
  jibunAddress: string;
  onClose: () => void;
  onApply: (value: { postalCode: string; roadAddress: string; jibunAddress: string }) => void;
  onNotice: (title: string, message: string, tone?: ToastTone) => void;
}) {
  const [nextPostalCode, setNextPostalCode] = useState(postalCode);
  const [nextRoadAddress, setNextRoadAddress] = useState(roadAddress);
  const [nextJibunAddress, setNextJibunAddress] = useState(jibunAddress);
  useEffect(() => {
    if (!visible) return;
    setNextPostalCode(postalCode);
    setNextRoadAddress(roadAddress);
    setNextJibunAddress(jibunAddress);
  }, [visible, postalCode, roadAddress, jibunAddress]);
  const apply = () => {
    if (!nextRoadAddress.trim()) {
      onNotice("주소 입력", "도로명 주소를 입력해 주세요.", "warning");
      return;
    }
    if (nextPostalCode && !/^\d{5}$/.test(nextPostalCode)) {
      onNotice("우편번호", "우편번호는 5자리 숫자여야 합니다.", "warning");
      return;
    }
    onApply({
      postalCode: nextPostalCode,
      roadAddress: nextRoadAddress.trim(),
      jibunAddress: nextJibunAddress.trim(),
    });
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.sheetSafe}>
        <KeyboardAvoidingView
          style={styles.sheetKeyboard}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityLabel="주소 선택 닫기"
              onPress={onClose}
              style={styles.iconButton}
            >
              {icon("close-outline", palette.navy, 23)}
            </Pressable>
            <Text style={styles.sheetTitle}>주소 선택</Text>
            <View style={{ width: 34 }} />
          </View>
          <ScrollView
            contentContainerStyle={styles.sheetBody}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.helper}>
              우편번호와 도로명 주소를 입력한 뒤 적용하면 배송지 폼으로 돌아갑니다.
            </Text>
            <Field
              label="우편번호"
              value={nextPostalCode}
              onChangeText={setNextPostalCode}
              placeholder="5자리 우편번호"
              keyboardType="numeric"
              returnKeyType="next"
            />
            <Field
              label="도로명 주소"
              value={nextRoadAddress}
              onChangeText={setNextRoadAddress}
              placeholder="예: 서울특별시 중구 세종대로 110"
              returnKeyType="next"
            />
            <Field
              label="지번 주소 (선택)"
              value={nextJibunAddress}
              onChangeText={setNextJibunAddress}
              placeholder="예: 태평로1가 31"
              returnKeyType="done"
            />
            <Primary text="이 주소 적용" onPress={apply} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function BankSheet({
  visible,
  bank,
  onClose,
  onSave,
  onNotice,
}: {
  visible: boolean;
  bank?: BankAccount;
  onClose: () => void;
  onSave: (bank: BankAccount) => Promise<void>;
  onNotice: (title: string, message: string, tone?: ToastTone) => void;
}) {
  const [bankName, setBankName] = useState(bank?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(bank?.accountNumber ?? "");
  const [holder, setHolder] = useState(bank?.accountHolder ?? "");
  const [active, setActive] = useState(bank?.isActive ?? true);
  const [isDefault, setIsDefault] = useState(bank?.isDefault ?? !bank);
  useEffect(() => {
    if (visible) {
      setBankName(bank?.bankName ?? "");
      setAccountNumber(bank?.accountNumber ?? "");
      setHolder(bank?.accountHolder ?? "");
      setActive(bank?.isActive ?? true);
      setIsDefault(bank?.isDefault ?? !bank);
    }
  }, [visible, bank]);
  return (
    <Sheet
      visible={visible}
      title={bank ? "결제 계좌 수정" : "결제 계좌 등록"}
      onClose={onClose}
    >
      <Field
        label="은행명"
        value={bankName}
        onChangeText={setBankName}
        placeholder="예: 국민은행"
      />
      <Field
        label="계좌번호"
        value={accountNumber}
        onChangeText={setAccountNumber}
        placeholder="계좌번호"
        keyboardType="numeric"
      />
      <Field
        label="예금주"
        value={holder}
        onChangeText={setHolder}
        placeholder="예금주"
      />
      <View style={styles.switchRow}>
        <Text style={styles.strong}>결제 계좌 사용</Text>
        <Switch
          value={active}
          onValueChange={setActive}
          trackColor={{ true: palette.teal }}
        />
      </View>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.strong}>기본 결제 계좌</Text>
          <Text style={styles.muted}>거래처 주문 화면에 우선 안내됩니다.</Text>
        </View>
        <Switch
          value={isDefault}
          onValueChange={setIsDefault}
          disabled={!active}
          trackColor={{ true: palette.teal }}
        />
      </View>
      <Primary
        text="저장"
        onPress={() => {
          if (![bankName, accountNumber, holder].every(Boolean)) {
            onNotice(
              "입력 확인",
              "은행명, 계좌번호, 예금주를 입력해 주세요.",
              "warning",
            );
            return;
          }
          onSave({
            id: bank?.id ?? makeId("bank"),
            bankName,
            accountNumber,
            accountHolder: holder,
            isActive: active,
            isDefault: active && isDefault,
          });
        }}
      />
    </Sheet>
  );
}

function CategorySheet({
  visible,
  category,
  nextSortOrder,
  onClose,
  onSave,
  onNotice,
}: {
  visible: boolean;
  category?: Category;
  nextSortOrder: number;
  onClose: () => void;
  onSave: (category: Category) => Promise<void>;
  onNotice: (title: string, message: string, tone?: ToastTone) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [iconValue, setIconValue] = useState(category?.icon ?? "📦");
  const [sortOrder, setSortOrder] = useState(
    String(category?.sortOrder ?? nextSortOrder),
  );
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  useEffect(() => {
    if (!visible) return;
    setName(category?.name ?? "");
    setIconValue(category?.icon ?? "📦");
    setSortOrder(String(category?.sortOrder ?? nextSortOrder));
    setIsActive(category?.isActive ?? true);
  }, [visible, category, nextSortOrder]);

  const save = async () => {
    if (!name.trim()) {
      onNotice("입력 확인", "카테고리명을 입력해 주세요.", "warning");
      return;
    }
    await onSave({
      id: category?.id ?? makeId("cat"),
      name,
      icon: iconValue,
      sortOrder: Number(sortOrder) || nextSortOrder,
      isActive,
    });
  };

  return (
    <Sheet
      visible={visible}
      title={category ? "카테고리 수정" : "카테고리 등록"}
      onClose={onClose}
    >
      <Field
        label="카테고리명"
        value={name}
        onChangeText={setName}
        placeholder="예: 냉동식품"
      />
      <Field
        label="아이콘"
        value={iconValue}
        onChangeText={setIconValue}
        placeholder="예: 🧊"
      />
      <Field
        label="노출 순서"
        value={sortOrder}
        onChangeText={setSortOrder}
        placeholder="숫자가 작을수록 먼저 표시"
        keyboardType="numeric"
      />
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.strong}>상품 화면에 노출</Text>
          <Text style={styles.muted}>
            숨김 처리한 카테고리는 기존 상품에 남아도 새 상품 분류·필터에는 표시되지 않습니다.
          </Text>
        </View>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ true: palette.teal }}
        />
      </View>
      <Primary text={category ? "수정 저장" : "카테고리 추가"} onPress={save} />
    </Sheet>
  );
}

function NoticeDetailSheet({
  visible,
  notice,
  onClose,
}: {
  visible: boolean;
  notice?: Notice;
  onClose: () => void;
}) {
  if (!notice) return null;
  return (
    <Sheet visible={visible} title="공지사항" onClose={onClose}>
      <View style={styles.noticeDetailHeader}>
        <Text style={styles.noticeDetailBadge}>운영 공지</Text>
        <Text style={styles.noticeDetailDate}>
          {notice.startDate ?? notice.createdAt.slice(0, 10)}
          {notice.endDate ? ` ~ ${notice.endDate}` : ""}
        </Text>
      </View>
      <Text style={styles.noticeDetailTitle}>{notice.title}</Text>
      <View style={styles.noticeDetailDivider} />
      <Text style={styles.noticeDetailContent}>{notice.content}</Text>
    </Sheet>
  );
}

function NoticeSheet({
  visible,
  notice,
  onClose,
  onSave,
  onNotice,
}: {
  visible: boolean;
  notice?: Notice;
  onClose: () => void;
  onSave: (notice: Notice) => Promise<void>;
  onNotice: (title: string, message: string, tone?: ToastTone) => void;
}) {
  const [title, setTitle] = useState(notice?.title ?? "");
  const [content, setContent] = useState(notice?.content ?? "");
  const [visibleNow, setVisibleNow] = useState(notice?.isVisible ?? true);
  const [startDate, setStartDate] = useState(notice?.startDate ?? today());
  const [endDate, setEndDate] = useState(notice?.endDate ?? "");
  useEffect(() => {
    if (visible) {
      setTitle(notice?.title ?? "");
      setContent(notice?.content ?? "");
      setVisibleNow(notice?.isVisible ?? true);
      setStartDate(notice?.startDate ?? today());
      setEndDate(notice?.endDate ?? "");
    }
  }, [visible, notice]);
  return (
    <Sheet
      visible={visible}
      title={notice ? "공지 수정" : "공지 등록"}
      onClose={onClose}
    >
      <Field
        label="제목"
        value={title}
        onChangeText={setTitle}
        placeholder="공지 제목"
      />
      <Field
        label="내용"
        value={content}
        onChangeText={setContent}
        placeholder="공지 내용을 입력하세요"
        multiline
      />
      <Field
        label="노출 시작일"
        value={startDate}
        onChangeText={setStartDate}
        placeholder="YYYY-MM-DD"
      />
      <Field
        label="노출 종료일 (선택)"
        value={endDate}
        onChangeText={setEndDate}
        placeholder="YYYY-MM-DD"
      />
      <View style={styles.switchRow}>
        <Text style={styles.strong}>즉시 노출</Text>
        <Switch
          value={visibleNow}
          onValueChange={setVisibleNow}
          trackColor={{ true: palette.teal }}
        />
      </View>
      <Primary
        text="저장"
        onPress={() => {
          if (![title, content].every(Boolean)) {
            onNotice("입력 확인", "제목과 내용을 입력해 주세요.", "warning");
            return;
          }
          onSave({
            id: notice?.id ?? makeId("notice"),
            title,
            content,
            isVisible: visibleNow,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            createdAt: notice?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }}
      />
    </Sheet>
  );
}

function QaSheet({
  visible,
  post,
  isAdmin,
  onClose,
  onSave,
  onNotice,
}: {
  visible: boolean;
  post?: QAPost;
  isAdmin: boolean;
  onClose: () => void;
  onSave: (post: QAPost) => Promise<void>;
  onNotice: (title: string, message: string, tone?: ToastTone) => void;
}) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (!result.canceled)
      setAttachments(result.assets.map((asset) => asset.name));
  };
  useEffect(() => {
    if (visible) {
      setTitle(post?.title ?? "");
      setContent("");
      setAttachments([]);
    }
  }, [visible, post]);
  const save = () => {
    if (!content.trim() || (!isAdmin && !title.trim())) {
      onNotice(
        "입력 확인",
        isAdmin ? "답변을 입력해 주세요." : "제목과 문의 내용을 입력해 주세요.",
        "warning",
      );
      return;
    }
    if (isAdmin && post) {
      onSave({
        ...post,
        isAnswered: true,
        comments: [
          ...post.comments,
          {
            id: makeId("qa_reply"),
            authorName: "MIF 관리자",
            isAdmin: true,
            content,
            attachmentNames: attachments,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    } else {
      onSave({
        id: makeId("qa"),
        authorName: "MIF 거래처",
        title,
        content,
        isPrivate: false,
        attachmentNames: attachments,
        isAnswered: false,
        createdAt: new Date().toISOString(),
        comments: [],
      });
    }
  };
  return (
    <Sheet
      visible={visible}
      title={isAdmin && post ? "Q&A 답변" : post ? "Q&A 상세" : "Q&A 문의"}
      onClose={onClose}
    >
      {post && (
        <View style={styles.qaOriginal}>
          <Text style={styles.strong}>{post.title}</Text>
          <Text style={styles.noticeContent}>{post.content}</Text>
          {post.comments.map((comment) => (
            <View
              key={comment.id}
              style={[styles.comment, comment.isAdmin && styles.adminComment]}
            >
              <Text style={styles.strong}>
                {comment.isAdmin ? "MIF 관리자" : comment.authorName}
              </Text>
              <Text style={styles.noticeContent}>{comment.content}</Text>
              <Text style={styles.noticeDate}>
                첨부 {comment.attachmentNames.length}개 ·{" "}
                {comment.createdAt.slice(0, 10)}
              </Text>
            </View>
          ))}
        </View>
      )}
      {!isAdmin && !post && (
        <Field
          label="제목"
          value={title}
          onChangeText={setTitle}
          placeholder="문의 제목"
        />
      )}
      {(!post || isAdmin) && (
        <>
          <Field
            label={isAdmin ? "답변" : "문의 내용"}
            value={content}
            onChangeText={setContent}
            placeholder="내용을 입력하세요"
            multiline
          />
          <Pressable style={styles.attach} onPress={pick}>
            {icon("attach-outline")}
            <Text style={styles.attachText}>
              {attachments.length
                ? `${attachments.length}개 파일 첨부됨`
                : "이미지 또는 파일 첨부"}
            </Text>
          </Pressable>
          <Primary text={isAdmin ? "답변 등록" : "문의 등록"} onPress={save} />
        </>
      )}
    </Sheet>
  );
}

function InquirySheet({
  visible,
  onClose,
  onSave,
  onNotice,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (inquiry: VendorInquiry) => Promise<void>;
  onNotice: (title: string, message: string, tone?: ToastTone) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [categories, setCategories] = useState("");
  const [area, setArea] = useState("");
  const [message, setMessage] = useState("");
  return (
    <Sheet visible={visible} title="입점 문의" onClose={onClose}>
      <Field
        label="상호명"
        value={companyName}
        onChangeText={setCompanyName}
        placeholder="상호명"
      />
      <Field
        label="담당자명"
        value={contactName}
        onChangeText={setContactName}
        placeholder="담당자명"
      />
      <Field
        label="연락처"
        value={phone}
        onChangeText={setPhone}
        placeholder="연락처"
      />
      <Field
        label="이메일 (선택)"
        value={email}
        onChangeText={setEmail}
        placeholder="email@example.com"
      />
      <Field
        label="취급 품목"
        value={categories}
        onChangeText={setCategories}
        placeholder="쉼표로 구분"
      />
      <Field
        label="배송 가능 지역"
        value={area}
        onChangeText={setArea}
        placeholder="예: 서울, 경기"
      />
      <Field
        label="문의 내용"
        value={message}
        onChangeText={setMessage}
        placeholder="최소 10자 이상"
        multiline
      />
      <Primary
        text="문의 접수"
        onPress={() => {
          if (
            ![companyName, contactName, phone].every(Boolean) ||
            message.trim().length < 10
          ) {
            onNotice(
              "입력 확인",
              "필수 정보와 10자 이상의 문의 내용을 입력해 주세요.",
              "warning",
            );
            return;
          }
          onSave({
            id: makeId("inquiry"),
            companyName,
            contactName,
            phone,
            email: email || undefined,
            categories: categories
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
            serviceArea: area || undefined,
            message,
            status: "pending",
            createdAt: new Date().toISOString(),
          });
        }}
      />
    </Sheet>
  );
}

function OrderSheet({
  visible,
  order,
  banks,
  isAdmin,
  onClose,
  onStatus,
  onReorder,
  onDelete,
  onShipping,
}: {
  visible: boolean;
  order?: Order;
  banks: BankAccount[];
  isAdmin: boolean;
  onClose: () => void;
  onStatus: (order: Order, status?: OrderStatus) => Promise<void>;
  onReorder: (order: Order) => void;
  onDelete: (id: string) => Promise<void>;
  onShipping: (
    order: Order,
    input: { courierCompany: string; trackingNumber: string; truckDriverPhone: string },
  ) => Promise<void>;
}) {
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  useEffect(() => {
    setCourier(order?.courierCompany ?? "");
    setTracking(order?.trackingNumber ?? "");
    setDriverPhone(order?.truckDriverPhone ?? "");
  }, [order?.id, order?.courierCompany, order?.trackingNumber, order?.truckDriverPhone]);
  if (!order) return null;
  const bank = banks.find((item) => item.id === order.paymentBankAccountId);
  const next = nextOrderStatus(order.status);
  const shippingInfo = orderShippingInfoLines(order);
  return (
    <Sheet visible={visible} title="주문 상세" onClose={onClose}>
      <View style={styles.detailOrder}>
        <View style={styles.orderDetailHero}>
          <View style={styles.sectionRow}>
            <View>
              <Text style={styles.detailTitle}>{order.orderNumber}</Text>
              <Text style={styles.orderDetailDate}>{formatOrderDate(order.createdAt, true)}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: `${statusColor[order.status]}18` }]}>
              <Text style={[styles.statusText, { color: statusColor[order.status] }]}>{orderStatusLabel[order.status]}</Text>
            </View>
          </View>
          {isAdmin && order.companyName && <Text style={styles.orderDetailCompany}>거래처 · {order.companyName}</Text>}
        </View>
        <View style={styles.orderDetailSection}>
          <Text style={styles.orderDetailSectionTitle}>주문 상품</Text>
          {order.items.map((item) => (
            <View key={item.id} style={styles.lineRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.strong}>{item.name}</Text>
                <Text style={styles.muted}>{item.spec} · {item.quantity}{item.unit}</Text>
              </View>
              <Text style={styles.strong}>{money(item.basePrice * item.quantity)}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.orderDetailSection, styles.orderDetailDeliverySection]}>
          <Text style={styles.orderDetailSectionTitle}>배송 정보</Text>
          <View style={styles.orderDetailDeliveryHead}>
            {icon("cube-outline", "#1D4ED8", 17)}
            <Text style={styles.orderDetailDeliveryMethod}>{deliveryMethodPresentation(order.deliveryMethod)}</Text>
          </View>
          <View style={styles.orderDetailInfoRow}>
            {icon("location-outline", palette.success, 17)}
            <View style={{ flex: 1 }}>
              <Text style={styles.orderDetailInfoLabel}>배송지</Text>
              <Text style={styles.orderDetailInfoValue}>{formatOrderAddress(order)}</Text>
              <Text style={styles.orderDetailRecipient}>{formatOrderRecipient(order)}</Text>
            </View>
          </View>
          <View style={styles.orderDetailInfoRow}>
            {icon("calendar-outline", palette.teal, 17)}
            <View style={{ flex: 1 }}>
              <Text style={styles.orderDetailInfoLabel}>희망 배송일</Text>
              <Text style={styles.orderDetailInfoValue}>{formatDesiredDelivery(order.desiredDeliveryAt)}</Text>
            </View>
          </View>
          {shippingInfo.map((line) => <Text key={line} style={styles.orderDetailShippingInfo}>🚚 {line}</Text>)}
          {order.deliveryMethod === "courier" && order.trackingNumber && (
            <Pressable
              style={styles.trackingLinkButton}
              onPress={() =>
                Linking.openURL(
                  `https://search.naver.com/search.naver?query=${encodeURIComponent(
                    `${order.courierCompany ?? "택배"} ${order.trackingNumber} 배송조회`,
                  )}`,
                ).catch(() => undefined)
              }
            >
              {icon("navigate-outline", palette.teal, 15)}
              <Text style={styles.trackingLinkText}>배송조회 열기</Text>
            </Pressable>
          )}
          {order.deliveryMethod === "truck" && order.truckDriverPhone && (
            <Pressable
              style={styles.trackingLinkButton}
              onPress={() =>
                Linking.openURL(`tel:${order.truckDriverPhone}`).catch(() => undefined)
              }
            >
              {icon("call-outline", palette.success, 15)}
              <Text style={styles.trackingLinkText}>
                기사 전화 연결 {order.truckDriverPhone}
              </Text>
            </Pressable>
          )}
        </View>
        {isAdmin && order.status !== "CANCELED" && (
          <View style={styles.orderDetailSection}>
            <Text style={styles.orderDetailSectionTitle}>배송 정보 입력</Text>
            {order.deliveryMethod === "courier" ? (
              <>
                <Text style={styles.fieldLabel}>택배사</Text>
                <TextInput
                  style={styles.input}
                  value={courier}
                  onChangeText={setCourier}
                  placeholder="예: CJ대한통운"
                  placeholderTextColor={palette.muted}
                />
                <Text style={styles.fieldLabel}>송장 번호</Text>
                <TextInput
                  style={styles.input}
                  value={tracking}
                  onChangeText={setTracking}
                  placeholder="송장 번호를 입력하세요"
                  placeholderTextColor={palette.muted}
                  keyboardType="number-pad"
                />
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>배송 기사 연락처</Text>
                <TextInput
                  style={styles.input}
                  value={driverPhone}
                  onChangeText={setDriverPhone}
                  placeholder="예: 010-0000-0000"
                  placeholderTextColor={palette.muted}
                  keyboardType="phone-pad"
                />
              </>
            )}
            <Secondary
              compact
              text="배송 정보 저장"
              onPress={() =>
                onShipping(order, {
                  courierCompany: courier.trim(),
                  trackingNumber: tracking.trim(),
                  truckDriverPhone: driverPhone.trim(),
                })
              }
            />
          </View>
        )}
        {order.note && (
          <View style={styles.orderNote}>
            <Text style={styles.orderNoteLabel}>배송 요청사항</Text>
            <Text style={styles.orderNoteText}>{order.note}</Text>
          </View>
        )}
        <View style={styles.orderDetailSection}>
          <Text style={styles.orderDetailSectionTitle}>결제 정보</Text>
          <View style={styles.orderPaymentTotalRow}><Text style={styles.orderPaymentLabel}>주문 금액</Text><Text style={styles.total}>{money(order.totalAmount)}</Text></View>
          {bank ? <Text style={styles.orderPaymentAccount}>{bank.bankName} · {bank.accountNumber} · 예금주 {bank.accountHolder}</Text> : <Text style={styles.helper}>등록된 결제 계좌가 없습니다.</Text>}
        </View>
      </View>
      <View style={styles.actionRow}>
        <Secondary compact text="재주문" onPress={() => onReorder(order)} />
        {order.status !== "CANCELED" && order.status !== "DELIVERED" && (
          <Secondary
            compact
            text="주문 취소"
            tone="error"
            onPress={() => onStatus(order, "CANCELED")}
          />
        )}
        {isAdmin && next && (
          <Primary
            compact
            text={`${orderStatusLabel[next]} 처리`}
            onPress={() => onStatus(order)}
          />
        )}
        {isAdmin && (
          <Secondary
            compact
            text="주문 삭제"
            tone="error"
            onPress={() => onDelete(order.id)}
          />
        )}
      </View>
    </Sheet>
  );
}

function BackHeader({
  title,
  onBack,
  onClose,
  action,
}: {
  title: string;
  onBack: () => void;
  onClose: () => void;
  action?: { icon: string; onPress: () => void };
}) {
  return (
    <View style={styles.backHeader}>
      <Pressable
        accessibilityLabel="이전 화면으로 이동"
        onPress={onBack}
        style={styles.iconButton}
      >
        {icon("chevron-back", palette.navy, 23)}
      </Pressable>
      <Text style={styles.backTitle}>{title}</Text>
      <View style={styles.headerActions}>
        {action && (
          <Pressable
            accessibilityLabel={`${title} 추가 작업`}
            onPress={action.onPress}
            style={styles.iconButton}
          >
            {icon(action.icon, palette.teal, 23)}
          </Pressable>
        )}
        <Pressable
          accessibilityLabel="이전 화면으로 닫기"
          onPress={onClose}
          style={styles.iconButton}
        >
          {icon("close-outline", palette.navy, 23)}
        </Pressable>
      </View>
    </View>
  );
}
function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: { icon: string; onPress: () => void };
}) {
  return (
    <View style={styles.pageHeader}>
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {action && (
        <Pressable onPress={action.onPress} style={styles.fab}>
          {icon(action.icon, "#fff", 22)}
        </Pressable>
      )}
    </View>
  );
}
function MenuGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.menuGroup}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}
function MenuRow({
  icon: iconName,
  title,
  copy,
  onPress,
}: {
  icon: string;
  title: string;
  copy: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuIcon}>{icon(iconName)}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuCopy}>{copy}</Text>
      </View>
      {icon("chevron-forward", palette.muted, 18)}
    </Pressable>
  );
}
function AdminGrid({
  icon: iconName,
  label,
  copy,
  onPress,
}: {
  icon: string;
  label: string;
  copy: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.adminGrid} onPress={onPress}>
      {icon(iconName, palette.teal, 22)}
      <Text style={styles.adminLabel}>{label}</Text>
      <Text style={styles.adminCopy}>{copy}</Text>
    </Pressable>
  );
}
function QuickCard({
  icon: iconName,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickCard} onPress={onPress}>
      {icon(iconName, palette.teal, 22)}
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}
function DateTimeOptionPicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  month,
  onMonthChange,
  minimumDate,
}: {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  month?: Date;
  onMonthChange?: (value: Date) => void;
  minimumDate?: string;
}) {
  const [internalMonth, setInternalMonth] = useState(() => monthStartFor(date || minimumDate));
  const visibleMonth = month ?? internalMonth;
  const updateMonth = (value: Date) => {
    const next = new Date(value.getFullYear(), value.getMonth(), 1);
    if (onMonthChange) onMonthChange(next);
    else setInternalMonth(next);
  };
  useEffect(() => {
    if (!month && date) setInternalMonth(monthStartFor(date));
  }, [date, month]);
  const calendarDays = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const monthIndex = visibleMonth.getMonth();
    const leadingEmpty = new Date(year, monthIndex, 1).getDay();
    const lastDate = new Date(year, monthIndex + 1, 0).getDate();
    return [
      ...Array.from({ length: leadingEmpty }, () => ""),
      ...Array.from({ length: lastDate }, (_, index) => localDateValue(new Date(year, monthIndex, index + 1))),
    ];
  }, [visibleMonth]);
  const minimumMonth = minimumDate ? monthStartFor(minimumDate) : undefined;
  const canGoPrevious = !minimumMonth || visibleMonth.getTime() > minimumMonth.getTime();
  return (
    <View style={styles.dateTimePicker}>
      <Text style={styles.fieldLabel}>날짜</Text>
      <View style={styles.calendarNav}>
        <Pressable
          accessibilityLabel="이전 달"
          disabled={!canGoPrevious}
          style={[styles.monthArrow, !canGoPrevious && styles.monthArrowDisabled]}
          onPress={() => updateMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
        >
          {icon("chevron-back", canGoPrevious ? palette.teal : palette.line, 20)}
        </Pressable>
        <Text style={styles.calendarMonthLabel}>{calendarMonthLabel(visibleMonth)}</Text>
        <Pressable
          accessibilityLabel="다음 달"
          style={styles.monthArrow}
          onPress={() => updateMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
        >
          {icon("chevron-forward", palette.teal, 20)}
        </Pressable>
      </View>
      <View style={styles.calendarWeekRow}>
        {["일", "월", "화", "수", "목", "금", "토"].map((weekday) => (
          <Text key={weekday} style={styles.calendarWeekday}>{weekday}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {calendarDays.map((option, index) => {
          if (!option) return <View key={`empty-${index}`} style={styles.calendarDayBlank} />;
          const disabled = Boolean(minimumDate && option < minimumDate);
          return (
            <Pressable
              key={option}
              accessibilityLabel={`${dateChoiceLabel(option)} 선택`}
              disabled={disabled}
              style={[
                styles.calendarDay,
                date === option && styles.calendarDayActive,
                disabled && styles.calendarDayDisabled,
              ]}
              onPress={() => onDateChange(option)}
            >
              <Text style={[
                styles.calendarDayText,
                date === option && styles.calendarDayTextActive,
                disabled && styles.calendarDayTextDisabled,
              ]}>
                {option.slice(-2).replace(/^0/, "")}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.fieldLabel}>시간</Text>
      <View style={styles.timeOptionGrid}>
        {timePickerOptions.map((option) => (
          <Pressable
            key={option}
            accessibilityLabel={`${option} 선택`}
            style={[
              styles.timeOption,
              time === option && styles.timeOptionActive,
            ]}
            onPress={() => onTimeChange(option)}
          >
            <Text
              style={[
                styles.timeOptionText,
                time === option && styles.timeOptionTextActive,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function StatusPill({ value }: { value: ApplicationStatus }) {
  const copy =
    value === "pending" ? "대기" : value === "approved" ? "승인" : "반려";
  const color =
    value === "pending"
      ? palette.warning
      : value === "approved"
        ? palette.success
        : palette.error;
  return (
    <View style={[styles.statusPill, { backgroundColor: `${color}18` }]}>
      <Text style={[styles.statusText, { color }]}>{copy}</Text>
    </View>
  );
}
function Primary({
  text,
  onPress,
  disabled = false,
  compact = false,
}: {
  text: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[
        styles.primaryButton,
        compact && styles.primaryButtonCompact,
        disabled && styles.primaryButtonDisabled,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.primaryText, compact && styles.primaryTextCompact]}>
        {text}
      </Text>
    </Pressable>
  );
}
function Secondary({
  text,
  onPress,
  tone,
  compact = false,
}: {
  text: string;
  onPress: () => void;
  tone?: "error";
  compact?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.secondaryButton,
        compact && styles.secondaryButtonCompact,
        tone === "error" && {
          borderColor: "#FECDCA",
          backgroundColor: "#FFF5F4",
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.secondaryText,
          compact && styles.secondaryTextCompact,
          tone === "error" && { color: palette.error },
        ]}
      >
        {text}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        style={[styles.input, props.multiline && styles.textarea]}
        placeholderTextColor="#98A2B3"
      />
    </View>
  );
}
function InlineEmpty({
  icon: iconName,
  title,
  copy,
}: {
  icon: string;
  title: string;
  copy: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{icon(iconName, palette.teal, 27)}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  );
}
function Sheet({
  visible,
  title,
  onClose,
  showClose = true,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  showClose?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.sheetSafe}>
        <KeyboardAvoidingView
          style={styles.sheetKeyboard}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={styles.sheetHeader}>
            {showClose ? (
              <Pressable
                accessibilityLabel={`${title} 닫기`}
                onPress={onClose}
                style={styles.iconButton}
              >
                {icon("close-outline", palette.navy, 23)}
              </Pressable>
            ) : (
              <View style={{ width: 34 }} />
            )}
            <Text style={styles.sheetTitle}>{title}</Text>
            <View style={{ width: 34 }} />
          </View>
          <ScrollView
            contentContainerStyle={styles.sheetBody}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
function ModalCloseButton({
  accessibilityLabel,
  onPress,
}: {
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.modalClose}
    >
      {icon("close-outline", palette.navy, 22)}
    </Pressable>
  );
}
const toastPresentation: Record<
  ToastTone,
  { accent: string; icon: string }
> = {
  success: { accent: "#32D583", icon: "checkmark-circle" },
  error: { accent: "#FDA29B", icon: "alert-circle" },
  warning: { accent: "#FDB022", icon: "warning" },
  info: { accent: "#5BC0CE", icon: "information-circle" },
};

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: MifToast[];
  onDismiss: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.toastStack, { top: insets.top + 58 }]}
    >
      {toasts.map((toast) => {
        const tone = toastPresentation[toast.tone];
        return (
          <Pressable
            key={toast.id}
            accessibilityRole="alert"
            accessibilityLabel={toastAccessibilityLabel(toast)}
            onPress={() => onDismiss(toast.id)}
            style={[styles.toastCard, { borderLeftColor: tone.accent }]}
          >
            {icon(tone.icon, tone.accent, 18)}
            <View style={{ flex: 1 }}>
              <Text style={styles.toastTitle}>{toast.title}</Text>
              {toast.message ? (
                <Text style={styles.toastMessage}>{toast.message}</Text>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel="알림 닫기"
              hitSlop={8}
              onPress={() => onDismiss(toast.id)}
              style={styles.toastClose}
            >
              {icon("close", "#98A2B3", 16)}
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabBar({
  active,
  cartCount,
  isAdmin,
  bottomInset,
  onSelect,
}: {
  active: Tab;
  cartCount: number;
  isAdmin: boolean;
  bottomInset: number;
  onSelect: (tab: Tab) => void;
}) {
  const items: { key: Tab; icon: string; label: string }[] = [
    { key: "home", icon: "home-outline", label: "홈" },
    { key: "products", icon: "cube-outline", label: "상품" },
    { key: "orders", icon: "receipt-outline", label: "주문" },
    ...(!isAdmin
      ? [{ key: "cart" as Tab, icon: "cart-outline", label: "장바구니" }]
      : []),
    { key: "more", icon: "menu-outline", label: "더보기" },
  ];
  return (
    <View
      style={[
        styles.tabs,
        {
          minHeight: 60 + Math.max(bottomInset, 8),
          paddingBottom: Math.max(bottomInset, 8),
        },
      ]}
    >
      {items.map((item) => (
        <Pressable
          key={item.key}
          style={styles.tab}
          onPress={() => onSelect(item.key)}
        >
          {icon(
            item.icon,
            active === item.key ? palette.teal : palette.muted,
            21,
          )}
          <Text
            style={[
              styles.tabText,
              active === item.key && { color: palette.teal },
            ]}
          >
            {item.label}
            {item.key === "cart" && cartCount ? ` ${cartCount}` : ""}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles: any = StyleSheet.create({
  ...cartStyles,
  canvas: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCE5EB",
    paddingVertical: 24,
  },
  previewTag: {
    position: "absolute",
    top: 7,
    zIndex: 2,
    backgroundColor: "#102A4317",
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  previewTagText: {
    color: palette.navy,
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "800",
  },
  device: {
    width: "100%",
    maxWidth: 430,
    height: "100%",
    maxHeight: 860,
    overflow: "hidden",
    borderRadius: 32,
    borderWidth: 7,
    borderColor: palette.navy,
    backgroundColor: palette.bg,
    shadowColor: palette.navy,
    shadowOpacity: 0.25,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  app: { flex: 1, backgroundColor: palette.bg },
  content: { flex: 1 },
  toastStack: {
    position: "absolute",
    left: 10,
    right: 10,
    gap: 8,
    zIndex: 90,
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    backgroundColor: palette.ink,
    shadowColor: "#0B1220",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastTitle: { color: palette.surface, fontSize: 13, fontWeight: "800" },
  toastMessage: {
    color: "#E4E7EC",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  toastClose: { paddingLeft: 2, paddingTop: 1 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.bg,
    gap: 12,
  },
  muted: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  strong: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  helper: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  formError: {
    color: palette.error,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: -5,
    marginBottom: 8,
  },
  deleteProductButton: {
    alignItems: "center",
    paddingVertical: 13,
    marginTop: 10,
    marginBottom: 8,
  },
  notificationToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  trackingLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  adminPreviewToggle: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
  exportButtonText: {
    color: palette.navy,
    fontSize: 13,
    fontWeight: "700",
  },
  previewToggleTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
  previewToggleTabActive: {
    backgroundColor: palette.teal,
    borderColor: palette.teal,
  },
  previewToggleText: {
    color: palette.navy,
    fontSize: 13,
    fontWeight: "700",
  },
  previewToggleTextActive: {
    color: "#FFFFFF",
  },
  trackingLinkText: {
    color: palette.teal,
    fontSize: 13,
    fontWeight: "700",
  },
  notificationFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  smallOutlineButton: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: palette.surface,
  },
  smallOutlineButtonText: {
    color: palette.navy,
    fontSize: 12,
    fontWeight: "700",
  },
  deleteProductText: {
    color: palette.error,
    fontSize: 14,
    fontWeight: "800",
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(16,42,67,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: 20,
  },
  confirmTitle: { color: palette.ink, fontSize: 18, fontWeight: "800" },
  confirmCopy: { color: palette.muted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  confirmActions: { flexDirection: "row", gap: 8, marginTop: 20 },
  confirmCancel: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: palette.aqua },
  confirmDelete: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: palette.error },
  confirmCancelText: { color: palette.teal, fontSize: 14, fontWeight: "800" },
  confirmDeleteText: { color: palette.surface, fontSize: 14, fontWeight: "800" },
  appbar: {
    height: 62,
    paddingHorizontal: 18,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.teal,
  },
  markText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  brandName: { color: palette.navy, fontSize: 16, fontWeight: "900" },
  brandSub: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  appActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  roleChip: {
    backgroundColor: palette.aqua,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  roleText: { color: palette.teal, fontSize: 10, fontWeight: "800" },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  badgeDot: {
    position: "absolute",
    top: 1,
    right: 0,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: palette.error,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDotText: { color: "#fff", fontSize: 8, fontWeight: "900" },
  scroll: { padding: 18, paddingBottom: 34 },
  hero: {
    minHeight: 168,
    borderRadius: 22,
    padding: 21,
    backgroundColor: palette.navy,
    flexDirection: "row",
    gap: 10,
  },
  eyebrow: {
    color: "#9EDDE5",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroTitle: { color: "#fff", fontSize: 24, lineHeight: 31, fontWeight: "900" },
  heroCopy: { color: "#D9EDF0", fontSize: 12, lineHeight: 18, marginTop: 8 },
  heroMark: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "#FFFFFF18",
  },
  heroMarkText: { color: "#fff", fontSize: 26, fontWeight: "900" },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  categoryOrderHint: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
  },
  categoryDraggingCard: {
    borderColor: palette.teal,
    backgroundColor: palette.aqua,
    opacity: 0.95,
  },
  categoryTitleRow: { flexDirection: "row", alignItems: "center", flex: 1, gap: 4 },
  categoryDragHandle: {
    width: 30,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -6,
  },
  categoryOrderActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  categoryMoveButton: {
    width: 30,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryMoveButtonDisabled: { opacity: 0.55 },
  sectionTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 22,
    marginBottom: 11,
  },
  link: { color: palette.teal, fontSize: 12, fontWeight: "800" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderColor: palette.line,
    borderWidth: 1,
    padding: 14,
  },
  statNumber: { color: palette.navy, fontSize: 24, fontWeight: "900" },
  statLabel: { color: palette.muted, fontSize: 11, marginTop: 4 },
  quickGrid: { flexDirection: "row", gap: 8, marginTop: 16 },
  quickCard: {
    flex: 1,
    minHeight: 82,
    padding: 8,
    borderRadius: 15,
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  quickLabel: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 16,
  },
  productTap: { flex: 1, flexDirection: "row", gap: 11, alignItems: "center" },
  productImage: {
    width: 52,
    height: 52,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: palette.aqua,
  },
  productImageFill: { width: "100%", height: "100%" },
  productActions: { alignItems: "center", gap: 10 },
  categoryLabel: { color: palette.teal, fontSize: 11, fontWeight: "900" },
  productName: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 1,
  },
  productPrice: {
    color: palette.navy,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 5,
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  stockStatusBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 99,
  },
  stockStatusBadgeCompact: { paddingHorizontal: 5, paddingVertical: 2 },
  stockStatusBadgeText: { fontSize: 10, fontWeight: "900" },
  stockStatusBadgeTextCompact: { fontSize: 9 },
  marketingBadge: {
    color: palette.purple,
    backgroundColor: "#F4EBFF",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    fontSize: 9,
    fontWeight: "900",
  },
  addCart: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.teal,
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  noticeRowPressed: { opacity: 0.62 },
  noticeTitle: { color: palette.ink, fontSize: 13, fontWeight: "700", flex: 1 },
  noticeDate: { color: palette.muted, fontSize: 11, marginTop: 4 },
  noticeDetailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  noticeDetailBadge: { color: palette.teal, backgroundColor: palette.aqua, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, fontSize: 11, fontWeight: "900" },
  noticeDetailDate: { color: palette.muted, fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right" },
  noticeDetailTitle: { color: palette.navy, fontSize: 21, fontWeight: "900", lineHeight: 29, marginTop: 15 },
  noticeDetailDivider: { height: 1, backgroundColor: palette.line, marginVertical: 16 },
  noticeDetailContent: { color: palette.ink, fontSize: 15, lineHeight: 24 },
  page: { flex: 1 },
  pageHeader: {
    paddingHorizontal: 18,
    paddingTop: 19,
    paddingBottom: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: palette.navy, fontSize: 25, fontWeight: "900" },
  subtitle: { color: palette.muted, fontSize: 12, marginTop: 4 },
  fab: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.teal,
  },
  searchBox: {
    height: 46,
    marginHorizontal: 18,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 13,
  },
  searchInput: { flex: 1, color: palette.ink, fontSize: 13 },
  searchClearButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryFilterRow: {
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    overflow: "visible",
  },
  categoryFilterDivider: {
    width: 1,
    height: 22,
    marginHorizontal: 8,
    backgroundColor: palette.line,
  },
  categoryFilterScroll: { flex: 1, minWidth: 0, overflow: "visible" },
  categoryFilterScrollContent: {
    flexDirection: "row",
    gap: 7,
    paddingRight: 18,
    paddingVertical: 5,
    alignItems: "center",
  },
  categoryChipScroller: { minHeight: 44, maxHeight: 44, overflow: "visible" },
  categoryChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 1,
    paddingVertical: 5,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 1,
    paddingVertical: 5,
  },
  filterRow: {
    paddingHorizontal: 18,
    paddingVertical: 5,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  productCount: { flex: 1, color: palette.muted, fontSize: 12, fontWeight: "700" },
  sortSelector: {
    minHeight: 32,
    paddingLeft: 11,
    paddingRight: 8,
    borderRadius: 18,
    borderColor: palette.line,
    borderWidth: 1,
    backgroundColor: palette.surface,
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
  },
  sortSelectorText: { color: palette.ink, fontSize: 11, fontWeight: "800" },
  sortModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#102A4380",
    padding: 18,
  },
  sortModalCard: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 8,
  },
  sortModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  sortModalTitle: { color: palette.navy, fontSize: 17, fontWeight: "900" },
  sortOption: {
    minHeight: 62,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 13,
    borderColor: palette.line,
    borderWidth: 1,
    backgroundColor: palette.bg,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  sortOptionActive: { borderColor: palette.teal, backgroundColor: palette.aqua },
  sortOptionCopy: { flex: 1, gap: 3 },
  sortOptionLabel: { color: palette.ink, fontSize: 14, fontWeight: "900" },
  sortOptionLabelActive: { color: palette.teal },
  sortOptionDescription: { color: palette.muted, fontSize: 11 },
  chip: {
    height: 34,
    minHeight: 34,
    flexShrink: 0,
    paddingHorizontal: 11,
    paddingVertical: 0,
    borderRadius: 18,
    borderColor: palette.line,
    borderWidth: 1,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  chipActive: { backgroundColor: palette.teal, borderColor: palette.teal },
  chipText: { color: palette.muted, fontSize: 11, lineHeight: 15, includeFontPadding: false, fontWeight: "800" },
  chipTextActive: { color: "#fff" },
  list: { padding: 18, gap: 10, paddingBottom: 98 },
  empty: {
    margin: 18,
    paddingHorizontal: 24,
    paddingVertical: 35,
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 18,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.aqua,
    marginBottom: 10,
  },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: "900" },
  emptyCopy: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },
  checkoutPanel: { gap: 10, paddingTop: 4 },
  panelTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 8,
  },
  addressSummary: {
    backgroundColor: palette.aqua,
    borderRadius: 12,
    padding: 12,
    gap: 3,
  },
  outlineButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 11,
    backgroundColor: palette.surface,
    marginTop: 8,
  },
  outlineText: { color: palette.teal, fontSize: 13, fontWeight: "900" },
  cartRow: {
    padding: 13,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 15,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quantity: { flexDirection: "row", alignItems: "center", gap: 6 },
  quantityDisabled: { opacity: 0.35 },
  cartStockWarning: {
    color: palette.error,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },
  quantityText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "900",
    minWidth: 17,
    textAlign: "center",
  },
  checkoutBar: {
    padding: 15,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  total: { color: palette.navy, fontSize: 19, fontWeight: "900", marginTop: 2 },
  primaryButton: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 17,
    backgroundColor: palette.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonCompact: {
    minHeight: 36,
    minWidth: 82,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  primaryButtonDisabled: { backgroundColor: "#98A2B3" },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  primaryTextCompact: { fontSize: 11 },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  secondaryButtonCompact: {
    flexGrow: 0,
    flexBasis: "auto",
    minHeight: 36,
    minWidth: 72,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  secondaryText: { color: palette.teal, fontSize: 12, fontWeight: "900" },
  secondaryTextCompact: { fontSize: 11 },
  periodBox: {
    marginHorizontal: 18,
    padding: 12,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: palette.surface,
  },
  periodHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 10,
  },
  dateInput: {
    flex: 1,
    height: 38,
    paddingHorizontal: 9,
    borderRadius: 9,
    borderColor: palette.line,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 11,
  },
  periodDateInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 9,
    borderRadius: 9,
    borderColor: palette.line,
    borderWidth: 1,
    backgroundColor: "#FAFCFD",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  periodDateText: { flex: 1, color: palette.ink, fontSize: 11, fontWeight: "700" },
  periodDatePlaceholder: { color: "#98A2B3", fontWeight: "600" },
  quickRangeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, marginTop: 10 },
  quickRangeLabel: { color: palette.muted, fontSize: 11, fontWeight: "800", marginRight: 1 },
  quickRangeButton: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#B9E4E9",
    backgroundColor: "#F0FCFD",
    alignItems: "center",
    justifyContent: "center",
  },
  quickRangeText: { color: palette.teal, fontSize: 11, fontWeight: "900" },
  dateTimePicker: { gap: 8, marginBottom: 16 },
  calendarNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#FAFCFD",
    alignItems: "center",
    justifyContent: "center",
  },
  monthArrowDisabled: { backgroundColor: palette.bg, borderColor: "#EEF2F5" },
  calendarMonthLabel: { color: palette.ink, fontSize: 14, fontWeight: "900" },
  calendarWeekRow: { flexDirection: "row", marginTop: 2 },
  calendarWeekday: { width: "14.285%", color: palette.muted, fontSize: 10, fontWeight: "800", textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 5 },
  calendarDay: { width: "14.285%", height: 34, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  calendarDayBlank: { width: "14.285%", height: 34 },
  calendarDayActive: { backgroundColor: palette.teal },
  calendarDayDisabled: { opacity: 0.35 },
  calendarDayText: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  calendarDayTextActive: { color: "#fff" },
  calendarDayTextDisabled: { color: palette.muted },
  timeOptionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  timeOption: {
    minWidth: 58,
    minHeight: 34,
    paddingHorizontal: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#FAFCFD",
    alignItems: "center",
    justifyContent: "center",
  },
  timeOptionActive: { backgroundColor: "#E8F7F8", borderColor: palette.teal },
  timeOptionText: { color: palette.ink, fontSize: 11, fontWeight: "800" },
  timeOptionTextActive: { color: palette.teal },
  bulkButton: {
    marginHorizontal: 18,
    marginTop: 5,
    borderRadius: 10,
    backgroundColor: "#F4EBFF",
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  bulkText: { color: palette.purple, fontSize: 12, fontWeight: "900" },
  orderCard: {
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE5EB",
    borderWidth: 1,
    borderRadius: 15,
    shadowColor: "#102A43",
    shadowOpacity: 0.04,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
  },
  latest: { borderWidth: 2, borderColor: palette.teal },
  latestText: {
    alignSelf: "flex-start",
    color: "#fff",
    backgroundColor: palette.teal,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: "900",
    marginTop: 7,
  },
  statusPill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: "900" },
  orderDate: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 6 },
  orderCardCompany: { color: palette.teal, fontSize: 11, fontWeight: "900", marginTop: 7 },
  orderDeliveryPanel: { marginTop: 9, gap: 7, padding: 9, borderRadius: 10, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E5EAF0" },
  orderDeliveryLine: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  deliveryInfoIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  deliveryAddressIcon: { backgroundColor: "#F0FDF4" },
  orderDeliveryCopy: { flex: 1, gap: 1 },
  orderDeliveryLabel: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  orderDeliveryValue: { color: "#1D4ED8", fontSize: 12, fontWeight: "900" },
  orderDeliveryAddress: { color: palette.ink, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  orderDesiredDelivery: { color: palette.success, fontSize: 11, fontWeight: "800", marginTop: 8 },
  orderShippingInfo: { color: palette.teal, fontSize: 11, fontWeight: "800", marginTop: 4 },
  orderItems: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 9,
  },
  orderAmount: {
    color: palette.navy,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 9,
  },
  account: {
    marginTop: 18,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.navy,
  },
  accountMark: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: "#FFFFFF20",
    alignItems: "center",
    justifyContent: "center",
  },
  accountMarkText: { color: "#fff", fontSize: 19, fontWeight: "900" },
  accountTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  accountCopy: { color: "#CAE5E8", fontSize: 11, lineHeight: 16, marginTop: 3 },
  previewRole: {
    padding: 13,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: palette.aqua,
  },
  menuGroup: { marginTop: 22 },
  groupTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 8,
  },
  menuRow: {
    padding: 13,
    marginTop: 8,
    borderRadius: 15,
    borderColor: palette.line,
    borderWidth: 1,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.aqua,
  },
  menuTitle: { color: palette.ink, fontSize: 13, fontWeight: "900" },
  menuCopy: {
    color: palette.muted,
    fontSize: 10,
    marginTop: 3,
    lineHeight: 14,
  },
  backHeader: {
    height: 58,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.surface,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  backTitle: { color: palette.navy, fontSize: 17, fontWeight: "900" },
  dashboard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: palette.navy,
    marginBottom: 10,
  },
  dashboardTitle: { color: "#fff", fontSize: 23, fontWeight: "900" },
  dashboardCopy: { color: "#D9EDF0", fontSize: 12, marginTop: 7 },
  roleIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 14,
    backgroundColor: palette.aqua,
    marginBottom: 2,
  },
  roleIntroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  accountRoleCard: {
    padding: 14,
    borderRadius: 15,
    borderColor: palette.line,
    borderWidth: 1,
    backgroundColor: palette.surface,
  },
  roleBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  roleBadgeAdmin: { backgroundColor: "#F4EBFF" },
  roleBadgeCustomer: { backgroundColor: palette.aqua },
  roleBadgeText: { fontSize: 10, fontWeight: "900" },
  roleActionRow: { flexDirection: "row", gap: 7, marginTop: 11 },
  roleActionButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  roleActionButtonActive: { borderColor: palette.teal, backgroundColor: palette.aqua },
  roleActionButtonDisabled: { opacity: 0.5 },
  roleActionText: { color: palette.teal, fontSize: 11, fontWeight: "900" },
  adminGrid: {
    minHeight: 104,
    borderRadius: 15,
    borderColor: palette.line,
    borderWidth: 1,
    backgroundColor: palette.surface,
    marginTop: 9,
    padding: 14,
  },
  adminLabel: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 8,
  },
  adminCopy: { color: palette.muted, fontSize: 11, marginTop: 4 },
  card: {
    padding: 14,
    borderRadius: 15,
    borderColor: palette.line,
    borderWidth: 1,
    backgroundColor: palette.surface,
    gap: 5,
  },
  noticeContent: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  qaState: { fontSize: 11, fontWeight: "900" },
  defaultTag: {
    color: palette.teal,
    fontSize: 10,
    backgroundColor: palette.aqua,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  setDefaultAddressButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: palette.aqua,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  setDefaultAddressText: { color: palette.teal, fontSize: 11, fontWeight: "900" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11 },
  unread: { borderColor: palette.teal, backgroundColor: "#F0FDFA" },
  tabs: {
    minHeight: 68,
    paddingBottom: 8,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: "row",
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  tabText: { color: palette.muted, fontSize: 9, fontWeight: "900" },
  sheetSafe: { flex: 1, backgroundColor: palette.bg },
  sheetKeyboard: { flex: 1 },
  sheetHeader: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.surface,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  sheetTitle: { color: palette.ink, fontSize: 16, fontWeight: "900" },
  cancel: { color: palette.muted, fontSize: 13, fontWeight: "800" },
  sheetBody: { padding: 18, paddingBottom: 44 },
  field: { marginBottom: 15 },
  fieldLabel: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 7,
  },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    color: palette.ink,
    fontSize: 13,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 11,
    backgroundColor: palette.surface,
  },
  addressLookupButton: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 11,
    borderColor: palette.line,
    borderWidth: 1,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addressLookupValue: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  addressLookupSub: { color: palette.muted, fontSize: 11, marginTop: 3 },
  addressLookupPlaceholder: { color: "#98A2B3", fontSize: 13 },
  textarea: { minHeight: 100, textAlignVertical: "top", paddingTop: 11 },
  twoFields: { flexDirection: "row", gap: 9 },
  attach: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderColor: palette.line,
    borderWidth: 1,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  attachText: { color: palette.teal, fontSize: 12, fontWeight: "800", flex: 1 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 10,
  },
  switchRow: {
    minHeight: 44,
    padding: 11,
    borderRadius: 11,
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  formDivider: {
    color: palette.muted,
    fontSize: 11,
    textAlign: "center",
    marginVertical: 15,
  },
  authLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 18,
  },
  authLinkText: {
    color: palette.teal,
    fontSize: 13,
    fontWeight: "800",
  },
  authLinkDivider: {
    width: 1,
    height: 13,
    backgroundColor: palette.line,
  },
  detailImage: {
    height: 180,
    borderRadius: 17,
    backgroundColor: palette.aqua,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 15,
  },
  detailImageFill: { width: "100%", height: "100%" },
  detailTitle: { color: palette.navy, fontSize: 21, fontWeight: "900" },
  detailPrice: {
    color: palette.navy,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 10,
  },
  detailCopy: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 15,
    marginBottom: 12,
  },
  qaOriginal: {
    padding: 13,
    borderRadius: 13,
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    marginBottom: 14,
  },
  comment: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: palette.bg,
    marginTop: 9,
  },
  adminComment: { backgroundColor: palette.aqua },
  detailOrder: { gap: 12 },
  orderDetailHero: { backgroundColor: "#F8FAFC", borderColor: "#E5EAF0", borderWidth: 1, borderRadius: 14, padding: 13 },
  orderDetailDate: { color: palette.muted, fontSize: 12, fontWeight: "700", marginTop: 4 },
  orderDetailCompany: { color: palette.teal, fontSize: 12, fontWeight: "800", marginTop: 10 },
  orderDetailSection: { borderColor: "#E5EAF0", borderWidth: 1, borderRadius: 14, padding: 13, backgroundColor: palette.surface },
  orderDetailSectionTitle: { color: palette.navy, fontSize: 14, fontWeight: "900", marginBottom: 6 },
  orderDetailDeliverySection: { backgroundColor: "#F8FAFC" },
  orderDetailDeliveryHead: { flexDirection: "row", alignItems: "center", gap: 7, paddingBottom: 10, borderBottomColor: "#E5EAF0", borderBottomWidth: 1 },
  orderDetailDeliveryMethod: { color: "#1D4ED8", fontSize: 13, fontWeight: "900" },
  orderDetailInfoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 11 },
  orderDetailInfoLabel: { color: palette.muted, fontSize: 10, fontWeight: "800", marginBottom: 2 },
  orderDetailInfoValue: { color: palette.ink, fontSize: 12, fontWeight: "800", lineHeight: 18 },
  orderDetailRecipient: { color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  orderDetailShippingInfo: { color: palette.teal, fontSize: 11, fontWeight: "800", marginTop: 9 },
  orderPaymentTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  orderPaymentLabel: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  orderPaymentAccount: { color: palette.muted, fontSize: 12, fontWeight: "700", marginTop: 7, lineHeight: 18 },
  lineRow: {
    paddingVertical: 7,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  productIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.aqua,
  },
});
