/** Focused login + logout + payment smoke continuation. */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ADB = path.join(
  process.env.LOCALAPPDATA || "",
  "Android",
  "Sdk",
  "platform-tools",
  "adb.exe"
);
const PKG = "com.orderzhouse.orderzhouse_app";
const OUTDIR = __dirname;

function sh(...args) {
  return spawnSync(ADB, args, { encoding: "utf8" });
}
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function dump(name) {
  sh("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = sh("exec-out", "cat", "/sdcard/ui.xml").stdout || "";
  fs.writeFileSync(path.join(OUTDIR, `${name}.xml`), xml, "utf8");
  return xml;
}
function unescapeHtml(s) {
  return s.replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
}
function texts(xml) {
  const out = [];
  for (const m of xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)) {
    const t = unescapeHtml(m[1]).trim();
    if (t) out.push(t);
  }
  return [...new Set(out)];
}
function show(label, xml) {
  console.log(`==== ${label} ====`);
  const ts = texts(xml);
  ts.forEach((t) => console.log(" -", t.replace(/\n/g, " / ")));
  const j = ts.join(" | ");
  const flags = {
    login: j.includes("مرحباً بعودتك") || (j.includes("تسجيل الدخول") && j.includes("إنشاء حساب")),
    bottomNav: ["الرئيسية", "الخدمات", "طلباتي", "حسابي"].some((x) => j.includes(x)),
    home: j.includes("أنجز طلباتك") || j.includes("إنشاء طلب جديد") || j.includes("لماذا أوردرز"),
    freelancer: j.includes("تصفح سوق الطلبات") || (j.includes("السوق") && j.includes("طلباتي")),
    logoutConfirm: j.includes("هل تريد تسجيل الخروج"),
    paymentGuest: j.includes("تأكيد حالة الدفع") || j.includes("تسجيل الدخول لتأكيد الدفع"),
    guestBrowse: j.includes("تصفح سوق الطلبات") && j.includes("تسجيل الدخول") && !j.includes("طلباتي"),
  };
  console.log(flags);
  return { ts, flags, j };
}
function nodes(xml) {
  return xml.match(/<node[^>]+>/g) || [];
}
function bounds(node) {
  const m = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) return null;
  return {
    x: ((+m[1] + +m[3]) / 2) | 0,
    y: ((+m[2] + +m[4]) / 2) | 0,
    y2: +m[4],
  };
}
function tapNeedle(xml, needle, preferBottom = false) {
  const c = [];
  for (const s of nodes(xml)) {
    if (!unescapeHtml(s).includes(needle)) continue;
    if (!s.includes('clickable="true"')) continue;
    const b = bounds(s);
    if (b) c.push(b);
  }
  if (!c.length) {
    for (const s of nodes(xml)) {
      if (!unescapeHtml(s).includes(needle)) continue;
      const b = bounds(s);
      if (b) c.push(b);
    }
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
function launch() {
  sh("shell", "am", "force-stop", PKG);
  sleep(400);
  sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  sleep(5000);
}
function typeEmail(email) {
  // Split around @ — KEYCODE_AT = 77
  const [local, domain] = email.split("@");
  sh("shell", "input", "text", local);
  sh("shell", "input", "keyevent", "77");
  sh("shell", "input", "text", domain);
}
function typePassword(pw) {
  // Test123456! → text + SHIFT+1 for !
  const base = pw.endsWith("!") ? pw.slice(0, -1) : pw;
  sh("shell", "input", "text", base);
  if (pw.endsWith("!")) {
    // META: KEYCODE_SHIFT_LEFT=59, KEYCODE_1=8
    sh("shell", "input", "keyevent", "--combination", "59", "8");
  }
}
function clearField() {
  for (let i = 0; i < 50; i++) sh("shell", "input", "keyevent", "67");
}
function findFields(xml) {
  const fields = [];
  for (const s of nodes(xml)) {
    if (!(s.includes("EditText") || s.includes('password="true"'))) continue;
    const b = bounds(s);
    if (!b) continue;
    fields.push({ password: s.includes('password="true"'), ...b });
  }
  if (fields.length >= 2) return fields;
  const cand = [];
  for (const s of nodes(xml)) {
    if (!s.includes('clickable="true"')) continue;
    const d = unescapeHtml(s);
    if (d.includes("تسجيل") || d.includes("إنشاء")) continue;
    const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!m) continue;
    const h = +m[4] - +m[2];
    const w = +m[3] - +m[1];
    if (h < 80 || w < 400) continue;
    cand.push({
      password: s.includes('password="true"'),
      x: ((+m[1] + +m[3]) / 2) | 0,
      y: ((+m[2] + +m[4]) / 2) | 0,
    });
  }
  return cand;
}
function doLogin(email, password) {
  const xml = dump("fields");
  const fields = findFields(xml);
  console.log("fields", fields);
  if (fields.length < 2) return false;
  const emailF = fields.find((f) => !f.password) || fields[0];
  const passF = fields.find((f) => f.password) || fields[1];
  sh("shell", "input", "tap", String(emailF.x), String(emailF.y));
  sleep(250);
  clearField();
  typeEmail(email);
  sleep(250);
  sh("shell", "input", "tap", String(passF.x), String(passF.y));
  sleep(250);
  clearField();
  typePassword(password);
  sleep(300);
  tapNeedle(dump("pre_submit"), "تسجيل الدخول", true);
  sleep(5500);
  return true;
}

const summary = {};

// Payment deep link with correct path (/success not /return?status=)
launch();
show("start", dump("start"));
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
sleep(3500);
const pay = show("payment_guest", dump("payment_guest"));
summary.payment_guest_asks_login =
  pay.flags.paymentGuest || pay.flags.login;
summary.payment_no_bottom_nav = !pay.flags.bottomNav;
summary.payment_no_home_browse = !pay.flags.home;

// Client login
launch();
doLogin("qa.client@orderzhouse.test", "Test123456!");
const client = show("client", dump("client"));
summary.client_login = (client.flags.home || client.flags.bottomNav) && !client.flags.login;
summary.client_bottom_nav = client.flags.bottomNav;

if (summary.client_login) {
  tapNeedle(dump("n1"), "حسابي");
  sleep(2000);
  const prof = show("profile", dump("profile"));
  tapNeedle(dump("p2"), "تسجيل الخروج");
  sleep(1000);
  const conf = show("logout_confirm", dump("logout_confirm"));
  summary.logout_confirm = conf.flags.logoutConfirm;
  tapNeedle(dump("p3"), "تسجيل الخروج", true);
  sleep(3000);
  const after = show("after_logout", dump("after_logout"));
  summary.logout_to_login = after.flags.login && !after.flags.bottomNav;

  sh("shell", "input", "keyevent", "4");
  sleep(2000);
  const back = show("back_after_logout", dump("back_after_logout"));
  const launcher = back.ts.some((t) =>
    ["Play Store", "Chrome", "Gmail", "Photos"].includes(t)
  );
  summary.back_no_home =
    launcher || back.flags.login || !(back.flags.home || back.flags.bottomNav);
  summary.back_exited_app = launcher;
}

// Freelancer
launch();
doLogin("qa.freelancer@orderzhouse.test", "Test123456!");
const fl = show("freelancer", dump("freelancer"));
summary.freelancer_login =
  !fl.flags.login && (fl.flags.bottomNav || fl.flags.freelancer || fl.flags.home);

console.log("\n======== FOCUSED SUMMARY ========");
for (const [k, v] of Object.entries(summary)) {
  console.log(`${k}: ${v}`);
}
fs.writeFileSync(
  path.join(OUTDIR, "summary_login.txt"),
  Object.entries(summary)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n"),
  "utf8"
);
