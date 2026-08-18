import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  emptyMifData,
  makeId,
  nextOrderStatus,
  orderStatusLabel,
  type CartItem,
  type MifData,
  type Order,
  type OrderStatus,
  type Product,
} from "./src/domain";
import { isMifApiConfigured, mifApi, type MifSessionUser } from "./src/api";
import { loadMifData, saveMifData } from "./src/storage";

const colors = {
  navy: "#102A43",
  teal: "#007C91",
  aqua: "#E8F7F8",
  background: "#F6F9FB",
  surface: "#FFFFFF",
  ink: "#1D2939",
  muted: "#667085",
  line: "#DCE5EB",
  success: "#087443",
  warning: "#B54708",
  danger: "#B42318",
};

type Tab = "home" | "products" | "orders" | "cart" | "more";

function won(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function EmptyState({ title, description, icon = "file-tray-outline" as const }: { title: string; description: string; icon?: React.ComponentProps<typeof Ionicons>["name"] }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={28} color={colors.teal} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{description}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const tone = status === "DELIVERED" ? colors.success : status === "CANCELED" ? colors.danger : colors.teal;
  return <View style={[styles.statusPill, { backgroundColor: `${tone}16` }]}><Text style={[styles.statusText, { color: tone }]}>{orderStatusLabel[status]}</Text></View>;
}

export default function App() {
  const [data, setData] = useState<MifData>(emptyMifData);
  const [tab, setTab] = useState<Tab>("home");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [applicationModal, setApplicationModal] = useState(false);
  const [vendorModal, setVendorModal] = useState(false);
  const [addressModal, setAddressModal] = useState(false);
  const [authModal, setAuthModal] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [session, setSession] = useState<MifSessionUser | null>(null);

  useEffect(() => {
    loadMifData().then(async (value) => {
      if (isMifApiConfigured()) {
        try {
          const products = await mifApi.listProducts();
          value = { ...value, products };
        } catch {
          // MIF API가 아직 준비되지 않은 개발 환경에서는 빈 데이터 상태를 유지한다.
        }
      }
      setData(value);
      setReady(true);
    });
  }, []);

  const updateData = async (next: MifData) => {
    setData(next);
    await saveMifData(next);
  };

  const addToCart = (product: Product) => {
    if (product.stockStatus === "out_of_stock") return;
    setCart((current) => {
      const target = current.find((item) => item.id === product.id);
      if (target) return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { ...product, quantity: product.minOrderQty }];
    });
  };

  const createOrder = async () => {
    if (!cart.length) return;
    const defaultAddress = data.addresses.find((address) => address.isDefault) ?? data.addresses[0];
    const order: Order = {
      id: makeId("ord"),
      orderNumber: `MIF-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(data.orders.length + 1).padStart(3, "0")}`,
      status: "RECEIVED",
      totalAmount: cart.reduce((sum, item) => sum + item.basePrice * item.quantity, 0),
      createdAt: new Date().toISOString(),
      deliveryMethod: "courier",
      address: defaultAddress,
      items: cart,
    };
    await updateData({ ...data, orders: [order, ...data.orders] });
    setCart([]);
    setTab("orders");
  };

  const advanceOrder = async (order: Order) => {
    const nextStatus = nextOrderStatus(order.status);
    if (!nextStatus) return;
    await updateData({ ...data, orders: data.orders.map((item) => item.id === order.id ? { ...item, status: nextStatus } : item) });
  };

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.basePrice * item.quantity, 0), [cart]);

  if (!ready) return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.teal} /><Text style={styles.loadingText}>MIF 업무 공간을 준비하는 중입니다.</Text></SafeAreaView>;

  const Home = () => <ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.hero}>
      <View><Text style={styles.eyebrow}>MIF ORDER TALK</Text><Text style={styles.heroTitle}>안녕하세요, MIF입니다.</Text><Text style={styles.heroText}>발주부터 배송 확인까지 한 곳에서 관리하세요.</Text></View>
      <View style={styles.monogram}><Text style={styles.monogramText}>M</Text></View>
    </View>
    <Text style={styles.sectionTitle}>주문 현황</Text>
    <View style={styles.summaryGrid}>
      {(["RECEIVED", "PREPARING", "SHIPPING", "DELIVERED"] as OrderStatus[]).map((status) => <Pressable key={status} onPress={() => setTab("orders")} style={styles.summaryCard}><Text style={styles.summaryNumber}>{data.orders.filter((order) => order.status === status).length}</Text><Text style={styles.summaryLabel}>{orderStatusLabel[status]}</Text></Pressable>)}
    </View>
    <View style={styles.sectionRow}><Text style={styles.sectionTitle}>최근 주문</Text><Pressable onPress={() => setTab("orders")}><Text style={styles.link}>전체 보기</Text></Pressable></View>
    {data.orders.length ? data.orders.slice(0, 3).map((order) => <OrderRow key={order.id} order={order} onAdvance={() => advanceOrder(order)} />) : <EmptyState title="아직 주문이 없습니다" description="상품을 등록하고 장바구니에서 첫 주문을 만들어 보세요." icon="receipt-outline" />}
    <View style={styles.quickRow}>
      <QuickAction icon="cube-outline" label="상품 관리" onPress={() => { setAdminMode(true); setTab("products"); }} />
      <QuickAction icon="business-outline" label="거래처 신청" onPress={() => setApplicationModal(true)} />
      <QuickAction icon="help-circle-outline" label="입점 문의" onPress={() => setVendorModal(true)} />
    </View>
  </ScrollView>;

  const Products = () => <View style={styles.page}>
    <View style={styles.pageHeader}><View><Text style={styles.pageTitle}>상품</Text><Text style={styles.pageSubtitle}>발주할 상품을 확인하세요.</Text></View>{adminMode && <Pressable style={styles.iconButton} onPress={() => setProductModal(true)}><Ionicons name="add" size={24} color={colors.surface} /></Pressable>}</View>
    {data.products.length ? <FlatList data={data.products} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} renderItem={({ item }) => <View style={styles.productCard}><View style={styles.productImage}><Ionicons name="cube-outline" size={26} color={colors.teal} /></View><View style={styles.productMain}><Text style={styles.productCategory}>{item.categoryName || "미분류"}</Text><Text style={styles.productName}>{item.name}</Text><Text style={styles.productSpec}>{[item.spec, item.unit].filter(Boolean).join(" · ") || "규격 미입력"}</Text><Text style={styles.productPrice}>{won(item.basePrice)}</Text></View><Pressable onPress={() => addToCart(item)} style={[styles.addButton, item.stockStatus === "out_of_stock" && styles.disabledButton]}><Ionicons name="add" size={18} color={colors.surface} /></Pressable></View>} /> : <EmptyState title="등록된 상품이 없습니다" description={adminMode ? "오른쪽 상단의 추가 버튼으로 첫 상품을 등록하세요." : "관리자가 상품을 등록하면 이곳에서 발주할 수 있습니다."} icon="cube-outline" />}
  </View>;

  const Orders = () => <View style={styles.page}>
    <View style={styles.pageHeader}><View><Text style={styles.pageTitle}>주문 내역</Text><Text style={styles.pageSubtitle}>발주 상태와 배송 정보를 확인하세요.</Text></View></View>
    {data.orders.length ? <FlatList data={data.orders} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} renderItem={({ item }) => <OrderRow order={item} onAdvance={() => advanceOrder(item)} />} /> : <EmptyState title="주문 내역이 없습니다" description="장바구니에 담은 상품을 주문하면 진행 상태가 표시됩니다." icon="receipt-outline" />}
  </View>;

  const Cart = () => <View style={styles.page}>
    <View style={styles.pageHeader}><View><Text style={styles.pageTitle}>장바구니</Text><Text style={styles.pageSubtitle}>수량을 확인하고 주문을 생성하세요.</Text></View></View>
    {cart.length ? <><FlatList data={cart} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} renderItem={({ item }) => <View style={styles.cartRow}><View style={{ flex: 1 }}><Text style={styles.productName}>{item.name}</Text><Text style={styles.productSpec}>{won(item.basePrice)} · {item.quantity}{item.unit || "개"}</Text></View><View style={styles.quantity}><Pressable onPress={() => setCart(cart.map((row) => row.id === item.id ? { ...row, quantity: Math.max(row.minOrderQty, row.quantity - 1) } : row))}><Ionicons name="remove-circle-outline" size={25} color={colors.teal} /></Pressable><Text style={styles.quantityText}>{item.quantity}</Text><Pressable onPress={() => setCart(cart.map((row) => row.id === item.id ? { ...row, quantity: row.quantity + 1 } : row))}><Ionicons name="add-circle-outline" size={25} color={colors.teal} /></Pressable></View></View>} /><View style={styles.checkout}><View><Text style={styles.checkoutLabel}>주문 예정 금액</Text><Text style={styles.checkoutPrice}>{won(total)}</Text></View><Pressable style={styles.primaryButton} onPress={createOrder}><Text style={styles.primaryButtonText}>주문 생성</Text></Pressable></View></> : <EmptyState title="장바구니가 비어 있습니다" description="상품 화면에서 발주할 품목을 담아 보세요." icon="cart-outline" />}
  </View>;

  const More = () => <ScrollView contentContainerStyle={styles.scrollContent}>
    <Text style={styles.pageTitle}>더보기</Text><Text style={styles.pageSubtitle}>계정과 거래처 정보를 관리하세요.</Text>
    <View style={styles.accountCard}><View style={styles.accountAvatar}><Text style={styles.accountAvatarText}>{session?.name?.slice(0, 1) || "M"}</Text></View><View><Text style={styles.accountName}>{session ? `${session.name || session.loginId}님` : "MIF 업무 공간"}</Text><Text style={styles.accountMeta}>{session ? `${session.role === "admin" ? "관리자" : "거래처"} · ${session.companyName || "MIF"}` : isMifApiConfigured() ? "MIF 전용 API 연결 구성됨" : "초기 빈 데이터 상태 · API 연결 대기"}</Text></View></View>
    <MenuItem icon="log-in-outline" label={session ? "로그아웃" : "거래처 로그인"} description={session ? "현재 로그인 세션을 종료합니다." : "승인된 거래처 또는 관리자 계정으로 로그인합니다."} onPress={() => session ? setSession(null) : setAuthModal(true)} />
    <MenuItem icon="location-outline" label="배송지 관리" description="기본 배송지와 수령 정보를 설정합니다." onPress={() => setAddressModal(true)} />
    <MenuItem icon="business-outline" label="신규 거래처 신청" description="사업자등록증으로 거래처 가입을 신청합니다." onPress={() => setApplicationModal(true)} />
    <MenuItem icon="storefront-outline" label="입점 문의" description="공급·유통 파트너 입점 문의를 남깁니다." onPress={() => setVendorModal(true)} />
    <MenuItem icon="settings-outline" label="관리자 모드" description={adminMode ? "상품 관리 기능이 활성화되어 있습니다." : "상품·주문·승인 업무를 관리합니다."} onPress={() => setAdminMode((value) => !value)} />
    {adminMode && <View style={styles.adminPanel}><Text style={styles.adminTitle}>관리자 현황</Text><Text style={styles.adminText}>거래처 신청 {data.signupApplications.filter((item) => item.status === "pending").length}건 · 입점 문의 {data.vendorInquiries.filter((item) => item.status === "pending").length}건</Text><Pressable style={styles.outlineButton} onPress={() => setTab("products")}><Text style={styles.outlineButtonText}>상품 관리로 이동</Text></Pressable></View>}
  </ScrollView>;

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" />
    <View style={styles.appBar}><View style={styles.appBrand}><View style={styles.appMark}><Text style={styles.appMarkText}>M</Text></View><View><Text style={styles.appName}>MIF</Text><Text style={styles.appSub}>ORDER TALK</Text></View></View><Text style={styles.appState}>MIF 전용</Text></View>
    <View style={styles.content}>{tab === "home" && <Home />}{tab === "products" && <Products />}{tab === "orders" && <Orders />}{tab === "cart" && <Cart />}{tab === "more" && <More />}</View>
    <View style={styles.tabBar}>{([{ key: "home", icon: "home-outline", label: "홈" }, { key: "products", icon: "cube-outline", label: "상품" }, { key: "orders", icon: "receipt-outline", label: "주문" }, { key: "cart", icon: "cart-outline", label: "장바구니" }, { key: "more", icon: "menu-outline", label: "더보기" }] as const).map((item) => <Pressable key={item.key} style={styles.tabItem} onPress={() => setTab(item.key)}><Ionicons name={item.icon} size={22} color={tab === item.key ? colors.teal : colors.muted} /><Text style={[styles.tabLabel, tab === item.key && { color: colors.teal }]}>{item.label}{item.key === "cart" && cart.length ? ` ${cart.length}` : ""}</Text></Pressable>)}</View>
    <ProductModal visible={productModal} onClose={() => setProductModal(false)} onSave={async (product) => { await updateData({ ...data, products: [product, ...data.products] }); setProductModal(false); }} />
    <ApplicationModal visible={applicationModal} onClose={() => setApplicationModal(false)} onSave={async (application) => { await updateData({ ...data, signupApplications: [application, ...data.signupApplications] }); setApplicationModal(false); Alert.alert("신청이 접수되었습니다", "관리자 검토 후 거래처 계정이 활성화됩니다."); }} />
    <VendorModal visible={vendorModal} onClose={() => setVendorModal(false)} onSave={async (inquiry) => { await updateData({ ...data, vendorInquiries: [inquiry, ...data.vendorInquiries] }); setVendorModal(false); Alert.alert("문의가 접수되었습니다", "담당자가 검토 후 연락드릴 예정입니다."); }} />
    <AddressModal visible={addressModal} onClose={() => setAddressModal(false)} addresses={data.addresses} onSave={async (address) => { await updateData({ ...data, addresses: [...data.addresses.map((item) => address.isDefault ? { ...item, isDefault: false } : item), address] }); setAddressModal(false); }} />
    <AuthModal visible={authModal} onClose={() => setAuthModal(false)} onSuccess={(user) => { setSession(user); setAdminMode(user.role === "admin"); setAuthModal(false); }} />
  </SafeAreaView>;
}

function QuickAction({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void }) { return <Pressable style={styles.quickAction} onPress={onPress}><Ionicons name={icon} size={22} color={colors.teal} /><Text style={styles.quickLabel}>{label}</Text></Pressable>; }
function MenuItem({ icon, label, description, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; description: string; onPress: () => void }) { return <Pressable style={styles.menuItem} onPress={onPress}><View style={styles.menuIcon}><Ionicons name={icon} size={21} color={colors.teal} /></View><View style={{ flex: 1 }}><Text style={styles.menuLabel}>{label}</Text><Text style={styles.menuDescription}>{description}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable>; }
function OrderRow({ order, onAdvance }: { order: Order; onAdvance: () => void }) { const next = nextOrderStatus(order.status); return <View style={styles.orderRow}><View style={styles.orderTop}><View><Text style={styles.orderNumber}>{order.orderNumber}</Text><Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString("ko-KR")}</Text></View><StatusPill status={order.status} /></View><Text style={styles.orderItems}>{order.items.map((item) => item.name).join(", ") || "주문 품목 없음"}</Text><View style={styles.orderBottom}><Text style={styles.orderAmount}>{won(order.totalAmount)}</Text>{next && <Pressable style={styles.advanceButton} onPress={onAdvance}><Text style={styles.advanceText}>{orderStatusLabel[next]} 처리</Text></Pressable>}</View></View>; }

function ProductModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (product: Product) => void }) { const [name, setName] = useState(""); const [category, setCategory] = useState(""); const [price, setPrice] = useState(""); const save = () => { if (!name.trim() || !Number(price)) return Alert.alert("입력 확인", "상품명과 단가를 입력해 주세요."); onSave({ id: makeId("prd"), name: name.trim(), categoryName: category.trim(), spec: "", unit: "개", basePrice: Number(price), minOrderQty: 1, stockStatus: "in_stock", createdAt: new Date().toISOString() }); setName(""); setCategory(""); setPrice(""); }; return <FormModal visible={visible} title="상품 등록" onClose={onClose} onSave={save} saveLabel="상품 등록"><Field label="상품명" value={name} onChangeText={setName} placeholder="상품명을 입력하세요" /><Field label="카테고리" value={category} onChangeText={setCategory} placeholder="예: 신선식품" /><Field label="단가" value={price} onChangeText={setPrice} placeholder="숫자만 입력하세요" keyboardType="numeric" /></FormModal>; }
function ApplicationModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (application: import("./src/domain").SignupApplication) => void }) { const [company, setCompany] = useState(""); const [business, setBusiness] = useState(""); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [login, setLogin] = useState(""); const [documentName, setDocumentName] = useState(""); const pick = async () => { const result = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "application/pdf"], copyToCacheDirectory: true }); if (!result.canceled) setDocumentName(result.assets[0]?.name ?? "첨부 문서"); }; const save = () => { if (![company, business, name, phone, login].every((value) => value.trim())) return Alert.alert("입력 확인", "필수 항목을 모두 입력해 주세요."); onSave({ id: makeId("signup"), companyName: company, businessNumber: business, contactName: name, phone, requestedLoginId: login, documentName, status: "pending", createdAt: new Date().toISOString() }); setCompany(""); setBusiness(""); setName(""); setPhone(""); setLogin(""); setDocumentName(""); }; return <FormModal visible={visible} title="신규 거래처 신청" onClose={onClose} onSave={save} saveLabel="신청 접수"><Field label="회사명" value={company} onChangeText={setCompany} placeholder="회사명을 입력하세요" /><Field label="사업자등록번호" value={business} onChangeText={setBusiness} placeholder="숫자만 입력하세요" keyboardType="numeric" /><Field label="담당자명" value={name} onChangeText={setName} placeholder="담당자명을 입력하세요" /><Field label="연락처" value={phone} onChangeText={setPhone} placeholder="연락처를 입력하세요" keyboardType="phone-pad" /><Field label="희망 아이디" value={login} onChangeText={setLogin} placeholder="로그인 아이디" /><Pressable style={styles.documentButton} onPress={pick}><Ionicons name="attach-outline" size={19} color={colors.teal} /><Text style={styles.documentText}>{documentName || "사업자등록증 선택"}</Text></Pressable></FormModal>; }
function VendorModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (inquiry: import("./src/domain").VendorInquiry) => void }) { const [company, setCompany] = useState(""); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [categories, setCategories] = useState(""); const [message, setMessage] = useState(""); const save = () => { if (![company, name, phone, message].every((value) => value.trim())) return Alert.alert("입력 확인", "필수 항목을 모두 입력해 주세요."); onSave({ id: makeId("inquiry"), companyName: company, contactName: name, phone, categories, message, status: "pending", createdAt: new Date().toISOString() }); setCompany(""); setName(""); setPhone(""); setCategories(""); setMessage(""); }; return <FormModal visible={visible} title="입점 문의" onClose={onClose} onSave={save} saveLabel="문의 접수"><Field label="회사명" value={company} onChangeText={setCompany} placeholder="회사명을 입력하세요" /><Field label="담당자명" value={name} onChangeText={setName} placeholder="담당자명을 입력하세요" /><Field label="연락처" value={phone} onChangeText={setPhone} placeholder="연락처를 입력하세요" keyboardType="phone-pad" /><Field label="취급 카테고리" value={categories} onChangeText={setCategories} placeholder="예: 냉장, 냉동, 소스" /><Field label="문의 내용" value={message} onChangeText={setMessage} placeholder="입점 문의 내용을 입력하세요" multiline /></FormModal>; }
function AddressModal({ visible, onClose, addresses, onSave }: { visible: boolean; onClose: () => void; addresses: import("./src/domain").Address[]; onSave: (address: import("./src/domain").Address) => void }) { const [label, setLabel] = useState(""); const [recipient, setRecipient] = useState(""); const [phone, setPhone] = useState(""); const [address, setAddress] = useState(""); const save = () => { if (![label, recipient, phone, address].every((value) => value.trim())) return Alert.alert("입력 확인", "필수 항목을 모두 입력해 주세요."); onSave({ id: makeId("addr"), label, recipient, phone, postalCode: "", address, addressDetail: "", isDefault: addresses.length === 0 }); setLabel(""); setRecipient(""); setPhone(""); setAddress(""); }; return <FormModal visible={visible} title="배송지 관리" onClose={onClose} onSave={save} saveLabel="배송지 저장"><Text style={styles.formHint}>{addresses.length ? `저장된 배송지 ${addresses.length}건` : "저장된 배송지가 없습니다."}</Text><Field label="배송지명" value={label} onChangeText={setLabel} placeholder="예: 본사" /><Field label="수령인" value={recipient} onChangeText={setRecipient} placeholder="수령인 이름" /><Field label="연락처" value={phone} onChangeText={setPhone} placeholder="연락처" keyboardType="phone-pad" /><Field label="주소" value={address} onChangeText={setAddress} placeholder="기본 주소" /></FormModal>; }
function AuthModal({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: (user: MifSessionUser) => void }) { const [loginId, setLoginId] = useState(""); const [password, setPassword] = useState(""); const submit = async () => { if (!isMifApiConfigured()) return Alert.alert("MIF API 연결 필요", "승인된 거래처 계정 로그인은 MIF 전용 API가 연결된 후 사용할 수 있습니다."); try { const result = await mifApi.login(loginId, password); onSuccess(result.user); setLoginId(""); setPassword(""); } catch (error) { Alert.alert("로그인 실패", error instanceof Error ? error.message : "로그인 정보를 확인해 주세요."); } }; return <FormModal visible={visible} title="거래처 로그인" onClose={onClose} onSave={submit} saveLabel="로그인"><Text style={styles.formHint}>승인된 거래처 또는 관리자 계정으로 로그인합니다.</Text><Field label="아이디" value={loginId} onChangeText={setLoginId} placeholder="로그인 아이디" autoCapitalize="none" /><Field label="비밀번호" value={password} onChangeText={setPassword} placeholder="비밀번호" secureTextEntry /></FormModal>; }
function FormModal({ visible, title, children, onClose, onSave, saveLabel }: { visible: boolean; title: string; children: React.ReactNode; onClose: () => void; onSave: () => void; saveLabel: string }) { return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.modalSafe}><View style={styles.modalHeader}><Pressable onPress={onClose}><Text style={styles.cancelText}>취소</Text></Pressable><Text style={styles.modalTitle}>{title}</Text><Pressable onPress={onSave}><Text style={styles.saveText}>{saveLabel}</Text></Pressable></View><ScrollView contentContainerStyle={styles.form}>{children}</ScrollView></SafeAreaView></Modal>; }
function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} style={[styles.input, props.multiline && styles.textarea]} placeholderTextColor="#98A2B3" /></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, gap: 12 }, loadingText: { color: colors.muted }, appBar: { height: 62, backgroundColor: colors.surface, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, appBrand: { flexDirection: "row", alignItems: "center", gap: 9 }, appMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.teal, alignItems: "center", justifyContent: "center" }, appMarkText: { color: colors.surface, fontWeight: "800" }, appName: { color: colors.navy, fontWeight: "800", fontSize: 16 }, appSub: { color: colors.muted, letterSpacing: 1.2, fontWeight: "700", fontSize: 8 }, appState: { color: colors.success, fontSize: 12, fontWeight: "700" }, content: { flex: 1 }, page: { flex: 1 }, scrollContent: { padding: 18, paddingBottom: 30 }, hero: { backgroundColor: colors.navy, borderRadius: 22, padding: 22, minHeight: 164, flexDirection: "row", justifyContent: "space-between" }, eyebrow: { color: "#9EDDE5", fontSize: 11, letterSpacing: 1.2, fontWeight: "700", marginBottom: 10 }, heroTitle: { color: colors.surface, fontSize: 25, fontWeight: "800" }, heroText: { color: "#D9EDF0", fontSize: 14, marginTop: 7, maxWidth: 240, lineHeight: 20 }, monogram: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#FFFFFF18", alignItems: "center", justifyContent: "center" }, monogramText: { color: "#FFFFFF", fontSize: 25, fontWeight: "800" }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", marginTop: 24, marginBottom: 12 }, sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, link: { color: colors.teal, fontWeight: "700", marginTop: 24 }, summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, summaryCard: { flexGrow: 1, width: "45%", backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line }, summaryNumber: { color: colors.navy, fontSize: 25, fontWeight: "800" }, summaryLabel: { color: colors.muted, fontSize: 12, marginTop: 4 }, empty: { paddingVertical: 38, alignItems: "center", backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, marginTop: 5 }, emptyIcon: { width: 54, height: 54, backgroundColor: colors.aqua, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 }, emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 }, emptyText: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 6, paddingHorizontal: 28, lineHeight: 19 }, quickRow: { flexDirection: "row", gap: 9, marginTop: 22 }, quickAction: { flex: 1, minHeight: 86, alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: colors.line }, quickLabel: { color: colors.ink, fontSize: 11, fontWeight: "700", textAlign: "center" }, pageHeader: { paddingHorizontal: 18, paddingTop: 21, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, pageTitle: { color: colors.navy, fontSize: 25, fontWeight: "800" }, pageSubtitle: { color: colors.muted, fontSize: 13, marginTop: 5 }, iconButton: { backgroundColor: colors.teal, width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, listContent: { padding: 18, paddingTop: 2, paddingBottom: 100, gap: 10 }, productCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 13, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", gap: 12 }, productImage: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.aqua }, productMain: { flex: 1 }, productCategory: { color: colors.teal, fontSize: 11, fontWeight: "700" }, productName: { color: colors.ink, fontSize: 15, fontWeight: "800", marginTop: 2 }, productSpec: { color: colors.muted, fontSize: 12, marginTop: 3 }, productPrice: { color: colors.navy, fontWeight: "800", fontSize: 14, marginTop: 6 }, addButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.teal, justifyContent: "center", alignItems: "center" }, disabledButton: { backgroundColor: colors.muted }, orderRow: { backgroundColor: colors.surface, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.line, marginBottom: 10 }, orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, orderNumber: { color: colors.ink, fontWeight: "800", fontSize: 14 }, orderDate: { color: colors.muted, fontSize: 11, marginTop: 4 }, statusPill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 }, statusText: { fontSize: 11, fontWeight: "800" }, orderItems: { color: colors.muted, fontSize: 13, marginTop: 13 }, orderBottom: { marginTop: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, orderAmount: { color: colors.navy, fontWeight: "800", fontSize: 16 }, advanceButton: { backgroundColor: colors.aqua, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9 }, advanceText: { color: colors.teal, fontSize: 11, fontWeight: "800" }, cartRow: { backgroundColor: colors.surface, borderRadius: 15, padding: 14, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center" }, quantity: { flexDirection: "row", alignItems: "center", gap: 8 }, quantityText: { color: colors.ink, fontWeight: "800", minWidth: 18, textAlign: "center" }, checkout: { padding: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, checkoutLabel: { color: colors.muted, fontSize: 11 }, checkoutPrice: { color: colors.navy, fontSize: 18, fontWeight: "800", marginTop: 3 }, primaryButton: { backgroundColor: colors.teal, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 11 }, primaryButtonText: { color: colors.surface, fontWeight: "800" }, accountCard: { marginTop: 20, backgroundColor: colors.navy, padding: 17, borderRadius: 17, flexDirection: "row", alignItems: "center", gap: 12 }, accountAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#FFFFFF20", justifyContent: "center", alignItems: "center" }, accountAvatarText: { color: colors.surface, fontSize: 19, fontWeight: "800" }, accountName: { color: colors.surface, fontWeight: "800" }, accountMeta: { color: "#CAE5E8", fontSize: 12, marginTop: 4 }, menuItem: { backgroundColor: colors.surface, padding: 14, borderRadius: 15, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", gap: 11, marginTop: 10 }, menuIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.aqua, justifyContent: "center", alignItems: "center" }, menuLabel: { color: colors.ink, fontSize: 14, fontWeight: "800" }, menuDescription: { color: colors.muted, fontSize: 11, marginTop: 4 }, adminPanel: { backgroundColor: colors.aqua, marginTop: 15, borderRadius: 15, padding: 16 }, adminTitle: { color: colors.navy, fontWeight: "800", fontSize: 15 }, adminText: { color: colors.muted, fontSize: 12, marginTop: 6 }, outlineButton: { borderColor: colors.teal, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 13 }, outlineButtonText: { color: colors.teal, fontWeight: "800", fontSize: 13 }, tabBar: { minHeight: 66, paddingBottom: 8, backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-around" }, tabItem: { flex: 1, alignItems: "center", gap: 3 }, tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" }, modalSafe: { flex: 1, backgroundColor: colors.background }, modalHeader: { paddingHorizontal: 18, height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, modalTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 }, cancelText: { color: colors.muted, fontWeight: "700" }, saveText: { color: colors.teal, fontWeight: "800" }, form: { padding: 18, paddingBottom: 42 }, field: { marginBottom: 17 }, fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: "800", marginBottom: 8 }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 11, paddingHorizontal: 13, color: colors.ink, fontSize: 14 }, textarea: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 }, documentButton: { minHeight: 48, borderWidth: 1, borderColor: colors.teal, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 3 }, documentText: { color: colors.teal, fontWeight: "700", fontSize: 13 }, formHint: { color: colors.muted, marginBottom: 16, fontSize: 13 },
});
