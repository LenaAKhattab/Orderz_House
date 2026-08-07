/** Quick login probe for 5J-2 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const ADB = path.join(process.env.LOCALAPPDATA, "Android/Sdk/platform-tools/adb.exe");
const PKG = "com.orderzhouse.orderzhouse_app";
function sh(...a) { return spawnSync(ADB, a, { encoding: "utf8", maxBuffer: 20e6 }); }
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function dump(n) {
  sh("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = sh("exec-out", "cat", "/sdcard/ui.xml").stdout || "";
  fs.writeFileSync(path.join(__dirname, n + ".xml"), xml);
  return xml;
}
function texts(xml) {
  return [...new Set([...xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)].map(m => m[1].replace(/&#10;/g," / ").trim()).filter(Boolean))];
}
function nodes(xml) { return xml.match(/<node[^>]+>/g) || []; }
function bounds(s) {
  const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return m ? { x: ((+m[1]+ +m[3])/2)|0, y: ((+m[2]+ +m[4])/2)|0 } : null;
}
function tap(needle, preferBottom=false) {
  const c=[];
  for (const s of nodes(dump("tap_tmp"))) {
    if (!s.includes(needle)) continue;
    const b=bounds(s); if (b) c.push(b);
  }
  if (!c.length) { console.log("no tap", needle); return false; }
  c.sort((a,b)=>a.y-b.y);
  const b = preferBottom ? c[c.length-1] : c[0];
  console.log("tap", needle, b);
  sh("shell","input","tap",String(b.x),String(b.y));
  return true;
}
function fields(xml) {
  const out=[];
  for (const s of nodes(xml)) {
    if (!(s.includes("EditText")||s.includes('password="true"'))) continue;
    const b=bounds(s); if (b) out.push({password:s.includes('password="true"'), ...b, raw:s.slice(0,120)});
  }
  return out.sort((a,b)=>a.y-b.y);
}

sh("shell","am","force-stop",PKG); sleep(500);
sh("shell","am","start","-n",`${PKG}/.MainActivity`); sleep(8000);
let xml = dump("probe_login");
console.log("start", texts(xml));
let f = fields(xml);
console.log("fields", f);
if (f.length < 2) { process.exit(1); }

sh("shell","input","tap",String(f[0].x),String(f[0].y)); sleep(300);
for (let i=0;i<40;i++) sh("shell","input","keyevent","67");
// email via shell with quotes
sh("shell","input","text","qa.client");
sh("shell","input","keyevent","77");
sh("shell","input","text","orderzhouse.test");
sleep(300);

sh("shell","input","tap",String(f[1].x),String(f[1].y)); sleep(300);
for (let i=0;i<40;i++) sh("shell","input","keyevent","67");
// try password without bang first then bang via keyevent
const r1 = sh("shell","input","text","Test123456");
console.log("pw1", r1.status, r1.stderr);
sh("shell","input","keyevent","--combination","59","8");
sleep(300);

xml = dump("probe_filled");
console.log("filled texts", texts(xml));
console.log("filled fields sample", fields(xml).map(x=>x.raw));

tap("تسجيل الدخول", true);
sleep(6000);
xml = dump("probe_after");
console.log("after", texts(xml));
