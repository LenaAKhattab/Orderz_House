const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const ADB = path.join(process.env.LOCALAPPDATA, "Android/Sdk/platform-tools/adb.exe");
const PKG = "com.orderzhouse.orderzhouse_app";
function sh(...a) {
  return spawnSync(ADB, a, { encoding: "utf8" });
}
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function dump(name) {
  sh("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = sh("exec-out", "cat", "/sdcard/ui.xml").stdout || "";
  fs.writeFileSync(path.join(__dirname, name + ".xml"), xml);
  return xml;
}
function texts(xml) {
  return [
    ...new Set(
      [...xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)].map((m) =>
        m[1].replace(/&#10;/g, " ")
      )
    ),
  ].filter(Boolean);
}
function findFields(xml) {
  const fields = [];
  for (const s of xml.match(/<node[^>]+>/g) || []) {
    if (!(s.includes("EditText") || s.includes('password="true"'))) continue;
    const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!m) continue;
    fields.push({
      password: s.includes('password="true"'),
      x: ((+m[1] + +m[3]) / 2) | 0,
      y: ((+m[2] + +m[4]) / 2) | 0,
    });
  }
  return fields;
}

sh("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1");
sh("shell", "am", "force-stop", PKG);
sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
sleep(5000);

let xml = dump("login_raw");
let fields = findFields(xml);
console.log("fields", fields);
const emailF = fields.find((f) => !f.password) || fields[0];
const passF = fields.find((f) => f.password) || fields[1];

sh("shell", "input", "tap", String(emailF.x), String(emailF.y));
sleep(600);

// Method A: raw @ via argv (no shell)
let r = sh("shell", "input", "text", "qa.client@orderzhouse.test");
console.log("methodA status", r.status, "stderr", r.stderr);
sleep(800);
xml = dump("methodA");
console.log("A texts:\n" + texts(xml).join("\n"));

// If empty, Method B: shell quoting
sh("shell", "input", "tap", String(emailF.x), String(emailF.y));
sleep(300);
for (let i = 0; i < 60; i++) sh("shell", "input", "keyevent", "67");
r = spawnSync(
  ADB,
  ["shell", "input text 'qa.client@orderzhouse.test'"],
  { encoding: "utf8" }
);
console.log("methodB", r.status, r.stderr, r.stdout);
sleep(800);
xml = dump("methodB");
console.log("B texts:\n" + texts(xml).join("\n"));

// Method C: percent-encoding space style - try \\@
sh("shell", "input", "tap", String(emailF.x), String(emailF.y));
sleep(300);
for (let i = 0; i < 60; i++) sh("shell", "input", "keyevent", "67");
r = sh("shell", "input", "text", "qa.client\\@orderzhouse.test");
console.log("methodC", r.status, r.stderr);
sleep(800);
xml = dump("methodC");
console.log("C texts:\n" + texts(xml).join("\n"));

// Continue login if any method put email
const joined = texts(xml).join(" ");
const hasEmail = joined.includes("qa.client") && joined.includes("orderzhouse");
console.log("hasEmail", hasEmail, "joined snippet", joined.slice(0, 200));

if (hasEmail || texts(dump("check")).some((t) => t.includes("qa.client"))) {
  sh("shell", "input", "tap", String(passF.x), String(passF.y));
  sleep(400);
  sh("shell", "input", "text", "Test123456");
  // !
  sh("shell", "input", "keyevent", "--combination", "59", "8");
  sleep(400);
  // tap login button bottom
  const pre = dump("prelogin");
  const nodes = pre.match(/<node[^>]+>/g) || [];
  let best = null;
  for (const s of nodes) {
    if (!s.includes('clickable="true"')) continue;
    if (!s.includes("تسجيل الدخول") && !unescape(s).includes("تسجيل الدخول")) continue;
    const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!m) continue;
    const y = ((+m[2] + +m[4]) / 2) | 0;
    const x = ((+m[1] + +m[3]) / 2) | 0;
    if (!best || y > best.y) best = { x, y };
  }
  // content-desc may be HTML encoded arabic - match clickable near password
  if (!best) {
    for (const s of nodes) {
      if (!s.includes('clickable="true"')) continue;
      if (!/content-desc="[^"]+"/.test(s)) continue;
      const desc = (s.match(/content-desc="([^"]*)"/) || [])[1] || "";
      if (!desc.includes("تسجيل") && !desc.includes("&#")) continue;
      // decode roughly - if length suggests login button
      const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (!m) continue;
      const y = ((+m[2] + +m[4]) / 2) | 0;
      const x = ((+m[1] + +m[3]) / 2) | 0;
      if (desc && (desc.includes("دخول") || desc.length > 5)) {
        if (!best || y > best.y) best = { x, y, desc };
      }
    }
  }
  console.log("login btn", best);
  if (best) sh("shell", "input", "tap", String(best.x), String(best.y));
  sleep(6000);
  xml = dump("after_login");
  console.log("AFTER LOGIN:\n" + texts(xml).join("\n"));
}

function unescape(s) {
  return s.replace(/&#10;/g, "\n");
}
