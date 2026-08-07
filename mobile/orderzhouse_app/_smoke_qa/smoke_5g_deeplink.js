const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ADB = path.join(process.env.LOCALAPPDATA, "Android/Sdk/platform-tools/adb.exe");
const PKG = "com.orderzhouse.orderzhouse_app";
const APK = path.join(__dirname, "../build/app/outputs/flutter-apk/app-debug.apk");
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
  texts(xml).forEach((t) => console.log(" -", t.replace(/\n/g, " / ")));
  const j = joined(xml);
  console.log({
    goException: j.includes("GoException") || j.includes("Page Not Found"),
    login: j.includes("مرحباً بعودتك") || j.includes("تسجيل الدخول"),
    payment: j.includes("الدفع") || j.includes("تأكيد"),
    guestHome: j.includes("تصفح السوق أو") || j.includes("ابدأ مع أوردرز"),
    bottomNav: ["الرئيسية", "طلباتي", "حسابي"].every((x) => j.includes(x)),
  });
  return j;
}
function openDeep(uri) {
  console.log("OPEN", uri);
  sh("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", uri, PKG);
  sleep(4500);
}

// Ensure installed
const pathOut = sh("shell", "pm", "path", PKG).stdout || "";
if (!pathOut.includes("package:")) {
  console.log(sh("install", "-r", APK).stdout || sh("install", "-r", APK).stderr);
} else {
  console.log(sh("install", "-r", APK).stdout || sh("install", "-r", APK).stderr);
}

sh("shell", "pm", "clear", PKG);
sleep(800);
sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
sleep(5000);
show("cold_login", dump("5g_cold"));

openDeep("orderzhouse://payment/success?orderId=123&session_id=test");
const s1 = show("success_link", dump("5g_success"));

openDeep("orderzhouse://payment/cancel?orderId=123");
const s2 = show("cancel_link", dump("5g_cancel"));

openDeep("orderzhouse://unknown/path");
const s3 = show("unknown_link", dump("5g_unknown"));

const summary = {
  success_no_go_exception: !s1.includes("GoException") && !s1.includes("Page Not Found"),
  success_not_guest_home: !s1.includes("تصفح السوق أو") && !s1.includes("لماذا أوردرز"),
  success_auth_gate:
    s1.includes("مرحباً بعودتك") ||
    s1.includes("الدفع") ||
    s1.includes("تأكيد") ||
    s1.includes("رابط العودة"),
  cancel_no_go_exception: !s2.includes("GoException") && !s2.includes("Page Not Found"),
  cancel_safe:
    s2.includes("مرحباً بعودتك") ||
    s2.includes("الدفع") ||
    s2.includes("تأكيد") ||
    s2.includes("رابط العودة") ||
    s2.includes("لم يتم"),
  unknown_no_go_exception: !s3.includes("GoException") && !s3.includes("Page Not Found"),
  unknown_safe: s3.includes("مرحباً بعودتك") || s3.includes("تسجيل الدخول"),
};

console.log("\n======== 5G ADB SMOKE ========");
for (const [k, v] of Object.entries(summary)) console.log(`${k}: ${v}`);
fs.writeFileSync(
  path.join(OUT, "summary_5g.txt"),
  Object.entries(summary)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n"),
  "utf8"
);
