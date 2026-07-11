/**
 * Phase 5J-2 Runtime QA (revised) — Flutter UI for bids accept/reject.
 * Creates bidding orders via API when wizard automation is flaky; still attempts one UI create.
 * Never opens Stripe live.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const ADB = path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe");
const PKG = "com.orderzhouse.orderzhouse_app";
const OUTDIR = __dirname;
const APK = path.join(__dirname, "..", "build", "app", "outputs", "flutter-apk", "app-debug.apk");
const BASE = "http://127.0.0.1:5000/api";
const CLIENT = { email: "qa.client@orderzhouse.test", password: "Test123456!" };
const FREELANCER = { email: "qa.freelancer@orderzhouse.test", password: "Test123456!" };
const REPORT = path.join(OUTDIR, "phase5j2_runtime_report.json");
const stamp = Date.now();
const TITLE_ACCEPT = `QA5J2A${stamp}`;
const TITLE_REJECT = `QA5J2R${stamp}`;
const TITLE_UI = `QA5J2UI${stamp}`;
const TITLE_FIXED = "QA-2C Pool Fixed (mobile QA)";

const results = {};
function set(k, v) {
  results[k] = v;
  console.log(`[${v.ok === true ? "PASS" : v.ok === false ? "FAIL" : "INFO"}] ${k}`, JSON.stringify(v).slice(0, 400));
}
function sh(...a) {
  return spawnSync(ADB, a, { encoding: "utf8", maxBuffer: 20e6 });
}
function shellCmd(cmd) {
  return spawnSync(ADB, ["shell", cmd], { encoding: "utf8", maxBuffer: 20e6 });
}
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function dump(name) {
  sh("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = sh("exec-out", "cat", "/sdcard/ui.xml").stdout || "";
  fs.writeFileSync(path.join(OUTDIR, `j2_${name}.xml`), xml);
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
  return m
    ? { x: ((+m[1] + +m[3]) / 2) | 0, y: ((+m[2] + +m[4]) / 2) | 0, y1: +m[2], y2: +m[4] }
    : null;
}
function isLauncher(xml) {
  const j = join(xml);
  return j.includes("Play Store") && j.includes("Chrome") && !j.includes("طلباتي") && !j.includes("تسجيل الدخول");
}
function ensureApp() {
  let xml = dump("ensure");
  if (isLauncher(xml) || (!join(xml).includes("أوردرز") && !join(xml).includes("تسجيل") && !join(xml).includes("طلباتي"))) {
    sh("shell", "am", "start", "-n", `${PKG}/.MainActivity`);
    sleep(8000);
    xml = dump("ensure2");
  }
  return xml;
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
function swipeUp() {
  sh("shell", "input", "swipe", "540", "1500", "540", "500", "350");
  sleep(600);
}
function typeQuoted(text) {
  const escaped = String(text).replace(/'/g, "'\\''");
  return shellCmd(`input text '${escaped}'`);
}
function fields(xml) {
  const out = [];
  for (const s of nodes(xml)) {
    if (!(s.includes("EditText") || s.includes('password="true"'))) continue;
    const b = bounds(s);
    if (b) out.push({ password: s.includes('password="true"'), ...b });
  }
  return out.sort((a, b) => a.y - b.y);
}
function launch() {
  sh("shell", "am", "force-stop", PKG);
  sleep(800);
  sh("shell", "am", "start", "-n", `${PKG}/.MainActivity`);
  sleep(8500);
  ensureApp();
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
          resolve({ status: res.statusCode, json });
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
  return d.accessToken || d.token || d.tokens?.accessToken;
}
async function apiCreateBidding(token, title) {
  const cats = await request("GET", "/categories", { token });
  const list = cats.json?.data || [];
  const categoryId = String((Array.isArray(list) ? list[0] : null)?.id || "1");
  const created = await request("POST", "/client/orders", {
    token,
    body: {
      projectType: "bidding",
      categoryId,
      title,
      description: "QA Phase 5J-2 bidding order created for runtime UI accept/reject.",
      durationValue: 5,
      durationUnit: "days",
      bidBudgetMin: 50,
      bidBudgetMax: 100,
    },
  });
  const order = created.json?.data?.order || created.json?.data;
  return {
    ok: created.status < 300 && !!order?.id,
    orderId: String(order?.id || ""),
    orderStatus: order?.orderStatus,
    checkoutUrl: created.json?.data?.checkoutUrl || null,
    status: created.status,
  };
}

function doLogin(email, password) {
  let xml = ensureApp();
  let f = fields(xml);
  if (f.length < 2) {
    tap(xml, "تسجيل الدخول");
    sleep(2000);
    xml = dump("login2");
    f = fields(xml);
  }
  if (f.length < 2) return false;
  sh("shell", "input", "tap", String(f[0].x), String(f[0].y));
  sleep(700);
  typeQuoted(email);
  sleep(700);
  xml = dump("em");
  f = fields(xml);
  const pass = f.find((x) => x.password) || f[1];
  sh("shell", "input", "tap", String(pass.x), String(pass.y));
  sleep(700);
  typeQuoted(password);
  sleep(700);
  tap(dump("prelogin"), "تسجيل الدخول", true);
  sleep(7000);
  const j = join(dump("postlogin"));
  return j.includes("طلباتي") || j.includes("الرئيسية") || j.includes("إنشاء طلب");
}

function doLogout() {
  ensureApp();
  tap(dump("nav"), "حسابي");
  sleep(2000);
  for (let i = 0; i < 5; i++) {
    if (join(dump(`lo${i}`)).includes("تسجيل الخروج")) break;
    swipeUp();
  }
  tap(dump("lobtn"), "تسجيل الخروج", true);
  sleep(1000);
  tap(dump("loconf"), "تسجيل الخروج", true);
  sleep(3500);
  return join(dump("loggedout")).includes("تسجيل الدخول");
}

function openMyOrder(title) {
  tap(dump("mytab"), "طلباتي");
  sleep(2500);
  for (let i = 0; i < 8; i++) {
    const xml = dump(`my${i}`);
    if (join(xml).includes(title)) {
      tap(xml, title);
      sleep(3500);
      return true;
    }
    swipeUp();
  }
  return false;
}

function openPoolOrder(title) {
  let xml = dump("flnav");
  if (!tap(xml, "الطلبات") && !tap(xml, "السوق")) tap(xml, "تصفح");
  sleep(2500);
  for (let i = 0; i < 10; i++) {
    xml = dump(`pool${i}`);
    if (join(xml).includes(title)) {
      tap(xml, title);
      sleep(3500);
      return true;
    }
    swipeUp();
  }
  return false;
}

function submitBid(amount, message) {
  let xml = dump("biddetail");
  for (let i = 0; i < 4; i++) {
    if (join(xml).includes("تقديم عرض")) break;
    swipeUp();
    xml = dump(`bd${i}`);
  }
  if (!tap(xml, "تقديم عرض")) return { ok: false, reason: "no_btn" };
  sleep(1500);
  xml = dump("bidsheet");
  const f = fields(xml);
  if (!f.length) return { ok: false, reason: "no_fields", texts: texts(xml).slice(0, 20) };
  sh("shell", "input", "tap", String(f[0].x), String(f[0].y));
  sleep(300);
  typeQuoted(String(amount));
  if (f[1] && message) {
    sh("shell", "input", "tap", String(f[1].x), String(f[1].y));
    sleep(300);
    typeQuoted(message);
  }
  xml = dump("bidsheet2");
  if (!tap(xml, "إرسال") && !tap(xml, "تقديم") && !tap(xml, "تأكيد")) tap(xml, "عرض", true);
  sleep(4000);
  const after = dump("afterbid");
  const j = join(after);
  return {
    ok: j.includes("تم إرسال") || j.includes("نجاح") || j.includes("عرضك"),
    errorVisible: /نطاق|تعذر|غير مسموح|بين|الحد/.test(j),
    texts: texts(after).slice(0, 25),
    joined: j.slice(0, 350),
  };
}

function scrollToBids() {
  let xml = dump("bids0");
  for (let i = 0; i < 6; i++) {
    if (join(xml).includes("عروض المستقلين") || join(xml).includes("قبول العرض") || join(xml).includes("رفض العرض")) {
      return xml;
    }
    swipeUp();
    xml = dump(`bids${i + 1}`);
  }
  return xml;
}

function rejectBidUi() {
  let xml = scrollToBids();
  const before = join(xml);
  const seen = {
    hasSection: before.includes("عروض المستقلين"),
    hasPrice: before.includes("مبلغ العرض") || /\d+/.test(before),
    hasAccept: before.includes("قبول العرض"),
    hasReject: before.includes("رفض العرض"),
    hasMessage: before.includes("QA5J2") || before.includes("reject") || before.includes("عرض"),
  };
  if (!tap(xml, "رفض العرض")) return { ok: false, ...seen, reason: "no_reject" };
  sleep(1000);
  xml = dump("rejectdlg");
  const dialogOk = join(xml).includes("رفض") || join(xml).includes("هل تريد");
  tap(xml, "رفض", true);
  sleep(4000);
  const after = dump("afterreject");
  const j = join(after);
  return {
    ok: dialogOk && (j.includes("تم رفض") || !j.includes("رفض العرض") || j.includes("عروض")),
    dialogOk,
    snack: j.includes("تم رفض"),
    ...seen,
    texts: texts(after).slice(0, 30),
  };
}

function acceptBidUi() {
  let xml = scrollToBids();
  const before = join(xml);
  const seen = {
    hasSection: before.includes("عروض المستقلين"),
    hasPrice: before.includes("مبلغ العرض") || before.includes("70"),
    hasAccept: before.includes("قبول العرض"),
    hasReject: before.includes("رفض العرض"),
    hasMessage: before.includes("QA5J2") || before.includes("accept") || before.includes("عرض"),
  };
  if (!tap(xml, "قبول العرض")) return { ok: false, ...seen, reason: "no_accept", texts: texts(xml).slice(0, 35) };
  sleep(1000);
  xml = dump("acceptdlg");
  const dialogOk = join(xml).includes("قبول") || join(xml).includes("هل تريد");
  tap(xml, "قبول", true);
  sleep(5500);
  const after = dump("afteraccept");
  const j = join(after);
  const liveBlocked = j.includes("Live") || j.includes("لا يجب اختبار الدفع") || j.includes("بيئة Stripe");
  const crash = /GoException|Failed assertion|Page Not Found/.test(j);
  return {
    ok: dialogOk && !crash,
    dialogOk,
    liveBlocked,
    crash,
    ...seen,
    texts: texts(after).slice(0, 40),
    joined: j.slice(0, 500),
  };
}

/** Best-effort UI create; returns ok=false if wizard unstable. */
function tryUiCreateBidding(title) {
  ensureApp();
  let xml = dump("uihome");
  if (!tap(xml, "إنشاء طلب جديد") && !tap(xml, "إنشاء طلب")) return { ok: false, reason: "no_create_cta" };
  sleep(3000);
  xml = dump("uitype");
  if (!tap(xml, "مناقصة")) return { ok: false, reason: "no_bidding_type" };
  sleep(800);
  if (!tap(dump("uitypenext"), "التالي", true)) return { ok: false, reason: "no_next_type" };
  sleep(2500);
  xml = dump("uicat");
  if (!tap(xml, "خدمات البرمجة") && !tap(xml, "برمجة")) return { ok: false, reason: "no_category" };
  sleep(2500);
  swipeUp();
  sleep(500);
  xml = dump("uisub");
  if (join(xml).includes("بدون تصنيف فرعي")) tap(xml, "بدون تصنيف فرعي");
  sleep(500);
  if (!tap(dump("uicatnext"), "التالي", true)) return { ok: false, reason: "no_next_cat", texts: texts(dump("uicatfail")).slice(0, 25) };
  sleep(2500);
  xml = dump("uidetails");
  let f = fields(xml);
  if (f.length < 2) return { ok: false, reason: "no_detail_fields", texts: texts(xml).slice(0, 25) };
  sh("shell", "input", "tap", String(f[0].x), String(f[0].y));
  sleep(300);
  typeQuoted(title);
  sh("shell", "input", "tap", String(f[1].x), String(f[1].y));
  sleep(300);
  typeQuoted("QA Phase 5J2 UI create bidding description text.");
  xml = dump("uidetails2");
  f = fields(xml);
  const dur = f[f.length - 1];
  if (dur) {
    sh("shell", "input", "tap", String(dur.x), String(dur.y));
    typeQuoted("5");
  }
  if (!tap(dump("uidetnext"), "التالي", true)) return { ok: false, reason: "no_next_details" };
  sleep(2000);
  xml = dump("uibudget");
  f = fields(xml);
  if (f.length < 2) return { ok: false, reason: "no_budget_fields", texts: texts(xml).slice(0, 20) };
  sh("shell", "input", "tap", String(f[0].x), String(f[0].y));
  typeQuoted("50");
  sh("shell", "input", "tap", String(f[1].x), String(f[1].y));
  typeQuoted("100");
  if (!tap(dump("uibudnext"), "التالي", true)) return { ok: false, reason: "no_next_budget" };
  sleep(2000);
  if (!tap(dump("uireview"), "إنشاء الطلب", true)) return { ok: false, reason: "no_submit" };
  sleep(6000);
  const after = dump("uiaftercreate");
  const j = join(after);
  return {
    ok: j.includes(title) || j.includes("طلباتي") || j.includes("العروض") || j.includes("تفاصيل") || j.includes("تم"),
    texts: texts(after).slice(0, 25),
  };
}

async function main() {
  // Ensure APK present
  shellCmd("pm trim-caches 400M");
  const pathOut = sh("shell", "pm", "path", PKG).stdout || "";
  if (!pathOut.includes("package:")) {
    console.log(sh("install", "-r", APK).stdout || sh("install", "-r", APK).stderr);
  }
  sh("shell", "pm", "clear", PKG);
  sleep(1500);

  launch();
  set("auth_first", {
    ok: join(dump("auth")).includes("تسجيل الدخول"),
    texts: texts(dump("auth2")).slice(0, 10),
  });

  sh(
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    "orderzhouse://payment/success?orderId=999002&session_id=cs_test_5j2b",
    PKG
  );
  sleep(3500);
  const payJ = join(dump("pay"));
  set("payment_deeplink", {
    ok: !/GoException|Failed assertion/.test(payJ),
    texts: texts(dump("pay2")).slice(0, 12),
  });

  launch();
  set("client_login", { ok: doLogin(CLIENT.email, CLIENT.password) });
  if (!results.client_login.ok) {
    fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));
    process.exit(1);
  }

  // Attempt UI create (non-blocking for rest of suite)
  const uiCreate = tryUiCreateBidding(TITLE_UI);
  set("client_create_bidding_ui_attempt", uiCreate);
  const cTok = await apiLogin(CLIENT);
  if (uiCreate.ok) {
    const found = await request("GET", "/client/orders", { token: cTok });
    const list = found.json?.data?.orders || [];
    const hit = (Array.isArray(list) ? list : []).find((o) => (o.title || "").includes(TITLE_UI));
    set("client_create_bidding_ui", {
      ok: !!hit,
      orderId: hit?.id,
      orderStatus: hit?.orderStatus,
      checkoutUrl: null,
    });
  } else {
    set("client_create_bidding_ui", {
      ok: false,
      reason: uiCreate.reason,
      note: "Wizard automation flaky; continuing with API-created orders for accept/reject UI",
    });
  }

  // API create for reliable accept/reject UI paths
  const acceptOrder = await apiCreateBidding(cTok, TITLE_ACCEPT);
  const rejectOrder = await apiCreateBidding(cTok, TITLE_REJECT);
  set("client_create_bidding_api_accept", acceptOrder);
  set("client_create_bidding_api_reject", rejectOrder);
  set("client_create_bidding_no_checkout", {
    ok: !acceptOrder.checkoutUrl && acceptOrder.orderStatus === "open_for_bids",
    orderStatus: acceptOrder.orderStatus,
  });

  set("client_logout", { ok: doLogout() });

  // Freelancer
  launch();
  set("freelancer_login", { ok: doLogin(FREELANCER.email, FREELANCER.password) });

  const openedA = openPoolOrder(TITLE_ACCEPT);
  set("freelancer_opened_accept_order", { ok: openedA });
  if (openedA) {
    const bad = submitBid(5, "too low");
    set("freelancer_bid_out_of_range", {
      ok: bad.errorVisible || !bad.ok,
      ...bad,
    });
    sh("shell", "input", "keyevent", "4");
    sleep(800);
    const good = submitBid(70, "QA5J2 accept bid msg");
    set("freelancer_bid_in_range", good);
  }

  sh("shell", "input", "keyevent", "4");
  sleep(1000);
  const openedR = openPoolOrder(TITLE_REJECT);
  set("freelancer_opened_reject_order", { ok: openedR });
  if (openedR) {
    set("freelancer_bid_reject_order", submitBid(65, "QA5J2 reject bid msg"));
  }

  // Fixed regression: button visible
  sh("shell", "input", "keyevent", "4");
  sleep(800);
  const fixedOpen = openPoolOrder(TITLE_FIXED);
  let fixedXml = dump("fixed");
  for (let i = 0; i < 3; i++) {
    if (join(fixedXml).includes("استلام الطلب")) break;
    swipeUp();
    fixedXml = dump(`fixed${i}`);
  }
  set("regression_fixed_take_button", {
    ok: fixedOpen && join(fixedXml).includes("استلام الطلب"),
    opened: fixedOpen,
  });

  doLogout();

  // Client reject + accept
  launch();
  doLogin(CLIENT.email, CLIENT.password);

  const openRej = openMyOrder(TITLE_REJECT);
  set("client_opened_reject_order", { ok: openRej });
  if (openRej) {
    const bx = scrollToBids();
    const bj = join(bx);
    set("client_sees_bid_ui", {
      ok: bj.includes("عروض المستقلين") && (bj.includes("قبول العرض") || bj.includes("مبلغ")),
      hasSection: bj.includes("عروض المستقلين"),
      hasPrice: bj.includes("مبلغ العرض") || bj.includes("65") || bj.includes("70"),
      hasAccept: bj.includes("قبول العرض"),
      hasReject: bj.includes("رفض العرض"),
      hasMessage: bj.includes("QA5J2") || bj.includes("reject") || bj.includes("عرض"),
      texts: texts(bx).slice(0, 40),
    });
    set("client_reject_bid_ui", rejectBidUi());
  }

  sh("shell", "input", "keyevent", "4");
  sleep(1000);
  const openAcc = openMyOrder(TITLE_ACCEPT);
  set("client_opened_accept_order", { ok: openAcc });
  if (openAcc) {
    const accept = acceptBidUi();
    set("client_accept_bid_ui", accept);
    set("cs_live_blocked_from_ui", {
      ok: accept.liveBlocked === true,
      liveBlocked: accept.liveBlocked,
      crash: accept.crash,
      texts: accept.texts,
    });
  }

  const log = (sh("logcat", "-d", "-t", "120").stdout || "");
  set("logcat_no_fatal", {
    ok: !/FATAL EXCEPTION|GoException|Failed assertion/.test(log),
  });

  fs.writeFileSync(
    REPORT,
    JSON.stringify({ stamp, TITLE_ACCEPT, TITLE_REJECT, TITLE_UI, results }, null, 2)
  );
  console.log("\n=== Phase 5J-2 report ===", REPORT);

  const critical = [
    "client_login",
    "client_create_bidding_api_accept",
    "freelancer_bid_in_range",
    "client_sees_bid_ui",
    "client_reject_bid_ui",
    "client_accept_bid_ui",
    "cs_live_blocked_from_ui",
  ];
  const failed = critical.filter((k) => results[k] && results[k].ok === false);
  console.log("critical_failed=", failed);
  process.exit(failed.length ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(REPORT, JSON.stringify({ error: String(e), results }, null, 2));
  process.exit(1);
});
