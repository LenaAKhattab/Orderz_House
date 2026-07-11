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
}
function waitFor(pred, name, tries = 18, delay = 900) {
  for (let i = 0; i < tries; i++) {
    const xml = dump(`${name}_${i}`);
    const j = joined(xml);
    if (j.includes("isn't responding")) {
      tapAny(xml, "Wait");
      sleep(2500);
      continue;
    }
    if (j.includes("Page Not Found")) {
      tapAny(xml, "Home");
      sleep(1500);
      continue;
    }
    if (pred(j, xml)) {
      console.log(`OK ${name}@${i}`);
      return xml;
    }
    console.log(`${name}@${i}:`, j.slice(0, 100));
    sleep(delay);
  }
  return dump(`${name}_to`);
}
function nodes(xml) {
  return xml.match(/<node[^>]+>/g) || [];
}
function bounds(n) {
  const m = n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) return null;
  return { x: ((+m[1] + +m[3]) / 2) | 0, y: ((+m[2] + +m[4]) / 2) | 0 };
}
function tapAny(xml, needle, preferBottom = true) {
  const c = [];
  for (const s of nodes(xml)) {
    if (!unescape(s).includes(needle)) continue;
    if (!s.includes('clickable="true"') && !needle.includes("Wait")) continue;
    const b = bounds(s);
    if (b) c.push(b);
  }
  if (!c.length) {
    for (const s of nodes(xml)) {
      if (!unescape(s).includes(needle)) continue;
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
function swipeUp() {
  // from mid to top to reveal bottom content
  sh("shell", "input", "swipe", "540", "1800", "540", "700", "400");
  sleep(800);
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
function typeQuoted(text) {
  return shellCmd(`input text '${String(text).replace(/'/g, "'\\''")}'`);
}

const S = {};

// Recover to freelancer profile or home
sh("shell", "am", "force-stop", PKG);
sleep(500);
sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
let xml = waitFor(
  (j) => j.includes("لوحة المستقل") || j.includes("مرحباً بعودتك") || j.includes("حسابي"),
  "boot",
  20
);
show("boot", xml);

if (joined(xml).includes("لوحة المستقل") || joined(xml).includes("حسابي")) {
  tapAny(xml, "حسابي");
  sleep(1500);
  // scroll to logout
  for (let i = 0; i < 4; i++) swipeUp();
  xml = dump("profile_scrolled");
  show("profile_scrolled", xml);
  S.logout_visible = joined(xml).includes("تسجيل الخروج");
  if (S.logout_visible) {
    tapAny(xml, "تسجيل الخروج");
    sleep(1200);
    xml = dump("confirm");
    show("confirm", xml);
    S.logout_confirm = joined(xml).includes("هل تريد تسجيل الخروج");
    // confirm dialog button
    tapAny(xml, "تسجيل الخروج", true);
    xml = waitFor((j) => j.includes("مرحباً بعودتك"), "after_logout", 15);
    show("after_logout", xml);
    S.logout_to_login = joined(xml).includes("مرحباً بعودتك");
    S.bottom_nav_after_logout = ["الرئيسية", "طلباتي", "حسابي"].every((x) =>
      joined(xml).includes(x)
    );

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
}

// Client login from login screen
if (!joined(dump("x")).includes("مرحباً بعودتك")) {
  sh("shell", "pm", "clear", PKG);
  sleep(800);
  sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
}
xml = waitFor((j) => j.includes("مرحباً بعودتك"), "login", 25);
show("login", xml);
let fields = findFields(xml);
sh("shell", "input", "tap", String(fields[0].x), String(fields[0].y));
sleep(1200);
typeQuoted("qa.client@orderzhouse.test");
sleep(1500);
show("email", dump("email"));
fields = findFields(dump("f2"));
const pass = fields.find((f) => f.password) || fields[1];
sh("shell", "input", "tap", String(pass.x), String(pass.y));
sleep(1200);
typeQuoted("Test123456!");
sleep(1500);
show("pass", dump("pass"));
tapAny(dump("pre"), "تسجيل الدخول", true);
xml = waitFor(
  (j) =>
    (!j.includes("مرحباً بعودتك") && j.includes("حسابي")) ||
    j.includes("أنجز طلباتك") ||
    j.includes("لماذا أوردرز"),
  "client",
  25,
  1000
);
show("client", xml);
const cj = joined(xml);
S.client_login =
  !cj.includes("مرحباً بعودتك") &&
  (cj.includes("حسابي") || cj.includes("أنجز طلباتك") || cj.includes("لماذا أوردرز"));
S.client_bottom_nav = ["الرئيسية", "حسابي"].every((x) => cj.includes(x));

if (S.client_login) {
  tapAny(xml, "الخدمات");
  sleep(2000);
  show("services", dump("services"));
  S.services_tab = true;
}

// Payment return via in-app route: use adb to open ONLY if we can trigger DeepLinkListener
// Document GoException from raw scheme as automation note.
// Authenticated payment return path check: open using flutter isn't available.
// Instead verify PaymentReturnScreen source + prior unit tests; runtime: try
// `adb shell am start -n PKG/.MainActivity` with extras won't work.
// Soft check: from login after logout, payment deep link shouldn't open marketplace.

console.log("\n======== LOGOUT/CLIENT SUMMARY ========");
for (const [k, v] of Object.entries(S)) console.log(`${k}: ${v}`);
fs.writeFileSync(
  path.join(OUT, "summary_logout_client.txt"),
  Object.entries(S)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n"),
  "utf8"
);
