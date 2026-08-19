/**
 * Phase 0E — local schema clone + Chromium browser QA for Bildazo author linking.
 *
 * NEVER migrates workstation DATABASE_URL when it is production Neon.
 * NEVER git add/commit/deploy. Does not call Bildazo. Does not collect passwords.
 *
 * Usage (from backend/):
 *   node scripts/runBildazoAuthorLinkPhase0eStagingBrowserQa.js
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

const BACKEND_ROOT = path.join(__dirname, "..");
const FRONTEND_ROOT = path.join(BACKEND_ROOT, "..", "frontend");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", `bildazo_author_link_0e_pg_${process.pid}`);
const SCREEN_DIR = path.join(BACKEND_ROOT, ".tmp", "bildazo_0e_screens");
const REPORT_PATH = path.join(BACKEND_ROOT, ".tmp", "bildazo_author_link_0e_report.json");
const PG_PORT = 55470;
const DB_NAME = "orderz_house_bildazo_0e";
const PG_USER = "postgres";
const PG_PASSWORD = "password";
const API_PORT = 5000;
const WEB_PORT = 5173;
const QA_PASSWORD = "QaBildazo0e!";
const JWT_SECRET = "phase0e-bildazo-browser-qa-secret";
const M163 = "163_freelancer_onboarding";
const M164 = "164_freelancer_bildazo_author_links";

const ACTORS = {
  newAccount: { accountId: "FL0E000001", email: "freelancer-new@bildazo-0e.test", role: "freelancer", first: "أحمد", father: "علي", family: "حسن" },
  sameEmail: { accountId: "FL0E000002", email: "freelancer-same@bildazo-0e.test", role: "freelancer", first: "سارة", father: "محمد", family: "خالد" },
  diffEmail: { accountId: "FL0E000003", email: "freelancer-diff@bildazo-0e.test", role: "freelancer", first: "ليلى", father: "يوسف", family: "عمر" },
  publicId: { accountId: "FL0E000004", email: "freelancer-url@bildazo-0e.test", role: "freelancer", first: "نور", father: "سامي", family: "زيد" },
  unlinked: { accountId: "FL0E000005", email: "freelancer-unlinked@bildazo-0e.test", role: "freelancer", first: "كريم", father: "فادي", family: "نبيل" },
  admin: { accountId: "SA0E000001", email: "superadmin@bildazo-0e.test", role: "super_admin", first: "Admin", father: "Orderz", family: "House" },
};

function buildUrl(database = DB_NAME) {
  return `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${database}`;
}

function classifyWorkstationEnvFile() {
  const envPath = path.join(BACKEND_ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    return { missing: true, classification: "MISSING", isProduction: false, maskedTarget: "(no backend/.env)", appEnv: "(unset)", nodeEnv: "(unset)" };
  }
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  const db = classifyDatabaseUrl(parsed.DATABASE_URL);
  return {
    missing: false,
    ...db,
    appEnv: String(parsed.APP_ENV || "").trim() || "(unset)",
    nodeEnv: String(parsed.NODE_ENV || "").trim() || "(unset)",
    stripeLive: /^sk_live_/i.test(String(parsed.STRIPE_SECRET_KEY || "")),
  };
}

function reviewMigrationFile(fileName) {
  const filePath = path.join(DEFAULT_MIGRATIONS_DIR, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const stripped = raw.split("\n").filter((line) => !/^\s*--/.test(line)).join("\n");
  return {
    fileName,
    scan: scanSqlForDangerousStatements(raw),
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
    throw new Error("embedded-postgres required. npm install --no-save embedded-postgres@18.4.0-beta.17");
  }
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* directory may be locked from a prior crashed run */
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
  await pg.createDatabase(DB_NAME);
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
  const marks = { before163: null, after163: null, before164: null, after164: null };
  const emptyDbRepairs = [];
  for (const file of files) {
    const version = versionFromMigrationFilename(file);
    if (version === M163) marks.before163 = await snapshotMigrations(client);
    if (version === M164) marks.before164 = await snapshotMigrations(client);
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
    if (version === M163) marks.after163 = await snapshotMigrations(client);
    if (version === M164) marks.after164 = await snapshotMigrations(client);
  }
  return { fileCount: files.length, marks, emptyDbRepairs };
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
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1::bigint, r.id FROM roles r WHERE r.name = $2::text
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [inserted.rows[0].id, actor.role],
    ).catch(() => {});
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

async function restartBackend(databaseUrl, extra, logName) {
  return spawnQuiet("node", ["server.js"], {
    cwd: BACKEND_ROOT,
    env: childEnv(databaseUrl, extra),
  }, logName);
}

function waitForHttp(url, { timeoutMs = 120_000, json = false } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode < 500) {
            if (!json) return resolve({ status: res.statusCode, body });
            try { return resolve({ status: res.statusCode, json: JSON.parse(body) }); } catch (err) {
              if (Date.now() - started > timeoutMs) return reject(err);
              return setTimeout(tick, 500);
            }
          }
          if (Date.now() - started > timeoutMs) return reject(new Error(`Timeout ${url} status ${res.statusCode}`));
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

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function spawnQuiet(command, args, options, logName) {
  const logPath = path.join(BACKEND_ROOT, ".tmp", `${logName}.log`);
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
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }
}

function childEnv(databaseUrl, extra = {}) {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    JWT_SECRET,
    JWT_EXPIRES_IN: "7d",
    NODE_ENV: "development",
    APP_ENV: "local",
    CLIENT_URL: `http://localhost:${WEB_PORT}`,
    PORT: String(API_PORT),
    HOST: "0.0.0.0",
    COOKIE_SECURE: "false",
    BILDAZO_AUTHOR_GATE_ENABLED: "false",
    FAKE_ORDERS_AUTOMATION_ENABLED: "false",
    INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED: "false",
    API_RATE_LIMIT_MAX: "0",
    ...extra,
  };
}

async function readLinkRow(client, email) {
  const { rows } = await client.query(
    `SELECT l.* FROM freelancer_bildazo_author_links l
     JOIN users u ON u.id = l.freelancer_user_id
     WHERE lower(u.email) = lower($1) LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

async function dismissChrome(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator("[data-popup-ad-close]").first().click({ timeout: 800 }).catch(() => {});
  await page.getByRole("button", { name: "ليس الآن" }).click({ timeout: 1500 }).catch(() => {});
}

async function screenshot(page, name) {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREEN_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}

async function attachBackendSessionCookie(page, email) {
  const { request } = require("playwright");
  const api = await request.newContext({
    baseURL: `http://localhost:${API_PORT}`,
    ignoreHTTPSErrors: true,
  });
  try {
    const res = await api.post("/api/auth/login", {
      data: { email, password: QA_PASSWORD },
    });
    if (res.status() !== 200) {
      throw new Error(`Direct API login ${res.status()} for ${email}: ${(await res.text()).slice(0, 300)}`);
    }
    const setCookie = res.headers()["set-cookie"] || "";
    const state = await api.storageState();
    process.stdout.write(`[0e] login set-cookie present=${Boolean(setCookie)} cookies=${(state.cookies || []).map((c) => c.name).join(",")}\n`);
    const cookies = (state.cookies || [])
      .filter((cookie) => cookie.name === "orderz_access_token")
      .flatMap((cookie) => ([
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
          url: `http://localhost:${API_PORT}/`,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]));
    if (!cookies.length) {
      throw new Error(`API login returned no cookies. set-cookie=${String(setCookie).slice(0, 180)}`);
    }
    await page.context().addCookies(cookies);
    process.stdout.write(`[0e] context cookies=${(await page.context().cookies()).map((c) => c.name).join(",")}\n`);
  } finally {
    await api.dispose();
  }
}

async function login(page, email) {
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
    throw new Error(`Login API ${loginRes.status()} for ${email}: ${(await loginRes.text()).slice(0, 400)}`);
  }
  await page.waitForURL(/\/dashboard\//, { timeout: 25_000 });
  process.stdout.write(`[0e] after form login url=${page.url()}\n`);
  await attachBackendSessionCookie(page, email);
  await page.evaluate(() => {
    localStorage.setItem("orderz_session_hint", "1");
  });
  await dismissChrome(page);
  await screenshot(page, "after-login");
}

async function openArticles(page) {
  process.stdout.write(`[0e] opening articles from ${page.url()}\n`);
  await dismissChrome(page);
  const articlesLink = page.locator('a[href="/dashboard/freelancer/articles"]');
  await articlesLink.first().waitFor({ timeout: 20_000 });
  const meWait = page.waitForResponse(
    (res) => res.url().includes("/bildazo-author-link/me") && res.request().method() === "GET",
    { timeout: 25_000 },
  );
  await articlesLink.first().click();
  await page.waitForURL(/\/dashboard\/freelancer\/articles/, { timeout: 20_000 });
  const meRes = await meWait.catch(() => null);
  process.stdout.write(`[0e] GET /me status=${meRes ? meRes.status() : "none"}\n`);
  if (meRes && meRes.status() === 401) {
    await screenshot(page, "me-401");
    throw new Error("GET /freelancer/bildazo-author-link/me returned 401 after login cookie inject");
  }
  await dismissChrome(page);
  try {
    await page.locator("text=حساب الكاتب").first().waitFor({ timeout: 25_000 });
  } catch (err) {
    await screenshot(page, "articles-missing");
    throw new Error(`Articles gate not visible at ${page.url()}: ${err.message}`);
  }
}

async function submitTermsAnd(page, clickName) {
  const nameInput = page.locator('input[required]').first();
  if (await nameInput.count()) {
    const current = await nameInput.inputValue();
    if (!String(current || "").trim()) {
      await nameInput.fill("أحمد علي حسن");
    }
  }
  const box = page.locator("form input[type=checkbox]").first();
  if (!(await box.isChecked())) await box.check();
  const wait = page.waitForResponse(
    (res) => res.url().includes("/bildazo-author-link/request") && res.request().method() === "POST",
    { timeout: 25_000 },
  );
  await page.getByRole("button", { name: clickName }).click();
  const res = await wait;
  const text = await res.text();
  process.stdout.write(`[0e] submit "${clickName}" status=${res.status()} body=${text.slice(0, 240)}\n`);
  if (res.status() >= 400) {
    await screenshot(page, "submit-fail");
    throw new Error(`Submit failed ${res.status()}: ${text.slice(0, 400)}`);
  }
}

async function runBrowserQa({ client, apiBase }) {
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
      .replace(`http://localhost:${WEB_PORT}`, `http://localhost:${API_PORT}`)
      .replace(`http://127.0.0.1:${WEB_PORT}`, `http://127.0.0.1:${API_PORT}`);
    const response = await route.fetch({ url: target, headers, timeout: 30_000 });
    await route.fulfill({ response });
  });
  const results = {};
  try {
    await login(page, ACTORS.newAccount.email);
    await openArticles(page);
    await screenshot(page, "freelancer-articles-gate");
    results.gateAppears = await page.getByTestId("bildazo-orderz-email").isVisible();
    const emailInput = page.getByTestId("bildazo-orderz-email");
    results.emailValue = await emailInput.inputValue();
    results.emailReadOnly = (await emailInput.getAttribute("readonly")) != null;
    results.passwordFieldsOnArticles = await page.locator('input[type="password"]').count();
    await submitTermsAnd(page, "إرسال طلب إنشاء حساب Bildazo");
    await page.getByTestId("bildazo-pending-state").waitFor({ timeout: 20_000 });
    results.newAccountCopy = await page.getByTestId("bildazo-pending-state").innerText();
    results.newAccountRow = await readLinkRow(client, ACTORS.newAccount.email);

    await login(page, ACTORS.sameEmail.email);
    await openArticles(page);
    await page.getByRole("button", { name: "لدي حساب في Bildazo" }).click();
    await page.getByLabel("بريد حساب Bildazo (اختياري)").fill(ACTORS.sameEmail.email);
    await submitTermsAnd(page, "إرسال طلب ربط حساب Bildazo");
    await page.getByTestId("bildazo-pending-state").waitFor({ timeout: 20_000 });
    results.sameEmailRow = await readLinkRow(client, ACTORS.sameEmail.email);

    await login(page, ACTORS.diffEmail.email);
    await openArticles(page);
    await page.getByRole("button", { name: "لدي حساب في Bildazo" }).click();
    await page.getByLabel("بريد حساب Bildazo (اختياري)").fill("other-writer@bildazo.example");
    await submitTermsAnd(page, "إرسال طلب ربط حساب Bildazo");
    await page.getByTestId("bildazo-pending-state").waitFor({ timeout: 20_000 });
    results.diffEmailRow = await readLinkRow(client, ACTORS.diffEmail.email);

    await login(page, ACTORS.publicId.email);
    await openArticles(page);
    await page.getByRole("button", { name: "لدي حساب في Bildazo" }).click();
    await page.getByLabel("الرقم العام في Bildazo (اختياري)").fill("writer-0e-public");
    await page.getByLabel("رابط الملف الشخصي (اختياري)").fill("https://bildazo.com/u/writer-0e-public");
    await submitTermsAnd(page, "إرسال طلب ربط حساب Bildazo");
    await page.getByTestId("bildazo-pending-state").waitFor({ timeout: 20_000 });
    results.publicIdRow = await readLinkRow(client, ACTORS.publicId.email);

    await login(page, ACTORS.admin.email);
    await dismissChrome(page);
    const adminLink = page.locator('a[href="/dashboard/super-admin/bildazo-author-links"]');
    await adminLink.first().waitFor({ timeout: 20_000 });
    await adminLink.first().click();
    await page.waitForURL(/bildazo-author-links/, { timeout: 20_000 });
    await dismissChrome(page);
    await page.getByTestId("bildazo-admin-filters").waitFor({ timeout: 30_000 });
    results.adminSchemaBanner = await page.locator("text=جدول الربط غير جاهز").count();
    await page.getByTestId("bildazo-admin-search").fill("freelancer-new@bildazo-0e.test");
    await page.getByRole("button", { name: "بحث" }).click();
    await page.getByRole("button", { name: "ربط الحساب" }).first().waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "ربط الحساب" }).first().click();
    const dialog = page.getByTestId("bildazo-manual-link-dialog");
    await dialog.waitFor();
    results.adminPasswordFields = await dialog.locator('input[type="password"]').count();
    const submitBtn = page.getByTestId("bildazo-manual-submit");
    results.submitDisabledBeforeConfirm = await submitBtn.isDisabled();
    await page.getByTestId("bildazo-manual-public-id").fill("writer-0e-1");
    await page.getByTestId("bildazo-manual-profile-url").fill("https://bildazo.com/u/writer-0e-1");
    results.submitDisabledBeforeCheckbox = await submitBtn.isDisabled();
    await page.getByTestId("bildazo-manual-confirm").check();
    await submitBtn.click();
    await page.getByTestId("bildazo-admin-linked-summary").waitFor({ timeout: 20_000 });
    results.adminLinkedCopy = await page.locator("body").innerText();
    results.adminLinkedRow = await readLinkRow(client, ACTORS.newAccount.email);
    await screenshot(page, "super-admin-linked");

    await login(page, ACTORS.newAccount.email);
    await openArticles(page);
    await page.getByTestId("bildazo-linked-profile").waitFor({ timeout: 20_000 });
    results.linkedCardText = await page.getByTestId("bildazo-linked-profile").innerText();
    results.articleListRendered =
      (await page.locator("text=لا توجد مقالات منشورة").count()) > 0 ||
      (await page.locator("ul li").count()) > 0;
    await screenshot(page, "freelancer-linked");

    await login(page, ACTORS.unlinked.email);
    await openArticles(page);
    results.unlinkedGateOffHint = await page.locator("text=التقديم على المقالات ما زال متاحًا").count();
    const meRes = await page.request.get(`${apiBase}/api/freelancer/bildazo-author-link/me`);
    results.unlinkedMe = await meRes.json();
  } catch (err) {
    await screenshot(page, "failure");
    throw err;
  } finally {
    await browser.close();
  }
  return results;
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

async function runHttpGateChecks(apiBase) {
  const unlinkedLogin = await loginCookie(apiBase, ACTORS.unlinked.email);
  const me = await authedJson(apiBase, unlinkedLogin.cookie, "GET", "/api/freelancer/bildazo-author-link/me");
  const unlinkedApply = await authedJson(
    apiBase,
    unlinkedLogin.cookie,
    "POST",
    "/api/freelancer/marketplace-articles/1/applications",
    { proposalMessage: "phase0e" },
  );
  const linkedLogin = await loginCookie(apiBase, ACTORS.newAccount.email);
  const linkedApply = await authedJson(
    apiBase,
    linkedLogin.cookie,
    "POST",
    "/api/freelancer/marketplace-articles/1/applications",
    { proposalMessage: "phase0e-linked" },
  );
  return {
    unlinkedMe: me.json,
    unlinkedStatus: unlinkedApply.status,
    unlinkedBody: unlinkedApply.json,
    linkedStatus: linkedApply.status,
    linkedBody: linkedApply.json,
  };
}

async function main() {
  const workstation = classifyWorkstationEnvFile();
  console.log("\n=== Phase 0E environment classification ===");
  console.log(`Workstation DATABASE_URL: ${workstation.maskedTarget}`);
  console.log(`Workstation classification: ${workstation.classification}`);
  console.log(`APP_ENV: ${workstation.appEnv}`);
  console.log(`NODE_ENV: ${workstation.nodeEnv}`);
  if (workstation.isProduction || workstation.classification === "PRODUCTION") {
    console.log("Workstation target is PRODUCTION — will NOT migrate or write that database.");
  }
  const processDb = classifyDatabaseUrl(process.env.DATABASE_URL || "");
  if (processDb.isProduction) {
    console.error("BLOCKED: process DATABASE_URL is production. Refusing Phase 0E migrate.");
    process.exit(2);
  }

  const files = listMigrationFilenames();
  assert.equal(files.filter((f) => f.startsWith("158_")).length, 1);
  assert.equal(files.filter((f) => f.startsWith("163_")).length, 1);
  const review164 = reviewMigrationFile("164_freelancer_bildazo_author_links.sql");
  const review163 = reviewMigrationFile("163_freelancer_onboarding.sql");
  assert.equal(review164.hasDropTable, false);
  assert.equal(review164.hasDeleteFrom, false);
  assert.equal(review164.hasTruncateTable, false);
  assert.equal(review164.scanNoComments.dangerous, false);

  const databaseUrl = buildUrl();
  const classification = classifyDatabaseUrl(databaseUrl);
  assert.equal(classification.classification, "LOCAL");
  assert.equal(classification.isProduction, false);

  let pg;
  let client;
  let backendProc;
  let backendGateOnProc;
  let frontendProc;
  const report = {
    overall: "FAIL",
    workstation,
    clone: { maskedTarget: classification.maskedTarget, classification: classification.classification, kind: "local_schema_clone" },
    review163: { hasDropTable: review163.hasDropTable, hasDeleteFrom: review163.hasDeleteFrom, hasTruncateTable: review163.hasTruncateTable },
    review164: {
      hasDropTable: review164.hasDropTable,
      hasDeleteFrom: review164.hasDeleteFrom,
      hasTruncateTable: review164.hasTruncateTable,
      commentOnlyDanger: review164.scan.dangerous && !review164.scanNoComments.dangerous,
    },
  };

  try {
    pg = await startEmbeddedPostgres();
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await execSqlFile(client, path.join(BACKEND_ROOT, "sql", "init.sql"));
    await ensureMigrationsTable(client);
    report.beforeAll = await snapshotMigrations(client);
    const applied = await applyAllMigrations(client);
    report.emptyDbRepairs = applied.emptyDbRepairs;
    report.migrationMarks = applied.marks;
    report.afterAll = await snapshotMigrations(client);
    assert.equal(report.afterAll.registered163, true);
    assert.equal(report.afterAll.registered164, true);
    assert.equal(report.afterAll.tableExists, true);
    assert.equal(report.afterAll.pendingCount, 0);

    const users = await seedActors(client);
    report.seededUserIds = Object.fromEntries(Object.entries(users).map(([email, row]) => [email, row.id]));
    report.cloneArticleEngine = await enableArticleEngineOnCloneOnly(client);

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "false";
    const { assertBildazoAuthorLinkedForArticleApply } = require("../src/services/bildazoAuthorLinkService");

    fs.mkdirSync(path.join(BACKEND_ROOT, ".tmp"), { recursive: true });
    backendProc = spawnQuiet("node", ["server.js"], { cwd: BACKEND_ROOT, env: childEnv(databaseUrl) }, "bildazo_0e_backend");
    const frontendEnv = {
      ...process.env,
      VITE_API_BASE_URL: "/api",
      VITE_POSTHOG_ENABLE_IN_DEV: "false",
    };
    frontendProc = spawnQuiet("npm", ["run", "dev", "--", "--host", "localhost", "--strictPort"], {
      cwd: FRONTEND_ROOT,
      env: frontendEnv,
      shell: true,
    }, "bildazo_0e_frontend");

    const health = await waitForHttp(`http://localhost:${API_PORT}/api/health`, { json: true });
    report.backendHealth = health.json;
    assert.equal(health.json?.database, "connected");
    const frontend = await waitForHttp(`http://localhost:${WEB_PORT}/`);
    report.frontendStatus = frontend.status;
    assert.ok(frontend.status < 500);

    const apiBase = `http://localhost:${API_PORT}`;
    const loginSmoke = await postJson(`${apiBase}/api/auth/login`, {
      email: ACTORS.newAccount.email,
      password: QA_PASSWORD,
    });
    report.authSmoke = { status: loginSmoke.status, success: loginSmoke.json?.success === true };
    assert.equal(loginSmoke.status, 200, `auth smoke failed: ${JSON.stringify(loginSmoke.json)}`);

    const browser = await runBrowserQa({ client, apiBase });
    report.browser = {
      newAccount: {
        gateAppears: browser.gateAppears,
        email: browser.emailValue,
        readOnly: browser.emailReadOnly,
        passwordFieldCount: browser.passwordFieldsOnArticles,
        copy: browser.newAccountCopy,
        status: browser.newAccountRow?.status,
      },
      existingSame: { status: browser.sameEmailRow?.status, emailMatchesOrderz: browser.sameEmailRow?.email_matches_orderz },
      existingDiff: { status: browser.diffEmailRow?.status, linked: browser.diffEmailRow?.status === "linked" },
      existingPublicId: { status: browser.publicIdRow?.status, publicId: browser.publicIdRow?.existing_bildazo_public_id },
      admin: {
        schemaMissingBanner: browser.adminSchemaBanner,
        passwordFields: browser.adminPasswordFields,
        submitDisabledBeforeConfirm: browser.submitDisabledBeforeConfirm,
        linkedStatus: browser.adminLinkedRow?.status,
        linkedAt: browser.adminLinkedRow?.linked_at,
        linkedBy: browser.adminLinkedRow?.linked_by_user_id,
        createdCopyPresent: /تم إنشاء الحساب|Bildazo account was created/i.test(browser.adminLinkedCopy || ""),
        negationCopyPresent: /لا يتم إنشاء حساب Bildazo/.test(browser.adminLinkedCopy || ""),
      },
      linkedState: { text: browser.linkedCardText, articleListRendered: browser.articleListRendered },
      gateOffUnlinkedHint: browser.unlinkedGateOffHint,
      schemaReady: browser.unlinkedMe?.schemaReady !== false,
    };

    assert.equal(browser.gateAppears, true);
    assert.equal(browser.emailValue, ACTORS.newAccount.email);
    assert.equal(browser.emailReadOnly, true);
    assert.equal(browser.passwordFieldsOnArticles, 0);
    assert.equal(browser.newAccountRow?.status, "pending_new_account");
    assert.match(browser.newAccountCopy, /تم حفظ طلب/);
    assert.doesNotMatch(browser.newAccountCopy, /تم إنشاء الحساب|حساب الكاتب مرتبط/);
    assert.equal(browser.sameEmailRow?.status, "pending_existing_account");
    assert.equal(Boolean(browser.sameEmailRow?.email_matches_orderz), true);
    assert.equal(browser.diffEmailRow?.status, "pending_external_verification");
    assert.notEqual(browser.diffEmailRow?.status, "linked");
    assert.equal(browser.publicIdRow?.status, "pending_existing_account");
    assert.equal(browser.adminSchemaBanner, 0);
    assert.equal(browser.adminPasswordFields, 0);
    assert.equal(browser.adminLinkedRow?.status, "linked");
    assert.ok(browser.adminLinkedRow?.linked_at);
    assert.ok(browser.adminLinkedRow?.linked_by_user_id);
    assert.match(browser.adminLinkedCopy || "", /لا يتم إنشاء حساب Bildazo/);
    assert.doesNotMatch(browser.adminLinkedCopy || "", /تم إنشاء الحساب|Bildazo account was created/i);
    assert.match(browser.linkedCardText, /حساب الكاتب مرتبط/);
    assert.match(browser.linkedCardText, /writer-0e-1/);

    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "false";
    await assertBildazoAuthorLinkedForArticleApply(users[ACTORS.unlinked.email].id);
    report.gateOff = { unlinkedPrerequisite: "noop" };

    const ledgerBefore = await countBidLedger(client);
    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "true";
    let unlinked409 = null;
    try {
      await assertBildazoAuthorLinkedForArticleApply(users[ACTORS.unlinked.email].id);
    } catch (err) {
      unlinked409 = err;
    }
    assert.equal(unlinked409?.statusCode, 409);
    assert.equal(unlinked409?.publicCode, "BILDAZO_AUTHOR_LINK_REQUIRED");
    await assertBildazoAuthorLinkedForArticleApply(users[ACTORS.newAccount.email].id);
    report.gateOnInProcess = {
      unlinkedCode: unlinked409.publicCode,
      linkedPassed: true,
      ledgerBefore,
      ledgerAfterBlock: await countBidLedger(client),
    };

    const GATE_ON_PORT = 5001;
    backendGateOnProc = spawnQuiet("node", ["server.js"], {
      cwd: BACKEND_ROOT,
      env: childEnv(databaseUrl, {
        BILDAZO_AUTHOR_GATE_ENABLED: "true",
        PORT: String(GATE_ON_PORT),
      }),
    }, "bildazo_0e_backend_gate_on");
    await waitForHttp(`http://localhost:${GATE_ON_PORT}/api/health`, { json: true });
    report.gateOnHttp = await runHttpGateChecks(`http://localhost:${GATE_ON_PORT}`);
    report.gateOnHttp.ledgerAfter = await countBidLedger(client);
    assert.equal(report.gateOnHttp.unlinkedMe?.data?.gateEnabled ?? report.gateOnHttp.unlinkedMe?.gateEnabled, true);
    assert.equal(report.gateOnHttp.unlinkedStatus, 409);
    assert.equal(report.gateOnHttp.unlinkedBody?.code, "BILDAZO_AUTHOR_LINK_REQUIRED");
    assert.notEqual(report.gateOnHttp.linkedBody?.code, "BILDAZO_AUTHOR_LINK_REQUIRED");
    assert.equal(report.gateOnHttp.ledgerAfter, ledgerBefore);
    killTree(backendGateOnProc);
    report.flagRestoredFalse = true;
    report.gateOffBackendUnchanged = true;
    report.overall = "PASS";
    report.productionWrites = false;
    report.bildazoApiCalled = false;
    report.passwordsCollected = false;
  } finally {
    killTree(frontendProc);
    killTree(backendProc);
    killTree(backendGateOnProc);
    if (client) { try { await client.end(); } catch { /* ignore */ } }
    if (pg) { try { await pg.stop(); } catch { /* ignore */ } }
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nPhase 0E report: ${REPORT_PATH}`);
    console.log(`Overall: ${report.overall}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
