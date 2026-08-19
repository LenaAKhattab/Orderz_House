/**
 * Phase 1C — live local OrderzHouse ↔ Bildazo S2S author link/create QA.
 *
 * NEVER uses workstation DATABASE_URL when it is production Neon.
 * NEVER git add/commit/deploy. Does not call production Bildazo.
 * Isolated embedded Postgres only (two databases on one local cluster).
 *
 * Usage (from OrderzHouse backend/):
 *   node scripts/runBildazoAuthorLinkPhase1cLiveS2sQa.js
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const { Client } = require("pg");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const {
  classifyDatabaseUrl,
  scanSqlForDangerousStatements,
} = require("../src/utils/databaseEnvironmentSafety");
const {
  ensureMigrationsTable,
  listAppliedMigrationVersions,
  listMigrationFilenames,
  applyOneMigration,
  DEFAULT_MIGRATIONS_DIR,
  versionFromMigrationFilename,
} = require("./lib/migrationRunnerCore");
const { splitSqlStatements, stripSqlLineComments } = require("./lib/splitSqlStatements");
const { ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION } = require("../src/constants/bildazoAuthorLink");

const BACKEND_ROOT = path.join(__dirname, "..");
const FRONTEND_ROOT = path.join(BACKEND_ROOT, "..", "frontend");
const BILDAZO_ROOT = path.join(BACKEND_ROOT, "..", "..", "Bildazo", "backend");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", `bildazo_author_link_1c_pg_${process.pid}`);
const SCREEN_DIR = path.join(BACKEND_ROOT, ".tmp", "bildazo_1c_screens");
const REPORT_PATH = path.join(BACKEND_ROOT, ".tmp", "bildazo_author_link_1c_report.json");
const PG_PORT = 55471;
const OH_DB = "orderz_house_bildazo_1c";
const BZ_DB = "bildazo_1c";
const PG_USER = "postgres";
const PG_PASSWORD = "password";
const OH_PORT = 5010;
const BZ_PORT = 4001;
const WEB_PORT = 5174;
const GATE_ON_PORT = 5011;
const QA_PASSWORD = "QaBildazo1c!";
const JWT_SECRET = "phase1c-bildazo-live-s2s-qa-secret";
const S2S_SECRET = "local-orderzhouse-bildazo-test-secret";
const M163 = "163_freelancer_onboarding";
const M164 = "164_freelancer_bildazo_author_links";

const ACTORS = {
  newAccount: {
    accountId: "FL1C000001",
    email: "freelancer-new@bildazo-1c.test",
    role: "freelancer",
    first: "أحمد",
    father: "علي",
    family: "حسن",
  },
  sameEmail: {
    accountId: "FL1C000002",
    email: "freelancer-same@bildazo-1c.test",
    role: "freelancer",
    first: "سارة",
    father: "محمد",
    family: "خالد",
  },
  diffEmail: {
    accountId: "FL1C000003",
    email: "freelancer-diff@bildazo-1c.test",
    role: "freelancer",
    first: "ليلى",
    father: "يوسف",
    family: "عمر",
  },
  publicId: {
    accountId: "FL1C000004",
    email: "freelancer-url@bildazo-1c.test",
    role: "freelancer",
    first: "نور",
    father: "سامي",
    family: "زيد",
  },
  unlinked: {
    accountId: "FL1C000005",
    email: "freelancer-unlinked@bildazo-1c.test",
    role: "freelancer",
    first: "كريم",
    father: "فادي",
    family: "نبيل",
  },
  down: {
    accountId: "FL1C000006",
    email: "freelancer-down@bildazo-1c.test",
    role: "freelancer",
    first: "هاني",
    father: "ماجد",
    family: "سليم",
  },
  admin: {
    accountId: "SA1C000001",
    email: "superadmin@bildazo-1c.test",
    role: "super_admin",
    first: "Admin",
    father: "Orderz",
    family: "House",
  },
};

function buildUrl(database) {
  return `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${database}`;
}

function classifyEnvFile(envPath, label) {
  if (!fs.existsSync(envPath)) {
    return {
      label,
      missing: true,
      classification: "MISSING",
      isProduction: false,
      maskedTarget: `(no ${label})`,
      looksRemote: false,
    };
  }
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  const db = classifyDatabaseUrl(parsed.DATABASE_URL);
  const host = String(db.host || "").toLowerCase();
  const looksRemote =
    Boolean(host) &&
    host !== "127.0.0.1" &&
    host !== "localhost" &&
    host !== "::1";
  const looksNeon = host.includes("neon.tech") || host.includes("neon.database");
  return {
    label,
    missing: false,
    ...db,
    looksRemote,
    looksNeon,
    appEnv: String(parsed.APP_ENV || parsed.NODE_ENV || "").trim() || "(unset)",
    stripeLive: /^sk_live_/i.test(String(parsed.STRIPE_SECRET_KEY || "")),
    bildazoUrl: String(parsed.BILDAZO_API_BASE_URL || parsed.FRONTEND_URL || "").trim() || "(unset)",
  };
}

function reviewMigrationFile(fileName) {
  const filePath = path.join(DEFAULT_MIGRATIONS_DIR, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const stripped = raw.split("\n").filter((line) => !/^\s*--/.test(line)).join("\n");
  return {
    fileName,
    scanNoComments: scanSqlForDangerousStatements(stripped),
    hasDropTable: /\bDROP TABLE\b/i.test(stripped),
    hasDeleteFrom: /\bDELETE FROM\b/i.test(stripped),
    hasTruncateTable: /\bTRUNCATE TABLE\b/i.test(stripped),
  };
}

async function startEmbeddedPostgres() {
  let EmbeddedPostgres;
  try {
    ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
  } catch {
    throw new Error(
      "embedded-postgres required. From backend/: npm install --no-save embedded-postgres@18.4.0-beta.17",
    );
  }
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* prior crash lock */
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: PG_USER,
    password: PG_PASSWORD,
    port: PG_PORT,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(OH_DB);
  await pg.createDatabase(BZ_DB);
  return pg;
}

async function execSqlFile(client, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const statements = splitSqlStatements(stripSqlLineComments(raw));
  for (const stmt of statements) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
}

async function snapshotMigrations(client) {
  const files = listMigrationFilenames();
  const applied = await listAppliedMigrationVersions(client);
  const appliedSet = new Set(applied.map(String));
  const pending = files.map((file) => versionFromMigrationFilename(file)).filter((v) => !appliedSet.has(v));
  const table = await client.query(`SELECT to_regclass('public.freelancer_bildazo_author_links') AS rel`);
  return {
    appliedCount: applied.length,
    pendingCount: pending.length,
    pending,
    registered163: appliedSet.has(M163),
    registered164: appliedSet.has(M164),
    tableExists: Boolean(table.rows[0]?.rel),
  };
}

async function repairEmptyDbSeedConflict(client, version) {
  if (version !== "057_pin_orderzhouse_plans_ids_1_2_3") return false;
  await client.query(`
    UPDATE plans
    SET name = name || '_archived_' || id::text, updated_at = NOW()
    WHERE name IN ('orderzhouse_free', 'orderzhouse_50_jod', 'orderzhouse_platinum')
  `);
  return true;
}

async function applyAllMigrations(client) {
  const files = listMigrationFilenames();
  const quietLog = () => {};
  const emptyDbRepairs = [];
  for (const file of files) {
    const version = versionFromMigrationFilename(file);
    const raw = fs.readFileSync(path.join(DEFAULT_MIGRATIONS_DIR, file), "utf8");
    try {
      // eslint-disable-next-line no-await-in-loop
      await applyOneMigration(client, { file, version, raw }, { log: quietLog });
    } catch (err) {
      const repaired = err && err.code === "23505" && (await repairEmptyDbSeedConflict(client, version));
      if (!repaired) throw err;
      emptyDbRepairs.push(version);
      process.stdout.write(`[repair] ${file}\n`);
      // eslint-disable-next-line no-await-in-loop
      await applyOneMigration(client, { file, version, raw }, { log: quietLog });
    }
    process.stdout.write(`[ok] ${file}\n`);
  }
  return { fileCount: files.length, emptyDbRepairs };
}

async function seedActors(client) {
  const passwordHash = await bcrypt.hash(QA_PASSWORD, 10);
  const ids = {};
  for (const actor of Object.values(ACTORS)) {
    const inserted = await client.query(
      `INSERT INTO users (
         account_id, first_name, father_name, family_name, email, password_hash, role,
         country, phone, whatsapp, gender, terms_accepted, is_active, email_verified
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'JO','+962790000001','+962790000001','ذكر', TRUE, TRUE, TRUE)
       RETURNING id, email, role`,
      [actor.accountId, actor.first, actor.father, actor.family, actor.email, passwordHash, actor.role],
    );
    ids[actor.email] = inserted.rows[0];
    await client
      .query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1::bigint, r.id FROM roles r WHERE r.name = $2::text
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [inserted.rows[0].id, actor.role],
      )
      .catch(() => {});
  }
  return ids;
}

async function enableArticleEngineOnCloneOnly(client) {
  const updated = await client.query(
    `UPDATE marketplace_economy_settings
        SET article_applications_enabled = TRUE, updated_at = NOW()
      WHERE id = 1
      RETURNING id, article_applications_enabled`,
  );
  if (!updated.rowCount) {
    throw new Error("Clone marketplace_economy_settings row id=1 missing; cannot reach HTTP apply gate");
  }
  return updated.rows[0];
}

async function countBidLedger(client) {
  try {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM marketplace_bid_credit_ledger_entries`);
    return rows[0]?.n ?? 0;
  } catch (err) {
    if (err && err.code === "42P01") return null;
    throw err;
  }
}

function waitForPortFree(port, { timeoutMs = 20_000 } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          return reject(new Error(`Port ${port} still in use after ${timeoutMs}ms`));
        }
        setTimeout(tick, 250);
      });
      socket.on("error", () => resolve());
    };
    tick();
  });
}

function waitForHttp(url, { timeoutMs = 180_000, json = false } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode < 500) {
            if (!json) return resolve({ status: res.statusCode, body });
            try {
              return resolve({ status: res.statusCode, json: JSON.parse(body) });
            } catch (err) {
              if (Date.now() - started > timeoutMs) return reject(err);
              return setTimeout(tick, 500);
            }
          }
          if (Date.now() - started > timeoutMs) {
            return reject(new Error(`Timeout ${url} status ${res.statusCode}`));
          }
          setTimeout(tick, 500);
        });
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) return reject(new Error(`Timeout ${url}`));
        setTimeout(tick, 500);
      });
    };
    tick();
  });
}

function spawnQuiet(command, args, options, logName) {
  const logPath = path.join(BACKEND_ROOT, ".tmp", `${logName}.log`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const out = fs.openSync(logPath, "w");
  const child = spawn(command, args, {
    stdio: ["ignore", out, out],
    windowsHide: true,
    ...options,
  });
  child.__logPath = logPath;
  return child;
}

function killTree(child) {
  if (!child?.pid) return;
  try {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

function ohChildEnv(databaseUrl, extra = {}) {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    JWT_SECRET,
    JWT_EXPIRES_IN: "7d",
    NODE_ENV: "development",
    APP_ENV: "local",
    CLIENT_URL: `http://localhost:${WEB_PORT}`,
    PORT: String(OH_PORT),
    HOST: "0.0.0.0",
    COOKIE_SECURE: "false",
    BILDAZO_AUTHOR_GATE_ENABLED: "false",
    BILDAZO_AUTHOR_SYNC_ENABLED: "true",
    BILDAZO_API_BASE_URL: `http://127.0.0.1:${BZ_PORT}`,
    BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET: S2S_SECRET,
    BILDAZO_AUTHOR_SYNC_TIMEOUT_MS: "8000",
    FAKE_ORDERS_AUTOMATION_ENABLED: "false",
    INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED: "false",
    API_RATE_LIMIT_MAX: "0",
    ...extra,
  };
}

function bzChildEnv(databaseUrl, extra = {}) {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    NODE_ENV: "development",
    PORT: String(BZ_PORT),
    JWT_SECRET,
    JWT_EXPIRES_IN: "7d",
    FRONTEND_URL: "http://127.0.0.1:3000",
    ORDERZHOUSE_INTEGRATION_ENABLED: "true",
    ORDERZHOUSE_INTEGRATION_SECRET: S2S_SECRET,
    ORDERZHOUSE_WEBHOOK_IP_ALLOWLIST: "",
    ...extra,
  };
}

async function runLogged(command, args, options, logName, { timeoutMs = 180_000 } = {}) {
  const child = spawnQuiet(command, args, options, logName);
  const exit = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error(`${logName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  const log = fs.readFileSync(child.__logPath, "utf8");
  return { code: exit, log, logPath: child.__logPath };
}

function logContainsSecret(logText) {
  return String(logText || "").includes(S2S_SECRET);
}

async function readOhLinkRow(client, email) {
  const { rows } = await client.query(
    `SELECT l.* FROM freelancer_bildazo_author_links l
     JOIN users u ON u.id = l.freelancer_user_id
     WHERE lower(u.email) = lower($1) LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

async function readBzUserByEmail(client, email) {
  const { rows } = await client.query(
    `SELECT u.id, u.email, u.public_id, u."passwordHash" IS NOT NULL AS has_password_hash, r.key AS role_key
       FROM "User" u
       JOIN "Role" r ON r.id = u."roleId"
      WHERE lower(u.email) = lower($1)
      LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

async function countBzUsers(client) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "User"`);
  return rows[0]?.n ?? 0;
}

async function countBzLinks(client) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM orderzhouse_author_links`);
  return rows[0]?.n ?? 0;
}

async function countOhLinks(client) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM freelancer_bildazo_author_links`);
  return rows[0]?.n ?? 0;
}

async function loginCookie(apiBase, email) {
  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: QA_PASSWORD }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const match = String(setCookie).match(/orderz_access_token=([^;]+)/);
  return {
    status: res.status,
    json: await res.json().catch(() => ({})),
    cookie: match ? `orderz_access_token=${match[1]}` : "",
  };
}

async function authedJson(apiBase, cookie, method, pathname, body) {
  const res = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function newAccountPayload(overrides = {}) {
  return {
    linkFlow: "new_account",
    fullName: "أحمد علي حسن",
    phoneE164: "+962790000001",
    countryIso: "JO",
    acceptedTermsVersion: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
    acceptedTermsAcknowledged: true,
    ...overrides,
  };
}

function existingPayload(overrides = {}) {
  return {
    linkFlow: "existing_account",
    acceptedTermsVersion: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
    acceptedTermsAcknowledged: true,
    ...overrides,
  };
}

async function screenshot(page, name) {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREEN_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}

async function dismissChrome(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator("[data-popup-ad-close]").first().click({ timeout: 800 }).catch(() => {});
  await page.getByRole("button", { name: "ليس الآن" }).click({ timeout: 1500 }).catch(() => {});
}

async function attachBackendSessionCookie(page, email, apiPort) {
  const { request } = require("playwright");
  const api = await request.newContext({
    baseURL: `http://localhost:${apiPort}`,
    ignoreHTTPSErrors: true,
  });
  try {
    const res = await api.post("/api/auth/login", {
      data: { email, password: QA_PASSWORD },
    });
    if (res.status() !== 200) {
      throw new Error(`Direct API login ${res.status()} for ${email}: ${(await res.text()).slice(0, 300)}`);
    }
    const state = await api.storageState();
    const cookies = (state.cookies || [])
      .filter((cookie) => cookie.name === "orderz_access_token")
      .flatMap((cookie) => [
        {
          name: cookie.name,
          value: cookie.value,
          url: `http://localhost:${WEB_PORT}/`,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
        {
          name: cookie.name,
          value: cookie.value,
          url: `http://localhost:${apiPort}/`,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
    if (!cookies.length) throw new Error("API login returned no cookies");
    await page.context().addCookies(cookies);
  } finally {
    await api.dispose();
  }
}

async function login(page, email, apiPort) {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.locator('input[name="email"]').waitFor({ timeout: 20_000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(QA_PASSWORD);
  const loginWait = page.waitForResponse(
    (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST",
    { timeout: 25_000 },
  );
  await page.locator('button[type="submit"]').click();
  const loginRes = await loginWait;
  if (loginRes.status() !== 200) {
    await screenshot(page, `login-fail-${email.split("@")[0]}`);
    throw new Error(`Login API ${loginRes.status()} for ${email}`);
  }
  await page.waitForURL(/\/dashboard\//, { timeout: 25_000 });
  await attachBackendSessionCookie(page, email, apiPort);
  await page.evaluate(() => {
    localStorage.setItem("orderz_session_hint", "1");
  });
  await dismissChrome(page);
}

async function openArticles(page) {
  await dismissChrome(page);
  const articlesLink = page.locator('a[href="/dashboard/freelancer/articles"]');
  await articlesLink.first().waitFor({ timeout: 20_000 });
  await articlesLink.first().click();
  await page.waitForURL(/\/dashboard\/freelancer\/articles/, { timeout: 20_000 });
  await dismissChrome(page);
  try {
    await page.locator("text=حساب الكاتب").first().waitFor({ timeout: 25_000 });
  } catch (err) {
    await screenshot(page, "articles-missing");
    throw new Error(`Articles gate not visible at ${page.url()}: ${err.message}`);
  }
}

async function runBrowserQa({ ohClient, apiPort }) {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    throw new Error("playwright required: npm install --no-save playwright && npx playwright install chromium");
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "ar",
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = req.url();
    if (/notifications\/(stream|sse)/i.test(url)) return route.continue();
    const tokenCookie = (await page.context().cookies()).find((c) => c.name === "orderz_access_token");
    const headers = { ...req.headers() };
    delete headers.host;
    delete headers["content-length"];
    if (tokenCookie) headers.cookie = `orderz_access_token=${tokenCookie.value}`;
    const target = url
      .replace(`http://localhost:${WEB_PORT}`, `http://localhost:${apiPort}`)
      .replace(`http://127.0.0.1:${WEB_PORT}`, `http://127.0.0.1:${apiPort}`);
    const response = await route.fetch({ url: target, headers, timeout: 30_000 });
    await route.fulfill({ response });
  });
  const results = {};
  try {
    await login(page, ACTORS.newAccount.email, apiPort);
    await openArticles(page);
    await screenshot(page, "freelancer-linked");
    results.linkedVisible = await page.getByTestId("bildazo-linked-profile").isVisible();
    results.linkedText = await page.getByTestId("bildazo-linked-profile").innerText();
    results.publicIdVisible = await page.getByTestId("bildazo-public-id").count();
    results.profileUrlCount = await page.getByTestId("bildazo-profile-url").count();
    results.passwordFields = await page.locator('input[type="password"]').count();
    results.falseCreatedCopy = /تم إنشاء الحساب/.test(results.linkedText || "");
    results.newAccountRow = await readOhLinkRow(ohClient, ACTORS.newAccount.email);

    await login(page, ACTORS.diffEmail.email, apiPort);
    await openArticles(page);
    results.diffCopy = await page.getByTestId("bildazo-pending-state").innerText().catch(() => "");
    results.diffRow = await readOhLinkRow(ohClient, ACTORS.diffEmail.email);

    await login(page, ACTORS.admin.email, apiPort);
    await dismissChrome(page);
    const adminLink = page.locator('a[href="/dashboard/super-admin/bildazo-author-links"]');
    await adminLink.first().waitFor({ timeout: 20_000 });
    await adminLink.first().click();
    await page.waitForURL(/bildazo-author-links/, { timeout: 20_000 });
    await page.getByTestId("bildazo-admin-filters").waitFor({ timeout: 30_000 });
    results.adminFilters = true;
    results.adminPasswordFields = await page.locator('input[type="password"]').count();
    results.adminSchemaBanner = await page.locator("text=جدول الربط غير جاهز").count();
    await screenshot(page, "super-admin-page");

    await login(page, ACTORS.unlinked.email, apiPort);
    await openArticles(page);
    results.unlinkedGateOffHint = await page.locator("text=التقديم على المقالات ما زال متاحًا").count();
    results.unlinkedPasswordFields = await page.locator('input[type="password"]').count();
  } catch (err) {
    await screenshot(page, "failure");
    throw err;
  } finally {
    await browser.close();
  }
  return results;
}

async function main() {
  if (!fs.existsSync(BILDAZO_ROOT)) {
    console.error(`BLOCKED: Bildazo backend not found at ${BILDAZO_ROOT}`);
    process.exit(2);
  }

  const ohEnv = classifyEnvFile(path.join(BACKEND_ROOT, ".env"), "OrderzHouse backend/.env");
  const bzEnv = classifyEnvFile(path.join(BILDAZO_ROOT, ".env"), "Bildazo backend/.env");
  console.log("\n=== Phase 1C environment classification ===");
  console.log(`OrderzHouse repo: ${path.join(BACKEND_ROOT, "..")}`);
  console.log(`Bildazo repo:     ${path.join(BILDAZO_ROOT, "..")}`);
  console.log(`OH workstation DB: ${ohEnv.maskedTarget} (${ohEnv.classification})`);
  console.log(`BZ workstation DB: ${bzEnv.maskedTarget} (${bzEnv.classification})`);
  if (ohEnv.isProduction || ohEnv.classification === "PRODUCTION") {
    console.log("OrderzHouse workstation target is PRODUCTION — will NOT migrate or write that database.");
  }
  if (bzEnv.isProduction || bzEnv.looksNeon || bzEnv.looksRemote) {
    console.log("Bildazo workstation DATABASE_URL is remote/hosted — will NOT migrate or write that database.");
  }

  const processDb = classifyDatabaseUrl(process.env.DATABASE_URL || "");
  if (processDb.isProduction) {
    console.error("BLOCKED: process DATABASE_URL is production. Refusing Phase 1C.");
    process.exit(2);
  }

  const review163 = reviewMigrationFile("163_freelancer_onboarding.sql");
  const review164 = reviewMigrationFile("164_freelancer_bildazo_author_links.sql");
  assert.equal(review164.hasDropTable, false);
  assert.equal(review164.hasDeleteFrom, false);
  assert.equal(review164.scanNoComments.dangerous, false);

  const ohUrl = buildUrl(OH_DB);
  const bzUrl = buildUrl(BZ_DB);
  assert.equal(classifyDatabaseUrl(ohUrl).isProduction, false);
  assert.equal(classifyDatabaseUrl(bzUrl).isProduction, false);
  assert.equal(classifyDatabaseUrl(ohUrl).classification, "LOCAL");
  assert.equal(classifyDatabaseUrl(bzUrl).classification, "LOCAL");

  let pg;
  let ohClient;
  let bzClient;
  let ohProc;
  let bzProc;
  let frontendProc;
  let gateProc;
  const report = {
    overall: "FAIL",
    workstation: { orderzhouse: ohEnv, bildazo: bzEnv },
    isolated: {
      oh: classifyDatabaseUrl(ohUrl).maskedTarget,
      bz: classifyDatabaseUrl(bzUrl).maskedTarget,
    },
    endpoints: {
      bildazo: `http://127.0.0.1:${BZ_PORT}`,
      orderzhouse: `http://127.0.0.1:${OH_PORT}`,
      frontend: `http://localhost:${WEB_PORT}`,
    },
    flags: {
      BILDAZO_AUTHOR_SYNC_ENABLED: true,
      BILDAZO_AUTHOR_GATE_ENABLED: false,
      ORDERZHOUSE_INTEGRATION_ENABLED: true,
    },
    productionWrites: false,
    productionBildazoCall: false,
    passwordsCollected: false,
  };

  try {
    await waitForPortFree(PG_PORT);
    await waitForPortFree(OH_PORT);
    await waitForPortFree(BZ_PORT);
    await waitForPortFree(WEB_PORT);

    pg = await startEmbeddedPostgres();
    ohClient = new Client({ connectionString: ohUrl });
    bzClient = new Client({ connectionString: bzUrl });
    await ohClient.connect();
    await bzClient.connect();

    await execSqlFile(ohClient, path.join(BACKEND_ROOT, "sql", "init.sql"));
    await ensureMigrationsTable(ohClient);
    const applied = await applyAllMigrations(ohClient);
    report.orderzhouseMigration = {
      ...applied,
      after: await snapshotMigrations(ohClient),
    };
    assert.equal(report.orderzhouseMigration.after.registered163, true);
    assert.equal(report.orderzhouseMigration.after.registered164, true);
    assert.equal(report.orderzhouseMigration.after.tableExists, true);

    const users = await seedActors(ohClient);
    report.seededUserIds = Object.fromEntries(Object.entries(users).map(([email, row]) => [email, row.id]));
    report.cloneArticleEngine = await enableArticleEngineOnCloneOnly(ohClient);

    const migrate = await runLogged(
      "npx",
      ["prisma", "migrate", "deploy"],
      {
        cwd: BILDAZO_ROOT,
        env: bzChildEnv(bzUrl),
        shell: true,
      },
      "bildazo_1c_prisma_migrate",
      { timeoutMs: 240_000 },
    );
    report.bildazoMigrate = { code: migrate.code, logTail: migrate.log.slice(-1200) };
    if (migrate.code !== 0) {
      const push = await runLogged(
        "npx",
        ["prisma", "db", "push", "--skip-generate"],
        {
          cwd: BILDAZO_ROOT,
          env: bzChildEnv(bzUrl),
          shell: true,
        },
        "bildazo_1c_prisma_push",
        { timeoutMs: 180_000 },
      );
      report.bildazoPushFallback = { code: push.code, logTail: push.log.slice(-800) };
      assert.equal(push.code, 0, `Bildazo prisma migrate/push failed: ${push.log.slice(-800)}`);
    }

    const seed = await runLogged(
      "node",
      ["scripts/seedOrderzhousePhase1cLocal.mjs"],
      {
        cwd: BILDAZO_ROOT,
        env: {
          ...bzChildEnv(bzUrl),
          SEED_WRITER_EMAIL: ACTORS.sameEmail.email,
          SEED_WRITER_NAME: "سارة محمد خالد",
        },
      },
      "bildazo_1c_seed",
      { timeoutMs: 60_000 },
    );
    assert.equal(seed.code, 0, `Bildazo seed failed: ${seed.log.slice(-800)}`);
    const seedJson = JSON.parse(seed.log.trim().split("\n").filter(Boolean).pop());
    report.bildazoSeed = seedJson;
    assert.equal(seedJson.writerRoleId, 2);

    const bzTables = await bzClient.query(`
      SELECT to_regclass('public."User"') AS users,
             to_regclass('public."Role"') AS roles,
             to_regclass('public.orderzhouse_author_links') AS links
    `);
    report.bildazoTables = bzTables.rows[0];
    assert.ok(bzTables.rows[0].users);
    assert.ok(bzTables.rows[0].roles);
    assert.ok(bzTables.rows[0].links);
    const writerRole = await bzClient.query(`SELECT id, key FROM "Role" WHERE key = 'writer' LIMIT 1`);
    assert.equal(writerRole.rows[0]?.key, "writer");

    fs.mkdirSync(path.join(BACKEND_ROOT, ".tmp"), { recursive: true });
    bzProc = spawnQuiet(
      "node",
      ["src/index.js"],
      { cwd: BILDAZO_ROOT, env: bzChildEnv(bzUrl) },
      "bildazo_1c_bildazo_backend",
    );
    const bzHealth = await waitForHttp(`http://127.0.0.1:${BZ_PORT}/api/health`, { json: true });
    report.bildazoHealth = bzHealth.json;
    assert.equal(bzHealth.json?.ok, true);

    const missingSecret = await fetch(`http://127.0.0.1:${BZ_PORT}/api/integrations/orderzhouse/authors/link-or-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderzFreelancerId: "probe", email: "probe@bildazo-1c.test", fullName: "Probe" }),
    });
    report.bildazoRejectsMissingSecret = {
      status: missingSecret.status,
      json: await missingSecret.json().catch(() => ({})),
    };
    assert.equal(missingSecret.status, 401);

    const validSecret = await fetch(`http://127.0.0.1:${BZ_PORT}/api/integrations/orderzhouse/authors/link-or-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OrderzHouse-Integration-Secret": S2S_SECRET,
      },
      body: JSON.stringify({
        orderzFreelancerId: "probe-valid",
        email: "probe-valid@bildazo-1c.test",
        fullName: "Probe Valid",
      }),
    });
    report.bildazoAcceptsValidSecret = {
      status: validSecret.status,
      json: await validSecret.json().catch(() => ({})),
    };
    assert.equal(validSecret.status, 200);
    assert.equal(report.bildazoAcceptsValidSecret.json?.password, undefined);
    assert.equal(report.bildazoAcceptsValidSecret.json?.passwordHash, undefined);

    ohProc = spawnQuiet("node", ["server.js"], { cwd: BACKEND_ROOT, env: ohChildEnv(ohUrl) }, "bildazo_1c_oh_backend");
    const ohHealth = await waitForHttp(`http://127.0.0.1:${OH_PORT}/api/health`, { json: true });
    report.orderzhouseHealth = ohHealth.json;
    assert.ok(ohHealth.status < 500);

    const apiBase = `http://127.0.0.1:${OH_PORT}`;
    const newLogin = await loginCookie(apiBase, ACTORS.newAccount.email);
    assert.equal(newLogin.status, 200, `OH login failed: ${JSON.stringify(newLogin.json)}`);
    const me = await authedJson(apiBase, newLogin.cookie, "GET", "/api/freelancer/bildazo-author-link/me");
    report.getMe = { status: me.status, statusValue: me.json?.data?.status, schemaReady: me.json?.data?.schemaReady };
    assert.equal(me.status, 200);
    assert.notEqual(me.json?.data?.schemaReady, false);

    const created = await authedJson(
      apiBase,
      newLogin.cookie,
      "POST",
      "/api/freelancer/bildazo-author-link/request",
      newAccountPayload(),
    );
    report.newAccount = {
      http: created.status,
      bodyStatus: created.json?.data?.status,
      publicId: created.json?.data?.linked?.bildazoPublicId,
      userId: created.json?.data?.linked?.bildazoUserId,
      profileUrl: created.json?.data?.linked?.bildazoProfileUrl ?? null,
      passwordInBody: Boolean(created.json?.data?.password || created.json?.password),
    };
    assert.equal(created.json?.data?.status, "linked");
    assert.ok(created.json?.data?.linked?.bildazoPublicId);
    assert.ok(created.json?.data?.linked?.bildazoUserId);
    const ohNew = await readOhLinkRow(ohClient, ACTORS.newAccount.email);
    assert.equal(ohNew.status, "linked");
    assert.ok(ohNew.linked_at);
    assert.equal(ohNew.linked_by_user_id, null);
    const bzNew = await readBzUserByEmail(bzClient, ACTORS.newAccount.email);
    assert.ok(bzNew);
    assert.equal(bzNew.role_key, "writer");
    assert.ok(bzNew.public_id);
    assert.equal(String(bzNew.email).toLowerCase(), ACTORS.newAccount.email);
    report.newAccount.bildazoUser = { id: bzNew.id, publicId: bzNew.public_id, role: bzNew.role_key };
    const ohLinksAfterCreate = await countOhLinks(ohClient);
    const bzUsersAfterCreate = await countBzUsers(bzClient);

    const again = await authedJson(
      apiBase,
      newLogin.cookie,
      "POST",
      "/api/freelancer/bildazo-author-link/request",
      newAccountPayload({ fullName: "أحمد علي حسن" }),
    );
    report.idempotency = {
      http: again.status,
      alreadyLinked: again.json?.data?.alreadyLinked,
      status: again.json?.data?.status,
      ohRows: await countOhLinks(ohClient),
      bzUsers: await countBzUsers(bzClient),
    };
    assert.equal(again.json?.data?.status, "linked");
    assert.equal(report.idempotency.ohRows, ohLinksAfterCreate);
    assert.equal(report.idempotency.bzUsers, bzUsersAfterCreate);

    const sameLogin = await loginCookie(apiBase, ACTORS.sameEmail.email);
    const sameSubmit = await authedJson(
      apiBase,
      sameLogin.cookie,
      "POST",
      "/api/freelancer/bildazo-author-link/request",
      existingPayload({ existingBildazoEmail: ACTORS.sameEmail.email, fullName: "سارة محمد خالد" }),
    );
    report.existingSame = {
      http: sameSubmit.status,
      status: sameSubmit.json?.data?.status,
      publicId: sameSubmit.json?.data?.linked?.bildazoPublicId,
      bzUsers: await countBzUsers(bzClient),
    };
    assert.equal(sameSubmit.json?.data?.status, "linked");
    const bzSame = await readBzUserByEmail(bzClient, ACTORS.sameEmail.email);
    assert.equal(bzSame.role_key, "writer");
    assert.equal(report.existingSame.bzUsers, bzUsersAfterCreate);

    const diffLogin = await loginCookie(apiBase, ACTORS.diffEmail.email);
    const bzLinksBeforeDiff = await countBzLinks(bzClient);
    const diffSubmit = await authedJson(
      apiBase,
      diffLogin.cookie,
      "POST",
      "/api/freelancer/bildazo-author-link/request",
      existingPayload({ existingBildazoEmail: "other-writer@bildazo.example" }),
    );
    report.existingDiff = {
      http: diffSubmit.status,
      status: diffSubmit.json?.data?.status,
      linked: diffSubmit.json?.data?.status === "linked",
      bzLinksAfter: await countBzLinks(bzClient),
    };
    assert.equal(diffSubmit.json?.data?.status, "pending_external_verification");
    assert.equal(report.existingDiff.bzLinksAfter, bzLinksBeforeDiff);

    const urlLogin = await loginCookie(apiBase, ACTORS.publicId.email);
    const urlSubmit = await authedJson(
      apiBase,
      urlLogin.cookie,
      "POST",
      "/api/freelancer/bildazo-author-link/request",
      existingPayload({ existingBildazoPublicId: "writer-1c-public" }),
    );
    report.existingPublicIdOnly = {
      status: urlSubmit.json?.data?.status,
      linked: urlSubmit.json?.data?.status === "linked",
    };
    assert.equal(urlSubmit.json?.data?.status, "pending_existing_account");

    const wrongSecret = await fetch(`http://127.0.0.1:${BZ_PORT}/api/integrations/orderzhouse/authors/link-or-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OrderzHouse-Integration-Secret": "not-the-local-test-secret",
      },
      body: JSON.stringify({ orderzFreelancerId: "x", email: "x@bildazo-1c.test", fullName: "X" }),
    });
    report.wrongSecret = { status: wrongSecret.status, json: await wrongSecret.json().catch(() => ({})) };
    assert.equal(wrongSecret.status, 401);

    killTree(bzProc);
    bzProc = null;
    await new Promise((r) => setTimeout(r, 1500));
    const downLogin = await loginCookie(apiBase, ACTORS.down.email);
    const downSubmit = await authedJson(
      apiBase,
      downLogin.cookie,
      "POST",
      "/api/freelancer/bildazo-author-link/request",
      newAccountPayload({ fullName: "هاني ماجد سليم" }),
    );
    const downRow = await readOhLinkRow(ohClient, ACTORS.down.email);
    report.bildazoDown = {
      http: downSubmit.status,
      status: downSubmit.json?.data?.status,
      lastError: downRow?.last_error || null,
      linked: downRow?.status === "linked",
    };
    assert.notEqual(downRow?.status, "linked");
    assert.equal(downRow?.status, "failed");
    assert.doesNotMatch(String(downRow?.last_error || ""), new RegExp(S2S_SECRET));

    bzProc = spawnQuiet(
      "node",
      ["src/index.js"],
      { cwd: BILDAZO_ROOT, env: bzChildEnv(bzUrl) },
      "bildazo_1c_bildazo_backend_restart",
    );
    await waitForHttp(`http://127.0.0.1:${BZ_PORT}/api/health`, { json: true });

    frontendProc = spawnQuiet(
      "npm",
      ["run", "dev", "--", "--host", "localhost", "--port", String(WEB_PORT), "--strictPort"],
      {
        cwd: FRONTEND_ROOT,
        env: { ...process.env, VITE_API_BASE_URL: "/api", VITE_POSTHOG_ENABLE_IN_DEV: "false" },
        shell: true,
      },
      "bildazo_1c_frontend",
    );
    const frontend = await waitForHttp(`http://localhost:${WEB_PORT}/`);
    report.frontendStatus = frontend.status;
    assert.ok(frontend.status < 500);
    const browser = await runBrowserQa({ ohClient, apiPort: OH_PORT });
    report.browser = {
      linkedVisible: browser.linkedVisible,
      linkedText: browser.linkedText,
      publicIdVisible: browser.publicIdVisible,
      profileUrlCount: browser.profileUrlCount,
      passwordFields: browser.passwordFields,
      falseCreatedCopy: browser.falseCreatedCopy,
      diffStatus: browser.diffRow?.status,
      adminFilters: browser.adminFilters,
      adminPasswordFields: browser.adminPasswordFields,
      adminSchemaBanner: browser.adminSchemaBanner,
      unlinkedGateOffHint: browser.unlinkedGateOffHint,
    };
    assert.equal(browser.linkedVisible, true);
    assert.match(browser.linkedText, /حساب الكاتب مرتبط/);
    assert.ok(browser.publicIdVisible >= 1);
    assert.equal(browser.profileUrlCount, 0);
    assert.equal(browser.passwordFields, 0);
    assert.equal(browser.falseCreatedCopy, false);
    assert.equal(browser.diffRow?.status, "pending_external_verification");
    assert.equal(browser.adminFilters, true);
    assert.equal(browser.adminPasswordFields, 0);
    assert.equal(browser.adminSchemaBanner, 0);

    process.env.DATABASE_URL = ohUrl;
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "false";
    const { assertBildazoAuthorLinkedForArticleApply } = require("../src/services/bildazoAuthorLinkService");
    await assertBildazoAuthorLinkedForArticleApply(users[ACTORS.unlinked.email].id);
    const ledgerBefore = await countBidLedger(ohClient);
    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "true";
    let unlinked409 = null;
    try {
      await assertBildazoAuthorLinkedForArticleApply(users[ACTORS.unlinked.email].id);
    } catch (err) {
      unlinked409 = err;
    }
    assert.equal(unlinked409?.publicCode, "BILDAZO_AUTHOR_LINK_REQUIRED");
    await assertBildazoAuthorLinkedForArticleApply(users[ACTORS.newAccount.email].id);
    report.gateInProcess = {
      unlinkedCode: unlinked409.publicCode,
      linkedPassed: true,
      ledgerBefore,
      ledgerAfterBlock: await countBidLedger(ohClient),
    };
    assert.equal(report.gateInProcess.ledgerAfterBlock, ledgerBefore);

    await waitForPortFree(GATE_ON_PORT);
    gateProc = spawnQuiet(
      "node",
      ["server.js"],
      {
        cwd: BACKEND_ROOT,
        env: ohChildEnv(ohUrl, { BILDAZO_AUTHOR_GATE_ENABLED: "true", PORT: String(GATE_ON_PORT) }),
      },
      "bildazo_1c_oh_gate_on",
    );
    await waitForHttp(`http://127.0.0.1:${GATE_ON_PORT}/api/health`, { json: true });
    const gateBase = `http://127.0.0.1:${GATE_ON_PORT}`;
    const unlinkedLogin = await loginCookie(gateBase, ACTORS.unlinked.email);
    const unlinkedApply = await authedJson(
      gateBase,
      unlinkedLogin.cookie,
      "POST",
      "/api/freelancer/marketplace-articles/1/applications",
      { proposalMessage: "phase1c" },
    );
    const linkedLogin = await loginCookie(gateBase, ACTORS.newAccount.email);
    const linkedApply = await authedJson(
      gateBase,
      linkedLogin.cookie,
      "POST",
      "/api/freelancer/marketplace-articles/1/applications",
      { proposalMessage: "phase1c-linked" },
    );
    report.gateOnHttp = {
      unlinkedStatus: unlinkedApply.status,
      unlinkedCode: unlinkedApply.json?.code,
      linkedStatus: linkedApply.status,
      linkedCode: linkedApply.json?.code,
      ledgerAfter: await countBidLedger(ohClient),
    };
    assert.equal(unlinkedApply.status, 409);
    assert.equal(unlinkedApply.json?.code, "BILDAZO_AUTHOR_LINK_REQUIRED");
    assert.notEqual(linkedApply.json?.code, "BILDAZO_AUTHOR_LINK_REQUIRED");
    assert.equal(report.gateOnHttp.ledgerAfter, ledgerBefore);
    killTree(gateProc);
    gateProc = null;
    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "false";
    report.flagRestoredFalse = true;

    const ohLog = fs.readFileSync(path.join(BACKEND_ROOT, ".tmp", "bildazo_1c_oh_backend.log"), "utf8");
    const bzLog = fs.readFileSync(path.join(BACKEND_ROOT, ".tmp", "bildazo_1c_bildazo_backend.log"), "utf8");
    report.secretInLogs = logContainsSecret(ohLog) || logContainsSecret(bzLog);
    assert.equal(report.secretInLogs, false);

    report.overall = "PASS";
  } finally {
    killTree(frontendProc);
    killTree(ohProc);
    killTree(bzProc);
    killTree(gateProc);
    if (ohClient) {
      try {
        await ohClient.end();
      } catch {
        /* ignore */
      }
    }
    if (bzClient) {
      try {
        await bzClient.end();
      } catch {
        /* ignore */
      }
    }
    if (pg) {
      try {
        await pg.stop();
      } catch {
        /* ignore */
      }
    }
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nPhase 1C report: ${REPORT_PATH}`);
    console.log(`Overall: ${report.overall}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
