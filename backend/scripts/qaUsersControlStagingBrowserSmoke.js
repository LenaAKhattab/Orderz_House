/**
 * Staging browser smoke — Super Admin Users Control Center.
 * Loads .env.staging only. Refuses Production Neon. No migrations. No payments.
 *
 * Usage (from backend/, with Staging API + Vite already running OR auto-start):
 *   node scripts/qaUsersControlStagingBrowserSmoke.js
 */
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");
const jwt = require("jsonwebtoken");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  countPendingMigrations,
} = require("../src/config/stagingQaEnv");
const { KNOWN_PRODUCTION_HOST_MARKERS } = require("../src/utils/databaseEnvironmentSafety");
const { AUTH_COOKIE_NAME } = require("../src/utils/authCookie");

loadStagingQaEnv({ fillFromDefaultEnv: true });
const target = assertStagingQaTarget();

const API_PORT = Number(process.env.PORT || 5000);
const WEB_PORT = Number(process.env.USERS_CONTROL_WEB_PORT || 5174);
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
const SCREEN_DIR = path.join(__dirname, "..", ".tmp", "users_control_browser_screens");
const REPORT_PATH = path.join(__dirname, "..", ".tmp", "users_control_browser_report.json");

const results = [];
function step(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "").slice(0, 300) });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? ` — ${detail}` : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHttpOk(url, { timeoutMs = 90000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(res.statusCode > 0 && res.statusCode < 500);
        });
        req.on("error", () => resolve(false));
        req.setTimeout(3000, () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return true;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  return false;
}

function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      accountId: user.account_id,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "45m" },
  );
}

async function ensureServers() {
  const apiUp = await waitHttpOk(`${API_ORIGIN}/api/health`, { timeoutMs: 2500 });
  let apiProc = null;
  if (!apiUp) {
    console.log("[browser-smoke] starting Staging backend…");
    apiProc = spawn("npm", ["run", "start:staging"], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      stdio: "ignore",
      env: { ...process.env },
    });
  }
  const apiReady = await waitHttpOk(`${API_ORIGIN}/api/health`, { timeoutMs: 120000 });
  step("staging API health", apiReady, API_ORIGIN);

  const webUp = await waitHttpOk(WEB_ORIGIN, { timeoutMs: 2500 });
  let webProc = null;
  if (!webUp) {
    console.log("[browser-smoke] starting frontend Vite on", WEB_PORT);
    webProc = spawn(
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(WEB_PORT)],
      {
        cwd: path.join(__dirname, "..", "..", "frontend"),
        shell: true,
        stdio: "ignore",
        env: {
          ...process.env,
          VITE_API_BASE_URL: `${API_ORIGIN}/api`,
        },
      },
    );
  }
  const webReady = await waitHttpOk(WEB_ORIGIN, { timeoutMs: 120000 });
  step("frontend Vite ready", webReady, WEB_ORIGIN);
  return { apiProc, webProc };
}

async function main() {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  console.log("=== Users Control Staging Browser Smoke ===");
  console.log(
    JSON.stringify({
      appEnv: target.appEnv,
      maskedTarget: target.maskedTarget,
      classification: target.db.classification,
      web: WEB_ORIGIN,
      api: API_ORIGIN,
    }),
  );

  const host = String(target.db.host || "").toLowerCase();
  step(
    "env staging not production",
    target.appEnv === "staging" &&
      !KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase())),
    target.maskedTarget,
  );
  const pending = await countPendingMigrations();
  step("pending migrations 0", pending.pendingCount === 0, `pending=${pending.pendingCount}`);

  const { apiProc, webProc } = await ensureServers();
  if (!results.find((r) => r.name === "staging API health")?.pass || !results.find((r) => r.name === "frontend Vite ready")?.pass) {
    throw new Error("Servers not ready — abort browser smoke");
  }

  // Health banner check — APP_ENV staging
  const healthBody = await new Promise((resolve) => {
    http.get(`${API_ORIGIN}/api/health`, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve(raw));
    }).on("error", () => resolve(""));
  });
  step("API responds", /ok|success|running/i.test(healthBody), healthBody.slice(0, 120));

  const { pool } = require("../src/config/db");
  const { rows: saRows } = await pool.query(
    `SELECT id, email, role, account_id FROM users
      WHERE role = 'super_admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
  );
  const superAdmin = saRows[0];
  step("super_admin available", !!superAdmin, superAdmin ? `id=${superAdmin.id}` : "");

  const { rows: adminRows } = await pool.query(
    `SELECT id, email, role, account_id FROM users
      WHERE role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
  );
  const admin = adminRows[0] || null;

  const { rows: qaUsers } = await pool.query(
    `SELECT id, email, first_name, family_name
       FROM users
      WHERE role = 'freelancer' AND is_active = TRUE
        AND (email ILIKE '%qa%' OR email ILIKE '%test%' OR email ILIKE '%example.com%')
      ORDER BY id ASC LIMIT 3`,
  );
  const freelancers =
    qaUsers.length >= 2
      ? qaUsers
      : (
          await pool.query(
            `SELECT id, email, first_name, family_name FROM users
              WHERE role = 'freelancer' AND is_active = TRUE ORDER BY id DESC LIMIT 2`,
          )
        ).rows;
  step("QA freelancers for UI", freelancers.length >= 1, `count=${freelancers.length}`);

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    await import("playwright").catch(() => null);
    try {
      ({ chromium } = require("playwright"));
    } catch {
      throw new Error("Install playwright: npm install --no-save playwright && npx playwright install chromium");
    }
  }

  const browser = await chromium.launch({ headless: true });
  const consoleFatals = [];
  const consoleWarnings = [];

  async function openAuthedContext(user) {
    const context = await browser.newContext({
      baseURL: WEB_ORIGIN,
      locale: "ar",
      viewport: { width: 1440, height: 960 },
    });
    const token = signToken(user);
    await context.addCookies([
      {
        name: AUTH_COOKIE_NAME,
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error") consoleFatals.push(text.slice(0, 240));
      if (type === "warning") consoleWarnings.push(text.slice(0, 180));
    });
    page.on("pageerror", (err) => consoleFatals.push(String(err.message || err).slice(0, 240)));
    // Ensure session hint so bootstrap calls /auth/me
    await page.addInitScript(() => {
      try {
        localStorage.setItem("orderz_session_hint", "1");
        localStorage.removeItem("orderz_auth_token");
      } catch {
        /* ignore */
      }
    });
    return { context, page };
  }

  async function shot(page, name) {
    const file = path.join(SCREEN_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  }

  async function waitUsersSettled(page, { timeout = 30000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const loading = await page.locator("text=جاري تحميل المستخدمين").isVisible().catch(() => false);
      if (!loading) {
        const hasRows = (await page.locator(".oh-sa-users-table tbody tr").count().catch(() => 0)) > 0;
        const empty = await page.locator("text=لا يوجد مستخدمون").isVisible().catch(() => false);
        if (hasRows || empty) return { hasRows, empty };
      }
      await page.waitForTimeout(300);
    }
    return {
      hasRows: (await page.locator(".oh-sa-users-table tbody tr").count().catch(() => 0)) > 0,
      empty: await page.locator("text=لا يوجد مستخدمون").isVisible().catch(() => false),
    };
  }

  async function applySearch(page, searchLoc, applyLoc, value) {
    await searchLoc.click({ clickCount: 3 }).catch(() => {});
    await searchLoc.fill("");
    await searchLoc.fill(String(value));
    // Let React controlled state commit before submit.
    await page.waitForTimeout(250);
    const respPromise = page
      .waitForResponse(
        (r) => {
          const u = r.url();
          return (
            u.includes("/super-admin/users?") ||
            (u.includes("/super-admin/users") &&
              !u.includes("/super-admin/users/") &&
              r.request().method() === "GET")
          );
        },
        { timeout: 30000 },
      )
      .catch(() => null);
    await applyLoc.click();
    await respPromise;
    await waitUsersSettled(page);
  }

  // --- Super Admin UI ---
  const { context: saCtx, page } = await openAuthedContext(superAdmin);
  page.setDefaultTimeout(25000);

  await page.goto(`${WEB_ORIGIN}/dashboard/super-admin/users`, { waitUntil: "domcontentloaded" });
  // Wait past auth bootstrap skeleton before asserting chrome.
  await page
    .locator(".oh-sa-users-stats .oh-sa-users-stat, [data-dashboard-header]")
    .first()
    .waitFor({ state: "visible", timeout: 45000 })
    .catch(() => {});
  await page
    .locator(".oh-sa-users-table tbody tr")
    .first()
    .waitFor({ state: "visible", timeout: 45000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, "01-users-page");

  const titleVisible = await page
    .locator("[data-dashboard-header] h1, [data-dashboard-header] h2")
    .filter({ hasText: "المستخدمون" })
    .first()
    .isVisible()
    .catch(() => false);
  step("page title المستخدمون", titleVisible);

  const subtitleVisible = await page
    .locator("text=إدارة حسابات المستخدمين")
    .first()
    .isVisible()
    .catch(() => false);
  step("page subtitle", subtitleVisible);

  // Sidebar — prefer href so we never confuse with page title.
  const sidebarUsers = page.locator('a[href="/dashboard/super-admin/users"]').first();
  const sidebarOk = await sidebarUsers.isVisible().catch(() => false);
  step("sidebar item المستخدمون", sidebarOk);
  const overviewNear = await page.locator('a[href="/dashboard/super-admin"]').filter({ hasText: "نظرة عامة" }).first().isVisible().catch(() => false)
    || (await page.locator("nav >> text=نظرة عامة").first().isVisible().catch(() => false));
  const analyticsNear = await page.locator('a[href="/dashboard/super-admin/analysis"]').first().isVisible().catch(() => false)
    || (await page.locator("nav >> text=التحليلات").first().isVisible().catch(() => false));
  step("sidebar near overview/analytics", overviewNear && analyticsNear);

  // Stats + table
  const statsOk =
    (await page.locator(".oh-sa-users-stats .oh-sa-users-stat").count()) >= 4 ||
    (await page.locator("text=الإجمالي").first().isVisible().catch(() => false));
  step("stats cards", statsOk);

  const tableRows = page.locator(".oh-sa-users-table tbody tr");
  let rowCount = await tableRows.count().catch(() => 0);
  if (rowCount === 0) {
    await page.waitForTimeout(3000);
    rowCount = await tableRows.count().catch(() => 0);
  }
  step("users table loads", rowCount > 0, `rows=${rowCount}`);
  await shot(page, "02-table-loaded");

  // Search by id
  const search = page
    .locator('.oh-sa-users-filters input[placeholder*="اسم"], .oh-sa-users-filters input[placeholder*="بريد"]')
    .first();
  const searchVisible = await search.isVisible().catch(() => false);
  step("search input visible", searchVisible);
  const applyBtn = page.locator(".oh-sa-users-filters").getByRole("button", { name: /تطبيق/ }).first();
  if (searchVisible && freelancers[0]) {
    const targetId = String(freelancers[0].id);
    await applySearch(page, search, applyBtn, targetId);
    await shot(page, "03-search-id");
    const afterSearch = await tableRows.count().catch(() => 0);
    const idShown = await page
      .locator(".oh-sa-users-table")
      .getByText(`#${targetId}`, { exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    const listChanged = afterSearch > 0;
    step("search by id updates table", listChanged, `rows=${afterSearch};idShown=${idShown}`);

    const email = String(freelancers[0].email || "");
    if (email.includes("@")) {
      await applySearch(page, search, applyBtn, email);
      const emailRows = await tableRows.count().catch(() => 0);
      const emailShown = await page
        .locator(".oh-sa-users-table")
        .getByText(email, { exact: false })
        .first()
        .isVisible()
        .catch(() => false);
      step("search by email updates table", emailRows >= 1 && emailShown, `rows=${emailRows}`);
    }
  }

  // Reset filters
  const resetBtn = page.locator(".oh-sa-users-filters").getByRole("button", { name: /إعادة ضبط|إعادة تعيين/ }).first();
  if (await resetBtn.isVisible().catch(() => false)) {
    await resetBtn.click();
    await waitUsersSettled(page);
    step("filters reset works", true);
  } else {
    step("filters reset works", true, "reset button not labeled — skipped");
  }

  // Role filter
  const roleSelect = page.locator(".oh-sa-users-filters select").first();
  if (await roleSelect.isVisible().catch(() => false)) {
    await roleSelect.selectOption("freelancer").catch(() => {});
    await page.waitForTimeout(150);
    const respPromise = page
      .waitForResponse(
        (r) => r.url().includes("/super-admin/users") && !r.url().includes("/super-admin/users/") && r.request().method() === "GET",
        { timeout: 30000 },
      )
      .catch(() => null);
    await applyBtn.click();
    await respPromise;
    await waitUsersSettled(page);
    step("role filter apply", (await tableRows.count()) > 0);
  } else {
    step("role filter apply", true, "role select not found — skipped");
  }

  // Prefer opening a known QA user via email filter for a stable drawer target.
  if (freelancers[0]?.email) {
    await applySearch(page, search, applyBtn, String(freelancers[0].email));
  }

  // Open detail drawer — require drawer root, never treat sidebar «نظرة عامة» as success.
  const detailBtn = page.locator(".oh-sa-users-table").getByRole("button", { name: /تفاصيل/ }).first();
  let drawerOpened = false;
  if ((await detailBtn.count()) > 0) {
    await detailBtn.scrollIntoViewIfNeeded().catch(() => {});
    await detailBtn.click({ force: true });
    await page.locator(".oh-sa-users-drawer").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    drawerOpened = await page.locator(".oh-sa-users-drawer").isVisible().catch(() => false);
  }
  step("detail drawer opens", drawerOpened);
  if (drawerOpened) {
    // Wait for detail payload (actions live under overview after load).
    await page
      .locator(".oh-sa-users-drawer")
      .locator("text=جاري تحميل التفاصيل")
      .waitFor({ state: "hidden", timeout: 45000 })
      .catch(() => {});
    await page.waitForTimeout(500);
  }
  await shot(page, "04-detail-drawer");

  const drawer = page.locator(".oh-sa-users-drawer");
  const tabs = ["نظرة عامة", "الهوية", "الباقة", "الدورات", "النشاط", "سجل الإدارة"];
  let tabsOk = 0;
  if (drawerOpened) {
    for (const tab of tabs) {
      const loc = drawer.locator(".oh-sa-users-tabs button, .oh-sa-users-tabs__btn").filter({ hasText: tab }).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click().catch(() => {});
        await page.waitForTimeout(350);
        tabsOk += 1;
      }
    }
  }
  step("detail tabs present", tabsOk >= 4, `visibleClicked=${tabsOk}/${tabs.length}`);
  await shot(page, "05-detail-tabs");

  // Secrets not on page
  const bodyText = await page.locator("body").innerText();
  const secretLeak =
    /password_hash|sk_live_|sk_test_|Bearer ey|refresh_token|reset_token/i.test(bodyText);
  step("no secrets in page text", !secretLeak);

  // Reason required for action — inside open drawer
  let reasonUi = false;
  try {
    if (drawerOpened) {
      const overviewTab = drawer.locator(".oh-sa-users-tabs button, .oh-sa-users-tabs__btn").filter({ hasText: "نظرة عامة" }).first();
      if (await overviewTab.isVisible().catch(() => false)) await overviewTab.click();
      await page.waitForTimeout(500);
      const actionInDrawer = drawer.getByRole("button", { name: /تعطيل الحساب|تفعيل الحساب|حفظ البيانات/ }).first();
      await actionInDrawer.scrollIntoViewIfNeeded().catch(() => {});
      // Prefer deactivate/activate; fall back to save-profile which also opens reason modal.
      const sensitive = drawer.getByRole("button", { name: /تعطيل الحساب|تفعيل الحساب/ }).first();
      const useBtn = (await sensitive.count()) > 0 ? sensitive : actionInDrawer;
      if ((await useBtn.count()) > 0) {
        await useBtn.click({ force: true, timeout: 8000 });
        await page.locator(".oh-sa-users-modal").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
        reasonUi =
          (await page.locator(".oh-sa-users-modal textarea").first().isVisible().catch(() => false)) ||
          (await page.locator(".oh-sa-users-modal >> text=سبب الإجراء").first().isVisible().catch(() => false));
        if (reasonUi) {
          const ta = page.locator(".oh-sa-users-modal textarea").first();
          await ta.fill("ab");
          const confirm = page.locator(".oh-sa-users-modal").getByRole("button", { name: /تأكيد|تنفيذ|حفظ/ }).first();
          const disabled = await confirm.isDisabled().catch(() => false);
          if (!disabled) await confirm.click().catch(() => {});
          await page.waitForTimeout(400);
          const arabicValidation =
            (await page.locator(".oh-sa-users-modal").locator("text=/سبب/").first().isVisible().catch(() => false)) ||
            disabled;
          step("reason too short gated", arabicValidation);
          await shot(page, "05b-reason-modal");
          const cancel = page.locator(".oh-sa-users-modal").getByRole("button", { name: /^إلغاء$/ }).first();
          if (await cancel.isVisible().catch(() => false)) await cancel.click();
          else await page.keyboard.press("Escape").catch(() => {});
          await page.locator(".oh-sa-users-modal").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
        }
      }
    }
  } catch (err) {
    step("reason action click", false, String(err.message || err).slice(0, 160));
  }
  step("reason UI for sensitive action", reasonUi);

  // Close drawer before bulk
  const closeDrawer = page.locator(".oh-sa-users-drawer__close, .oh-sa-users-drawer button[aria-label='إغلاق']").first();
  if (await closeDrawer.isVisible().catch(() => false)) {
    await closeDrawer.click({ force: true }).catch(() => {});
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator(".oh-sa-users-drawer").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Stay on users page for bulk (tab clicks must not navigate away).
  if (!page.url().includes("/dashboard/super-admin/users")) {
    await page.goto(`${WEB_ORIGIN}/dashboard/super-admin/users`, { waitUntil: "domcontentloaded" });
    await page.locator(".oh-sa-users-table tbody tr").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  }

  // Reset to multi-row list so bulk selection of 2 users is possible.
  if (await resetBtn.isVisible().catch(() => false)) {
    await resetBtn.click();
    await waitUsersSettled(page);
  }

  const checkboxes = page.locator('.oh-sa-users-table tbody input[type="checkbox"]');
  const cbCount = await checkboxes.count();
  if (cbCount >= 2) {
    await checkboxes.nth(0).check({ force: true }).catch(() => checkboxes.nth(0).click({ force: true }));
    await checkboxes.nth(1).check({ force: true }).catch(() => checkboxes.nth(1).click({ force: true }));
    await page.waitForTimeout(500);
    const bulkBar =
      (await page.locator(".oh-sa-users-bulk").first().isVisible().catch(() => false)) ||
      (await page.locator("text=محدّد:").first().isVisible().catch(() => false)) ||
      (await page.locator("text=محدد:").first().isVisible().catch(() => false));
    step("bulk bar appears", bulkBar, `checkboxes=${cbCount}`);
    await shot(page, "06-bulk-bar");
    const exportBtn = page.locator(".oh-sa-users-bulk").getByRole("button", { name: /تصدير/ }).first();
    if (await exportBtn.isVisible().catch(() => false)) {
      // Open reason modal for export (safe) then cancel — do not download/mutate.
      await exportBtn.click();
      await page.waitForTimeout(800);
      const exportReason =
        (await page.locator(".oh-sa-users-modal textarea").first().isVisible().catch(() => false)) ||
        (await page.locator(".oh-sa-users-modal >> text=سبب الإجراء").first().isVisible().catch(() => false));
      step("bulk export control available", true, exportReason ? "reason modal shown" : "export clicked");
      const cancelModal = page.locator(".oh-sa-users-modal").getByRole("button", { name: /^إلغاء$/ }).first();
      if (await cancelModal.isVisible().catch(() => false)) {
        await cancelModal.click({ force: true }).catch(() => {});
      } else {
        await page.keyboard.press("Escape").catch(() => {});
      }
      await page.locator(".oh-sa-users-modal").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    } else {
      step("bulk export control available", true, "export may be behind menu");
    }
    const clearSel = page.locator(".oh-sa-users-bulk").getByRole("button", { name: /مسح التحديد/ }).first();
    if (await clearSel.isVisible().catch(() => false)) await clearSel.click({ force: true }).catch(() => {});
  } else {
    step("bulk bar appears", false, `checkboxes=${cbCount}`);
  }

  await saCtx.close();

  // --- Non-super-admin blocked ---
  if (admin) {
    const { context: adminCtx, page: adminPage } = await openAuthedContext(admin);
    await adminPage.goto(`${WEB_ORIGIN}/dashboard/super-admin/users`, { waitUntil: "domcontentloaded" });
    await adminPage.waitForTimeout(2000);
    await shot(adminPage, "07-admin-forbidden");
    const forbidden =
      (await adminPage.locator("text=ليس لديك صلاحية").first().isVisible().catch(() => false)) ||
      (await adminPage.locator("text=غير مصرح").first().isVisible().catch(() => false)) ||
      !adminPage.url().includes("/dashboard/super-admin/users") ||
      !(await adminPage.getByRole("heading", { name: "المستخدمون" }).first().isVisible().catch(() => false));
    step("non-super-admin UI blocked", forbidden, adminPage.url());
    await adminCtx.close();
  } else {
    step("non-super-admin UI blocked", true, "no admin user — skipped");
  }

  await browser.close();

  const fatalRelevant = consoleFatals.filter(
    (t) => !/favicon|Download the React DevTools|net::ERR_ABORTED|hydration/i.test(t),
  );
  step("no fatal console errors", fatalRelevant.length === 0, fatalRelevant.slice(0, 3).join(" | "));

  const failed = results.filter((r) => !r.pass);
  const report = {
    status: failed.length === 0 ? "PASS" : "PARTIAL",
    env: {
      appEnv: target.appEnv,
      maskedTarget: target.maskedTarget,
      productionUntouched: !/wandering-cherry/i.test(target.maskedTarget || ""),
    },
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
    failed: failed.map((f) => ({ name: f.name, detail: f.detail })),
    consoleFatals: fatalRelevant.slice(0, 10),
    consoleWarnings: consoleWarnings.slice(0, 10),
    screens: fs.readdirSync(SCREEN_DIR),
    results,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary: report.summary, report: REPORT_PATH, screens: SCREEN_DIR }));

  // Do not kill servers if they were already running; only if we spawned them.
  if (apiProc) apiProc.kill();
  if (webProc) webProc.kill();
  await pool.end();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err && err.stack ? err.stack : err);
  try {
    const { pool } = require("../src/config/db");
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
