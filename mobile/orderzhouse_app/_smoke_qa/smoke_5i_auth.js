/**
 * Phase 5I — Auth-first UI smoke (no code changes).
 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ADB = path.join(process.env.LOCALAPPDATA, "Android/Sdk/platform-tools/adb.exe");
const PKG = "com.orderzhouse.orderzhouse_app";
const OUT = __dirname;

function sh(...a) {
  return spawnSync(ADB, a, { encoding: "utf8" });
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
function texts(xml) {
  return [
    ...new Set(
      [...xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)].map((m) =>
        m[1].replace(/&#10;/g, " ").trim()
      )
    ),
  ].filter(Boolean);
}
function joined(xml) {
  return texts(xml).join(" | ");
}
function show(label, xml) {
  console.log(`==== ${label} ====`);
  texts(xml).forEach((t) => console.log(" -", t.replace(/\n/g, " / ").slice(0, 120)));
  return joined(xml);
}

const R = {};

sh("shell", "am", "force-stop", PKG);
sleep(500);
sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
sleep(6000);
let xml = dump("5i_launch");
let j = show("launch", xml);
R.red_screen = /Failed assertion|only one of onException|errorBuilder/.test(j) || /GoException|Page Not Found/.test(j);
R.login_visible = j.includes("مرحباً بعودتك") || j.includes("تسجيل الدخول");
R.bottom_nav = ["الرئيسية", "طلباتي", "حسابي"].every((x) => j.includes(x));
R.guest_browse = j.includes("تصفح السوق أو") || j.includes("الدخول كضيف");

// register
for (const s of xml.match(/<node[^>]+>/g) || []) {
  if (!s.includes("إنشاء حساب") || !s.includes('clickable="true"')) continue;
  const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) continue;
  sh("shell", "input", "tap", String(((+m[1] + +m[3]) / 2) | 0), String(((+m[2] + +m[4]) / 2) | 0));
  break;
}
sleep(2000);
j = show("register", dump("5i_reg"));
R.register_opens = j.includes("إنشاء حساب") && !j.includes("مرحباً بعودتك");
sh("shell", "input", "keyevent", "4");
sleep(1500);
j = show("back_login", dump("5i_back"));
R.register_back = j.includes("مرحباً بعودتك");

// deep link
sh("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "orderzhouse://payment/success?orderId=123&session_id=test", PKG);
sleep(4000);
j = show("payment_dl", dump("5i_pay"));
R.payment_no_goex = !j.includes("GoException") && !j.includes("Page Not Found") && !j.includes("Failed assertion");
R.payment_safe = j.includes("الدفع") || j.includes("تسجيل الدخول") || j.includes("مرحباً");

console.log("\n======== AUTH-FIRST SMOKE ========");
for (const [k, v] of Object.entries(R)) console.log(`${k}: ${v}`);
fs.writeFileSync(path.join(OUT, "summary_5i_auth.txt"), Object.entries(R).map(([k, v]) => `${k}: ${v}`).join("\n"));
