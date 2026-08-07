/**
 * Focused UI: complete fixed-price create order after Step 3 fix.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const ADB = path.join(process.env.LOCALAPPDATA || "", "Android/Sdk/platform-tools/adb.exe");
const PKG = "com.orderzhouse.app";
const OUT = __dirname;
const TITLE = `QAUI${Date.now()}`;
const DESC = "QA UI description long enough for validation rules";

function sh(...a) {
  return spawnSync(ADB, ["-s", "emulator-5554", ...a], { encoding: "utf8", maxBuffer: 20e6 });
}
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function dump(n) {
  sh("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = sh("exec-out", "cat", "/sdcard/ui.xml").stdout || "";
  fs.writeFileSync(path.join(OUT, `coq2_${n}.xml`), xml);
  return xml;
}
function texts(xml) {
  return [
    ...new Set(
      [...xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)].map((m) =>
        m[1].replace(/&#10;/g, " / ").trim()
      )
    ),
  ].filter(Boolean);
}
function join(xml) {
  return texts(xml).join(" | ");
}
function nodes(xml) {
  return xml.match(/<node[^>]+>/g) || [];
}
function bounds(s) {
  const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return m ? { x: ((+m[1] + +m[3]) / 2) | 0, y: ((+m[2] + +m[4]) / 2) | 0 } : null;
}
function tap(xml, needle, preferBottom = false) {
  const c = [];
  for (const s of nodes(xml)) {
    if (!s.includes(needle)) continue;
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
function tapXY(x, y) {
  sh("shell", "input", "tap", String(x), String(y));
}
function fields(xml) {
  const out = [];
  for (const s of nodes(xml)) {
    if (!s.includes("EditText")) continue;
    const b = bounds(s);
    if (b) out.push(b);
  }
  return out.sort((a, b) => a.y - b.y);
}
function clearField() {
  sh("shell", "input", "keyevent", "KEYCODE_MOVE_END");
  for (let i = 0; i < 60; i++) sh("shell", "input", "keyevent", "KEYCODE_DEL");
}
function paste(text) {
  // Android 13+ clipboard cmd
  const r = sh("shell", "cmd", "clipboard", "set", text);
  if (r.status !== 0) {
    sh("shell", "input", "text", text.replace(/ /g, "%s"));
    return;
  }
  sleep(250);
  sh("shell", "input", "keyevent", "279"); // PASTE
}
function typeEscaped(t) {
  sh("shell", "input", "text", String(t).replace(/ /g, "%s"));
}
function shot(n) {
  const p = `/sdcard/${n}.png`;
  sh("shell", "screencap", "-p", p);
  sh("pull", p, path.join(OUT, `${n}.png`));
}
function dismissOverlays() {
  for (let i = 0; i < 4; i++) {
    sh("shell", "input", "keyevent", "KEYCODE_BACK");
    sleep(350);
  }
}

function request(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { "X-Client-Type": "mobile", Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const r = http.request(
      { hostname: "127.0.0.1", port: 5000, path: `/api${urlPath}`, method, headers },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          let j = null;
          try {
            j = JSON.parse(d);
          } catch (_) {}
          resolve({ status: res.statusCode, j });
        });
      }
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  const result = { title: TITLE, steps: {} };
  dismissOverlays();
  sh("shell", "am", "force-stop", PKG);
  sleep(1000);
  sh("shell", "am", "start", "--activity-clear-task", "-n", `${PKG}/.MainActivity`);
  sleep(4500);

  let xml = dump("home");
  result.steps.home = join(xml).slice(0, 250);
  tap(xml, "إنشاء طلب جديد", true);
  sleep(2000);

  xml = dump("type");
  tap(xml, "ثابت السعر");
  sleep(500);
  tap(dump("type2"), "التالي", true);
  sleep(1500);

  xml = dump("cat");
  tap(xml, "خدمات البرمجة");
  sleep(1200);
  tap(dump("cat2"), "التالي", true);
  sleep(1500);

  xml = dump("step3");
  shot("coq2_step3");
  const j3 = join(xml);
  result.steps.step3 = {
    progress: j3.includes("الخطوة 3 من 5"),
    titleLabel: j3.includes("عنوان الطلب") || j3.includes("تفاصيل الطلب"),
    attachments: j3.includes("المرفقات") && j3.includes("إضافة ملفات"),
    join: j3.slice(0, 400),
  };
  console.log("STEP3", JSON.stringify(result.steps.step3));

  tap(xml, "التالي", true);
  sleep(900);
  xml = dump("val");
  const jv = join(xml);
  result.steps.validation = {
    title: jv.includes("عنوان الطلب مطلوب"),
    desc: jv.includes("الوصف مطلوب"),
    duration: jv.includes("مدة التنفيذ مطلوبة"),
  };
  console.log("VAL", result.steps.validation);
  shot("coq2_validation");

  let fs = fields(xml);
  console.log("fields", fs.length);
  if (fs.length >= 3) {
    tapXY(fs[0].x, fs[0].y);
    sleep(200);
    clearField();
    typeEscaped(TITLE);
    sleep(300);
    tapXY(fs[1].x, fs[1].y);
    sleep(200);
    clearField();
    paste(DESC);
    sleep(400);
    tapXY(fs[2].x, fs[2].y);
    sleep(200);
    clearField();
    typeEscaped("5");
    sleep(300);
  }
  sh("shell", "input", "keyevent", "KEYCODE_BACK");
  sleep(500);
  xml = dump("filled");
  shot("coq2_filled");
  result.steps.filled = { hasTitle: join(xml).includes(TITLE), join: join(xml).slice(0, 350) };
  console.log("FILLED", result.steps.filled);

  tap(xml, "السابق", true);
  sleep(1000);
  tap(dump("back"), "التالي", true);
  sleep(1200);
  xml = dump("afterback");
  result.steps.backPreserve = {
    hasTitle: join(xml).includes(TITLE),
    fields: fields(xml).length,
  };
  console.log("BACK", result.steps.backPreserve);

  // Ensure description + duration synced before next
  fs = fields(dump("refill"));
  if (fs.length >= 3) {
    tapXY(fs[1].x, fs[1].y);
    sleep(200);
    clearField();
    paste(DESC);
    sleep(300);
    tapXY(fs[2].x, fs[2].y);
    sleep(200);
    clearField();
    typeEscaped("5");
    sleep(200);
    sh("shell", "input", "keyevent", "KEYCODE_BACK");
    sleep(400);
  }

  tap(dump("tonext"), "التالي", true);
  sleep(1500);
  xml = dump("budget");
  result.steps.budget = join(xml).includes("الميزانية") || join(xml).includes("الخطوة 4");
  console.log("BUDGET", result.steps.budget, join(xml).slice(0, 200));
  fs = fields(xml);
  if (fs.length) {
    tapXY(fs[0].x, fs[0].y);
    clearField();
    typeEscaped("55");
    sleep(200);
    sh("shell", "input", "keyevent", "KEYCODE_BACK");
    sleep(300);
  }
  tap(dump("toreview"), "التالي", true);
  sleep(1500);
  xml = dump("review");
  result.steps.review = join(xml).includes("مراجعة") || join(xml).includes("الخطوة 5");
  console.log("REVIEW", result.steps.review, join(xml).slice(0, 250));
  shot("coq2_review");

  tap(xml, "إنشاء الطلب", true);
  sleep(7000);
  xml = dump("done");
  shot("coq2_done");
  const jd = join(xml);
  result.steps.submit = {
    ok: /دفع|نجاح|طلباتي|Stripe|checkout|تم/i.test(jd) || jd.includes("الدفع"),
    join: jd.slice(0, 450),
  };
  console.log("DONE", result.steps.submit);

  dismissOverlays();
  sleep(500);
  tap(dump("nav"), "طلباتي");
  sleep(2500);
  xml = dump("my");
  shot("coq2_my");
  result.steps.myOrdersUi = {
    hasTitle: join(xml).includes(TITLE) || join(xml).includes("QAUI"),
    join: join(xml).slice(0, 400),
  };
  console.log("MY", result.steps.myOrdersUi);

  // API check for this title
  const login = await request("POST", "/auth/login", null, {
    email: "qa.client@orderzhouse.test",
    password: "Test123456!",
  });
  const token = login.j?.data?.accessToken || login.j?.data?.token;
  const mine = await request("GET", "/client/orders", token);
  const orders = mine.j?.data?.orders || [];
  result.steps.myOrdersApi = {
    count: orders.length,
    titles: orders.map((o) => o.title).slice(0, 8),
    hasThis: orders.some((o) => (o.title || "").includes("QAUI")),
  };
  console.log("API MY", result.steps.myOrdersApi);

  fs.writeFileSync(path.join(OUT, "create_order_ui_fixed_report.json"), JSON.stringify(result, null, 2));
  console.log("TITLE", TITLE);
  console.log("REPORT WRITTEN");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
