const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ADB = path.join(process.env.LOCALAPPDATA, "Android/Sdk/platform-tools/adb.exe");
const PKG = "com.orderzhouse.orderzhouse_app";
const APK = path.join(
  __dirname,
  "..",
  "build/app/outputs/flutter-apk/app-debug.apk"
);
const OUT = __dirname;

function sh(...a) {
  return spawnSync(ADB, a, { encoding: "utf8" });
}
function shellCmd(cmd) {
  return spawnSync(ADB, ["shell", cmd], { encoding: "utf8" });
}
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function dump(name) {
  sh("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = sh("exec-out", "cat", "/sdcard/ui.xml").stdout || "";
  fs.writeFileSync(path.join(OUT, `${name}.xml`), xml);
  return xml;
}
function unescape(s) {
  return s.replace(/&#10;/g, "\n");
}
function texts(xml) {
  return [
    ...new Set(
      [...xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)].map((m) =>
        unescape(m[1]).trim()
      )
    ),
  ].filter(Boolean);
}
function show(label, xml) {
  console.log(`==== ${label} ====`);
  const ts = texts(xml);
  ts.forEach((t) => console.log(" -", t.replace(/\n/g, " / ")));
  const j = ts.join(" | ");
  const flags = {
    login: j.includes("مرحباً بعودتك"),
    bottomNav: ["الرئيسية", "الخدمات", "طلباتي", "حسابي"].some((x) => j.includes(x)),
    home: ["أنجز طلباتك", "إنشاء طلب جديد", "لماذا أوردرز"].some((x) => j.includes(x)),
    freelancer: j.includes("تصفح سوق الطلبات") || j.includes("الباقات"),
    logoutConfirm: j.includes("هل تريد تسجيل الخروج"),
    paymentGuest: j.includes("تأكيد حالة الدفع") || j.includes("تسجيل الدخول لتأكيد الدفع"),
  };
  console.log(flags);
  return { ts, flags, j };
}
function nodes(xml) {
  return xml.match(/<node[^>]+>/g) || [];
}
function bounds(n) {
  const m = n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) return null;
  return { x: ((+m[1] + +m[3]) / 2) | 0, y: ((+m[2] + +m[4]) / 2) | 0 };
}
function findFields(xml) {
  const fields = [];
  for (const s of nodes(xml)) {
    if (!(s.includes("EditText") || s.includes('password="true"'))) continue;
    const b = bounds(s);
    if (b) fields.push({ password: s.includes('password="true"'), ...b });
  }
  return fields;
}
function tapClickable(xml, needle, preferBottom = true) {
  const c = [];
  for (const s of nodes(xml)) {
    if (!unescape(s).includes(needle)) continue;
    if (!s.includes('clickable="true"')) continue;
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
function typeQuoted(text) {
  const escaped = String(text).replace(/'/g, "'\\''");
  const r = shellCmd(`input text '${escaped}'`);
  console.log("typed", text, "status", r.status, "err", (r.stderr || "").trim());
  return r;
}
function resetApp() {
  console.log("pm clear...");
  console.log(sh("shell", "pm", "clear", PKG).stdout.trim());
  sleep(1000);
  sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  sleep(5500);
}
function doLogin(email, password) {
  let xml = dump("login_form");
  let fields = findFields(xml);
  console.log("fields", fields);
  if (fields.length < 2) throw new Error("no fields");
  const emailF = fields.find((f) => !f.password) || fields[0];
  const passF = fields.find((f) => f.password) || fields[1];

  // Email — no clear, fresh app
  sh("shell", "input", "tap", String(emailF.x), String(emailF.y));
  sleep(800);
  typeQuoted(email);
  sleep(800);
  xml = dump("after_email");
  console.log("after email:", texts(xml).join(" | "));

  // Re-find password field (layout may shift)
  fields = findFields(xml);
  const pass2 = fields.find((f) => f.password) || passF;
  sh("shell", "input", "tap", String(pass2.x), String(pass2.y));
  sleep(800);
  typeQuoted(password);
  sleep(800);
  xml = dump("after_pass");
  console.log("after pass:", texts(xml).join(" | "));

  tapClickable(xml, "تسجيل الدخول", true);
  sleep(7000);
}

const S = {};

// Ensure installed
if (!sh("shell", "pm", "path", PKG).stdout.includes("package:")) {
  console.log("installing apk...");
  console.log(sh("install", "-r", APK).stdout || sh("install", "-r", APK).stderr);
}

resetApp();
let fresh = show("fresh", dump("fresh"));
S.fresh_login = fresh.flags.login;
S.bottom_nav_hidden = !fresh.flags.bottomNav;

// Register
tapClickable(dump("r0"), "إنشاء حساب");
sleep(2000);
let reg = show("register", dump("register"));
S.register_ok = reg.j.includes("إنشاء حساب") && !reg.flags.login;
sh("shell", "input", "keyevent", "4");
sleep(2000);
S.register_back = show("reg_back", dump("reg_back")).flags.login;

// Payment deep link from cold
resetApp();
sh(
  "shell",
  "am",
  "start",
  "-a",
  "android.intent.action.VIEW",
  "-d",
  "orderzhouse://payment/success?orderId=999999&session_id=cs_test_smoke",
  PKG
);
sleep(4000);
let pay = show("payment", dump("payment"));
S.payment_guest = pay.flags.paymentGuest;
S.payment_auth_gate = pay.flags.login || pay.flags.paymentGuest;
S.payment_no_app_shell = !pay.flags.bottomNav && !pay.flags.home;

// Client login
resetApp();
doLogin("qa.client@orderzhouse.test", "Test123456!");
let client = show("client", dump("client"));
S.client_login = (client.flags.home || client.flags.bottomNav) && !client.flags.login;
S.client_bottom_nav = client.flags.bottomNav;

if (S.client_login) {
  tapClickable(dump("c1"), "حسابي");
  sleep(2000);
  show("profile", dump("profile"));
  tapClickable(dump("c2"), "تسجيل الخروج");
  sleep(1200);
  S.logout_confirm = show("confirm", dump("confirm")).flags.logoutConfirm;
  tapClickable(dump("c3"), "تسجيل الخروج", true);
  sleep(3500);
  S.logout_to_login = show("logged_out", dump("logged_out")).flags.login;
  sh("shell", "input", "keyevent", "4");
  sleep(2000);
  const back = show("back", dump("back"));
  const launcher = back.ts.some((t) =>
    ["Play Store", "Chrome", "Gmail", "Photos"].includes(t)
  );
  S.back_no_home = launcher || !(back.flags.home || back.flags.bottomNav);
}

// Freelancer
resetApp();
doLogin("qa.freelancer@orderzhouse.test", "Test123456!");
let fl = show("freelancer", dump("freelancer"));
S.freelancer_login = !fl.flags.login && (fl.flags.bottomNav || fl.flags.freelancer || fl.flags.home);

console.log("\n======== SUMMARY ========");
for (const [k, v] of Object.entries(S)) console.log(`${k}: ${v}`);
fs.writeFileSync(
  path.join(OUT, "summary_pmclear.txt"),
  Object.entries(S)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n"),
  "utf8"
);
