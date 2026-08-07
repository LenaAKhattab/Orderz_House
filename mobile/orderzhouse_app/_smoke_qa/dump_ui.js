const { spawnSync } = require("child_process");
const path = require("path");
const adb = path.join(process.env.LOCALAPPDATA, "Android/Sdk/platform-tools/adb.exe");
spawnSync(adb, ["shell", "uiautomator", "dump", "/sdcard/ui.xml"]);
const xml = spawnSync(adb, ["exec-out", "cat", "/sdcard/ui.xml"], { encoding: "utf8" }).stdout || "";
const t = [...xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)]
  .map((m) => m[1].replace(/&#10;/g, " / "))
  .filter(Boolean);
console.log([...new Set(t)].slice(0, 25).join("\n"));
console.log("---");
console.log({
  red: /Failed assertion|GoException|Page Not Found/.test(xml),
  login: /مرحباً بعودتك|تسجيل الدخول/.test(xml),
  payment: /الدفع|تأكيد حالة/.test(xml),
});
