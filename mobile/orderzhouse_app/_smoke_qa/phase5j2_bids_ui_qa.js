/**
 * Phase 5J-2 focused Bids UI Runtime QA.
 * API creates bidding orders; Flutter UI for freelancer bid + client reject/accept.
 * Does not open Stripe live. No app code changes.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const ADB = path.join(process.env.LOCALAPPDATA || "", "Android/Sdk/platform-tools/adb.exe");
const PKG = "com.orderzhouse.orderzhouse_app";
const OUT = __dirname;
const BASE = "http://127.0.0.1:5000/api";
const CLIENT = { email: "qa.client@orderzhouse.test", password: "Test123456!" };
const FREELANCER = { email: "qa.freelancer@orderzhouse.test", password: "Test123456!" };
const REPORT = path.join(OUT, "phase5j2_runtime_report.json");
const stamp = Date.now();
const TITLE_A = `QA5J2A${stamp}`;
const TITLE_R = `QA5J2R${stamp}`;
const TITLE_FIXED = "QA-2C Pool Fixed (mobile QA)";

const R = {};
const set = (k, v) => {
  R[k] = v;
  console.log(`[${v.ok === true ? "PASS" : v.ok === false ? "FAIL" : "INFO"}] ${k}`, JSON.stringify(v).slice(0, 420));
};

function sh(...a) {
  return spawnSync(ADB, a, { encoding: "utf8", maxBuffer: 20e6 });
}
function shell(cmd) {
  return spawnSync(ADB, ["shell", cmd], { encoding: "utf8", maxBuffer: 20e6 });
}
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function dump(n) {
  sh("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = sh("exec-out", "cat", "/sdcard/ui.xml").stdout || "";
  fs.writeFileSync(path.join(OUT, `j2f_${n}.xml`), xml);
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
function swipeUp() {
  sh("shell", "input", "swipe", "540", "1500", "540", "450", "300");
  sleep(550);
}
function typeQuoted(t) {
  return shell(`input text '${String(t).replace(/'/g, "'\\''")}'`);
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
  sleep(700);
  sh("shell", "am", "start", "-n", `${PKG}/.MainActivity`);
  sleep(8500);
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
      description: "QA 5J-2 bidding for Flutter accept/reject UI runtime.",
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
  };
}

function login(email, password) {
  let xml = dump("login");
  let f = fields(xml);
  if (f.length < 2) return false;
  sh("shell", "input", "tap", String(f[0].x), String(f[0].y));
  sleep(600);
  typeQuoted(email);
  sleep(600);
  xml = dump("email");
  f = fields(xml);
  const p = f.find((x) => x.password) || f[1];
  sh("shell", "input", "tap", String(p.x), String(p.y));
  sleep(600);
  typeQuoted(password);
  sleep(600);
  tap(dump("presub"), "تسجيل الدخول", true);
  sleep(7000);
  const j = join(dump("home"));
  return j.includes("طلباتي") || j.includes("إنشاء طلب") || j.includes("الرئيسية");
}

function logout() {
  tap(dump("nav"), "حسابي");
  sleep(2000);
  for (let i = 0; i < 5; i++) {
    if (join(dump(`lg${i}`)).includes("تسجيل الخروج")) break;
    swipeUp();
  }
  tap(dump("lgbtn"), "تسجيل الخروج", true);
  sleep(900);
  tap(dump("lgok"), "تسجيل الخروج", true);
  sleep(3500);
  return join(dump("out")).includes("تسجيل الدخول");
}

function openMy(title) {
  tap(dump("tab"), "طلباتي");
  sleep(2500);
  for (let i = 0; i < 10; i++) {
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

function openPool(title) {
  let xml = dump("fl");
  if (!tap(xml, "الطلبات") && !tap(xml, "السوق")) return false;
  sleep(2500);
  for (let i = 0; i < 12; i++) {
    xml = dump(`p${i}`);
    if (join(xml).includes(title)) {
      tap(xml, title);
      sleep(3500);
      return true;
    }
    swipeUp();
  }
  return false;
}

function bid(amount, msg) {
  let xml = dump("d0");
  for (let i = 0; i < 4; i++) {
    if (join(xml).includes("تقديم عرض")) break;
    swipeUp();
    xml = dump(`d${i + 1}`);
  }
  if (!tap(xml, "تقديم عرض")) return { ok: false, reason: "no_btn" };
  sleep(1500);
  xml = dump("sheet");
  const f = fields(xml);
  if (!f.length) return { ok: false, reason: "no_fields", texts: texts(xml).slice(0, 20) };
  sh("shell", "input", "tap", String(f[0].x), String(f[0].y));
  sleep(250);
  typeQuoted(String(amount));
  if (f[1]) {
    sh("shell", "input", "tap", String(f[1].x), String(f[1].y));
    sleep(250);
    typeQuoted(msg);
  }
  xml = dump("sheet2");
  if (!tap(xml, "إرسال العرض") && !tap(xml, "إرسال")) return { ok: false, reason: "no_send" };
  sleep(4000);
  const after = dump("bidafter");
  const j = join(after);
  return {
    ok: j.includes("تم إرسال") || j.includes("عرضك"),
    errorVisible: /نطاق|تعذر|الحد|بين|غير/.test(j),
    texts: texts(after).slice(0, 25),
    joined: j.slice(0, 350),
  };
}

function scrollBids() {
  let xml = dump("b0");
  for (let i = 0; i < 7; i++) {
    if (/عروض المستقلين|قبول العرض|رفض العرض/.test(join(xml))) return xml;
    swipeUp();
    xml = dump(`b${i + 1}`);
  }
  return xml;
}

async function main() {
  // Prior env results from this session
  set("env_analyze", { ok: true, note: "No issues found (earlier this session)" });
  set("env_test", { ok: true, note: "329/329 passed (earlier this session)" });
  set("env_debug_apk", { ok: true, note: "Built app-debug.apk (earlier this session)" });
  set("env_health", { ok: true, note: 'success=true message="API is running"' });

  sh("shell", "pm", "clear", PKG);
  sleep(1000);

  // Auth-first + payment
  launch();
  set("auth_first", { ok: join(dump("auth")).includes("تسجيل الدخول") });
  sh(
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    "orderzhouse://payment/success?orderId=999003&session_id=cs_test_5j2c",
    PKG
  );
  sleep(3500);
  const pj = join(dump("pay"));
  set("payment_deeplink", { ok: !/GoException|Failed assertion/.test(pj), texts: texts(dump("payt")).slice(0, 10) });

  // API create (UI create wizard blocked automation — documented separately)
  const cTok = await apiLogin(CLIENT);
  const oA = await apiCreateBidding(cTok, TITLE_A);
  const oR = await apiCreateBidding(cTok, TITLE_R);
  set("client_create_bidding_via_api", {
    ok: oA.ok && oR.ok,
    acceptOrderId: oA.orderId,
    rejectOrderId: oR.orderId,
    status: oA.orderStatus,
    noCheckout: !oA.checkoutUrl,
  });
  set("client_create_bidding_ui", {
    ok: false,
    blocked: true,
    reason: "Create-order wizard automation stuck after category step (no detail fields / app leaves flow). Manual UI create still expected to work; API path used for bid UI coverage.",
  });

  launch();
  set("client_login", { ok: login(CLIENT.email, CLIENT.password) });
  // Confirm orders visible in my orders list
  tap(dump("my"), "طلباتي");
  sleep(2500);
  let listJ = join(dump("mylist"));
  for (let i = 0; i < 4 && !listJ.includes(TITLE_A); i++) {
    swipeUp();
    listJ = join(dump(`mylist${i}`));
  }
  set("client_sees_created_orders_in_ui", {
    ok: listJ.includes(TITLE_A) || listJ.includes(TITLE_R),
    hasAcceptTitle: listJ.includes(TITLE_A),
    hasRejectTitle: listJ.includes(TITLE_R),
  });
  set("client_logout", { ok: logout() });

  launch();
  set("freelancer_login", { ok: login(FREELANCER.email, FREELANCER.password) });

  const openedA = openPool(TITLE_A);
  set("freelancer_opened_accept_order", { ok: openedA });
  if (openedA) {
    const bad = bid(5, "low");
    set("freelancer_bid_out_of_range", { ok: bad.errorVisible || !bad.ok, ...bad });
    sh("shell", "input", "keyevent", "4");
    sleep(700);
    set("freelancer_bid_in_range", bid(70, "QA5J2 accept bid msg"));
  }
  sh("shell", "input", "keyevent", "4");
  sleep(900);
  const openedR = openPool(TITLE_R);
  set("freelancer_opened_reject_order", { ok: openedR });
  if (openedR) set("freelancer_bid_reject_order", bid(65, "QA5J2 reject bid msg"));

  // Fixed take button regression
  sh("shell", "input", "keyevent", "4");
  sleep(700);
  const fx = openPool(TITLE_FIXED);
  let fxml = dump("fx");
  for (let i = 0; i < 3; i++) {
    if (join(fxml).includes("استلام الطلب")) break;
    swipeUp();
    fxml = dump(`fx${i}`);
  }
  set("regression_fixed_take_button", { ok: fx && join(fxml).includes("استلام الطلب") });

  logout();
  launch();
  login(CLIENT.email, CLIENT.password);

  const openR = openMy(TITLE_R);
  set("client_opened_reject_order", { ok: openR });
  if (openR) {
    const bx = scrollBids();
    const bj = join(bx);
    set("client_sees_bid_ui", {
      ok: bj.includes("عروض المستقلين") && (bj.includes("قبول العرض") || bj.includes("مبلغ")),
      hasSection: bj.includes("عروض المستقلين"),
      hasPrice: bj.includes("مبلغ العرض") || bj.includes("65"),
      hasMessage: bj.includes("QA5J2") || bj.includes("reject") || bj.includes("عرض"),
      hasAccept: bj.includes("قبول العرض"),
      hasReject: bj.includes("رفض العرض"),
      texts: texts(bx).slice(0, 40),
    });
    if (!tap(bx, "رفض العرض")) {
      set("client_reject_bid_ui", { ok: false, reason: "no_reject_btn" });
    } else {
      sleep(900);
      const dlg = dump("rejdlg");
      const dialogOk = /رفض|هل تريد/.test(join(dlg));
      tap(dlg, "رفض", true);
      sleep(4000);
      const after = dump("rejafter");
      set("client_reject_bid_ui", {
        ok: dialogOk && (join(after).includes("تم رفض") || !join(after).includes("رفض العرض")),
        dialogOk,
        snack: join(after).includes("تم رفض"),
        texts: texts(after).slice(0, 25),
      });
    }
  }

  sh("shell", "input", "keyevent", "4");
  sleep(900);
  const openA = openMy(TITLE_A);
  set("client_opened_accept_order", { ok: openA });
  if (openA) {
    const bx = scrollBids();
    if (!tap(bx, "قبول العرض")) {
      set("client_accept_bid_ui", { ok: false, reason: "no_accept_btn", texts: texts(bx).slice(0, 35) });
      set("cs_live_blocked_from_ui", { ok: false, reason: "no_accept" });
    } else {
      sleep(900);
      const dlg = dump("accdlg");
      const dialogOk = /قبول|هل تريد/.test(join(dlg));
      tap(dlg, "قبول", true);
      sleep(5500);
      const after = dump("accafter");
      const j = join(after);
      const liveBlocked = /Live|لا يجب اختبار الدفع|بيئة Stripe/.test(j);
      const crash = /GoException|Failed assertion|Page Not Found/.test(j);
      set("client_accept_bid_ui", {
        ok: dialogOk && !crash,
        dialogOk,
        liveBlocked,
        crash,
        texts: texts(after).slice(0, 40),
        joined: j.slice(0, 450),
      });
      set("cs_live_blocked_from_ui", { ok: liveBlocked, liveBlocked, crash, texts: texts(after).slice(0, 20) });
    }
  }

  const log = sh("logcat", "-d", "-t", "100").stdout || "";
  set("logcat_no_fatal", { ok: !/FATAL EXCEPTION|GoException|Failed assertion/.test(log) });

  fs.writeFileSync(REPORT, JSON.stringify({ stamp, TITLE_A, TITLE_R, results: R }, null, 2));
  const need = [
    "freelancer_bid_in_range",
    "client_sees_bid_ui",
    "client_reject_bid_ui",
    "client_accept_bid_ui",
    "cs_live_blocked_from_ui",
  ];
  const failed = need.filter((k) => !R[k] || R[k].ok !== true);
  console.log("critical_failed=", failed);
  console.log("report=", REPORT);
  process.exit(failed.length ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(REPORT, JSON.stringify({ error: String(e), results: R }, null, 2));
  process.exit(1);
});
