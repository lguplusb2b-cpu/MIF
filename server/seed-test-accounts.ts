import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "./password";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * 요청된 검증용 계정(mif/@mif, admin/admin1234)을 서버 DB에 준비한다.
 * 실제 거래처·주문 데이터는 만들지 않고 로그인 계정만 생성한다.
 */
async function seed() {
  const companyId = randomUUID();
  await pool.query(
    "INSERT INTO mif_companies (id,name,status) VALUES ($1,$2,'active') ON CONFLICT DO NOTHING",
    [companyId, "MIF 테스트 거래처"],
  );
  const company = await pool.query("SELECT id FROM mif_companies WHERE name=$1 LIMIT 1", [
    "MIF 테스트 거래처",
  ]);
  const resolvedCompanyId = company.rows[0]?.id ?? companyId;

  const accounts = [
    { loginId: "mif", password: "@mif", name: "MIF 거래처", role: "customer", companyId: resolvedCompanyId },
    { loginId: "admin", password: "admin1234", name: "MIF 관리자", role: "admin", companyId: null },
  ] as const;

  // 다중 거래처 격리 검증용 두 번째 거래처 (환경변수로 활성화)
  if (process.env.MIF_SEED_SECOND_TENANT === "1") {
    const secondId = randomUUID();
    const existing = await pool.query("SELECT id FROM mif_companies WHERE name=$1 LIMIT 1", [
      "MIF 두번째 거래처",
    ]);
    if (!existing.rowCount) {
      await pool.query("INSERT INTO mif_companies (id,name,status) VALUES ($1,$2,'active')", [
        secondId,
        "MIF 두번째 거래처",
      ]);
    }
    const second = await pool.query("SELECT id FROM mif_companies WHERE name=$1 LIMIT 1", [
      "MIF 두번째 거래처",
    ]);
    await pool.query(
      `INSERT INTO mif_users (id,login_id,password_hash,name,role,status,company_id)
       VALUES ($1,$2,$3,$4,'customer','active',$5)
       ON CONFLICT (login_id) DO UPDATE SET password_hash=EXCLUDED.password_hash, company_id=EXCLUDED.company_id, status='active'`,
      [randomUUID(), "mif2", await hashPassword("mif2pass"), "MIF 두번째 거래처", second.rows[0]?.id ?? secondId],
    );
  }

  for (const account of accounts) {
    const passwordHash = await hashPassword(account.password);
    await pool.query(
      `INSERT INTO mif_users (id,login_id,password_hash,name,role,status,company_id)
       VALUES ($1,$2,$3,$4,$5,'active',$6)
       ON CONFLICT (login_id) DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, status='active', company_id=EXCLUDED.company_id`,
      [randomUUID(), account.loginId, passwordHash, account.name, account.role, account.companyId],
    );
  }

  const result = await pool.query("SELECT login_id, role, status FROM mif_users ORDER BY login_id");
  console.table(result.rows);
  await pool.end();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
