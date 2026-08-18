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
  const result = await pool.query("SELECT id, name, category_name AS \"categoryName\", spec, unit, base_price AS \"basePrice\", min_order_qty AS \"minOrderQty\", stock_status AS \"stockStatus\", created_at AS \"createdAt\" FROM mif_products WHERE status = 'active' ORDER BY created_at DESC");
  res.json(result.rows);
});

app.post("/api/products", async (req, res) => {
  const input = z.object({ name: z.string().min(1).max(128), categoryName: z.string().max(64).optional(), spec: z.string().max(128).optional(), unit: z.string().max(32).optional(), basePrice: z.number().int().nonnegative(), minOrderQty: z.number().int().positive().default(1) }).parse(req.body);
  const id = randomUUID();
  const result = await pool.query("INSERT INTO mif_products (id, name, category_name, spec, unit, base_price, min_order_qty) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, category_name AS \"categoryName\", spec, unit, base_price AS \"basePrice\", min_order_qty AS \"minOrderQty\", stock_status AS \"stockStatus\", created_at AS \"createdAt\"", [id, input.name, input.categoryName ?? null, input.spec ?? null, input.unit ?? null, input.basePrice, input.minOrderQty]);
  res.status(201).json(result.rows[0]);
});

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
    res.status(201).json({ id: orderId, orderNumber, status: "RECEIVED", totalAmount });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

app.patch("/api/orders/:id/status", async (req, res) => {
  const input = z.object({ status: z.enum(orderStatuses), courierCompany: z.string().max(64).optional(), trackingNumber: z.string().max(128).optional(), truckDriverPhone: z.string().max(32).optional() }).parse(req.body);
  const current = await pool.query("SELECT status FROM mif_orders WHERE id = $1", [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  const existing = current.rows[0].status as (typeof orderStatuses)[number];
  if (input.status !== "CANCELED" && allowedTransitions[existing] !== input.status) return res.status(409).json({ message: "허용되지 않은 주문 상태 전환입니다." });
  const result = await pool.query("UPDATE mif_orders SET status=$2, courier_company=COALESCE($3,courier_company), tracking_number=COALESCE($4,tracking_number), truck_driver_phone=COALESCE($5,truck_driver_phone), updated_at=NOW() WHERE id=$1 RETURNING id, order_number AS \"orderNumber\", status", [req.params.id, input.status, input.courierCompany ?? null, input.trackingNumber ?? null, input.truckDriverPhone ?? null]);
  res.json(result.rows[0]);
});

app.post("/api/onboarding/signup", upload.single("businessDocument"), async (req, res) => {
  const input = z.object({ companyName: z.string().min(1).max(128), businessNumber: z.string().min(10).max(32), contactName: z.string().min(1).max(64), phone: z.string().min(9).max(32), requestedLoginId: z.string().min(4).max(64), password: z.string().min(4).max(255), email: z.string().email().optional() }).parse(req.body);
  if (!req.file) return res.status(400).json({ message: "사업자등록증 파일을 첨부해 주세요." });
  const document = await putPrivateDocument(req.file, "business-registration");
  const id = randomUUID();
  await pool.query("INSERT INTO mif_signup_applications (id, company_name, business_number, contact_name, phone, email, requested_login_id, password_hash, business_document_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id, input.companyName, input.businessNumber, input.contactName, input.phone, input.email ?? null, input.requestedLoginId, await hashPassword(input.password), document.key]);
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
  res.status(201).json(result.rows[0]);
});

app.post("/api/qa-posts/:id/comments", async (req, res) => {
  const input = z.object({ authorId: z.string().uuid().optional(), authorName: z.string().min(1).max(128), isAdmin: z.boolean().default(false), content: z.string().min(1).max(10000), fileKeys: z.array(z.string()).max(5).default([]) }).parse(req.body);
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const comment = await client.query("INSERT INTO mif_qa_comments (id,post_id,author_id,author_name,is_admin,content,file_keys) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,post_id AS \"postId\",author_name AS \"authorName\",is_admin AS \"isAdmin\",content,file_keys AS \"fileKeys\",created_at AS \"createdAt\"", [id, req.params.id, input.authorId ?? null, input.authorName, input.isAdmin, input.content, JSON.stringify(input.fileKeys)]);
    if (input.isAdmin) await client.query("UPDATE mif_qa_posts SET is_answered=TRUE, updated_at=NOW() WHERE id=$1", [req.params.id]);
    await client.query("COMMIT");
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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : "MIF API 처리 중 오류가 발생했습니다.";
  res.status(400).json({ message });
});

app.listen(port, () => console.log(`MIF API server running on ${port}`));
