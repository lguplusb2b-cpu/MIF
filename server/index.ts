import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { isStorageConfigured, putPrivateDocument } from "./storage";
import { hashPassword, verifyPassword } from "./password";

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const allowedOrigin = process.env.MIF_ALLOWED_ORIGIN || "mif://";

app.use(cors({ origin: allowedOrigin === "*" ? true : (origin, callback) => callback(null, !origin || origin.startsWith(allowedOrigin)) }));
app.use(express.json({ limit: "2mb" }));

const orderStatuses = ["RECEIVED", "PAID", "CONFIRMED", "PREPARING", "SHIPPING", "DELIVERED", "CANCELED"] as const;
const allowedTransitions: Partial<Record<(typeof orderStatuses)[number], (typeof orderStatuses)[number]>> = {
  RECEIVED: "PAID", PAID: "CONFIRMED", CONFIRMED: "PREPARING", PREPARING: "SHIPPING", SHIPPING: "DELIVERED",
};

type NotificationInput = {
  title: string;
  body: string;
  type: "order" | "notice" | "qa" | "onboarding" | "system";
  recipientRole?: "admin" | "customer" | "all";
  recipientUserId?: string;
  companyId?: string;
  payload?: Record<string, string>;
};

async function createAndDispatchNotification(input: NotificationInput) {
  const userQuery = input.recipientUserId
    ? { text: "SELECT id FROM mif_users WHERE id=$1 AND status='active'", values: [input.recipientUserId] }
    : input.recipientRole && input.recipientRole !== "all"
      ? { text: "SELECT id FROM mif_users WHERE role=$1 AND status='active'", values: [input.recipientRole] }
      : { text: "SELECT id FROM mif_users WHERE status='active'", values: [] as unknown[] };
  const recipients = await pool.query(userQuery.text, userQuery.values);
  if (!recipients.rowCount) return { notificationIds: [] as string[], pushCount: 0 };
  const notificationIds = await Promise.all(recipients.rows.map(async (user) => {
    const id = randomUUID();
    await pool.query("INSERT INTO mif_in_app_notifications (id,user_id,company_id,recipient_role,title,body,notification_type,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, user.id, input.companyId ?? null, input.recipientRole ?? "all", input.title, input.body, input.type, JSON.stringify(input.payload ?? {})]);
    return id;
  }));
  const tokens = await pool.query("SELECT token FROM mif_push_tokens WHERE user_id = ANY($1::uuid[])", [recipients.rows.map((user) => user.id)]);
  if (!tokens.rowCount) return { notificationIds, pushCount: 0 };
  const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(tokens.rows.map((row) => ({ to: row.token, sound: "default", title: input.title, body: input.body, channelId: "mif-orders", data: input.payload ?? {} }))) });
  if (response.ok) await pool.query("UPDATE mif_in_app_notifications SET delivered_at=NOW() WHERE id = ANY($1::uuid[])", [notificationIds]);
  return { notificationIds, pushCount: tokens.rowCount };
}

async function requireAdmin(loginId: string, password: string) {
  const result = await pool.query("SELECT id, password_hash, role, status FROM mif_users WHERE login_id=$1", [loginId]);
  const user = result.rows[0];
  if (!user || user.role !== "admin" || user.status !== "active" || !(await verifyPassword(password, user.password_hash))) throw new Error("관리자 인증 정보를 확인할 수 없습니다.");
  return user as { id: string; role: "admin"; status: "active" };
}

app.post("/api/auth/login", async (req, res) => {
  const input = z.object({ loginId: z.string().min(1).max(64), password: z.string().min(1).max(255) }).parse(req.body);
  const result = await pool.query("SELECT u.id,u.login_id AS \"loginId\",u.password_hash,u.name,u.company_id AS \"companyId\",c.name AS \"companyName\",u.role,u.status FROM mif_users u LEFT JOIN mif_companies c ON c.id=u.company_id WHERE u.login_id=$1", [input.loginId]);
  const user = result.rows[0];
  if (!user || user.status !== "active" || !(await verifyPassword(input.password, user.password_hash))) return res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
  const { password_hash: _passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.post("/api/auth/password-reset-requests", async (req, res) => {
  const input = z.object({ loginId: z.string().min(1).max(64), companyName: z.string().min(1).max(128), contactPhone: z.string().min(9).max(32), message: z.string().max(500).optional() }).parse(req.body);
  const known = await pool.query("SELECT 1 FROM mif_users WHERE login_id=$1", [input.loginId]);
  if (!known.rowCount) return res.status(404).json({ message: "등록된 계정을 찾을 수 없습니다." });
  const id = randomUUID();
  await pool.query("INSERT INTO mif_password_reset_requests (id,login_id,company_name,contact_phone,message) VALUES ($1,$2,$3,$4,$5)", [id, input.loginId, input.companyName, input.contactPhone, input.message ?? null]);
  res.status(201).json({ id, status: "pending" });
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "mif-order-api", storageConfigured: isStorageConfigured() });
  } catch {
    res.status(503).json({ status: "degraded", service: "mif-order-api", message: "MIF 데이터베이스 연결이 필요합니다." });
  }
});

app.get("/api/products", async (_req, res) => {
  const result = await pool.query("SELECT id, category_id AS \"categoryId\", name, category_name AS \"categoryName\", spec, unit, base_price AS \"basePrice\", min_order_qty AS \"minOrderQty\", stock_status AS \"stockStatus\", image_key AS \"imageKey\", description, detail_image_keys AS \"detailImageKeys\", marketing_badges AS \"marketingBadges\", created_at AS \"createdAt\", updated_at AS \"updatedAt\" FROM mif_products WHERE status = 'active' ORDER BY created_at DESC");
  res.json(result.rows);
});

const productInput = z.object({ name: z.string().min(1).max(128), categoryId: z.string().uuid().optional(), categoryName: z.string().max(64).optional(), spec: z.string().max(128).optional(), unit: z.string().max(32).optional(), basePrice: z.number().int().nonnegative(), minOrderQty: z.number().int().positive().default(1), stockStatus: z.enum(["in_stock", "out_of_stock"]).default("in_stock"), description: z.string().max(10000).optional(), imageKey: z.string().max(512).optional(), detailImageKeys: z.array(z.string()).max(20).default([]), marketingBadges: z.array(z.string()).max(10).default([]), featuredPriority: z.number().int().positive().optional() });

app.post("/api/products", async (req, res) => {
  const input = productInput.parse(req.body);
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("INSERT INTO mif_products (id, category_id, name, category_name, spec, unit, base_price, min_order_qty, stock_status, image_key, description, detail_image_keys, marketing_badges) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, category_id AS \"categoryId\", name, category_name AS \"categoryName\", spec, unit, base_price AS \"basePrice\", min_order_qty AS \"minOrderQty\", stock_status AS \"stockStatus\", image_key AS \"imageKey\", description, detail_image_keys AS \"detailImageKeys\", marketing_badges AS \"marketingBadges\", created_at AS \"createdAt\"", [id, input.categoryId ?? null, input.name, input.categoryName ?? null, input.spec ?? null, input.unit ?? null, input.basePrice, input.minOrderQty, input.stockStatus, input.imageKey ?? null, input.description ?? null, JSON.stringify(input.detailImageKeys), JSON.stringify(input.marketingBadges)]);
    if (input.featuredPriority && input.categoryId) await client.query("INSERT INTO mif_featured_products (id, category_id, product_id, priority) VALUES ($1,$2,$3,$4)", [randomUUID(), input.categoryId, id, input.featuredPriority]);
    await client.query("COMMIT");
    res.status(201).json(result.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

app.patch("/api/products/:id", async (req, res) => {
  const input = productInput.parse(req.body);
  const result = await pool.query("UPDATE mif_products SET category_id=$2, category_name=$3, name=$4, spec=$5, unit=$6, base_price=$7, min_order_qty=$8, stock_status=$9, image_key=$10, description=$11, detail_image_keys=$12, marketing_badges=$13, updated_at=NOW() WHERE id=$1 RETURNING id, category_id AS \"categoryId\", name, category_name AS \"categoryName\", spec, unit, base_price AS \"basePrice\", min_order_qty AS \"minOrderQty\", stock_status AS \"stockStatus\", image_key AS \"imageKey\", description, detail_image_keys AS \"detailImageKeys\", marketing_badges AS \"marketingBadges\", updated_at AS \"updatedAt\"", [req.params.id, input.categoryId ?? null, input.categoryName ?? null, input.name, input.spec ?? null, input.unit ?? null, input.basePrice, input.minOrderQty, input.stockStatus, input.imageKey ?? null, input.description ?? null, JSON.stringify(input.detailImageKeys), JSON.stringify(input.marketingBadges)]);
  if (!result.rowCount) return res.status(404).json({ message: "상품을 찾을 수 없습니다." });
  res.json(result.rows[0]);
});

app.delete("/api/products/:id", async (req, res) => {
  const result = await pool.query("UPDATE mif_products SET status='inactive',updated_at=NOW() WHERE id=$1 RETURNING id", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ message: "상품을 찾을 수 없습니다." });
  res.status(204).end();
});

app.get("/api/categories", async (_req, res) => {
  const result = await pool.query("SELECT id,name,sort_order AS \"sortOrder\",created_at AS \"createdAt\" FROM mif_categories ORDER BY sort_order,name");
  res.json(result.rows);
});

app.post("/api/categories", async (req, res) => {
  const input = z.object({ name: z.string().min(1).max(64), sortOrder: z.number().int().nonnegative().default(0) }).parse(req.body);
  const result = await pool.query("INSERT INTO mif_categories (id,name,sort_order) VALUES ($1,$2,$3) RETURNING id,name,sort_order AS \"sortOrder\",created_at AS \"createdAt\"", [randomUUID(), input.name, input.sortOrder]);
  res.status(201).json(result.rows[0]);
});

app.patch("/api/categories/:id", async (req, res) => {
  const input = z.object({ name: z.string().min(1).max(64), sortOrder: z.number().int().nonnegative().default(0) }).parse(req.body);
  const result = await pool.query("UPDATE mif_categories SET name=$2,sort_order=$3 WHERE id=$1 RETURNING id,name,sort_order AS \"sortOrder\"", [req.params.id, input.name, input.sortOrder]);
  if (!result.rowCount) return res.status(404).json({ message: "카테고리를 찾을 수 없습니다." });
  res.json(result.rows[0]);
});

app.delete("/api/categories/:id", async (req, res) => { await pool.query("DELETE FROM mif_categories WHERE id=$1", [req.params.id]); res.status(204).end(); });

app.get("/api/bank-accounts", async (_req, res) => {
  const result = await pool.query("SELECT id,bank_name AS \"bankName\",account_number AS \"accountNumber\",account_holder AS \"accountHolder\",is_active AS \"isActive\" FROM mif_bank_accounts ORDER BY created_at DESC");
  res.json(result.rows);
});

app.post("/api/bank-accounts", async (req, res) => {
  const input = z.object({ bankName: z.string().min(1).max(64), accountNumber: z.string().min(1).max(128), accountHolder: z.string().min(1).max(128), isActive: z.boolean().default(true) }).parse(req.body);
  const result = await pool.query("INSERT INTO mif_bank_accounts (id,bank_name,account_number,account_holder,is_active) VALUES ($1,$2,$3,$4,$5) RETURNING id,bank_name AS \"bankName\",account_number AS \"accountNumber\",account_holder AS \"accountHolder\",is_active AS \"isActive\"", [randomUUID(), input.bankName, input.accountNumber, input.accountHolder, input.isActive]);
  res.status(201).json(result.rows[0]);
});

app.patch("/api/bank-accounts/:id", async (req, res) => {
  const input = z.object({ bankName: z.string().min(1).max(64), accountNumber: z.string().min(1).max(128), accountHolder: z.string().min(1).max(128), isActive: z.boolean() }).parse(req.body);
  const result = await pool.query("UPDATE mif_bank_accounts SET bank_name=$2,account_number=$3,account_holder=$4,is_active=$5,updated_at=NOW() WHERE id=$1 RETURNING id,bank_name AS \"bankName\",account_number AS \"accountNumber\",account_holder AS \"accountHolder\",is_active AS \"isActive\"", [req.params.id, input.bankName, input.accountNumber, input.accountHolder, input.isActive]);
  if (!result.rowCount) return res.status(404).json({ message: "결제 계좌를 찾을 수 없습니다." });
  res.json(result.rows[0]);
});

app.delete("/api/bank-accounts/:id", async (req, res) => { await pool.query("DELETE FROM mif_bank_accounts WHERE id=$1", [req.params.id]); res.status(204).end(); });

app.get("/api/orders", async (req, res) => {
  const companyId = z.string().uuid().optional().safeParse(req.query.companyId).data;
  const result = await pool.query(`SELECT o.id, o.order_number AS "orderNumber", o.status, o.total_amount AS "totalAmount", o.delivery_method AS "deliveryMethod", o.courier_company AS "courierCompany", o.tracking_number AS "trackingNumber", o.created_at AS "createdAt" FROM mif_orders o ${companyId ? "WHERE o.company_id = $1" : ""} ORDER BY o.created_at DESC`, companyId ? [companyId] : []);
  res.json(result.rows);
});

app.post("/api/orders", async (req, res) => {
  const input = z.object({ companyId: z.string().uuid(), userId: z.string().uuid().optional(), addressId: z.string().uuid().optional(), addressSnapshot: z.record(z.string(), z.unknown()).optional(), note: z.string().max(2000).optional(), deliveryMethod: z.enum(["courier", "truck", "pickup"]), items: z.array(z.object({ productId: z.string().uuid().optional(), productName: z.string().min(1), spec: z.string().optional(), quantity: z.number().int().positive(), unitPrice: z.number().int().nonnegative() })).min(1) }).parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderId = randomUUID();
    const totalAmount = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const sequence = await client.query("SELECT COUNT(*)::int AS count FROM mif_orders");
    const orderNumber = `MIF-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(sequence.rows[0].count + 1).padStart(4, "0")}`;
    await client.query("INSERT INTO mif_orders (id, order_number, company_id, user_id, address_id, address_snapshot, note, delivery_method, total_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [orderId, orderNumber, input.companyId, input.userId ?? null, input.addressId ?? null, input.addressSnapshot ?? null, input.note ?? null, input.deliveryMethod, totalAmount]);
    for (const item of input.items) await client.query("INSERT INTO mif_order_items (id, order_id, product_id, product_name, spec, quantity, unit_price, amount, delivery_method) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [randomUUID(), orderId, item.productId ?? null, item.productName, item.spec ?? null, item.quantity, item.unitPrice, item.quantity * item.unitPrice, input.deliveryMethod]);
    await client.query("COMMIT");
    void createAndDispatchNotification({ title: "새 발주가 접수되었습니다", body: `${orderNumber} · 관리자 확인이 필요합니다.`, type: "order", recipientRole: "admin", companyId: input.companyId, payload: { event: "order-created", orderId, orderNumber } });
    if (input.userId) void createAndDispatchNotification({ title: "주문이 접수되었습니다", body: `${orderNumber} · 발주 접수 완료`, type: "order", recipientUserId: input.userId, companyId: input.companyId, payload: { event: "order-created", orderId, orderNumber } });
    res.status(201).json({ id: orderId, orderNumber, status: "RECEIVED", totalAmount });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

app.patch("/api/orders/:id/status", async (req, res) => {
  const input = z.object({ status: z.enum(orderStatuses), courierCompany: z.string().max(64).optional(), trackingNumber: z.string().max(128).optional(), truckDriverPhone: z.string().max(32).optional() }).parse(req.body);
  const current = await pool.query("SELECT status,company_id,user_id,order_number FROM mif_orders WHERE id = $1", [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  const existing = current.rows[0].status as (typeof orderStatuses)[number];
  if (input.status !== "CANCELED" && allowedTransitions[existing] !== input.status) return res.status(409).json({ message: "허용되지 않은 주문 상태 전환입니다." });
  const result = await pool.query("UPDATE mif_orders SET status=$2, courier_company=COALESCE($3,courier_company), tracking_number=COALESCE($4,tracking_number), truck_driver_phone=COALESCE($5,truck_driver_phone), updated_at=NOW() WHERE id=$1 RETURNING id, order_number AS \"orderNumber\", status", [req.params.id, input.status, input.courierCompany ?? null, input.trackingNumber ?? null, input.truckDriverPhone ?? null]);
  if (current.rows[0].user_id) void createAndDispatchNotification({ title: "주문 상태가 변경되었습니다", body: `${current.rows[0].order_number} · ${input.status}`, type: "order", recipientUserId: current.rows[0].user_id, companyId: current.rows[0].company_id, payload: { event: "order-status", orderId: req.params.id, status: input.status } });
  res.json(result.rows[0]);
});

app.post("/api/onboarding/signup", upload.single("businessDocument"), async (req, res) => {
  const input = z.object({ companyName: z.string().min(1).max(128), businessNumber: z.string().min(10).max(32), contactName: z.string().min(1).max(64), phone: z.string().min(9).max(32), requestedLoginId: z.string().min(4).max(64), password: z.string().min(4).max(255), email: z.string().email().optional() }).parse(req.body);
  if (!req.file) return res.status(400).json({ message: "사업자등록증 파일을 첨부해 주세요." });
  const document = await putPrivateDocument(req.file, "business-registration");
  const id = randomUUID();
  await pool.query("INSERT INTO mif_signup_applications (id, company_name, business_number, contact_name, phone, email, requested_login_id, password_hash, business_document_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id, input.companyName, input.businessNumber, input.contactName, input.phone, input.email ?? null, input.requestedLoginId, await hashPassword(input.password), document.key]);
  void createAndDispatchNotification({ title: "거래처 가입 신청이 접수되었습니다", body: `${input.companyName} · 심사 대기`, type: "onboarding", recipientRole: "admin", payload: { event: "signup", applicationId: id } });
  res.status(201).json({ id, status: "pending" });
});

app.get("/api/admin/onboarding", async (req, res) => {
  const input = z.object({ actorLoginId: z.string().min(1), actorPassword: z.string().min(1) }).parse(req.query);
  await requireAdmin(input.actorLoginId, input.actorPassword);
  const [applications, inquiries, resetRequests] = await Promise.all([
    pool.query("SELECT id,company_name AS \"companyName\",business_number AS \"businessNumber\",contact_name AS \"contactName\",phone,email,requested_login_id AS \"requestedLoginId\",business_document_key AS \"businessDocumentKey\",status,review_note AS \"reviewNote\",created_at AS \"createdAt\" FROM mif_signup_applications ORDER BY created_at DESC"),
    pool.query("SELECT id,company_name AS \"companyName\",contact_name AS \"contactName\",phone,email,product_categories AS \"productCategories\",service_area AS \"serviceArea\",message,status,review_note AS \"reviewNote\",created_at AS \"createdAt\" FROM mif_vendor_inquiries ORDER BY created_at DESC"),
    pool.query("SELECT id,login_id AS \"loginId\",company_name AS \"companyName\",contact_phone AS \"contactPhone\",message,status,created_at AS \"createdAt\" FROM mif_password_reset_requests ORDER BY created_at DESC"),
  ]);
  res.json({ applications: applications.rows, inquiries: inquiries.rows, passwordResetRequests: resetRequests.rows });
});

app.post("/api/admin/onboarding/:id/review", async (req, res) => {
  const input = z.object({ actorLoginId: z.string().min(1), actorPassword: z.string().min(1), decision: z.enum(["approved", "rejected"]), reviewNote: z.string().max(1000).optional() }).parse(req.body);
  const admin = await requireAdmin(input.actorLoginId, input.actorPassword);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const application = await client.query("SELECT * FROM mif_signup_applications WHERE id=$1 FOR UPDATE", [req.params.id]);
    if (!application.rowCount) return res.status(404).json({ message: "가입 신청을 찾을 수 없습니다." });
    const row = application.rows[0];
    if (row.status !== "pending") return res.status(409).json({ message: "이미 검토된 가입 신청입니다." });
    await client.query("UPDATE mif_signup_applications SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=NOW() WHERE id=$1", [req.params.id, input.decision, input.reviewNote ?? null, admin.id]);
    if (input.decision === "approved") {
      const companyId = randomUUID();
      const userId = randomUUID();
      await client.query("INSERT INTO mif_companies (id,name,business_number,contact_name,phone,email) VALUES ($1,$2,$3,$4,$5,$6)", [companyId, row.company_name, row.business_number, row.contact_name, row.phone, row.email]);
      await client.query("INSERT INTO mif_users (id,login_id,password_hash,name,company_id,role,status) VALUES ($1,$2,$3,$4,$5,'customer','active')", [userId, row.requested_login_id, row.password_hash, row.contact_name, companyId]);
    }
    await client.query("COMMIT");
    res.json({ success: true, decision: input.decision });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

app.post("/api/vendor-inquiries", async (req, res) => {
  const input = z.object({ companyName: z.string().min(1).max(128), contactName: z.string().min(1).max(64), phone: z.string().min(9).max(32), email: z.string().email().optional(), productCategories: z.array(z.string()).max(10).default([]), serviceArea: z.string().max(255).optional(), message: z.string().min(10).max(3000) }).parse(req.body);
  const id = randomUUID();
  await pool.query("INSERT INTO mif_vendor_inquiries (id, company_name, contact_name, phone, email, product_categories, service_area, message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, input.companyName, input.contactName, input.phone, input.email ?? null, JSON.stringify(input.productCategories), input.serviceArea ?? null, input.message]);
  res.status(201).json({ id, status: "pending" });
});

app.get("/api/notices", async (_req, res) => {
  const result = await pool.query("SELECT id, title, content, is_visible AS \"isVisible\", start_date AS \"startDate\", end_date AS \"endDate\", created_at AS \"createdAt\" FROM mif_notices WHERE is_visible = TRUE AND (start_date IS NULL OR start_date <= CURRENT_DATE) AND (end_date IS NULL OR end_date >= CURRENT_DATE) ORDER BY created_at DESC");
  res.json(result.rows);
});

app.post("/api/notices", async (req, res) => {
  const input = z.object({ title: z.string().min(1).max(255), content: z.string().min(1).max(10000), isVisible: z.boolean().default(true), startDate: z.string().date().optional(), endDate: z.string().date().optional() }).parse(req.body);
  const id = randomUUID();
  const result = await pool.query("INSERT INTO mif_notices (id,title,content,is_visible,start_date,end_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,title,content,is_visible AS \"isVisible\",start_date AS \"startDate\",end_date AS \"endDate\",created_at AS \"createdAt\"", [id, input.title, input.content, input.isVisible, input.startDate ?? null, input.endDate ?? null]);
  if (input.isVisible) void createAndDispatchNotification({ title: "새 공지", body: input.title, type: "notice", recipientRole: "customer", payload: { event: "notice", noticeId: id } });
  res.status(201).json(result.rows[0]);
});

app.get("/api/qa-posts", async (req, res) => {
  const companyId = z.string().uuid().optional().safeParse(req.query.companyId).data;
  const result = await pool.query(`SELECT id, company_id AS "companyId", author_id AS "authorId", author_name AS "authorName", title, content, is_private AS "isPrivate", is_answered AS "isAnswered", image_keys AS "imageKeys", created_at AS "createdAt", updated_at AS "updatedAt" FROM mif_qa_posts ${companyId ? "WHERE company_id=$1" : ""} ORDER BY created_at DESC`, companyId ? [companyId] : []);
  res.json(result.rows);
});

app.post("/api/qa-posts", async (req, res) => {
  const input = z.object({ companyId: z.string().uuid(), authorId: z.string().uuid().optional(), authorName: z.string().min(1).max(128), title: z.string().min(1).max(255), content: z.string().min(1).max(10000), isPrivate: z.boolean().default(false), imageKeys: z.array(z.string()).max(5).default([]) }).parse(req.body);
  const id = randomUUID();
  const result = await pool.query("INSERT INTO mif_qa_posts (id,company_id,author_id,author_name,title,content,is_private,image_keys) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,company_id AS \"companyId\",author_id AS \"authorId\",author_name AS \"authorName\",title,content,is_private AS \"isPrivate\",is_answered AS \"isAnswered\",image_keys AS \"imageKeys\",created_at AS \"createdAt\"", [id, input.companyId, input.authorId ?? null, input.authorName, input.title, input.content, input.isPrivate, JSON.stringify(input.imageKeys)]);
  void createAndDispatchNotification({ title: "새 Q&A 문의가 접수되었습니다", body: input.title, type: "qa", recipientRole: "admin", companyId: input.companyId, payload: { event: "qa-created", qaId: id } });
  res.status(201).json(result.rows[0]);
});

app.post("/api/qa-posts/:id/comments", async (req, res) => {
  const input = z.object({ authorId: z.string().uuid().optional(), authorName: z.string().min(1).max(128), isAdmin: z.boolean().default(false), content: z.string().min(1).max(10000), fileKeys: z.array(z.string()).max(5).default([]) }).parse(req.body);
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const post = await client.query("SELECT author_id,company_id,title FROM mif_qa_posts WHERE id=$1", [req.params.id]);
    if (!post.rowCount) return res.status(404).json({ message: "Q&A 문의를 찾을 수 없습니다." });
    const comment = await client.query("INSERT INTO mif_qa_comments (id,post_id,author_id,author_name,is_admin,content,file_keys) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,post_id AS \"postId\",author_name AS \"authorName\",is_admin AS \"isAdmin\",content,file_keys AS \"fileKeys\",created_at AS \"createdAt\"", [id, req.params.id, input.authorId ?? null, input.authorName, input.isAdmin, input.content, JSON.stringify(input.fileKeys)]);
    if (input.isAdmin) await client.query("UPDATE mif_qa_posts SET is_answered=TRUE, updated_at=NOW() WHERE id=$1", [req.params.id]);
    await client.query("COMMIT");
    if (input.isAdmin && post.rows[0].author_id) void createAndDispatchNotification({ title: "Q&A 답변이 등록되었습니다", body: post.rows[0].title, type: "qa", recipientUserId: post.rows[0].author_id, companyId: post.rows[0].company_id, payload: { event: "qa-answer", qaId: req.params.id } });
    if (!input.isAdmin) void createAndDispatchNotification({ title: "Q&A에 새 댓글이 등록되었습니다", body: post.rows[0].title, type: "qa", recipientRole: "admin", companyId: post.rows[0].company_id, payload: { event: "qa-comment", qaId: req.params.id } });
    res.status(201).json(comment.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

app.post("/api/favorite-shares", async (req, res) => {
  const input = z.object({ companyId: z.string().uuid(), productIds: z.array(z.string().uuid()).min(1).max(100) }).parse(req.body);
  const token = randomUUID().replaceAll("-", "");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query("INSERT INTO mif_favorite_shares (token,company_id,product_ids,expires_at) VALUES ($1,$2,$3,$4)", [token, input.companyId, JSON.stringify([...new Set(input.productIds)]), expiresAt]);
  res.status(201).json({ token, expiresAt, path: `/shared-favorites/${token}` });
});

app.get("/api/favorite-shares/:token", async (req, res) => {
  const share = await pool.query("SELECT product_ids FROM mif_favorite_shares WHERE token=$1 AND expires_at > NOW()", [req.params.token]);
  if (!share.rowCount) return res.status(404).json({ message: "공유 링크가 만료되었거나 존재하지 않습니다." });
  const ids = share.rows[0].product_ids as string[];
  const products = await pool.query("SELECT id,name,category_name AS \"categoryName\",spec,unit,stock_status AS \"stockStatus\" FROM mif_products WHERE id = ANY($1::uuid[]) AND status='active'", [ids]);
  res.json({ products: products.rows });
});

app.post("/api/push-tokens", async (req, res) => {
  const input = z.object({ userId: z.string().uuid(), token: z.string().min(1).max(255), platform: z.string().max(16).optional() }).parse(req.body);
  await pool.query("INSERT INTO mif_push_tokens (id,user_id,token,platform) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,token) DO UPDATE SET platform=EXCLUDED.platform,updated_at=NOW()", [randomUUID(), input.userId, input.token, input.platform ?? null]);
  res.status(201).json({ success: true });
});

app.get("/api/orders/:id/tracking", async (req, res) => {
  if (!process.env.SWEETTRACKER_API_KEY) return res.status(501).json({ message: "MIF 배송조회 API 키가 아직 설정되지 않았습니다." });
  const order = await pool.query("SELECT delivery_method,courier_company,tracking_number FROM mif_orders WHERE id=$1", [req.params.id]);
  if (!order.rowCount) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  if (order.rows[0].delivery_method !== "courier" || !order.rows[0].tracking_number) return res.status(409).json({ message: "택배 배송 정보가 등록된 주문에서만 배송조회가 가능합니다." });
  res.status(501).json({ message: "MIF 택배사 코드 매핑을 설정한 뒤 배송조회 제공사를 연결해야 합니다.", courierCompany: order.rows[0].courier_company, trackingNumber: order.rows[0].tracking_number });
});

app.get("/api/addresses", async (req, res) => {
  const companyId = z.string().uuid().parse(req.query.companyId);
  const result = await pool.query("SELECT id,label,recipient,phone,postal_code AS \"postalCode\",address,address_detail AS \"addressDetail\",is_default AS \"isDefault\" FROM mif_addresses WHERE company_id=$1 ORDER BY is_default DESC,created_at DESC", [companyId]);
  res.json(result.rows);
});

const addressInput = z.object({ companyId: z.string().uuid(), label: z.string().min(1).max(64), recipient: z.string().min(1).max(64), phone: z.string().min(9).max(32), postalCode: z.string().regex(/^\d{5}$/).optional().or(z.literal("")), address: z.string().min(1).max(1000), addressDetail: z.string().max(500).optional(), isDefault: z.boolean().default(false) });
app.post("/api/addresses", async (req, res) => {
  const input = addressInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.isDefault) await client.query("UPDATE mif_addresses SET is_default=FALSE WHERE company_id=$1", [input.companyId]);
    const result = await client.query("INSERT INTO mif_addresses (id,company_id,label,recipient,phone,postal_code,address,address_detail,is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,label,recipient,phone,postal_code AS \"postalCode\",address,address_detail AS \"addressDetail\",is_default AS \"isDefault\"", [randomUUID(), input.companyId, input.label, input.recipient, input.phone, input.postalCode || null, input.address, input.addressDetail ?? null, input.isDefault]);
    await client.query("COMMIT");
    res.status(201).json(result.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

app.patch("/api/addresses/:id", async (req, res) => {
  const input = addressInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.isDefault) await client.query("UPDATE mif_addresses SET is_default=FALSE WHERE company_id=$1", [input.companyId]);
    const result = await client.query("UPDATE mif_addresses SET label=$3,recipient=$4,phone=$5,postal_code=$6,address=$7,address_detail=$8,is_default=$9 WHERE id=$1 AND company_id=$2 RETURNING id,label,recipient,phone,postal_code AS \"postalCode\",address,address_detail AS \"addressDetail\",is_default AS \"isDefault\"", [req.params.id, input.companyId, input.label, input.recipient, input.phone, input.postalCode || null, input.address, input.addressDetail ?? null, input.isDefault]);
    if (!result.rowCount) return res.status(404).json({ message: "배송지를 찾을 수 없습니다." });
    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

app.delete("/api/addresses/:id", async (req, res) => { await pool.query("DELETE FROM mif_addresses WHERE id=$1", [req.params.id]); res.status(204).end(); });

app.delete("/api/orders/:id", async (req, res) => {
  const result = await pool.query("DELETE FROM mif_orders WHERE id=$1 RETURNING id", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  res.status(204).end();
});

app.get("/api/orders/export", async (req, res) => {
  const input = z.object({ actorLoginId: z.string().min(1), actorPassword: z.string().min(1), status: z.enum(orderStatuses).optional(), from: z.string().date().optional(), to: z.string().date().optional() }).parse(req.query);
  await requireAdmin(input.actorLoginId, input.actorPassword);
  const result = await pool.query("SELECT order_number,status,total_amount,delivery_method,courier_company,tracking_number,created_at FROM mif_orders WHERE ($1::text IS NULL OR status=$1) AND ($2::date IS NULL OR created_at::date >= $2) AND ($3::date IS NULL OR created_at::date <= $3) ORDER BY created_at DESC", [input.status ?? null, input.from ?? null, input.to ?? null]);
  const header = "주문번호,상태,금액,배송방법,택배사,송장번호,주문일";
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = result.rows.map((row) => [row.order_number, row.status, row.total_amount, row.delivery_method, row.courier_company, row.tracking_number, row.created_at].map(escape).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="mif-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${header}\n${rows.join("\n")}`);
});

app.post("/api/admin/vendor-inquiries/:id/review", async (req, res) => {
  const input = z.object({ actorLoginId: z.string().min(1), actorPassword: z.string().min(1), decision: z.enum(["approved", "rejected"]), reviewNote: z.string().max(1000).optional() }).parse(req.body);
  await requireAdmin(input.actorLoginId, input.actorPassword);
  const result = await pool.query("UPDATE mif_vendor_inquiries SET status=$2,review_note=$3 WHERE id=$1 AND status='pending' RETURNING id,status,review_note AS \"reviewNote\"", [req.params.id, input.decision, input.reviewNote ?? null]);
  if (!result.rowCount) return res.status(409).json({ message: "대기 중인 입점 문의를 찾을 수 없습니다." });
  res.json(result.rows[0]);
});

app.post("/api/admin/password-reset-requests/:id/review", async (req, res) => {
  const input = z.object({ actorLoginId: z.string().min(1), actorPassword: z.string().min(1), status: z.enum(["completed", "rejected"]) }).parse(req.body);
  await requireAdmin(input.actorLoginId, input.actorPassword);
  const result = await pool.query("UPDATE mif_password_reset_requests SET status=$2,updated_at=NOW() WHERE id=$1 AND status='pending' RETURNING id,status", [req.params.id, input.status]);
  if (!result.rowCount) return res.status(409).json({ message: "대기 중인 재설정 요청을 찾을 수 없습니다." });
  res.json(result.rows[0]);
});

app.patch("/api/notices/:id", async (req, res) => {
  const input = z.object({ title: z.string().min(1).max(255), content: z.string().min(1).max(10000), isVisible: z.boolean(), startDate: z.string().date().optional(), endDate: z.string().date().optional() }).parse(req.body);
  const result = await pool.query("UPDATE mif_notices SET title=$2,content=$3,is_visible=$4,start_date=$5,end_date=$6,updated_at=NOW() WHERE id=$1 RETURNING id,title,content,is_visible AS \"isVisible\",start_date AS \"startDate\",end_date AS \"endDate\",updated_at AS \"updatedAt\"", [req.params.id, input.title, input.content, input.isVisible, input.startDate ?? null, input.endDate ?? null]);
  if (!result.rowCount) return res.status(404).json({ message: "공지를 찾을 수 없습니다." });
  res.json(result.rows[0]);
});
app.delete("/api/notices/:id", async (req, res) => { await pool.query("DELETE FROM mif_notices WHERE id=$1", [req.params.id]); res.status(204).end(); });

app.get("/api/notifications", async (req, res) => {
  const userId = z.string().uuid().parse(req.query.userId);
  const result = await pool.query("SELECT id,title,body,notification_type AS \"type\",recipient_role AS \"recipientRole\",payload AS data,is_read AS \"isRead\",created_at AS \"createdAt\" FROM mif_in_app_notifications WHERE user_id=$1 ORDER BY created_at DESC", [userId]);
  res.json(result.rows);
});
app.patch("/api/notifications/:id/read", async (req, res) => { const result = await pool.query("UPDATE mif_in_app_notifications SET is_read=TRUE WHERE id=$1 RETURNING id", [req.params.id]); if (!result.rowCount) return res.status(404).json({ message: "알림을 찾을 수 없습니다." }); res.json({ success: true }); });
app.post("/api/notifications/test", async (req, res) => {
  const input = z.object({ recipientRole: z.enum(["admin", "customer", "all"]).default("customer"), title: z.string().min(1).max(255).default("MIF 테스트 알림"), body: z.string().min(1).max(1000).default("실시간 인앱 알림과 모바일 푸시 발송을 검증하는 메시지입니다.") }).parse(req.body);
  const result = await createAndDispatchNotification({ title: input.title, body: input.body, type: "system", recipientRole: input.recipientRole, payload: { event: "notification-test" } });
  res.status(201).json({ success: true, ...result });
});

app.post("/api/uploads/product-image", upload.single("file"), async (req, res) => {
  const actor = z.object({ actorLoginId: z.string().min(1), actorPassword: z.string().min(1) }).parse(req.body);
  await requireAdmin(actor.actorLoginId, actor.actorPassword);
  if (!req.file || !req.file.mimetype.startsWith("image/")) return res.status(400).json({ message: "이미지 파일을 첨부해 주세요." });
  res.status(201).json(await putPrivateDocument(req.file, "product-images"));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : "MIF API 처리 중 오류가 발생했습니다.";
  res.status(400).json({ message });
});

app.listen(port, () => console.log(`MIF API server running on ${port}`));
