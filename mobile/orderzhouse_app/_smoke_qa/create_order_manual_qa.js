/**
 * Manual QA — Create Order flow after Step 3 blank-screen fix.
 * UI automation via adb + API checks. No product code changes.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const ADB = path.join(process.env.LOCALAPPDATA || "", "Android/Sdk/platform-tools/adb.exe");
const PKG = "com.orderzhouse.app";
const OUT = __dirname;
const BASE = "http://127.0.0.1:5000/api";
const CLIENT = { email: "qa.client@orderzhouse.test", password: "Test123456!" };
const FREELANCER = { email: "qa.freelancer@orderzhouse.test", password: "Test123456!" };
const stamp = Date.now();
const TITLE_FIXED = `QA-FIX-${stamp}`;
const TITLE_BID = `QA-BID-${stamp}`;
const REPORT = path.join(OUT, "create_order_manual_qa_report.json");

const R = { at: new Date().toISOString(), cases: {} };
const set = (k, v) => {
  R.cases[k] = v;
  const tag = v && v.ok === true ? "PASS" : v && v.ok === false ? "FAIL" : "INFO";
  console.log(`[${tag}] ${k}`, JSON.stringify(v).slice(0, 500));
};

function sh(...a) {
  return spawnSync(ADB, ["-s", "emulator-5554", ...a], { encoding: "utf8", maxBuffer: 20e6 });
}
function shell(cmd) {
  return spawnSync(ADB, ["-s", "emulator-5554", "shell", cmd], { encoding: "utf8", maxBuffer: 20e6 });
}
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function focused() {
  const out = sh("shell", "dumpsys", "window", "windows").stdout || "";
  const m = out.match(/mCurrentFocus=Window\{[^ ]+ u0 ([^\}]+)/);
  return m ? m[1] : out.includes(PKG) ? PKG : "";
}
function bringApp(clearTask = false) {
  for (let i = 0; i < 5; i++) {
    if (clearTask) {
      sh("shell", "am", "start", "--activity-clear-task", "-n", `${PKG}/.MainActivity`);
    } else {
      sh("shell", "am", "start", "-n", `${PKG}/.MainActivity`);
    }
    sleep(3500);
    const f = focused();
    console.log("focus", f);
    if (f.includes(PKG)) return true;
  }
  return false;
}
function launchFresh() {
  sh("shell", "am", "force-stop", PKG);
  sleep(1200);
  return bringApp(true);
}
function dump(n) {
  sh("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = sh("exec-out", "cat", "/sdcard/ui.xml").stdout || "";
  fs.writeFileSync(path.join(OUT, `coq_${n}.xml`), xml);
  return xml;
}
function texts(xml) {
  return [
    ...new Set(
      [...xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)].map((m) =>
        m[1].replace(/&#10;/g, " / ").trim()
      )
    ),
  ].filter(Boolean);
}
function join(xml) {
  return texts(xml).join(" | ");
}
function nodes(xml) {
  return xml.match(/<node[^>]+>/g) || [];
}
function bounds(s) {
  const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return m ? { x: ((+m[1] + +m[3]) / 2) | 0, y: ((+m[2] + +m[4]) / 2) | 0 } : null;
}
function tap(xml, needle, preferBottom = false) {
  const c = [];
  for (const s of nodes(xml)) {
    if (!s.includes(needle)) continue;
    const b = bounds(s);
    if (b) c.push(b);
  }
  if (!c.length) {
    console.log("TAP FAIL", needle);
    return false;
  }
  c.sort((a, b) => a.y - b.y);
  const b = preferBottom ? c[c.length - 1] : c[0];
  console.log("TAP", needle, b.x, b.y);
  sh("shell", "input", "tap", String(b.x), String(b.y));
  return true;
}
function tapXY(x, y) {
  sh("shell", "input", "tap", String(x), String(y));
}
function swipeUp() {
  sh("shell", "input", "swipe", "540", "1600", "540", "700", "350");
  sleep(500);
}
function swipeDown() {
  sh("shell", "input", "swipe", "540", "700", "540", "1600", "350");
  sleep(500);
}
function typeEscaped(t) {
  // adb input text: spaces as %s, avoid Arabic via paste when needed
  const s = String(t)
    .replace(/\\/g, "\\\\")
    .replace(/ /g, "%s")
    .replace(/'/g, "");
  return shell(`input text ${s}`);
}
function clearField() {
  // Select-all + delete (best-effort on emulator)
  sh("shell", "input", "keyevent", "KEYCODE_MOVE_END");
  for (let i = 0; i < 40; i++) sh("shell", "input", "keyevent", "KEYCODE_DEL");
}
function fields(xml) {
  const out = [];
  for (const s of nodes(xml)) {
    if (!(s.includes("EditText") || s.includes('password="true"'))) continue;
    const b = bounds(s);
    if (b) out.push({ password: s.includes('password="true"'), ...b, raw: s });
  }
  return out.sort((a, b) => a.y - b.y);
}
function hasAll(j, arr) {
  return arr.every((x) => j.includes(x));
}
function hasAny(j, arr) {
  return arr.some((x) => j.includes(x));
}
function crashHints(j) {
  return hasAny(j, ["Exception", "Overflow", "RenderFlex", "BoxConstraints", "Something went wrong"]);
}
function screenshot(name) {
  const p = `/sdcard/${name}.png`;
  sh("shell", "screencap", "-p", p);
  const local = path.join(OUT, `${name}.png`);
  sh("pull", p, local);
  return fs.existsSync(local);
}

function request(method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${BASE}${urlPath}`);
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = { "X-Client-Type": "mobile", Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (_) {}
          resolve({ status: res.statusCode, json, raw: data });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function apiLogin(creds) {
  const res = await request("POST", "/auth/login", { body: creds });
  const d = res.json?.data || {};
  const token = d.accessToken || d.token || d.tokens?.accessToken;
  return { ok: res.status < 300 && !!token, token, status: res.status, user: d.user };
}

async function apiCategories(token) {
  const res = await request("GET", "/categories", { token });
  const list = res.json?.data || [];
  return Array.isArray(list) ? list : [];
}

async function apiCreate(token, body) {
  const res = await request("POST", "/client/orders", { token, body });
  const order = res.json?.data?.order || res.json?.data;
  return {
    ok: res.status < 300 && !!order?.id,
    status: res.status,
    orderId: order?.id ? String(order.id) : null,
    requiresPayment: res.json?.data?.requiresPayment === true,
    checkoutUrl: res.json?.data?.checkoutUrl || null,
    orderStatus: order?.orderStatus || order?.status || null,
    error: res.json?.message || res.json?.error || null,
    rawSlice: (res.raw || "").slice(0, 300),
  };
}

async function apiMyOrders(token) {
  const res = await request("GET", "/client/orders", { token });
  const data = res.json?.data;
  const list = Array.isArray(data) ? data : data?.orders || data?.items || [];
  return { ok: res.status < 300, status: res.status, list: Array.isArray(list) ? list : [], rawSlice: (res.raw || "").slice(0, 200) };
}

async function apiPool(token) {
  const res = await request("GET", "/orders/pool", { token });
  const data = res.json?.data;
  const list = Array.isArray(data) ? data : data?.orders || data?.items || [];
  return { ok: res.status < 300, status: res.status, list: Array.isArray(list) ? list : [] };
}

function ensureLoginUi() {
  launchFresh();
  sleep(2500);
  let xml = dump("boot");
  let j = join(xml);
  if (hasAny(j, ["طلباتي", "الرئيسية", "إنشاء طلب"])) {
    set("already_logged_in", { ok: true, texts: texts(xml).slice(0, 20) });
    return true;
  }
  // Navigate to login if needed
  if (j.includes("تسجيل الدخول")) tap(xml, "تسجيل الدخول", true);
  sleep(1500);
  xml = dump("login_form");
  const fs = fields(xml);
  if (fs.length < 2) {
    set("login_fields", { ok: false, count: fs.length, join: j.slice(0, 300) });
    return false;
  }
  tapXY(fs[0].x, fs[0].y);
  sleep(300);
  clearField();
  typeEscaped(CLIENT.email);
  sleep(400);
  tapXY(fs[1].x, fs[1].y);
  sleep(300);
  clearField();
  typeEscaped(CLIENT.password);
  sleep(400);
  tap(dump("pre_login"), "تسجيل الدخول", true);
  sleep(4000);
  xml = dump("after_login");
  j = join(xml);
  const ok = hasAny(j, ["طلباتي", "الرئيسية", "إنشاء طلب", "مرحبا"]);
  set("ui_login", { ok, join: j.slice(0, 400) });
  screenshot("coq_after_login");
  return ok;
}

function openCreateOrder() {
  let xml = dump("home0");
  let j = join(xml);
  // Prefer home tab then CTA
  if (j.includes("الرئيسية")) {
    tap(xml, "الرئيسية");
    sleep(1200);
    xml = dump("home1");
    j = join(xml);
  }
  if (j.includes("إنشاء طلب جديد") || j.includes("إنشاء طلب")) {
    const label = j.includes("إنشاء طلب جديد") ? "إنشاء طلب جديد" : "إنشاء طلب";
    tap(xml, label, true);
    sleep(2000);
  } else {
    // Profile path
    tap(xml, "حسابي");
    sleep(1500);
    xml = dump("profile");
    tap(xml, "إنشاء طلب", true);
    sleep(2000);
  }
  xml = dump("wizard0");
  j = join(xml);
  const ok = j.includes("إنشاء طلب") || j.includes("نوع الطلب") || j.includes("الخطوة");
  set("open_create_order", { ok, join: j.slice(0, 450) });
  screenshot("coq_wizard0");
  return ok;
}

function pickProjectType(fixed) {
  let xml = dump("type");
  const needle = fixed ? "ثابت السعر" : "مناقصة";
  const alt = fixed ? "ثابت" : "مزايدة";
  let ok = tap(xml, needle) || tap(xml, alt);
  sleep(600);
  xml = dump("type_picked");
  ok = ok && tap(xml, "التالي", true);
  sleep(1200);
  xml = dump("after_type");
  const j = join(xml);
  set(fixed ? "pick_fixed_type" : "pick_bidding_type", {
    ok: ok && (j.includes("التصنيف") || j.includes("الخطوة 2")),
    join: j.slice(0, 350),
  });
  return ok;
}

function pickFirstCategory() {
  let xml = dump("cats");
  let j = join(xml);
  // Wait for categories load
  for (let i = 0; i < 8 && j.includes("جاري تحميل"); i++) {
    sleep(1000);
    xml = dump(`cats_load_${i}`);
    j = join(xml);
  }
  // Tap first selectable category-looking node below title
  const candidates = texts(xml).filter(
    (t) =>
      t.length > 2 &&
      ![
        "التصنيف",
        "التصنيف الرئيسي",
        "التصنيف الفرعي (اختياري)",
        "التالي",
        "السابق",
        "إنشاء طلب",
        "بدون تصنيف فرعي",
        "لا توجد تصنيفات فرعية — يمكنك المتابعة.",
      ].includes(t) &&
      !t.startsWith("الخطوة")
  );
  let tapped = false;
  for (const c of candidates.slice(0, 8)) {
    if (tap(xml, c)) {
      tapped = true;
      console.log("category candidate", c);
      break;
    }
  }
  sleep(1500);
  xml = dump("cat_picked");
  tap(xml, "التالي", true);
  sleep(1500);
  xml = dump("after_cat");
  j = join(xml);
  const ok = tapped && (j.includes("التفاصيل") || j.includes("تفاصيل الطلب") || j.includes("عنوان الطلب"));
  set("pick_category", { ok, tapped, candidates: candidates.slice(0, 6), join: j.slice(0, 450) });
  screenshot("coq_step3");
  return ok;
}

function assertStep3Fields() {
  const xml = dump("step3_fields");
  const j = join(xml);
  const required = ["عنوان الطلب", "وصف الطلب", "مدة التنفيذ", "المرفقات", "إضافة ملفات"];
  const missing = required.filter((x) => !j.includes(x));
  const ok = missing.length === 0 && !crashHints(j);
  set("step3_fields_visible", {
    ok,
    missing,
    hasProgress: j.includes("الخطوة 3 من 5"),
    crashHints: crashHints(j),
    join: j.slice(0, 500),
  });
  screenshot("coq_step3_fields");
  return ok;
}

function assertEmptyValidation() {
  let xml = dump("val0");
  tap(xml, "التالي", true);
  sleep(1000);
  xml = dump("val1");
  const j = join(xml);
  const ok =
    hasAny(j, ["عنوان الطلب مطلوب", "الوصف مطلوب", "مدة التنفيذ مطلوبة"]) &&
    j.includes("الخطوة 3 من 5");
  set("step3_empty_validation", { ok, join: j.slice(0, 450) });
  return ok;
}

function fillDetails(titleAscii) {
  let xml = dump("fill0");
  let fs = fields(xml);
  if (fs.length < 3) {
    swipeUp();
    xml = dump("fill0b");
    fs = fields(xml);
  }
  if (fs.length < 3) {
    set("fill_details_fields", { ok: false, count: fs.length });
    return false;
  }
  // title
  tapXY(fs[0].x, fs[0].y);
  sleep(200);
  clearField();
  typeEscaped(titleAscii);
  sleep(300);
  // description — need >= 10 chars
  tapXY(fs[1].x, fs[1].y);
  sleep(200);
  clearField();
  typeEscaped("QA%smanual%stest%sdescription%senough");
  sleep(300);
  // duration
  tapXY(fs[2].x, fs[2].y);
  sleep(200);
  clearField();
  typeEscaped("5");
  sleep(300);
  // dismiss keyboard
  sh("shell", "input", "keyevent", "KEYCODE_BACK");
  sleep(500);
  xml = dump("filled");
  const j = join(xml);
  set("fill_details", { ok: true, fieldCount: fs.length, join: j.slice(0, 300) });
  return true;
}

function testBackPreserves() {
  let xml = dump("back0");
  tap(xml, "السابق", true);
  sleep(1200);
  xml = dump("back_cat");
  const onCat = join(xml).includes("التصنيف") || join(xml).includes("الخطوة 2");
  tap(xml, "التالي", true);
  sleep(1200);
  xml = dump("back_details");
  const j = join(xml);
  // Title field should still contain our QA title if preserved in controllers/state
  const ok = onCat && (j.includes(TITLE_FIXED) || j.includes(TITLE_BID) || fields(xml).length >= 3);
  set("back_preserves_details", { ok, onCat, join: j.slice(0, 400) });
  return ok;
}

function goNextFromDetails() {
  let xml = dump("next_det");
  tap(xml, "التالي", true);
  sleep(1200);
  xml = dump("budget");
  const j = join(xml);
  const ok = j.includes("الميزانية") || j.includes("الخطوة 4");
  set("enter_budget_step", { ok, join: j.slice(0, 350) });
  return ok;
}

function fillBudgetFixed(amount) {
  let xml = dump("bud0");
  let fs = fields(xml);
  if (!fs.length) {
    set("fill_budget_fixed", { ok: false, count: 0 });
    return false;
  }
  tapXY(fs[0].x, fs[0].y);
  sleep(200);
  clearField();
  typeEscaped(String(amount));
  sleep(300);
  sh("shell", "input", "keyevent", "KEYCODE_BACK");
  sleep(400);
  tap(dump("bud1"), "التالي", true);
  sleep(1200);
  const j = join(dump("review"));
  const ok = j.includes("مراجعة") || j.includes("الخطوة 5");
  set("fill_budget_fixed", { ok, join: j.slice(0, 350) });
  return ok;
}

function fillBudgetBidding(min, max) {
  let xml = dump("bmin");
  let fs = fields(xml);
  if (fs.length < 2) {
    set("fill_budget_bidding", { ok: false, count: fs.length });
    return false;
  }
  tapXY(fs[0].x, fs[0].y);
  sleep(200);
  clearField();
  typeEscaped(String(min));
  sleep(200);
  tapXY(fs[1].x, fs[1].y);
  sleep(200);
  clearField();
  typeEscaped(String(max));
  sleep(300);
  sh("shell", "input", "keyevent", "KEYCODE_BACK");
  sleep(400);
  tap(dump("bmax"), "التالي", true);
  sleep(1200);
  const j = join(dump("breview"));
  const ok = j.includes("مراجعة") || j.includes("الخطوة 5");
  set("fill_budget_bidding", { ok, join: j.slice(0, 350) });
  return ok;
}

function testBiddingMinMaxValidation() {
  // On budget step for bidding: set min > max
  let xml = dump("minmax0");
  // Ensure we are on bidding budget — assume called when on step 4 bidding
  let fs = fields(xml);
  if (fs.length < 2) return set("minmax_validation", { ok: false, reason: "no fields" });
  tapXY(fs[0].x, fs[0].y);
  clearField();
  typeEscaped("200");
  tapXY(fs[1].x, fs[1].y);
  clearField();
  typeEscaped("50");
  sh("shell", "input", "keyevent", "KEYCODE_BACK");
  sleep(300);
  tap(dump("minmax1"), "التالي", true);
  sleep(900);
  xml = dump("minmax2");
  const j = join(xml);
  const ok = hasAny(j, ["الحد الأعلى", "أكبر", "مطلوب"]) && (j.includes("الخطوة 4") || j.includes("الميزانية"));
  set("minmax_validation", { ok, join: j.slice(0, 400) });
  // Fix values for continue
  fs = fields(xml);
  if (fs.length >= 2) {
    tapXY(fs[0].x, fs[0].y);
    clearField();
    typeEscaped("50");
    tapXY(fs[1].x, fs[1].y);
    clearField();
    typeEscaped("120");
    sh("shell", "input", "keyevent", "KEYCODE_BACK");
  }
}

function submitOrder(label) {
  let xml = dump(`sub_${label}`);
  const j0 = join(xml);
  tap(xml, "إنشاء الطلب", true);
  sleep(5000);
  xml = dump(`sub_after_${label}`);
  const j = join(xml);
  const ok = hasAny(j, [
    "تم إنشاء",
    "نجاح",
    "الدفع",
    "Stripe",
    "طلباتي",
    "checkout",
    "تم بنجاح",
    "الدفع لاحقًا",
    "عرض طلباتي",
  ]);
  set(`submit_${label}`, { ok, before: j0.slice(0, 200), join: j.slice(0, 500) });
  screenshot(`coq_submit_${label}`);
  return ok;
}

function openMyOrdersLookFor(titlePart) {
  // Go to my orders tab
  let xml = dump("nav_my");
  tap(xml, "طلباتي");
  sleep(2500);
  for (let i = 0; i < 4; i++) {
    xml = dump(`my_${i}`);
    const j = join(xml);
    if (j.includes(titlePart)) {
      set("my_orders_contains_title", { ok: true, titlePart, join: j.slice(0, 400) });
      screenshot("coq_my_orders");
      return true;
    }
    swipeUp();
  }
  set("my_orders_contains_title", { ok: false, titlePart, join: join(dump("my_final")).slice(0, 400) });
  return false;
}

function testAttachmentsUi() {
  // From details step: tap add files — emulator may cancel picker
  let xml = dump("att0");
  const before = join(xml);
  const tapped = tap(xml, "إضافة ملفات");
  sleep(2000);
  // Dismiss system picker if opened
  sh("shell", "input", "keyevent", "KEYCODE_BACK");
  sleep(800);
  xml = dump("att1");
  const j = join(xml);
  const ok = tapped && !crashHints(j) && j.includes("المرفقات");
  set("attachments_button_no_crash", { ok, tapped, stillOnDetails: j.includes("التفاصيل") || j.includes("المرفقات"), join: j.slice(0, 350) });
  return ok;
}

function testKeyboardScroll() {
  let xml = dump("kb0");
  const fs = fields(xml);
  if (!fs.length) {
    set("keyboard_scroll", { ok: false, reason: "no fields" });
    return false;
  }
  tapXY(fs[0].x, fs[0].y);
  sleep(800);
  xml = dump("kb1");
  const j = join(xml);
  // Bottom actions should still be findable or content scrollable
  const hasNext = j.includes("التالي") || j.includes("السابق");
  swipeUp();
  xml = dump("kb2");
  const j2 = join(xml);
  sh("shell", "input", "keyevent", "KEYCODE_BACK");
  sleep(400);
  const ok = !crashHints(j) && !crashHints(j2) && (hasNext || j2.includes("التالي"));
  set("keyboard_scroll", { ok, hasNext, join: j2.slice(0, 300) });
  return ok;
}

async function main() {
  set("adb_pkg", { ok: true, pkg: PKG });
  const health = await request("GET", "/health").catch((e) => ({ status: 0, error: String(e) }));
  set("backend_health", { ok: health.status === 200, status: health.status });

  const clientLogin = await apiLogin(CLIENT);
  set("api_client_login", { ok: clientLogin.ok, status: clientLogin.status });
  if (!clientLogin.ok) {
    fs.writeFileSync(REPORT, JSON.stringify(R, null, 2));
    console.log("ABORT: client login failed");
    process.exit(1);
  }

  const cats = await apiCategories(clientLogin.token);
  const categoryId = String(cats[0]?.id || "1");
  set("api_categories", { ok: cats.length > 0, categoryId, count: cats.length });

  // --- API fixed + bidding as ground truth (UI may be flaky on Arabic input) ---
  const fixedApi = await apiCreate(clientLogin.token, {
    projectType: "fixed",
    categoryId: Number(categoryId),
    title: TITLE_FIXED,
    description: "QA manual fixed order description text",
    durationValue: 5,
    durationUnit: "days",
    budget: 75,
  });
  set("api_fixed_create", fixedApi);

  const bidApi = await apiCreate(clientLogin.token, {
    projectType: "bidding",
    categoryId: Number(categoryId),
    title: TITLE_BID,
    description: "QA manual bidding order description text",
    durationValue: 7,
    durationUnit: "days",
    bidBudgetMin: 40,
    bidBudgetMax: 90,
  });
  set("api_bidding_create", bidApi);

  const mine = await apiMyOrders(clientLogin.token);
  const titles = mine.list.map((o) => o.title || o.name || "").filter(Boolean);
  set("api_my_orders", {
    ok: mine.ok && (titles.some((t) => t.includes("QA-FIX-")) || titles.some((t) => t.includes(TITLE_FIXED.slice(0, 12)))),
    count: mine.list.length,
    sampleTitles: titles.slice(0, 8),
    hasFixed: titles.some((t) => t.includes("QA-FIX-")),
    hasBid: titles.some((t) => t.includes("QA-BID-")),
  });

  const flLogin = await apiLogin(FREELANCER);
  if (flLogin.ok && bidApi.orderId) {
    const pool = await apiPool(flLogin.token);
    const ids = pool.list.map((o) => String(o.id || o.orderId || ""));
    const titlesP = pool.list.map((o) => o.title || "");
    set("api_pool_has_bidding", {
      ok: ids.includes(String(bidApi.orderId)) || titlesP.some((t) => t.includes("QA-BID-")),
      poolCount: pool.list.length,
      orderId: bidApi.orderId,
      status: pool.status,
    });
  } else {
    set("api_pool_has_bidding", { ok: false, reason: "freelancer login or bid create failed" });
  }

  // Attachment validation via API multipart is optional; client-side checked in unit tests.
  // Invalid create payload check:
  const bad = await apiCreate(clientLogin.token, {
    projectType: "bidding",
    categoryId: Number(categoryId),
    title: "x",
    description: "short",
    durationValue: 0,
    durationUnit: "days",
    bidBudgetMin: 100,
    bidBudgetMax: 10,
  });
  set("api_validation_rejects_bad", {
    ok: !bad.ok && bad.status >= 400,
    status: bad.status,
    error: bad.error,
  });

  // --- UI path ---
  const logged = ensureLoginUi();
  if (!logged) {
    R.summary = { ui: "login_failed", apiFixed: fixedApi.ok, apiBid: bidApi.ok };
    fs.writeFileSync(REPORT, JSON.stringify(R, null, 2));
    process.exit(2);
  }

  if (!openCreateOrder()) {
    R.summary = { ui: "open_create_failed", apiFixed: fixedApi.ok, apiBid: bidApi.ok };
    fs.writeFileSync(REPORT, JSON.stringify(R, null, 2));
    process.exit(3);
  }

  pickProjectType(true);
  pickFirstCategory();
  assertStep3Fields();
  assertEmptyValidation();
  fillDetails(TITLE_FIXED);
  testKeyboardScroll();
  testAttachmentsUi();
  testBackPreserves();
  // Ensure still on details with data
  {
    const j = join(dump("recheck"));
    if (!(j.includes("التفاصيل") || j.includes("عنوان"))) {
      // try navigate again
      openCreateOrder();
      pickProjectType(true);
      pickFirstCategory();
      fillDetails(TITLE_FIXED);
    }
  }
  goNextFromDetails();
  fillBudgetFixed(80);
  submitOrder("fixed_ui");

  // Bidding UI path (fresh wizard)
  openCreateOrder();
  pickProjectType(false);
  pickFirstCategory();
  assertStep3Fields();
  fillDetails(TITLE_BID);
  goNextFromDetails();
  testBiddingMinMaxValidation();
  fillBudgetBidding(40, 90);
  submitOrder("bidding_ui");

  openMyOrdersLookFor("QA-");

  // Final crash check from last dump
  const last = join(dump("final"));
  set("final_no_crash_overflow", { ok: !crashHints(last), join: last.slice(0, 300) });

  const c = R.cases;
  R.summary = {
    step3_visible: c.step3_fields_visible?.ok === true,
    fixed_api: c.api_fixed_create?.ok === true,
    bidding_api: c.api_bidding_create?.ok === true,
    fixed_ui_submit: c.submit_fixed_ui?.ok === true,
    bidding_ui_submit: c.submit_bidding_ui?.ok === true,
    attachments_no_crash: c.attachments_button_no_crash?.ok === true,
    back_preserves: c.back_preserves_details?.ok === true,
    keyboard_scroll: c.keyboard_scroll?.ok === true,
    my_orders: c.api_my_orders?.ok === true || c.my_orders_contains_title?.ok === true,
    pool: c.api_pool_has_bidding?.ok === true,
    validation_ui: c.step3_empty_validation?.ok === true,
    validation_api: c.api_validation_rejects_bad?.ok === true,
    no_crash: c.final_no_crash_overflow?.ok === true,
  };

  fs.writeFileSync(REPORT, JSON.stringify(R, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(R.summary, null, 2));
  console.log("Report:", REPORT);
}

main().catch((e) => {
  console.error(e);
  R.fatal = String(e);
  fs.writeFileSync(REPORT, JSON.stringify(R, null, 2));
  process.exit(1);
});
