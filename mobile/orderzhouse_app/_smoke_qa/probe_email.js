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
function dump() {
  sh("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  return sh("exec-out", "cat", "/sdcard/ui.xml").stdout || "";
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

console.log("sdk", sh("shell", "getprop", "ro.build.version.sdk").stdout.trim());
console.log("clip set-text", sh("shell", "cmd", "clipboard", "set-text", "qa.client@orderzhouse.test"));
console.log("clip set-clip", sh("shell", "cmd", "clipboard", "set-clip", "--text", "qa.client@orderzhouse.test").stderr);

sh("shell", "am", "force-stop", PKG);
sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
sleep(5000);
sh("shell", "input", "tap", "540", "693");
sleep(400);
sh("shell", "input", "tap", "540", "693");
sleep(400);

// Try paste
console.log("paste279", sh("shell", "input", "keyevent", "279").stderr);
sleep(800);
let xml = dump();
console.log("AFTER PASTE:\n" + texts(xml).join("\n"));

// Try char-by-char without @ first then KEYCODE_AT
sh("shell", "am", "force-stop", PKG);
sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
sleep(5000);
sh("shell", "input", "tap", "540", "693");
sleep(500);
for (const ch of "qa.client") {
  sh("shell", "input", "text", ch);
  sleep(50);
}
console.log("at", sh("shell", "input", "keyevent", "77"));
for (const ch of "orderzhouse.test") {
  sh("shell", "input", "text", ch);
  sleep(50);
}
sleep(500);
xml = dump();
console.log("AFTER CHARTYPE:\n" + texts(xml).join("\n"));
fs.writeFileSync(path.join(__dirname, "email_probe.txt"), texts(xml).join("\n"));
