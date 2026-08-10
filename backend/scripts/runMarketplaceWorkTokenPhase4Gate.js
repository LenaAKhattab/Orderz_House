/**
 * Phase 4 Work Token Wallet isolated DB gate orchestrator.
 *
 * Starts embedded Postgres, applies init + marketplace migrations 134–139,
 * then runs marketplaceWorkTokenPhase4Gate.test.js.
 *
 * NEVER points at Production. Does not git add/commit/deploy.
 *
 * Usage (from backend/):
 *   node scripts/runMarketplaceWorkTokenPhase4Gate.js
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client } = require("pg");
const {
  splitSqlStatements,
  stripSqlLineComments,
} = require("./lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_work_token_phase4_pg");
const PORT = 55433;
const DB_NAME = "orderz_house_test";
const USER = "postgres";
const PASSWORD = "password";

function buildUrl(database = DB_NAME) {
  return `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${database}`;
}

async function startEmbeddedPostgres() {
  let EmbeddedPostgres;
  try {
    ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
  } catch (err) {
    throw new Error(
      "embedded-postgres is required for the Phase 4 gate. Install with: npm install --no-save embedded-postgres@18.4.0-beta.17",
    );
  }
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB_NAME);
  return pg;
}

async function execSqlFile(client, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const cleaned = stripSqlLineComments(raw);
  const statements = splitSqlStatements(cleaned);
  for (const stmt of statements) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
}

async function applyInitAndMigrations(databaseUrl) {
  const classification = classifyDatabaseUrl(databaseUrl);
  if (classification.isProduction) {
    throw new Error(`Refusing gate migrate on PRODUCTION: ${classification.maskedTarget}`);
  }
  if (!classification.looksLocal && classification.classification !== "ISOLATED_TEST") {
    throw new Error(
      `Refusing gate migrate on non-local DB: ${classification.maskedTarget} (${classification.classification})`,
    );
  }

  const client = new Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();
  try {
    await execSqlFile(client, path.join(BACKEND_ROOT, "sql", "init.sql"));

    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(64) NOT NULL UNIQUE,
        display_name VARCHAR(120) NOT NULL,
        description TEXT NULL,
        is_system BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS user_roles (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, role_id)
      );
      INSERT INTO roles (name, display_name, description, is_system)
      VALUES
        ('super_admin', 'سوبر أدمن', 'صلاحيات كاملة على النظام.', TRUE),
        ('admin', 'أدمن', 'صلاحيات تشغيلية حسب الصلاحيات الممنوحة.', TRUE),
        ('client', 'عميل', 'مستخدم عميل بقدرات محدودة.', TRUE),
        ('freelancer', 'مستقل', 'مستخدم مستقل بقدرات محدودة.', TRUE)
      ON CONFLICT (name) DO NOTHING;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(120) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const marketplaceMigrations = [
      "134_marketplace_membership_plans.sql",
      "135_marketplace_economy_settings.sql",
      "136_marketplace_membership_priority_bid.sql",
      "137_marketplace_memberships_cycles.sql",
      "138_marketplace_membership_phase3_1_hardening.sql",
      "139_marketplace_work_token_wallet_ledger.sql",
    ];

    const migrationsDir = path.join(BACKEND_ROOT, "sql", "migrations");
    let applied = 0;
    for (const file of marketplaceMigrations) {
      const version = file.replace(/\.sql$/i, "");
      // eslint-disable-next-line no-await-in-loop
      const exists = await client.query(
        `SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1`,
        [version],
      );
      if (exists.rows[0]) continue;

      const raw = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      const cleaned = stripSqlLineComments(raw);
      const statements = splitSqlStatements(cleaned);
      // eslint-disable-next-line no-console
      console.log(`[gate-migrate] ${file} (${statements.length} stmt)`);
      try {
        for (const stmt of statements) {
          // eslint-disable-next-line no-await-in-loop
          await client.query(stmt);
        }
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
          [version],
        );
        applied += 1;
      } catch (err) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw new Error(`[gate-migrate] FAIL ${file}: ${err.message || err}`);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[gate-migrate] newly applied marketplace migrations=${applied}`);

    for (const must of [
      "134_marketplace_membership_plans",
      "135_marketplace_economy_settings",
      "136_marketplace_membership_priority_bid",
      "137_marketplace_memberships_cycles",
      "138_marketplace_membership_phase3_1_hardening",
      "139_marketplace_work_token_wallet_ledger",
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await client.query(`SELECT 1 FROM schema_migrations WHERE version = $1`, [must]);
      if (!r.rows[0]) throw new Error(`Required migration missing after gate bootstrap: ${must}`);
    }

    for (const table of [
      "freelancer_work_token_wallets",
      "work_token_reservations",
      "work_token_ledger_entries",
      "marketplace_economy_settings",
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const t = await client.query(`SELECT to_regclass($1) AS r`, [`public.${table}`]);
      if (!t.rows[0].r) throw new Error(`Missing table after bootstrap: ${table}`);
    }
  } finally {
    await client.end();
  }
}

function runGateTests(databaseUrl) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      APP_ENV: "test",
      NODE_ENV: "development",
      JWT_SECRET: process.env.JWT_SECRET || "marketplace-work-token-phase4-gate-secret",
      CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
      MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED: "0",
      ORDERZ_GATE_ISOLATED_DB: "1",
    };
    delete env.STRIPE_SECRET_KEY;
    delete env.STRIPE_WEBHOOK_SECRET;

    const child = spawn(
      process.execPath,
      ["--test", "test/marketplaceWorkTokenPhase4Gate.test.js"],
      {
        cwd: BACKEND_ROOT,
        env,
        stdio: "inherit",
      },
    );
    child.on("exit", (code) => resolve(code == null ? 1 : code));
  });
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("=== Marketplace Work Token Phase 4 GATE ===");
  const prodCheck = classifyDatabaseUrl(process.env.DATABASE_URL);
  // eslint-disable-next-line no-console
  console.log(
    `[safety] parent shell DATABASE_URL classification=${prodCheck.classification} (gate will NOT use it)`,
  );

  let pg;
  try {
    pg = await startEmbeddedPostgres();
    const url = buildUrl();
    const cls = classifyDatabaseUrl(url);
    // eslint-disable-next-line no-console
    console.log(`[gate-db] ${cls.maskedTarget} classification=${cls.classification}`);
    await applyInitAndMigrations(url);
    const code = await runGateTests(url);
    process.exitCode = code;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    if (pg) {
      try {
        await pg.stop();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[gate-db] stop failed:", e?.message || e);
      }
    }
  }
}

main();
