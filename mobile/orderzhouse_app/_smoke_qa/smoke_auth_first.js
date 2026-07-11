/**
 * Phase 5F-SMOKE — Auth-first runtime smoke QA (no code changes).
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const ADB = path.join(
  process.env.LOCALAPPDATA || "",
  "Android",
  "Sdk",
  "platform-tools",
  "adb.exe"
);
const PKG = "com.orderzhouse.orderzhouse_app";
const OUTDIR = path.join(__dirname);

const RESULTS = {};

function sh(...args) {
  const r = spawnSync(ADB, args, { encoding: "utf8" });
  return { stdout: r.stdout || "", stderr: r.stderr || "", status: r.status };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function dump(name) {
  sh("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const r = sh("exec-out", "cat", "/sdcard/ui.xml");
  const xml = r.stdout || "";
  fs.writeFileSync(path.join(OUTDIR, `${name}.xml`), xml, "utf8");
  return xml;
}

function unescapeHtml(s) {
  return s
    .replace(/&#10;/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function texts(xml) {
  const out = [];
  const re = /(?:text|content-desc)="([^"]*)"/g;
  let m;
  while ((m = re.exec(xml))) {
    const t = unescapeHtml(m[1]).trim();
    if (t) out.push(t);
  }
  return [...new Set(out)];
}

function nodeIter(xml) {
  return xml.match(/<node[^>]+>/g) || [];
}

function boundsOf(node) {
  const m = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) return null;
  return {
    x: Math.floor((Number(m[1]) + Number(m[3])) / 2),
    y: Math.floor((Number(m[2]) + Number(m[4])) / 2),
    y2: Number(m[4]),
  };
}

function tapContaining(xml, needle) {
  for (const s of nodeIter(xml)) {
    if (!unescapeHtml(s).includes(needle)) continue;
    const b = boundsOf(s);
    if (!b) continue;
    console.log(`TAP ${JSON.stringify(needle)} -> ${b.x},${b.y}`);
    sh("shell", "input", "tap", String(b.x), String(b.y));
    return true;
  }
  console.log(`TAP FAIL ${JSON.stringify(needle)}`);
  return false;
}

function flagsFrom(joined, xml) {
  const flags = {
    HAS_LOGIN:
      joined.includes("تسجيل الدخول") || joined.includes("مرحباً بعودتك"),
    HAS_REGISTER_CTA: joined.includes("إنشاء حساب"),
    HAS_CREATE_ACCOUNT_SCREEN: false,
    HAS_BOTTOM_NAV: ["الرئيسية", "الخدمات", "طلباتي", "حسابي"].some((x) =>
      joined.includes(x)
    ),
    HAS_GUEST_BROWSE: ["تصفح سوق الطلبات", "الدخول كضيف", "تصفح السوق أو سجّل"].some(
      (x) => joined.includes(x)
    ),
    HAS_HOME_CLIENT:
      joined.includes("أنجز طلباتك باحتراف") ||
      joined.includes("إنشاء طلب جديد") ||
      joined.includes("لماذا أوردرز هاوس"),
    HAS_FREELANCER: ["تصفح سوق الطلبات", "الباقات", "المطالبات", "السوق"].some(
      (x) => joined.includes(x)
    ),
    HAS_LOGOUT_CONFIRM: joined.includes("هل تريد تسجيل الخروج"),
    HAS_PAYMENT_GUEST:
      joined.includes("تسجيل الدخول لتأكيد الدفع") ||
      joined.includes("تأكيد حالة الدفع"),
  };
  if (
    joined.includes("إنشاء حساب") &&
    joined.includes("كلمة المرور") &&
    !joined.includes("مرحباً بعودتك")
  ) {
    flags.HAS_CREATE_ACCOUNT_SCREEN = true;
  }
  // Register screen often has AppBar "إنشاء حساب" + firstName fields
  if (
    joined.includes("إنشاء حساب") &&
    !joined.includes("مرحباً بعودتك") &&
    (joined.includes("الاسم") ||
      joined.includes("البريد") ||
      xml.includes("EditText"))
  ) {
    flags.HAS_CREATE_ACCOUNT_SCREEN = true;
  }
  return flags;
}

function show(label, xml) {
  console.log(`==== ${label} ====`);
  const ts = texts(xml);
  for (const t of ts) console.log(" -", t.replace(/\n/g, " / "));
  const joined = ts.join(" | ");
  const flags = flagsFrom(joined, xml);
  for (const [k, v] of Object.entries(flags)) console.log(` ${k}: ${v}`);
  RESULTS[label] = { texts: ts, flags };
  return joined;
}

function launchFresh() {
  sh("shell", "am", "force-stop", PKG);
  sleep(500);
  sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  sleep(5000);
}

function openDeepLink(uri) {
  console.log("DEEP LINK:", uri);
  sh("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", uri, PKG);
  sleep(3000);
}

function findEditFields(xml) {
  const fields = [];
  for (const s of nodeIter(xml)) {
    const isEdit = s.includes("EditText") || s.includes('password="true"');
    if (!isEdit) continue;
    const b = boundsOf(s);
    if (!b) continue;
    fields.push({ password: s.includes('password="true"'), ...b, s });
  }
  if (fields.length >= 2) return fields;

  // Flutter candidates: wide clickable empty nodes
  const cand = [];
  for (const s of nodeIter(xml)) {
    if (!s.includes('clickable="true"')) continue;
    const decoded = unescapeHtml(s);
    if (decoded.includes("تسجيل") || decoded.includes("إنشاء")) continue;
    if (s.includes("Button")) continue;
    const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!m) continue;
    const x1 = +m[1],
      y1 = +m[2],
      x2 = +m[3],
      y2 = +m[4];
    const h = y2 - y1,
      w = x2 - x1;
    if (h < 80 || w < 400) continue;
    cand.push({
      password: s.includes('password="true"'),
      x: Math.floor((x1 + x2) / 2),
      y: Math.floor((y1 + y2) / 2),
    });
  }
  return cand;
}

function tapLoginButton(xml) {
  const candidates = [];
  for (const s of nodeIter(xml)) {
    if (!unescapeHtml(s).includes("تسجيل الدخول")) continue;
    if (!s.includes('clickable="true"')) continue;
    const b = boundsOf(s);
    if (!b) continue;
    candidates.push(b);
  }
  if (!candidates.length) return tapContaining(xml, "تسجيل الدخول");
  candidates.sort((a, b) => a.y - b.y);
  const b = candidates[candidates.length - 1];
  console.log(`TAP login button -> ${b.x},${b.y}`);
  sh("shell", "input", "tap", String(b.x), String(b.y));
  return true;
}

function login(email, password) {
  const xml = dump("login_fields");
  show("LOGIN_BEFORE_FILL", xml);
  const fields = findEditFields(xml);
  console.log(
    "FIELDS:",
    fields.map((f) => ({ password: f.password, x: f.x, y: f.y }))
  );
  if (fields.length < 2) {
    console.log("LOGIN FAIL: could not find fields");
    return false;
  }
  const emailField = fields.find((f) => !f.password) || fields[0];
  const passField = fields.find((f) => f.password) || fields[1];

  sh("shell", "input", "tap", String(emailField.x), String(emailField.y));
  sleep(300);
  sh("shell", "input", "keyevent", "KEYCODE_MOVE_END");
  // clear: many DELs
  for (let i = 0; i < 40; i++) sh("shell", "input", "keyevent", "67");
  sh("shell", "input", "text", email.replace(/@/g, "%40"));
  sleep(300);

  sh("shell", "input", "tap", String(passField.x), String(passField.y));
  sleep(300);
  for (let i = 0; i < 40; i++) sh("shell", "input", "keyevent", "67");
  // password with !
  const pr = spawnSync(ADB, ["shell", "input", "text", password], {
    encoding: "utf8",
  });
  if (pr.status !== 0) {
    console.log("password input stderr:", pr.stderr);
    // fallback char by char without !
    spawnSync(ADB, ["shell", "input", "text", "Test123456"], { encoding: "utf8" });
    sh("shell", "input", "text", "!");
  }
  sleep(400);

  tapLoginButton(dump("before_login_tap"));
  sleep(5000);
  return true;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d));
      })
      .on("error", reject);
  });
}

async function main() {
  console.log("ADB devices:\n" + sh("devices").stdout);

  // 1 Fresh
  launchFresh();
  let xml = dump("01_fresh_login");
  show("01_FRESH_INSTALL", xml);
  RESULTS.fresh_goes_to_login = RESULTS["01_FRESH_INSTALL"].flags.HAS_LOGIN;
  RESULTS.bottom_nav_hidden = !RESULTS["01_FRESH_INSTALL"].flags.HAS_BOTTOM_NAV;
  RESULTS.guest_browse_gone = !RESULTS["01_FRESH_INSTALL"].flags.HAS_GUEST_BROWSE;

  // 3 Register
  tapContaining(xml, "إنشاء حساب");
  sleep(2000);
  xml = dump("02_register");
  show("02_REGISTER", xml);
  RESULTS.register_opens =
    RESULTS["02_REGISTER"].flags.HAS_CREATE_ACCOUNT_SCREEN ||
    (RESULTS["02_REGISTER"].texts.join(" ").includes("إنشاء حساب") &&
      !RESULTS["02_REGISTER"].texts.join(" ").includes("مرحباً بعودتك"));
  sh("shell", "input", "keyevent", "4");
  sleep(2000);
  xml = dump("03_back_login");
  show("03_BACK_LOGIN", xml);
  RESULTS.register_back_ok = RESULTS["03_BACK_LOGIN"].flags.HAS_LOGIN;
  RESULTS.no_auth_loop = RESULTS.register_opens && RESULTS.register_back_ok;

  // 7 Payment return (guest)
  openDeepLink(
    "orderzhouse://payment/return?status=success&orderId=999999&session_id=cs_test_smoke"
  );
  xml = dump("04_payment_guest");
  show("04_PAYMENT_RETURN_GUEST", xml);
  RESULTS.payment_return_guest_login =
    RESULTS["04_PAYMENT_RETURN_GUEST"].flags.HAS_PAYMENT_GUEST ||
    RESULTS["04_PAYMENT_RETURN_GUEST"].flags.HAS_LOGIN;
  RESULTS.payment_not_guest_home =
    !RESULTS["04_PAYMENT_RETURN_GUEST"].flags.HAS_GUEST_BROWSE;
  RESULTS.payment_no_bottom_nav =
    !RESULTS["04_PAYMENT_RETURN_GUEST"].flags.HAS_BOTTOM_NAV;

  // Ensure not marketplace/home shell
  const payJoined = RESULTS["04_PAYMENT_RETURN_GUEST"].texts.join(" | ");
  RESULTS.payment_not_browsing =
    !payJoined.includes("لماذا أوردرز") &&
    !RESULTS["04_PAYMENT_RETURN_GUEST"].flags.HAS_BOTTOM_NAV;

  launchFresh();
  sleep(1500);

  try {
    const health = await httpGet("http://127.0.0.1:5000/api/health");
    console.log("API health:", health);
    RESULTS.api_ok = health.includes("API is running");
  } catch (e) {
    console.log("API FAIL", e.message);
    RESULTS.api_ok = false;
  }

  // 4 Client login
  login("qa.client@orderzhouse.test", "Test123456!");
  xml = dump("05_client_home");
  show("05_CLIENT_LOGIN", xml);
  RESULTS.client_login =
    (RESULTS["05_CLIENT_LOGIN"].flags.HAS_HOME_CLIENT ||
      RESULTS["05_CLIENT_LOGIN"].flags.HAS_BOTTOM_NAV) &&
    !RESULTS["05_CLIENT_LOGIN"].flags.HAS_LOGIN;
  RESULTS.client_bottom_nav = RESULTS["05_CLIENT_LOGIN"].flags.HAS_BOTTOM_NAV;

  if (RESULTS.client_login) {
    tapContaining(dump("nav1"), "الخدمات");
    sleep(2000);
    show("05b_SERVICES", dump("05b_services"));
    tapContaining(dump("nav2"), "حسابي");
    sleep(2000);
    xml = dump("06_profile");
    show("06_PROFILE", xml);

    tapContaining(xml, "تسجيل الخروج");
    sleep(1000);
    xml = dump("07_logout_confirm");
    show("07_LOGOUT_CONFIRM", xml);
    RESULTS.logout_confirm = RESULTS["07_LOGOUT_CONFIRM"].flags.HAS_LOGOUT_CONFIRM;

    const candidates = [];
    for (const s of nodeIter(xml)) {
      if (!unescapeHtml(s).includes("تسجيل الخروج")) continue;
      if (!s.includes('clickable="true"')) continue;
      const b = boundsOf(s);
      if (b) candidates.push(b);
    }
    candidates.sort((a, b) => a.y - b.y);
    if (candidates.length) {
      const b = candidates[candidates.length - 1];
      console.log(`CONFIRM LOGOUT ${b.x},${b.y}`);
      sh("shell", "input", "tap", String(b.x), String(b.y));
    }
    sleep(3000);
    xml = dump("08_after_logout");
    show("08_AFTER_LOGOUT", xml);
    RESULTS.logout_to_login = RESULTS["08_AFTER_LOGOUT"].flags.HAS_LOGIN;

    sh("shell", "input", "keyevent", "4");
    sleep(2000);
    xml = dump("09_back_after_logout");
    show("09_BACK_AFTER_LOGOUT", xml);
    const bj = RESULTS["09_BACK_AFTER_LOGOUT"].texts.join(" | ");
    if (bj.includes("Play Store") || bj.includes("Chrome") || bj.includes("Gmail")) {
      RESULTS.back_no_home = true;
      RESULTS.back_exited_app = true;
    } else {
      RESULTS.back_exited_app = false;
      RESULTS.back_no_home =
        RESULTS["09_BACK_AFTER_LOGOUT"].flags.HAS_LOGIN ||
        !(
          RESULTS["09_BACK_AFTER_LOGOUT"].flags.HAS_HOME_CLIENT ||
          RESULTS["09_BACK_AFTER_LOGOUT"].flags.HAS_BOTTOM_NAV
        );
    }
  } else {
    RESULTS.logout_confirm = null;
    RESULTS.logout_to_login = null;
    RESULTS.back_no_home = null;
  }

  // 6 Freelancer
  launchFresh();
  sleep(1500);
  login("qa.freelancer@orderzhouse.test", "Test123456!");
  xml = dump("10_freelancer");
  show("10_FREELANCER_LOGIN", xml);
  RESULTS.freelancer_login =
    (RESULTS["10_FREELANCER_LOGIN"].flags.HAS_BOTTOM_NAV ||
      RESULTS["10_FREELANCER_LOGIN"].flags.HAS_FREELANCER ||
      RESULTS["10_FREELANCER_LOGIN"].flags.HAS_HOME_CLIENT === false) &&
    !RESULTS["10_FREELANCER_LOGIN"].flags.HAS_LOGIN &&
    RESULTS["10_FREELANCER_LOGIN"].flags.HAS_BOTTOM_NAV;

  // If still on login, mark fail clearly
  if (RESULTS["10_FREELANCER_LOGIN"].flags.HAS_LOGIN) {
    RESULTS.freelancer_login = false;
  }

  console.log("\n======== SMOKE SUMMARY ========");
  const keys = [
    "fresh_goes_to_login",
    "bottom_nav_hidden",
    "guest_browse_gone",
    "register_opens",
    "register_back_ok",
    "no_auth_loop",
    "payment_return_guest_login",
    "payment_not_guest_home",
    "payment_no_bottom_nav",
    "payment_not_browsing",
    "api_ok",
    "client_login",
    "client_bottom_nav",
    "logout_confirm",
    "logout_to_login",
    "back_no_home",
    "freelancer_login",
  ];
  const lines = [];
  for (const k of keys) {
    const line = `${k}: ${RESULTS[k]}`;
    console.log(line);
    lines.push(line);
  }
  fs.writeFileSync(path.join(OUTDIR, "summary.txt"), lines.join("\n"), "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
