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
function joined(xml) {
  return texts(xml).join(" | ");
}
function show(label, xml) {
  console.log(`==== ${label} ====`);
  texts(xml).forEach((t) => console.log(" -", t.replace(/\n/g, " / ")));
  return texts(xml);
}
function waitFor(pred, name, tries = 20, delay = 1000) {
  for (let i = 0; i < tries; i++) {
    const xml = dump(`${name}_${i}`);
    const j = joined(xml);
    if (pred(j, xml)) {
      console.log(`WAIT OK ${name} at try ${i}`);
      return xml;
    }
    console.log(`WAIT ${name} try ${i}:`, j.slice(0, 80));
    sleep(delay);
  }
  return dump(`${name}_timeout`);
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
  return shellCmd(`input text '${escaped}'`);
}
function resetToLogin() {
  sh("shell", "pm", "clear", PKG);
  sleep(800);
  sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  return waitFor((j) => j.includes("مرحباً بعودتك"), "login", 25, 800);
}

const S = {};

// 1 Fresh -> login
let xml = resetToLogin();
show("01_fresh", xml);
S.fresh_to_login = joined(xml).includes("مرحباً بعودتك");
S.bottom_nav_hidden = !["الرئيسية", "الخدمات", "طلباتي", "حسابي"].some((x) =>
  joined(xml).includes(x)
);
S.guest_browse_gone = !joined(xml).includes("تصفح سوق") && !joined(xml).includes("الدخول كضيف");
S.register_cta = joined(xml).includes("إنشاء حساب");

// 3 Register
tapClickable(xml, "إنشاء حساب");
xml = waitFor(
  (j) => j.includes("حساب عميل") || (j.includes("إنشاء حساب") && !j.includes("مرحباً بعودتك")),
  "register",
  15,
  700
);
show("02_register", xml);
S.register_opens =
  joined(xml).includes("حساب عميل") ||
  (joined(xml).includes("إنشاء حساب") && !joined(xml).includes("مرحباً بعودتك"));
sh("shell", "input", "keyevent", "4");
xml = waitFor((j) => j.includes("مرحباً بعودتك"), "back_login", 15, 700);
show("03_back", xml);
S.register_back_login = joined(xml).includes("مرحباً بعودتك");
S.no_loop = S.register_opens && S.register_back_login;

// 7 Payment — open while on login (app already past splash)
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
xml = waitFor(
  (j) =>
    j.includes("تأكيد حالة الدفع") ||
    j.includes("تسجيل الدخول لتأكيد الدفع") ||
    j.includes("العودة من الدفع") ||
    j.includes("رابط العودة غير صالح"),
  "payment",
  12,
  800
);
show("04_payment", xml);
const pj = joined(xml);
S.payment_guest_screen =
  pj.includes("تأكيد حالة الدفع") ||
  pj.includes("تسجيل الدخول لتأكيد الدفع") ||
  pj.includes("العودة من الدفع");
S.payment_invalid_or_guest =
  S.payment_guest_screen || pj.includes("رابط العودة غير صالح");
S.payment_not_home_shell =
  !["الرئيسية", "لماذا أوردرز", "الخدمات"].some((x) => pj.includes(x)) ||
  !pj.includes("حسابي");
S.payment_no_bottom_nav = !["الرئيسية", "طلباتي", "حسابي"].every((x) =>
  pj.includes(x)
);
// stronger: not authenticated shell
S.payment_not_browsing =
  !pj.includes("لماذا أوردرز") && !pj.includes("أنجز طلباتك");

// 4 Client login
xml = resetToLogin();
let fields = findFields(xml);
console.log("fields", fields);
sh("shell", "input", "tap", String(fields[0].x), String(fields[0].y));
sleep(1000);
typeQuoted("qa.client@orderzhouse.test");
sleep(1000);
xml = dump("email_ok");
show("email_ok", xml);
fields = findFields(xml);
const pass = fields.find((f) => f.password) || fields[1];
sh("shell", "input", "tap", String(pass.x), String(pass.y));
sleep(1000);
typeQuoted("Test123456!");
sleep(1000);
xml = dump("pass_ok");
show("pass_ok", xml);
tapClickable(xml, "تسجيل الدخول", true);
xml = waitFor(
  (j) =>
    j.includes("أنجز طلباتك") ||
    j.includes("لماذا أوردرز") ||
    j.includes("إنشاء طلب") ||
    (j.includes("الرئيسية") && j.includes("حسابي")),
  "client_home",
  20,
  1000
);
show("05_client", xml);
let cj = joined(xml);
S.client_login =
  (cj.includes("أنجز طلباتك") ||
    cj.includes("لماذا أوردرز") ||
    cj.includes("إنشاء طلب") ||
    (cj.includes("الرئيسية") && cj.includes("حسابي"))) &&
  !cj.includes("مرحباً بعودتك");
S.client_bottom_nav = ["الرئيسية", "حسابي"].every((x) => cj.includes(x));

if (S.client_login) {
  tapClickable(xml, "حسابي");
  xml = waitFor((j) => j.includes("تسجيل الخروج"), "profile", 10, 700);
  show("06_profile", xml);
  tapClickable(xml, "تسجيل الخروج");
  sleep(1200);
  xml = dump("07_confirm");
  show("07_confirm", xml);
  S.logout_confirm = joined(xml).includes("هل تريد تسجيل الخروج");
  tapClickable(xml, "تسجيل الخروج", true);
  xml = waitFor((j) => j.includes("مرحباً بعودتك"), "after_logout", 15, 800);
  show("08_logout", xml);
  S.logout_to_login = joined(xml).includes("مرحباً بعودتك");
  sh("shell", "input", "keyevent", "4");
  sleep(2000);
  xml = dump("09_back");
  show("09_back", xml);
  const bj = joined(xml);
  S.back_no_home =
    bj.includes("Play Store") ||
    bj.includes("مرحباً بعودتك") ||
    !(bj.includes("لماذا أوردرز") || bj.includes("أنجز طلباتك"));
}

// 6 Freelancer
xml = resetToLogin();
fields = findFields(xml);
sh("shell", "input", "tap", String(fields[0].x), String(fields[0].y));
sleep(1000);
typeQuoted("qa.freelancer@orderzhouse.test");
sleep(1000);
xml = dump("fl_email");
fields = findFields(xml);
const pass2 = fields.find((f) => f.password) || fields[1];
sh("shell", "input", "tap", String(pass2.x), String(pass2.y));
sleep(1000);
typeQuoted("Test123456!");
sleep(1000);
tapClickable(dump("fl_pre"), "تسجيل الدخول", true);
xml = waitFor(
  (j) =>
    (j.includes("الرئيسية") && j.includes("حسابي")) ||
    j.includes("تصفح سوق") ||
    j.includes("الباقات"),
  "fl_home",
  20,
  1000
);
show("10_freelancer", xml);
const fj = joined(xml);
S.freelancer_login =
  !fj.includes("مرحباً بعودتك") &&
  (fj.includes("حسابي") || fj.includes("تصفح سوق") || fj.includes("الباقات"));

console.log("\n======== FINAL SMOKE SUMMARY ========");
for (const [k, v] of Object.entries(S)) console.log(`${k}: ${v}`);
fs.writeFileSync(
  path.join(OUT, "summary_wait.txt"),
  Object.entries(S)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n"),
  "utf8"
);
