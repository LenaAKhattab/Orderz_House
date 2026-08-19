/**
 * Phase 2C — live local OrderzHouse ↔ Bildazo accepted-article publish QA.
 *
 * NEVER uses workstation DATABASE_URL when it is production Neon.
 * NEVER git add/commit/deploy. Does not call production Bildazo or OrderzHouse.
 * Isolated embedded Postgres only (two databases on one local cluster).
 *
 * Usage (from OrderzHouse backend/):
 *   node scripts/runBildazoAuthorLinkPhase2cLiveS2sQa.js
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
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", `bildazo_author_link_2c_pg_${process.pid}`);
const SCREEN_DIR = path.join(BACKEND_ROOT, ".tmp", "bildazo_2c_screens");
const REPORT_PATH = path.join(BACKEND_ROOT, ".tmp", "bildazo_author_link_2c_report.json");
const PG_PORT = 55481;
const OH_DB = "orderz_house_bildazo_2c";
const BZ_DB = "bildazo_2c";
const PG_USER = "postgres";
const PG_PASSWORD = "password";
const OH_PORT = 5020;
const BZ_PORT = 4011;
const WEB_PORT = 5176;
const QA_PASSWORD = "QaBildazo2c!";
const JWT_SECRET = "phase2c-bildazo-live-s2s-qa-secret";
const S2S_SECRET = "local-orderzhouse-bildazo-test-secret";
const M163 = "163_freelancer_onboarding";
const M164 = "164_freelancer_bildazo_author_links";
const M165 = "165_bildazo_article_publish_records";
const M166 = "166_marketplace_article_submissions";

const PROPOSAL_NOTE = "PROPOSAL_NOTE_MUST_NOT_PUBLISH_2C_UNIQUE";
const CAMPAIGN_BRIEF = "CAMPAIGN_BRIEF_MUST_NOT_PUBLISH_2C_UNIQUE";
const MANUSCRIPT_TITLE = "أثر القراءة اليومية على التركيز";
const MANUSCRIPT_BODY = Array.from({ length: 70 }, (_, i) => `هذه جملة منظمة من المخطوط النهائي رقم ${i + 1}.`).join(" ");

const ACTORS = {
  freelancer: {
    accountId: "FL2C000001",
    email: "freelancer-pub@bildazo-2c.test",
    role: "freelancer",
    first: "أحمد",
    father: "علي",
    family: "حسن",
  },
  unlinked: {
    accountId: "FL2C000002",
    email: "freelancer-unlinked@bildazo-2c.test",
    role: "freelancer",
    first: "كريم",
    father: "فادي",
    family: "نبيل",
  },
  admin: {
    accountId: "SA2C000001",
    email: "superadmin@bildazo-2c.test",
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
  const looksRemote = Boolean(host) && host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
  const looksNeon = host.includes("neon.tech") || host.includes("neon.database");
  const bildazoUrl = String(parsed.BILDAZO_API_BASE_URL || parsed.FRONTEND_URL || "").trim() || "(unset)";
  return {
    label,
    missing: false,
    ...db,
    looksRemote,
    looksNeon,
    appEnv: String(parsed.APP_ENV || parsed.NODE_ENV || "").trim() || "(unset)",
    stripeLive: /^sk_live_/i.test(String(parsed.STRIPE_SECRET_KEY || "")),
    bildazoUrl,
  };
}

function reviewMigrationFile(fileName) {
  const filePath = path.join(DEFAULT_MIGRATIONS_DIR, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const stripped = raw
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
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
  const tables = await client.query(`
    SELECT to_regclass('public.freelancer_bildazo_author_links') AS links,
           to_regclass('public.bildazo_article_publish_records') AS publish,
           to_regclass('public.marketplace_article_submissions') AS submissions
  `);
  return {
    appliedCount: applied.length,
    pendingCount: pending.length,
    pending,
    registered163: appliedSet.has(M163),
    registered164: appliedSet.has(M164),
    registered165: appliedSet.has(M165),
    registered166: appliedSet.has(M166),
    tableExists: Boolean(tables.rows[0]?.links),
    publishTable: Boolean(tables.rows[0]?.publish),
    submissionsTable: Boolean(tables.rows[0]?.submissions),
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

async function enableArticleEnginesOnCloneOnly(client) {
  await client.query(`
    INSERT INTO system_settings (key, value)
    VALUES ('subscription_activation_fee_enabled', 'false')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `).catch(() => {});
  await client.query(`UPDATE users SET subscription_activation_fee_paid_at = NOW() WHERE subscription_activation_fee_paid_at IS NULL`).catch(() => {});
  const updated = await client.query(
    `UPDATE marketplace_economy_settings
        SET article_applications_enabled = TRUE,
            bid_credits_enabled = TRUE,
            article_min_required_bids = 1,
            updated_at = NOW()
      WHERE id = 1
      RETURNING id, article_applications_enabled, bid_credits_enabled, article_min_required_bids`,
  );
  if (!updated.rowCount) {
    throw new Error("Clone marketplace_economy_settings row id=1 missing");
  }
  return updated.rows[0];
}

async function seedMembership(client, freelancerUserId) {
  const plan = await client.query(
    `SELECT id, article_access_level, tier_code
       FROM marketplace_membership_plans
      WHERE is_active = TRUE
      ORDER BY article_access_level DESC NULLS LAST, id ASC
      LIMIT 1`,
  );
  if (!plan.rows[0]) throw new Error("No marketplace membership plan on isolated clone");
  const planId = plan.rows[0].id;
  const ends = new Date(Date.now() + 90 * 86400000);
  const membership = await client.query(
    `INSERT INTO freelancer_marketplace_memberships (
       freelancer_user_id, marketplace_plan_id, is_current, status, source,
       cycle_anchor_day, started_at, paid_term_starts_at, paid_term_ends_at,
       auto_renew
     ) VALUES ($1,$2,TRUE,'active','admin',1,NOW(),NOW(),$3,FALSE)
     RETURNING id`,
    [freelancerUserId, planId, ends.toISOString()],
  );
  const membershipId = membership.rows[0].id;
  try {
    await client.query(
      `INSERT INTO marketplace_membership_cycles (
         membership_id, cycle_number, starts_at, ends_at, status,
         marketplace_plan_id, priority_bid_uses_allowed, included_tokens_allowed,
         priority_bid_uses_consumed, activated_at,
         elite_direct_orders_allowed, elite_direct_orders_reserved, elite_direct_orders_consumed,
         monthly_bid_allowance_snapshot
       ) VALUES (
         $1, 1, NOW(), $2, 'active',
         $3, 0, 0, 0, NOW(),
         0, 0, 0, 80
       )`,
      [membershipId, ends.toISOString(), planId],
    );
  } catch {
    await client.query(
      `INSERT INTO marketplace_membership_cycles (
         membership_id, cycle_number, starts_at, ends_at, status,
         marketplace_plan_id, priority_bid_uses_allowed, included_tokens_allowed,
         priority_bid_uses_consumed, activated_at
       ) VALUES (
         $1, 1, NOW(), $2, 'active',
         $3, 0, 0, 0, NOW()
       )`,
      [membershipId, ends.toISOString(), planId],
    );
  }
  return { membershipId, planId, tierCode: plan.rows[0].tier_code };
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
    BILDAZO_ARTICLE_PUBLISH_ENABLED: "true",
    BILDAZO_API_BASE_URL: `http://127.0.0.1:${BZ_PORT}`,
    BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET: S2S_SECRET,
    BILDAZO_AUTHOR_SYNC_TIMEOUT_MS: "8000",
    BILDAZO_ARTICLE_PUBLISH_TIMEOUT_MS: "10000",
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

async function pickLeafCategory(bzClient) {
  const { rows } = await bzClient.query(`
    SELECT leaf.id
      FROM article_categories leaf
      JOIN article_categories section ON section.id = leaf.parent_id
      JOIN article_categories root ON root.id = section.parent_id
     WHERE root.parent_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM article_categories child WHERE child.parent_id = leaf.id
       )
     LIMIT 1
  `);
  return rows[0]?.id || null;
}

async function ensureLeafCategory(bzClient) {
  let id = await pickLeafCategory(bzClient);
  if (id) return { id, created: false };
  const root = await bzClient.query(
    `INSERT INTO article_categories (id, slug, name_ar, parent_id, sort_order, created_at, updated_at)
     VALUES (gen_random_uuid(), 'qa-2c-root', 'جذر اختبار', NULL, 0, NOW(), NOW())
     RETURNING id`,
  );
  const section = await bzClient.query(
    `INSERT INTO article_categories (id, slug, name_ar, parent_id, sort_order, created_at, updated_at)
     VALUES (gen_random_uuid(), 'qa-2c-section', 'قسم اختبار', $1, 0, NOW(), NOW())
     RETURNING id`,
    [root.rows[0].id],
  );
  const leaf = await bzClient.query(
    `INSERT INTO article_categories (id, slug, name_ar, parent_id, sort_order, created_at, updated_at)
     VALUES (gen_random_uuid(), 'qa-2c-leaf', 'ورقة اختبار', $1, 0, NOW(), NOW())
     RETURNING id`,
    [section.rows[0].id],
  );
  return { id: leaf.rows[0].id, created: true };
}

async function fundCampaign(ohClient, articleId) {
  await ohClient.query(
    `UPDATE marketplace_articles
        SET budget_total_jod = 50,
            target_article_count = 1,
            required_bid_count = 1,
            updated_at = NOW()
      WHERE id = $1`,
    [articleId],
  );
  await ohClient.query(
    `UPDATE opportunity_bid_collection_rounds
        SET required_bid_count = 1
      WHERE id = (
        SELECT current_bid_collection_round_id FROM marketplace_articles WHERE id = $1
      )`,
    [articleId],
  );
}

async function createCampaignThroughApi(apiBase, adminCookie, title) {
  const created = await authedJson(apiBase, adminCookie, "POST", "/api/super-admin/marketplace-articles", {
    title,
    description: CAMPAIGN_BRIEF,
    articleLevel: 1,
    requiredWordCount: 50,
    requiredReferencesCount: 0,
    status: "published",
    requiredBidCount: 10,
    minRequiredBidsAcknowledged: true,
  });
  const articleId = created.json?.data?.article?.id || created.json?.data?.id;
  return { created, articleId };
}

async function runHappyPathThroughApproval({
  apiBase,
  freelancerCookie,
  adminCookie,
  ohClient,
  articleTitle,
}) {
  const campaign = await createCampaignThroughApi(apiBase, adminCookie, articleTitle);
  assert.equal(campaign.created.status, 201, `create article failed: ${JSON.stringify(campaign.created.json)}`);
  assert.ok(campaign.articleId);
  await fundCampaign(ohClient, campaign.articleId);

  const apply = await authedJson(
    apiBase,
    freelancerCookie,
    "POST",
    `/api/freelancer/marketplace-articles/${campaign.articleId}/applications`,
    { proposalMessage: PROPOSAL_NOTE },
  );
  const applicationId = apply.json?.data?.application?.id || apply.json?.data?.id;
  assert.ok(apply.status < 300, `apply failed ${apply.status}: ${JSON.stringify(apply.json)}`);
  assert.ok(applicationId);

  const select = await authedJson(
    apiBase,
    adminCookie,
    "POST",
    `/api/super-admin/article-applications/${applicationId}/select`,
    {},
  );
  assert.equal(select.status, 200, `select failed: ${JSON.stringify(select.json)}`);

  const manuscript = await authedJson(
    apiBase,
    freelancerCookie,
    "POST",
    `/api/freelancer/article-applications/${applicationId}/final-manuscript`,
    { title: MANUSCRIPT_TITLE, content: MANUSCRIPT_BODY },
  );
  assert.ok(manuscript.status < 300, `manuscript failed ${manuscript.status}: ${JSON.stringify(manuscript.json)}`);

  const submission = await ohClient.query(
    `SELECT * FROM marketplace_article_submissions WHERE application_id = $1`,
    [Number(applicationId)],
  );
  const applicationRow = await ohClient.query(
    `SELECT a.proposal_message, a.status, art.description
       FROM marketplace_article_applications a
       JOIN marketplace_articles art ON art.id = a.article_id
      WHERE a.id = $1`,
    [Number(applicationId)],
  );

  return {
    articleId: campaign.articleId,
    applicationId,
    apply,
    select,
    manuscript,
    submission: submission.rows[0] || null,
    applicationRow: applicationRow.rows[0] || null,
  };
}

async function startBildazo(bzUrl, logName) {
  const proc = spawnQuiet("node", ["src/index.js"], { cwd: BILDAZO_ROOT, env: bzChildEnv(bzUrl) }, logName);
  await waitForHttp(`http://127.0.0.1:${BZ_PORT}/api/health`, { json: true });
  return proc;
}

async function startOrderzHouse(ohUrl, extra, logName) {
  const proc = spawnQuiet("node", ["server.js"], { cwd: BACKEND_ROOT, env: ohChildEnv(ohUrl, extra) }, logName);
  await waitForHttp(`http://127.0.0.1:${OH_PORT}/api/health`, { json: true });
  return proc;
}

async function runBrowserQa({ articleId, apiPort }) {
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
  page.setDefaultTimeout(25_000);
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
    await login(page, ACTORS.freelancer.email, apiPort);
    await page.goto(`/dashboard/freelancer/articles/${articleId}`, { waitUntil: "domcontentloaded" });
    await dismissChrome(page);
    await page.getByTestId("freelancer-final-article-status").waitFor({ timeout: 25_000 });
    results.freelancerStatus = await page.getByTestId("freelancer-final-article-status").innerText();
    results.publishedCopy = await page.locator("text=تم نشر مقالك على Bildazo").count();
    results.freelancerPasswordFields = await page.locator('input[type="password"]').count();
    results.freelancerUrl = await page.locator("a[href*='/m/articles/']").count();
    await screenshot(page, "freelancer-published");

    await login(page, ACTORS.admin.email, apiPort);
    await page.goto("/dashboard/super-admin/marketplace-articles", { waitUntil: "domcontentloaded" });
    await dismissChrome(page);
    const happyCard = page.locator("article").filter({ hasText: "حملة نشر محلي 2C" });
    await happyCard.first().waitFor({ timeout: 25_000 });
    await happyCard.getByRole("button", { name: /تعديل|Edit/i }).click();
    await page.getByTestId("admin-bildazo-publish-status").waitFor({ timeout: 25_000 });
    results.adminPublish = await page.getByTestId("admin-bildazo-publish-status").innerText();
    results.adminManuscript = await page.getByTestId("admin-final-article-status").innerText().catch(() => "");
    results.adminPasswordFields = await page.locator('input[type="password"]').count();
    results.adminUrl = await page.locator("a[href*='/m/articles/']").count();
    await screenshot(page, "super-admin-published");
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
  console.log("\n=== Phase 2C environment classification ===");
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
    console.error("BLOCKED: process DATABASE_URL is production. Refusing Phase 2C.");
    process.exit(2);
  }

  for (const file of [
    "163_freelancer_onboarding.sql",
    "164_freelancer_bildazo_author_links.sql",
    "165_bildazo_article_publish_records.sql",
    "166_marketplace_article_submissions.sql",
  ]) {
    const review = reviewMigrationFile(file);
    assert.equal(review.hasDropTable, false);
    assert.equal(review.hasTruncateTable, false);
  }

  const ohUrl = buildUrl(OH_DB);
  const bzUrl = buildUrl(BZ_DB);
  assert.equal(classifyDatabaseUrl(ohUrl).classification, "LOCAL");
  assert.equal(classifyDatabaseUrl(bzUrl).classification, "LOCAL");

  let pg;
  let ohClient;
  let bzClient;
  let ohProc;
  let bzProc;
  let frontendProc;
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
      BILDAZO_ARTICLE_PUBLISH_ENABLED: true,
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
    report.orderzhouseMigration = { ...applied, after: await snapshotMigrations(ohClient) };
    assert.equal(report.orderzhouseMigration.after.registered163, true);
    assert.equal(report.orderzhouseMigration.after.registered164, true);
    assert.equal(report.orderzhouseMigration.after.registered165, true);
    assert.equal(report.orderzhouseMigration.after.registered166, true);
    assert.equal(report.orderzhouseMigration.after.tableExists, true);
    assert.equal(report.orderzhouseMigration.after.publishTable, true);
    assert.equal(report.orderzhouseMigration.after.submissionsTable, true);

    const users = await seedActors(ohClient);
    report.seededUserIds = Object.fromEntries(Object.entries(users).map(([email, row]) => [email, row.id]));
    report.cloneEngines = await enableArticleEnginesOnCloneOnly(ohClient);
    report.linkedMembership = await seedMembership(ohClient, users[ACTORS.freelancer.email].id);
    report.unlinkedMembership = await seedMembership(ohClient, users[ACTORS.unlinked.email].id);

    const migrate = await runLogged(
      "npx",
      ["prisma", "migrate", "deploy"],
      { cwd: BILDAZO_ROOT, env: bzChildEnv(bzUrl), shell: true },
      "bildazo_2c_prisma_migrate",
      { timeoutMs: 240_000 },
    );
    report.bildazoMigrate = { code: migrate.code, logTail: migrate.log.slice(-1200) };
    if (migrate.code !== 0) {
      const push = await runLogged(
        "npx",
        ["prisma", "db", "push", "--skip-generate"],
        { cwd: BILDAZO_ROOT, env: bzChildEnv(bzUrl), shell: true },
        "bildazo_2c_prisma_push",
        { timeoutMs: 180_000 },
      );
      report.bildazoPushFallback = { code: push.code, logTail: push.log.slice(-800) };
      assert.equal(push.code, 0, `Bildazo prisma migrate/push failed: ${push.log.slice(-800)}`);
    }

    const seed = await runLogged(
      "node",
      ["scripts/seedOrderzhousePhase1cLocal.mjs"],
      { cwd: BILDAZO_ROOT, env: bzChildEnv(bzUrl) },
      "bildazo_2c_seed",
      { timeoutMs: 60_000 },
    );
    assert.equal(seed.code, 0, `Bildazo seed failed: ${seed.log.slice(-800)}`);
    await runLogged(
      "node",
      ["scripts/seed-article-categories.mjs"],
      { cwd: BILDAZO_ROOT, env: bzChildEnv(bzUrl) },
      "bildazo_2c_categories",
      { timeoutMs: 120_000 },
    );
    const leaf = await ensureLeafCategory(bzClient);
    report.leafCategoryId = leaf.id;
    report.leafCategoryCreated = leaf.created;
    assert.ok(report.leafCategoryId);

    const bzTables = await bzClient.query(`
      SELECT to_regclass('public."User"') AS users,
             to_regclass('public."Role"') AS roles,
             to_regclass('public.orderzhouse_author_links') AS links,
             to_regclass('public.orderzhouse_article_imports') AS imports
    `);
    report.bildazoTables = bzTables.rows[0];
    assert.ok(bzTables.rows[0].users);
    assert.ok(bzTables.rows[0].roles);
    assert.ok(bzTables.rows[0].links);
    assert.ok(bzTables.rows[0].imports);
    const writerRole = await bzClient.query(`SELECT id, key FROM "Role" WHERE key = 'writer' LIMIT 1`);
    assert.equal(writerRole.rows[0]?.key, "writer");

    fs.mkdirSync(path.join(BACKEND_ROOT, ".tmp"), { recursive: true });
    bzProc = await startBildazo(bzUrl, "bildazo_2c_bildazo_backend");
    const bzHealth = await waitForHttp(`http://127.0.0.1:${BZ_PORT}/api/health`, { json: true });
    report.bildazoHealth = bzHealth.json;

    const missingSecret = await fetch(`http://127.0.0.1:${BZ_PORT}/api/integrations/orderzhouse/articles/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderzArticleId: "probe" }),
    });
    report.bildazoPublishRejectsMissingSecret = {
      status: missingSecret.status,
      json: await missingSecret.json().catch(() => ({})),
    };
    assert.equal(missingSecret.status, 401);

    const wrongSecret = await fetch(`http://127.0.0.1:${BZ_PORT}/api/integrations/orderzhouse/articles/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OrderzHouse-Integration-Secret": "not-the-local-test-secret",
      },
      body: JSON.stringify({ orderzArticleId: "probe" }),
    });
    report.bildazoPublishRejectsWrongSecret = {
      status: wrongSecret.status,
      json: await wrongSecret.json().catch(() => ({})),
    };
    assert.equal(wrongSecret.status, 401);

    const validSecret = await fetch(`http://127.0.0.1:${BZ_PORT}/api/integrations/orderzhouse/articles/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OrderzHouse-Integration-Secret": S2S_SECRET,
      },
      body: JSON.stringify({ orderzArticleId: "probe-valid" }),
    });
    report.bildazoPublishValidSecretReachesValidation = {
      status: validSecret.status,
      json: await validSecret.json().catch(() => ({})),
    };
    assert.notEqual(validSecret.status, 401);
    assert.equal(report.bildazoPublishValidSecretReachesValidation.json?.password, undefined);

    ohProc = await startOrderzHouse(
      ohUrl,
      { BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID: String(leaf.id) },
      "bildazo_2c_oh_backend",
    );
    const apiBase = `http://127.0.0.1:${OH_PORT}`;
    const ohHealth = await waitForHttp(`${apiBase}/api/health`, { json: true });
    report.orderzhouseHealth = ohHealth.json;
    assert.ok(ohHealth.status < 500);

    const freelancerLogin = await loginCookie(apiBase, ACTORS.freelancer.email);
    assert.equal(freelancerLogin.status, 200, `OH login failed: ${JSON.stringify(freelancerLogin.json)}`);
    const me = await authedJson(apiBase, freelancerLogin.cookie, "GET", "/api/freelancer/bildazo-author-link/me");
    report.getMe = { status: me.status, schemaReady: me.json?.data?.schemaReady, statusValue: me.json?.data?.status };
    assert.equal(me.status, 200);
    assert.notEqual(me.json?.data?.schemaReady, false);

    const linked = await authedJson(apiBase, freelancerLogin.cookie, "POST", "/api/freelancer/bildazo-author-link/request", {
      linkFlow: "new_account",
      fullName: "أحمد علي حسن",
      phoneE164: "+962790000001",
      countryIso: "JO",
      acceptedTermsVersion: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
      acceptedTermsAcknowledged: true,
    });
    report.writerLink = {
      http: linked.status,
      status: linked.json?.data?.status,
      bildazoUserId: linked.json?.data?.linked?.bildazoUserId,
      bildazoPublicId: linked.json?.data?.linked?.bildazoPublicId,
      passwordInBody: Boolean(linked.json?.data?.password || linked.json?.password),
    };
    assert.equal(linked.json?.data?.status, "linked");
    assert.equal(report.writerLink.passwordInBody, false);

    const adminLogin = await loginCookie(apiBase, ACTORS.admin.email);
    assert.equal(adminLogin.status, 200);
    const grant = await authedJson(apiBase, adminLogin.cookie, "POST", "/api/super-admin/bid-credits/grants", {
      freelancerUserId: Number(users[ACTORS.freelancer.email].id),
      amount: 30,
      expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
      reason: "phase2c isolated live qa",
    });
    const grantUnlinked = await authedJson(apiBase, adminLogin.cookie, "POST", "/api/super-admin/bid-credits/grants", {
      freelancerUserId: Number(users[ACTORS.unlinked.email].id),
      amount: 30,
      expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
      reason: "phase2c isolated live qa unlinked",
    });
    report.bidGrants = { linked: grant.status, unlinked: grantUnlinked.status, linkedBody: grant.json, unlinkedBody: grantUnlinked.json };
    assert.ok(grant.status < 300, `grant failed: ${JSON.stringify(grant.json)}`);
    assert.ok(grantUnlinked.status < 300, `unlinked grant failed: ${JSON.stringify(grantUnlinked.json)}`);

    const happy = await runHappyPathThroughApproval({
      apiBase,
      freelancerCookie: freelancerLogin.cookie,
      adminCookie: adminLogin.cookie,
      ohClient,
      articleTitle: "حملة نشر محلي 2C",
    });
    report.manuscript = {
      http: happy.manuscript.status,
      dbStatus: happy.submission?.status,
      title: happy.submission?.title,
      proposalRemains: happy.applicationRow?.proposal_message,
      campaignRemains: happy.applicationRow?.description,
    };
    assert.equal(happy.submission?.status, "submitted");
    assert.equal(happy.submission?.title, MANUSCRIPT_TITLE);
    assert.equal(happy.submission?.content, MANUSCRIPT_BODY);
    assert.equal(happy.applicationRow?.proposal_message, PROPOSAL_NOTE);
    assert.equal(happy.applicationRow?.description, CAMPAIGN_BRIEF);

    const articlesBefore = await bzClient.query(`SELECT COUNT(*)::int AS n FROM "Article"`);
    const finalize = await authedJson(
      apiBase,
      adminLogin.cookie,
      "POST",
      `/api/super-admin/article-applications/${happy.applicationId}/finalize-approval`,
    );
    report.finalize = { http: finalize.status, json: finalize.json };
    assert.equal(finalize.status, 200, `finalize failed: ${JSON.stringify(finalize.json)}`);

    const publishRow = await ohClient.query(
      `SELECT * FROM bildazo_article_publish_records WHERE orderz_application_id = $1`,
      [Number(happy.applicationId)],
    );
    report.publishRecord = publishRow.rows[0] || null;
    assert.ok(report.publishRecord);
    assert.ok(["published", "already_imported"].includes(report.publishRecord.status));
    assert.ok(report.publishRecord.bildazo_article_id);
    assert.ok(report.publishRecord.bildazo_article_url);
    assert.match(String(report.publishRecord.bildazo_article_url), /\/m\/articles\//);

    const settlement = await ohClient.query(
      `SELECT * FROM marketplace_article_settlements WHERE article_application_id = $1`,
      [Number(happy.applicationId)],
    );
    report.settlement = { count: settlement.rowCount, bidConsumed: settlement.rows[0]?.bid_consumed };
    assert.equal(settlement.rowCount, 1);

    const bzArticle = await bzClient.query(`SELECT * FROM "Article" WHERE id = $1`, [
      report.publishRecord.bildazo_article_id,
    ]);
    report.bildazoArticle = bzArticle.rows[0] || null;
    assert.ok(report.bildazoArticle);
    assert.equal(report.bildazoArticle.status, "APPROVED");
    assert.ok(report.bildazoArticle.publishedAt || report.bildazoArticle.published_at);
    assert.equal(report.bildazoArticle.title, MANUSCRIPT_TITLE);
    assert.equal(report.bildazoArticle.content, MANUSCRIPT_BODY);
    assert.doesNotMatch(String(report.bildazoArticle.content), new RegExp(PROPOSAL_NOTE));
    assert.doesNotMatch(String(report.bildazoArticle.content), new RegExp(CAMPAIGN_BRIEF));
    assert.doesNotMatch(String(report.bildazoArticle.title), new RegExp(PROPOSAL_NOTE));
    const ohLink = await ohClient.query(
      `SELECT * FROM freelancer_bildazo_author_links WHERE freelancer_user_id = $1`,
      [users[ACTORS.freelancer.email].id],
    );
    assert.equal(String(report.bildazoArticle.authorId || report.bildazoArticle.author_id), String(ohLink.rows[0].bildazo_user_id));
    const articlesAfter = await bzClient.query(`SELECT COUNT(*)::int AS n FROM "Article"`);
    assert.equal(articlesAfter.rows[0].n, articlesBefore.rows[0].n + 1);

    const finalizeAgain = await authedJson(
      apiBase,
      adminLogin.cookie,
      "POST",
      `/api/super-admin/article-applications/${happy.applicationId}/finalize-approval`,
    );
    const retry = await authedJson(
      apiBase,
      adminLogin.cookie,
      "POST",
      `/api/super-admin/article-applications/${happy.applicationId}/bildazo-publish/retry`,
    );
    const publishCount = await ohClient.query(
      `SELECT COUNT(*)::int AS n FROM bildazo_article_publish_records WHERE orderz_application_id = $1`,
      [Number(happy.applicationId)],
    );
    const importCount = await bzClient.query(
      `SELECT COUNT(*)::int AS n FROM orderzhouse_article_imports WHERE orderz_article_id = $1`,
      [String(happy.applicationId)],
    );
    const articleCountSame = await bzClient.query(`SELECT COUNT(*)::int AS n FROM "Article"`);
    report.idempotency = {
      finalizeAgain: finalizeAgain.status,
      retry: retry.status,
      publishRows: publishCount.rows[0].n,
      importRows: importCount.rows[0].n,
      articleRows: articleCountSame.rows[0].n,
    };
    assert.equal(publishCount.rows[0].n, 1);
    assert.equal(importCount.rows[0].n, 1);
    assert.equal(articleCountSame.rows[0].n, articlesAfter.rows[0].n);

    const unlinkedLogin = await loginCookie(apiBase, ACTORS.unlinked.email);
    const unlinkedFlow = await runHappyPathThroughApproval({
      apiBase,
      freelancerCookie: unlinkedLogin.cookie,
      adminCookie: adminLogin.cookie,
      ohClient,
      articleTitle: "حملة غير مرتبط 2C",
    });
    const articlesBeforeUnlinked = await bzClient.query(`SELECT COUNT(*)::int AS n FROM "Article"`);
    const unlinkedFinalize = await authedJson(
      apiBase,
      adminLogin.cookie,
      "POST",
      `/api/super-admin/article-applications/${unlinkedFlow.applicationId}/finalize-approval`,
    );
    const unlinkedPublish = await ohClient.query(
      `SELECT * FROM bildazo_article_publish_records WHERE orderz_application_id = $1`,
      [Number(unlinkedFlow.applicationId)],
    );
    const unlinkedSettle = await ohClient.query(
      `SELECT COUNT(*)::int AS n FROM marketplace_article_settlements WHERE article_application_id = $1`,
      [Number(unlinkedFlow.applicationId)],
    );
    const articlesAfterUnlinked = await bzClient.query(`SELECT COUNT(*)::int AS n FROM "Article"`);
    report.unlinkedFailure = {
      finalize: unlinkedFinalize.status,
      publishStatus: unlinkedPublish.rows[0]?.status,
      lastError: unlinkedPublish.rows[0]?.last_error,
      settlementCount: unlinkedSettle.rows[0].n,
      articleDelta: articlesAfterUnlinked.rows[0].n - articlesBeforeUnlinked.rows[0].n,
    };
    assert.equal(unlinkedFinalize.status, 200);
    assert.equal(unlinkedSettle.rows[0].n, 1);
    assert.equal(unlinkedPublish.rows[0]?.status, "needs_manual_review");
    assert.equal(articlesAfterUnlinked.rows[0].n, articlesBeforeUnlinked.rows[0].n);

    killTree(ohProc);
    ohProc = null;
    await waitForPortFree(OH_PORT);
    ohProc = await startOrderzHouse(
      ohUrl,
      { BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID: "", BILDAZO_ARTICLE_CATEGORY_MAP: "" },
      "bildazo_2c_oh_no_category",
    );
    const freelancerLogin2 = await loginCookie(apiBase, ACTORS.freelancer.email);
    const adminLogin2 = await loginCookie(apiBase, ACTORS.admin.email);
    const missingCatFlow = await runHappyPathThroughApproval({
      apiBase,
      freelancerCookie: freelancerLogin2.cookie,
      adminCookie: adminLogin2.cookie,
      ohClient,
      articleTitle: "حملة بدون تصنيف 2C",
    });
    const articlesBeforeCat = await bzClient.query(`SELECT COUNT(*)::int AS n FROM "Article"`);
    const missingCatFinalize = await authedJson(
      apiBase,
      adminLogin2.cookie,
      "POST",
      `/api/super-admin/article-applications/${missingCatFlow.applicationId}/finalize-approval`,
    );
    const missingCatPublish = await ohClient.query(
      `SELECT * FROM bildazo_article_publish_records WHERE orderz_application_id = $1`,
      [Number(missingCatFlow.applicationId)],
    );
    const articlesAfterCat = await bzClient.query(`SELECT COUNT(*)::int AS n FROM "Article"`);
    report.missingCategory = {
      finalize: missingCatFinalize.status,
      status: missingCatPublish.rows[0]?.status,
      lastError: missingCatPublish.rows[0]?.last_error,
      articleDelta: articlesAfterCat.rows[0].n - articlesBeforeCat.rows[0].n,
    };
    assert.equal(missingCatFinalize.status, 200);
    assert.equal(missingCatPublish.rows[0]?.status, "needs_manual_review");
    assert.equal(articlesAfterCat.rows[0].n, articlesBeforeCat.rows[0].n);

    killTree(ohProc);
    ohProc = null;
    await waitForPortFree(OH_PORT);
    ohProc = await startOrderzHouse(
      ohUrl,
      {
        BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID: String(leaf.id),
        BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET: "wrong-local-secret",
      },
      "bildazo_2c_oh_wrong_secret",
    );
    const freelancerLogin3 = await loginCookie(apiBase, ACTORS.freelancer.email);
    const adminLogin3 = await loginCookie(apiBase, ACTORS.admin.email);
    const wrongSecretFlow = await runHappyPathThroughApproval({
      apiBase,
      freelancerCookie: freelancerLogin3.cookie,
      adminCookie: adminLogin3.cookie,
      ohClient,
      articleTitle: "حملة سر خاطئ 2C",
    });
    const articlesBeforeWrong = await bzClient.query(`SELECT COUNT(*)::int AS n FROM "Article"`);
    const wrongFinalize = await authedJson(
      apiBase,
      adminLogin3.cookie,
      "POST",
      `/api/super-admin/article-applications/${wrongSecretFlow.applicationId}/finalize-approval`,
    );
    const wrongPublish = await ohClient.query(
      `SELECT * FROM bildazo_article_publish_records WHERE orderz_application_id = $1`,
      [Number(wrongSecretFlow.applicationId)],
    );
    const wrongSettle = await ohClient.query(
      `SELECT COUNT(*)::int AS n FROM marketplace_article_settlements WHERE article_application_id = $1`,
      [Number(wrongSecretFlow.applicationId)],
    );
    const articlesAfterWrong = await bzClient.query(`SELECT COUNT(*)::int AS n FROM "Article"`);
    report.wrongSecretPublish = {
      finalize: wrongFinalize.status,
      status: wrongPublish.rows[0]?.status,
      lastError: wrongPublish.rows[0]?.last_error,
      settlementCount: wrongSettle.rows[0].n,
      articleDelta: articlesAfterWrong.rows[0].n - articlesBeforeWrong.rows[0].n,
    };
    assert.equal(wrongFinalize.status, 200);
    assert.equal(wrongSettle.rows[0].n, 1);
    assert.ok(["failed", "needs_manual_review"].includes(wrongPublish.rows[0]?.status));
    assert.equal(articlesAfterWrong.rows[0].n, articlesBeforeWrong.rows[0].n);
    assert.doesNotMatch(String(wrongPublish.rows[0]?.last_error || ""), /wrong-local-secret|local-orderzhouse-bildazo-test-secret/);

    killTree(bzProc);
    bzProc = null;
    await waitForPortFree(BZ_PORT);
    const downRetry = await authedJson(
      apiBase,
      adminLogin3.cookie,
      "POST",
      `/api/super-admin/article-applications/${wrongSecretFlow.applicationId}/bildazo-publish/retry`,
    );
    const downPublish = await ohClient.query(
      `SELECT * FROM bildazo_article_publish_records WHERE orderz_application_id = $1`,
      [Number(wrongSecretFlow.applicationId)],
    );
    report.bildazoDown = {
      retry: downRetry.status,
      status: downPublish.rows[0]?.status,
      settlementStillOne: wrongSettle.rows[0].n,
    };
    assert.equal(wrongSettle.rows[0].n, 1);

    bzProc = await startBildazo(bzUrl, "bildazo_2c_bildazo_backend_restart");
    killTree(ohProc);
    ohProc = null;
    await waitForPortFree(OH_PORT);
    ohProc = await startOrderzHouse(
      ohUrl,
      { BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID: String(leaf.id) },
      "bildazo_2c_oh_restore",
    );

    frontendProc = spawnQuiet(
      "npm",
      ["run", "dev", "--", "--host", "localhost", "--port", String(WEB_PORT), "--strictPort"],
      {
        cwd: FRONTEND_ROOT,
        env: { ...process.env, VITE_API_BASE_URL: "/api", VITE_POSTHOG_ENABLE_IN_DEV: "false" },
        shell: true,
      },
      "bildazo_2c_frontend",
    );
    const frontend = await waitForHttp(`http://localhost:${WEB_PORT}/`);
    report.frontendStatus = frontend.status;
    assert.ok(frontend.status < 500);
    report.browser = await runBrowserQa({ articleId: happy.articleId, apiPort: OH_PORT });
    assert.ok(report.browser.publishedCopy >= 1);
    assert.ok(report.browser.freelancerUrl >= 1);
    assert.equal(report.browser.freelancerPasswordFields, 0);
    assert.equal(report.browser.adminPasswordFields, 0);
    assert.match(String(report.browser.adminPublish || ""), /Bildazo|نشر|published|imported/i);
    assert.ok(report.browser.adminUrl >= 1);

    killTree(frontendProc);
    frontendProc = null;
    killTree(ohProc);
    ohProc = null;
    killTree(bzProc);
    bzProc = null;

    const unitEnv = {
      ...process.env,
      DATABASE_URL: "postgresql://127.0.0.1:5432/bildazo_placeholder",
      DIRECT_URL: "postgresql://127.0.0.1:5432/bildazo_placeholder",
    };
    const oh2b = await runLogged(
      "npm",
      ["run", "test:bildazo-article-publish-phase-2b"],
      { cwd: BACKEND_ROOT, env: unitEnv, shell: true },
      "bildazo_2c_oh_2b_tests",
      { timeoutMs: 120_000 },
    );
    const ohArea = await runLogged(
      "node",
      [
        "--test",
        "test/marketplaceArticleApplicationsPhaseB5.test.js",
        "test/articleFairDistributionAdapter.test.js",
        "test/fairSelectionOverride.test.js",
        "test/relistBidCollection.test.js",
        "test/articleMinRequiredBids.test.js",
      ],
      { cwd: BACKEND_ROOT, env: unitEnv, shell: true },
      "bildazo_2c_oh_area_tests",
      { timeoutMs: 120_000 },
    );
    const fe2b = await runLogged(
      "node",
      ["--test", "src/phase2b_bildazo_article_publish.test.js"],
      { cwd: FRONTEND_ROOT, env: unitEnv, shell: true },
      "bildazo_2c_fe_2b_tests",
      { timeoutMs: 60_000 },
    );
    const feBuild = await runLogged("npm", ["run", "build"], { cwd: FRONTEND_ROOT, env: unitEnv, shell: true }, "bildazo_2c_fe_build", {
      timeoutMs: 180_000,
    });
    const bzAuthor = await runLogged(
      "npm",
      ["run", "test:orderzhouse-author-link"],
      { cwd: BILDAZO_ROOT, env: unitEnv, shell: true },
      "bildazo_2c_bz_author_tests",
      { timeoutMs: 60_000 },
    );
    const bzPublish = await runLogged(
      "npm",
      ["run", "test:orderzhouse-article-publish"],
      { cwd: BILDAZO_ROOT, env: unitEnv, shell: true },
      "bildazo_2c_bz_publish_tests",
      { timeoutMs: 60_000 },
    );
    report.tests = {
      oh2b: oh2b.code,
      ohArea: ohArea.code,
      fe2b: fe2b.code,
      feBuild: feBuild.code,
      bzAuthor: bzAuthor.code,
      bzPublish: bzPublish.code,
    };
    assert.equal(oh2b.code, 0, oh2b.log.slice(-800));
    assert.equal(ohArea.code, 0, ohArea.log.slice(-800));
    assert.equal(fe2b.code, 0, fe2b.log.slice(-800));
    assert.equal(feBuild.code, 0, feBuild.log.slice(-800));
    assert.equal(bzAuthor.code, 0, bzAuthor.log.slice(-800));
    assert.equal(bzPublish.code, 0, bzPublish.log.slice(-800));

    const ohLogs = ["bildazo_2c_oh_backend", "bildazo_2c_oh_no_category", "bildazo_2c_oh_wrong_secret", "bildazo_2c_oh_restore"]
      .map((name) => {
        const p = path.join(BACKEND_ROOT, ".tmp", `${name}.log`);
        return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
      })
      .join("\n");
    const bzLogs = ["bildazo_2c_bildazo_backend", "bildazo_2c_bildazo_backend_restart"]
      .map((name) => {
        const p = path.join(BACKEND_ROOT, ".tmp", `${name}.log`);
        return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
      })
      .join("\n");
    report.secretInLogs = logContainsSecret(ohLogs) || logContainsSecret(bzLogs);
    assert.equal(report.secretInLogs, false);

    report.overall = "PASS";
  } catch (err) {
    report.overall = "FAIL";
    report.error = { message: err.message, stack: String(err.stack || "").split("\n").slice(0, 8) };
    throw err;
  } finally {
    killTree(frontendProc);
    killTree(ohProc);
    killTree(bzProc);
    try {
      await ohClient?.end();
    } catch {
      /* ignore */
    }
    try {
      await bzClient?.end();
    } catch {
      /* ignore */
    }
    try {
      await pg?.stop();
    } catch {
      /* ignore */
    }
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nPhase 2C report: ${REPORT_PATH}`);
    console.log(`Overall: ${report.overall}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
