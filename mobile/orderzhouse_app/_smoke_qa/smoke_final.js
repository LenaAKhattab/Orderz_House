/** Phase 5F-SMOKE login/logout/freelancer/payment with working adb text input. */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ADB = path.join(process.env.LOCALAPPDATA, "Android/Sdk/platform-tools/adb.exe");
const PKG = "com.orderzhouse.orderzhouse_app";
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
    freelancerHome: j.includes("تصفح سوق الطلبات") || (j.includes("السوق") && j.includes("طلباتي")),
    logoutConfirm: j.includes("هل تريد تسجيل الخروج"),
    paymentGuest: j.includes("تأكيد حالة الدفع") || j.includes("تسجيل الدخول لتأكيد الدفع"),
    guestBrowse: j.includes("تصفح سوق الطلبات") && j.includes("ابدأ مع"),
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
  if (!c.length) return false;
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
function typeQuoted(text) {
  // adb shell input text '...' — required for @ and !
  const escaped = text.replace(/'/g, "'\\''");
  return shellCmd(`input text '${escaped}'`);
}
function clearField() {
  for (let i = 0; i < 50; i++) sh("shell", "input", "keyevent", "67");
}
function doLogin(email, password) {
  const xml = dump("fields");
  const fields = findFields(xml);
  console.log("fields", fields);
  if (fields.length < 2) return false;
  const emailF = fields.find((f) => !f.password) || fields[0];
  const passF = fields.find((f) => f.password) || fields[1];

  sh("shell", "input", "tap", String(emailF.x), String(emailF.y));
  sleep(400);
  clearField();
  console.log("email type", typeQuoted(email).stderr);
  sleep(400);

  sh("shell", "input", "tap", String(passF.x), String(passF.y));
  sleep(400);
  clearField();
  console.log("pass type", typeQuoted(password).stderr);
  sleep(400);

  const pre = dump("presubmit");
  console.log("presubmit:", texts(pre).join(" | "));
  tapClickable(pre, "تسجيل الدخول", true);
  sleep(6000);
  return true;
}

const S = {};

// Payment deep link (correct path format)
launch();
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
let pay = show("payment", dump("payment"));
S.payment_guest_ui = pay.flags.paymentGuest;
S.payment_stays_auth_gate = pay.flags.login || pay.flags.paymentGuest;
S.payment_no_shell = !pay.flags.bottomNav && !pay.flags.home;

// Client
launch();
doLogin("qa.client@orderzhouse.test", "Test123456!");
let client = show("client", dump("client"));
S.client_login = (client.flags.home || client.flags.bottomNav) && !client.flags.login;
S.client_bottom_nav = client.flags.bottomNav;

if (S.client_login) {
  // services tab
  tapClickable(dump("n1"), "الخدمات");
  sleep(2000);
  show("services", dump("services"));
  tapClickable(dump("n2"), "حسابي");
  sleep(2000);
  show("profile", dump("profile"));
  tapClickable(dump("lo1"), "تسجيل الخروج");
  sleep(1000);
  const conf = show("logout_confirm", dump("logout_confirm"));
  S.logout_confirm = conf.flags.logoutConfirm;
  tapClickable(dump("lo2"), "تسجيل الخروج", true);
  sleep(3000);
  const after = show("after_logout", dump("after_logout"));
  S.logout_to_login = after.flags.login && !after.flags.bottomNav;

  sh("shell", "input", "keyevent", "4");
  sleep(2000);
  const back = show("back", dump("back"));
  const launcher = back.ts.some((t) =>
    ["Play Store", "Chrome", "Gmail", "Photos", "YouTube"].includes(t)
  );
  S.back_no_home = launcher || after.flags.login
    ? launcher || !(back.flags.home || back.flags.bottomNav)
    : !(back.flags.home || back.flags.bottomNav);
  if (launcher) S.back_no_home = true;
  S.back_exited_app = launcher;
}

// Freelancer
launch();
doLogin("qa.freelancer@orderzhouse.test", "Test123456!");
let fl = show("freelancer", dump("freelancer"));
S.freelancer_login = !fl.flags.login && (fl.flags.bottomNav || fl.flags.freelancerHome || fl.flags.home);
if (S.freelancer_login) {
  tapClickable(dump("fn1"), "السوق") || tapClickable(dump("fn1b"), "الطلبات");
  sleep(2000);
  show("fl_market", dump("fl_market"));
  tapClickable(dump("fn2"), "حسابي");
  sleep(2000);
  const fp = show("fl_profile", dump("fl_profile"));
  S.freelancer_profile_actions =
    fp.j.includes("الباقات") || fp.j.includes("المطالبات") || fp.j.includes("طلباتي");
}

console.log("\n======== LOGIN SMOKE SUMMARY ========");
for (const [k, v] of Object.entries(S)) console.log(`${k}: ${v}`);
fs.writeFileSync(
  path.join(OUT, "summary_final.txt"),
  Object.entries(S)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n") +
    "\n\n--- earlier auth-first ---\n" +
    (fs.existsSync(path.join(OUT, "summary.txt"))
      ? fs.readFileSync(path.join(OUT, "summary.txt"), "utf8")
      : ""),
  "utf8"
);
