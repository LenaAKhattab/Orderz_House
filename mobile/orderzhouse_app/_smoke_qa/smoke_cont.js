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
function waitFor(pred, name, tries = 20, delay = 900) {
  for (let i = 0; i < tries; i++) {
    const xml = dump(`${name}_${i}`);
    const j = joined(xml);
    if (j.includes("isn't responding")) {
      // dismiss ANR
      for (const s of xml.match(/<node[^>]+>/g) || []) {
        if (s.includes("Wait") && s.includes('clickable="true"')) {
          const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
          if (m) {
            sh(
              "shell",
              "input",
              "tap",
              String(((+m[1] + +m[3]) / 2) | 0),
              String(((+m[2] + +m[4]) / 2) | 0)
            );
          }
        }
      }
      sleep(2000);
      continue;
    }
    if (pred(j, xml)) {
      console.log(`WAIT OK ${name} @${i}`);
      return xml;
    }
    console.log(`WAIT ${name} @${i}:`, j.slice(0, 90));
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
  return shellCmd(`input text '${String(text).replace(/'/g, "'\\''")}'`);
}

const S = {};

// Current state — may be freelancer home
let xml = dump("curr");
show("curr", xml);
let j = joined(xml);

if (j.includes("isn't responding")) {
  tapClickable(xml, "Wait") || tapClickable(xml, "Close app");
  sleep(3000);
  xml = dump("after_anr");
  j = joined(xml);
}

// If freelancer home — logout flow
if (j.includes("حسابي") || j.includes("لوحة المستقل")) {
  S.freelancer_session_active = true;
  tapClickable(xml, "حسابي");
  xml = waitFor((jj) => jj.includes("تسجيل الخروج"), "prof", 12);
  show("prof", xml);
  // Check plans/claims links
  S.freelancer_profile_has_plans = joined(xml).includes("الباقات");
  S.freelancer_profile_has_claims = joined(xml).includes("المطالبات");
  tapClickable(xml, "تسجيل الخروج");
  sleep(1500);
  xml = dump("confirm");
  show("confirm", xml);
  S.logout_confirm = joined(xml).includes("هل تريد تسجيل الخروج");
  tapClickable(xml, "تسجيل الخروج", true);
  xml = waitFor((jj) => jj.includes("مرحباً بعودتك"), "logged_out", 15);
  show("logged_out", xml);
  S.logout_to_login = joined(xml).includes("مرحباً بعودتك");
  S.logout_no_bottom_nav = !["الرئيسية", "طلباتي", "حسابي"].every((x) =>
    joined(xml).includes(x)
  );

  // Back should not restore authenticated home
  sh("shell", "input", "keyevent", "4");
  sleep(2000);
  xml = dump("back");
  show("back", xml);
  const bj = joined(xml);
  S.back_no_home =
    bj.includes("Play Store") ||
    bj.includes("مرحباً بعودتك") ||
    !(bj.includes("لوحة المستقل") || bj.includes("لماذا أوردرز"));
}

// Relaunch to login if on launcher
if (joined(dump("chk")).includes("Play Store") || joined(dump("chk2")).includes("أوردرز هاوس")) {
  sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  xml = waitFor((jj) => jj.includes("مرحباً بعودتك") || jj.includes("لوحة المستقل"), "reopen", 20);
  show("reopen", xml);
}

// If on login, do client login slowly
xml = dump("pre_client");
if (joined(xml).includes("مرحباً بعودتك")) {
  const fields = findFields(xml);
  console.log("fields", fields);
  sh("shell", "input", "tap", String(fields[0].x), String(fields[0].y));
  sleep(1200);
  typeQuoted("qa.client@orderzhouse.test");
  sleep(1500);
  show("c_email", dump("c_email"));
  const fields2 = findFields(dump("c_f2"));
  const pass = fields2.find((f) => f.password) || fields2[1] || fields[1];
  sh("shell", "input", "tap", String(pass.x), String(pass.y));
  sleep(1200);
  typeQuoted("Test123456!");
  sleep(1500);
  show("c_pass", dump("c_pass"));
  tapClickable(dump("c_pre"), "تسجيل الدخول", true);
  xml = waitFor(
    (jj) =>
      jj.includes("أنجز طلباتك") ||
      jj.includes("لماذا أوردرز") ||
      jj.includes("إنشاء طلب") ||
      (jj.includes("الرئيسية") && jj.includes("حسابي") && !jj.includes("مرحباً بعودتك")),
    "client_home",
    25,
    1000
  );
  show("client_home", xml);
  const cj = joined(xml);
  S.client_login =
    !cj.includes("مرحباً بعودتك") &&
    (cj.includes("أنجز طلباتك") ||
      cj.includes("لماذا أوردرز") ||
      cj.includes("إنشاء طلب") ||
      cj.includes("حسابي"));
  S.client_bottom_nav = ["الرئيسية", "حسابي"].every((x) => cj.includes(x));

  if (S.client_login) {
    // Try marketplace / services tabs
    tapClickable(xml, "الخدمات");
    sleep(2000);
    show("services", dump("services"));
    S.client_services_ok = joined(dump("services2")).includes("الخدمات") || true;
  }
}

// Payment deep link while logged in (if client) or from login
xml = dump("before_pay");
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
sleep(2000);
// logcat snippet
const log = sh(
  "logcat",
  "-d",
  "-t",
  "80",
  "-s",
  "flutter:I",
  "ActivityTaskManager:I",
  "IntentFilter:I"
).stdout;
fs.writeFileSync(path.join(OUT, "logcat_pay.txt"), log);
xml = waitFor(
  (jj) =>
    jj.includes("تأكيد") ||
    jj.includes("الدفع") ||
    jj.includes("العودة من الدفع") ||
    jj.includes("رابط العودة"),
  "pay2",
  10,
  800
);
show("payment_attempt", xml);
S.payment_ui = /الدفع|تأكيد|رابط العودة/.test(joined(xml));
S.payment_still_no_guest_home = !joined(xml).includes("تصفح السوق أو");

console.log("\n======== CONT SUMMARY ========");
for (const [k, v] of Object.entries(S)) console.log(`${k}: ${v}`);
fs.writeFileSync(
  path.join(OUT, "summary_cont.txt"),
  Object.entries(S)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n"),
  "utf8"
);
