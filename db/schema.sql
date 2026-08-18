-- MIF 전용 B2B 주문 앱 스키마
-- 이 파일은 거래처·상품·주문·문서 데이터 없이 테이블만 생성한다.

CREATE TABLE IF NOT EXISTS mif_companies (
  id UUID PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  business_number VARCHAR(32),
  contact_name VARCHAR(64),
  phone VARCHAR(32),
  email VARCHAR(128),
  address TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_users (
  id UUID PRIMARY KEY,
  login_id VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(128),
  company_id UUID REFERENCES mif_companies(id) ON DELETE SET NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'customer')),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_categories (
  id UUID PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_products (
  id UUID PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  category_id UUID REFERENCES mif_categories(id) ON DELETE SET NULL,
  category_name VARCHAR(64),
  spec VARCHAR(128),
  unit VARCHAR(32),
  base_price INTEGER NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  min_order_qty INTEGER NOT NULL DEFAULT 1 CHECK (min_order_qty > 0),
  stock_status VARCHAR(32) NOT NULL DEFAULT 'in_stock',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  image_key TEXT,
  description TEXT,
  detail_image_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  marketing_badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  storage_type VARCHAR(16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_featured_products (
  id UUID PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES mif_categories(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES mif_products(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category_id, product_id)
);

CREATE TABLE IF NOT EXISTS mif_addresses (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES mif_companies(id) ON DELETE CASCADE,
  label VARCHAR(64) NOT NULL,
  recipient VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  postal_code VARCHAR(5),
  address TEXT NOT NULL,
  address_detail TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_orders (
  id UUID PRIMARY KEY,
  order_number VARCHAR(64) NOT NULL UNIQUE,
  company_id UUID NOT NULL REFERENCES mif_companies(id),
  user_id UUID REFERENCES mif_users(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  address_id UUID REFERENCES mif_addresses(id) ON DELETE SET NULL,
  address_snapshot JSONB,
  note TEXT,
  delivery_method VARCHAR(32),
  desired_delivery_at TIMESTAMPTZ,
  courier_company VARCHAR(64),
  tracking_number VARCHAR(128),
  truck_driver_phone VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES mif_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES mif_products(id) ON DELETE SET NULL,
  product_name VARCHAR(128) NOT NULL,
  spec VARCHAR(128),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  delivery_method VARCHAR(32)
);

CREATE TABLE IF NOT EXISTS mif_signup_applications (
  id UUID PRIMARY KEY,
  company_name VARCHAR(128) NOT NULL,
  business_number VARCHAR(32) NOT NULL,
  contact_name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(128),
  requested_login_id VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  business_document_key TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  review_note TEXT,
  reviewed_by UUID REFERENCES mif_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_vendor_inquiries (
  id UUID PRIMARY KEY,
  company_name VARCHAR(128) NOT NULL,
  business_number VARCHAR(32),
  contact_name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(128),
  product_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_area VARCHAR(255),
  message TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_password_reset_requests (
  id UUID PRIMARY KEY,
  login_id VARCHAR(64) NOT NULL,
  company_name VARCHAR(128) NOT NULL,
  contact_phone VARCHAR(32) NOT NULL,
  message TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_notices (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_qa_posts (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES mif_companies(id) ON DELETE CASCADE,
  author_id UUID REFERENCES mif_users(id) ON DELETE SET NULL,
  author_name VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  is_answered BOOLEAN NOT NULL DEFAULT FALSE,
  image_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_qa_comments (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES mif_qa_posts(id) ON DELETE CASCADE,
  author_id UUID REFERENCES mif_users(id) ON DELETE SET NULL,
  author_name VARCHAR(128) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  content TEXT NOT NULL,
  file_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_favorite_shares (
  token VARCHAR(64) PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES mif_companies(id) ON DELETE CASCADE,
  product_ids JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mif_push_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES mif_users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL,
  platform VARCHAR(16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS mif_orders_company_created_idx ON mif_orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mif_orders_status_idx ON mif_orders(status);
CREATE INDEX IF NOT EXISTS mif_products_status_idx ON mif_products(status);
CREATE INDEX IF NOT EXISTS mif_qa_posts_company_created_idx ON mif_qa_posts(company_id, created_at DESC);
