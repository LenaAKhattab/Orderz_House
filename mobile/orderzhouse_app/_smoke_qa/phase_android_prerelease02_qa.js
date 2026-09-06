/**
 * Phase Android-PreRelease-02 — Production authenticated QA (API + emulator UI).
 * Password via ANDROID_QA_PASSWORD env (never logged).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const API = "https://orderzhouse.com/api";
const ADB = path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe");
const PKG = "com.orderzhouse.app";
const OUTDIR = path.join(__dirname, "prerelease02_out");
const STARTER_EMAIL = "qa.android.starter@orderzhouse.com";
const SILVER_EMAIL = "qa.android.silver@orderzhouse.com";

const COPY = {
  courseLockMsg: "هذه الدورة متاحة لباقات أعلى",
  courseLockCta: "ترقية الباقة",
  planTooLow: "قيمة هذا الطلب أعلى من حد باقتك الحالية",
  planUpgrade: "ترقية الباقة",
  noActivePlan: "فعّل باقتك لاستلام الطلبات",
  viewPlans: "عرض الباقات",
  refundLink: "تفاصيل استرداد مبلغ الباقة",
  refundSummary: ["عدد العروض", "الحد اليومي", "الحد الأقصى للمشروع", "المدة"],
};

const report = { api: {}, ui: {}, issues: { P0: [], P1: [], P2: [] } };

function sh(...args) {
  return spawnSync(ADB, args, { encoding: "utf8" });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function unescapeHtml(s) {
  return s
    .replace(/&#10;/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function textsFromXml(xml) {
  const out = [];
  const re = /(?:text|content-desc)="([^"]*)"/g;
  let m;
  while ((m = re.exec(xml))) {
    const t = unescapeHtml(m[1]).trim();
    if (t) out.push(t);
  }
  return [...new Set(out)];
}

function joinedFromXml(xml) {
  return textsFromXml(xml).join(" | ");
}

function nodeIter(xml) {
  return xml.match(/<node[^>]+>/g) || [];
}

function boundsOf(node) {
  const m = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) return null;
  return {
    x: Math.floor((Number(m[1]) + Number(m[3])) / 2),
    y: Math.floor((Number(m[2]) + Number(m[4])) / 2),
  };
}

function dumpUi(name) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  sh("shell", "uiautomator", "dump", "/sdcard/ui_pr02.xml");
  const r = sh("exec-out", "cat", "/sdcard/ui_pr02.xml");
  const xml = r.stdout || "";
  fs.writeFileSync(path.join(OUTDIR, `${name}.xml`), xml, "utf8");
  return xml;
}

function tapText(xml, needle) {
  for (const s of nodeIter(xml)) {
    if (!unescapeHtml(s).includes(needle)) continue;
    const b = boundsOf(s);
    if (!b) continue;
    sh("shell", "input", "tap", String(b.x), String(b.y));
    return true;
  }
  return false;
}

function findEditFields(xml) {
  const fields = [];
  for (const s of nodeIter(xml)) {
    const isEdit = s.includes("EditText") || s.includes('password="true"');
    if (!isEdit) continue;
    const b = boundsOf(s);
    if (!b) continue;
    fields.push({ password: s.includes('password="true"'), ...b });
  }
  if (fields.length >= 2) return fields;
  const cand = [];
  for (const s of nodeIter(xml)) {
    if (!s.includes('clickable="true"')) continue;
    const decoded = unescapeHtml(s);
    if (decoded.includes("تسجيل") || decoded.includes("إنشاء")) continue;
    if (s.includes("Button")) continue;
    const m = s.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!m) continue;
    const w = +m[3] - +m[1];
    const h = +m[4] - +m[2];
    if (h < 80 || w < 400) continue;
    cand.push({
      password: s.includes('password="true"'),
      x: Math.floor((+m[1] + +m[3]) / 2),
      y: Math.floor((+m[2] + +m[4]) / 2),
    });
  }
  return cand;
}

function adbSetClipboard(text) {
  sh("shell", "cmd", "clipboard", "set-text", text);
}

function adbPaste() {
  sh("shell", "input", "keyevent", "279"); // KEYCODE_PASTE
}

function adbLogin(email, password) {
  let xml = dumpUi("login");
  const fields = findEditFields(xml);
  if (fields.length < 2) return { ok: false, reason: "login_fields_not_found" };
  const emailField = fields.find((f) => !f.password) || fields[0];
  const passField = fields.find((f) => f.password) || fields[1];

  sh("shell", "input", "tap", String(emailField.x), String(emailField.y));
  sleep(400);
  for (let i = 0; i < 40; i++) sh("shell", "input", "keyevent", "67");
  adbSetClipboard(email);
  adbPaste();
  sleep(500);

  sh("shell", "input", "tap", String(passField.x), String(passField.y));
  sleep(400);
  for (let i = 0; i < 40; i++) sh("shell", "input", "keyevent", "67");
  sh("shell", "input", "text", password);
  sleep(500);

  xml = dumpUi("before_submit");
  tapText(xml, "تسجيل الدخول");
  sleep(7000);
  xml = dumpUi("after_login");
  const ts = textsFromXml(xml);
  const desc = [];
  for (const s of nodeIter(xml)) {
    const m = s.match(/content-desc="([^"]+)"/);
    if (m) desc.push(unescapeHtml(m[1]));
  }
  const joined = [...ts, ...desc].join(" | ");
  const ok = ["الرئيسية", "الطلبات", "الدورات", "حسابي", "أهلاً", "فرص جديدة"].some((x) =>
    joined.includes(x),
  );
  return { ok, joined };
}

function tapBottomNav(label) {
  sleep(800);
  const xml = dumpUi(`nav_${label}`);
  return tapText(xml, label);
}

async function apiLogin(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  const token = json?.data?.accessToken || json?.accessToken || json?.token;
  return { ok: res.ok && !!token, status: res.status, token };
}

async function apiGet(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "X-Client-Type": "mobile" },
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    json = null;
  }
  return { status: res.status, json };
}

function coursesFrom(json) {
  const list = json?.data?.courses || json?.courses || json?.data || [];
  return Array.isArray(list) ? list : [];
}

function poolOrdersFrom(json) {
  const list = json?.data?.orders || json?.orders || json?.data?.items || json?.data || [];
  return Array.isArray(list) ? list : [];
}

function specialOfferFrom(json) {
  const data = json?.data;
  if (!data || typeof data !== "object") return null;
  return data.specialOfferPackage || data.special_offer_package || null;
}

async function runApiQa(label, email, password, expect) {
  const out = {};
  const login = await apiLogin(email, password);
  out.login = login.ok;
  if (!login.ok) {
    report.issues.P0.push(`${label}: login failed (${login.status})`);
    report.api[label] = out;
    return out;
  }
  const h = { token: login.token };

  const courses = await apiGet(h.token, "/freelancer/courses");
  out.coursesStatus = courses.status;
  const clist = coursesFrom(courses.json);
  out.coursesTotal = clist.length;
  out.accessibleCount = clist.filter((c) => c.canAccess !== false && c.isLockedByPlan !== true).length;
  out.lockedCount = clist.filter((c) => c.isLockedByPlan === true || c.canAccess === false).length;
  out.starterArticleOpen = clist.some(
    (c) => String(c.title || "").includes("كيفية إنشاء مقال") && c.canAccess !== false && c.isLockedByPlan !== true,
  );
  const lockedCourse = clist.find((c) => c.isLockedByPlan === true || c.canAccess === false);
  if (lockedCourse) {
    const detail = await apiGet(h.token, `/freelancer/courses/${lockedCourse.id}`);
    out.lockedCourseDetailStatus = detail.status;
    out.lockedCourseDetailCode =
      detail.json?.code || detail.json?.publicCode || detail.json?.errorCode || null;
  }

  const pool = await apiGet(h.token, "/orders/pool?page=1&limit=20&sort=newest");
  out.poolStatus = pool.status;
  const orders = poolOrdersFrom(pool.json);
  out.poolCount = orders.length;
  const lockedOrders = orders.filter((o) => o.poolEligibility?.isLockedByPlan === true || o.isPlanLocked === true);
  out.lockedOrderCount = lockedOrders.length;
  out.planReasons = [...new Set(lockedOrders.map((o) => o.poolEligibility?.reasonCode).filter(Boolean))];

  const offer = await apiGet(h.token, "/special-offer-package");
  out.specialOfferStatus = offer.status;
  const pkg = specialOfferFrom(offer.json);
  out.specialOfferVisible = !!(pkg && pkg.title && Number(pkg.totalOffers) > 0);
  out.specialOfferHasRefund = !!(pkg?.refundExplanationAr && String(pkg.refundExplanationAr).trim());

  const unread = await apiGet(h.token, "/notifications/unread-count");
  out.notificationsUnreadStatus = unread.status;

  const mini = await apiGet(h.token, "/marketplace-articles?page=1&limit=5");
  out.miniArticlesStatus = mini.status;

  const kyc = await apiGet(h.token, "/freelancer/account-activation");
  out.kycStatus = kyc.status;

  const claims = await apiGet(h.token, "/portal/financial-claims");
  out.claimsStatus = claims.status;

  // Expectations
  if (expect.allCoursesAccessible) {
    if (out.accessibleCount !== out.coursesTotal || out.lockedCount > 0) {
      report.issues.P1.push(`${label}: expected all courses accessible`);
    }
  } else {
    if (!out.starterArticleOpen || out.lockedCount < 1) {
      report.issues.P1.push(`${label}: course gating mismatch`);
    }
    if (lockedCourse && out.lockedCourseDetailStatus !== 403) {
      report.issues.P1.push(`${label}: locked course detail should 403`);
    }
    if (lockedCourse && out.lockedCourseDetailCode !== "COURSE_PLAN_UPGRADE_REQUIRED") {
      report.issues.P2.push(`${label}: locked course code=${out.lockedCourseDetailCode}`);
    }
  }

  if (out.coursesStatus !== 200) report.issues.P0.push(`${label}: courses API ${out.coursesStatus}`);
  if (out.poolStatus !== 200) report.issues.P1.push(`${label}: pool API ${out.poolStatus}`);
  if (out.notificationsUnreadStatus !== 200) report.issues.P2.push(`${label}: notifications unread ${out.notificationsUnreadStatus}`);

  report.api[label] = out;
  return out;
}

function uiCheck(label, joined, checks) {
  const result = {};
  for (const [key, needle] of Object.entries(checks)) {
    result[key] = typeof needle === "function" ? needle(joined) : joined.includes(needle);
    if (!result[key] && key.endsWith("Required")) {
      report.issues.P1.push(`${label} UI: missing ${key}`);
    }
  }
  report.ui[label] = result;
  return result;
}

function runUiFlow(accountLabel, email, password, courseChecks) {
  sh("shell", "am", "force-stop", PKG);
  sleep(500);
  sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  sleep(5000);

  const login = adbLogin(email, password);
  uiCheck(`${accountLabel}_login`, login.joined || "", { loginOk: login.ok });
  if (!login.ok) {
    report.issues.P0.push(`${accountLabel}: UI login failed`);
    return;
  }

  // Home
  let xml = dumpUi(`${accountLabel}_home`);
  let joined = joinedFromXml(xml);
  uiCheck(`${accountLabel}_home`, joined, {
    homeLoads: (j) => j.includes("أهلاً") || j.includes("فرص جديدة"),
    bottomNav: (j) => ["الرئيسية", "الطلبات", "الدورات", "حسابي"].every((x) => j.includes(x)),
    specialOfferCard: (j) => j.includes("د.أ") || j.includes("عرض") || j.includes("باقة"),
    refundLinkRequired: COPY.refundLink,
  });

  if (joined.includes(COPY.refundLink)) {
    tapText(xml, COPY.refundLink);
    sleep(1500);
    xml = dumpUi(`${accountLabel}_refund_modal`);
    joined = joinedFromXml(xml);
    uiCheck(`${accountLabel}_refund`, joined, {
      modalOpen: (j) => COPY.refundSummary.every((s) => j.includes(s)),
      closeWorks: true,
    });
    sh("shell", "input", "keyevent", "4");
    sleep(800);
  }

  // Courses tab
  tapBottomNav("الدورات");
  sleep(2500);
  xml = dumpUi(`${accountLabel}_courses`);
  joined = joinedFromXml(xml);
  uiCheck(`${accountLabel}_courses`, joined, courseChecks);

  // Orders tab
  tapBottomNav("الطلبات");
  sleep(2500);
  xml = dumpUi(`${accountLabel}_orders`);
  joined = joinedFromXml(xml);
  uiCheck(`${accountLabel}_orders`, joined, {
    ordersLoad: (j) => j.length > 20,
    hasPlanTooLowOrList: (j) =>
      j.includes(COPY.planTooLow) ||
      j.includes(COPY.planUpgrade) ||
      j.includes(COPY.noActivePlan) ||
      j.includes(COPY.viewPlans) ||
      j.includes("طلب") ||
      j.includes("سوق"),
  });

  // Profile / logout probe (open only, no confirm)
  tapBottomNav("حسابي");
  sleep(2000);
  xml = dumpUi(`${accountLabel}_profile`);
  joined = joinedFromXml(xml);
  uiCheck(`${accountLabel}_profile`, joined, {
    profileOpen: (j) => j.includes("تسجيل الخروج") || j.includes("حسابي") || j.includes(email.split("@")[0]),
    logoutVisible: "تسجيل الخروج",
  });

  // Notifications via profile quick action if visible
  if (joined.includes("الإشعارات")) {
    tapText(xml, "الإشعارات");
    sleep(2000);
    xml = dumpUi(`${accountLabel}_notifications`);
    joined = joinedFromXml(xml);
    uiCheck(`${accountLabel}_notifications`, joined, {
      notificationsOpen: (j) => j.includes("الإشعارات") || j.includes("لا توجد"),
    });
    sh("shell", "input", "keyevent", "4");
  }

  // Logout for account switch
  tapBottomNav("حسابي");
  sleep(1500);
  xml = dumpUi(`${accountLabel}_logout_probe`);
  if (tapText(xml, "تسجيل الخروج")) {
    sleep(1000);
    xml = dumpUi(`${accountLabel}_logout_confirm`);
    tapText(xml, "تسجيل الخروج");
    sleep(3000);
  }
}

async function main() {
  const password = String(process.env.ANDROID_QA_PASSWORD || "").trim();
  if (!password) {
    console.error("Set ANDROID_QA_PASSWORD");
    process.exit(1);
  }

  console.log("=== API QA ===");
  await runApiQa("STARTER", STARTER_EMAIL, password, { allCoursesAccessible: false });
  await runApiQa("SILVER", SILVER_EMAIL, password, { allCoursesAccessible: true });

  console.log("=== UI QA (emulator) ===");
  const devices = sh("devices").stdout || "";
  if (!devices.includes("emulator-5554")) {
    report.issues.P1.push("UI: emulator-5554 not connected — UI checks skipped");
    console.log(JSON.stringify({ ok: false, reason: "no_emulator" }, null, 2));
  } else {
    runUiFlow("STARTER", STARTER_EMAIL, password, {
      courseLockMsg: COPY.courseLockMsg,
      courseLockCta: COPY.courseLockCta,
      starterCourseAccessible: (j) => j.includes("كيفية إنشاء مقال") || j.includes("ابدأ") || j.includes("تابع"),
    });
    runUiFlow("SILVER", SILVER_EMAIL, password, {
      allAccessible: (j) => !j.includes(COPY.courseLockMsg),
      canOpenCourse: (j) => j.includes("ابدأ") || j.includes("تابع") || j.includes("دورة"),
    });
  }

  const p0 = report.issues.P0.length;
  const p1 = report.issues.P1.length;
  const status = p0 > 0 ? "FAILED" : p1 > 0 ? "PARTIAL" : "PASS";

  console.log(
    JSON.stringify(
      {
        overall: `ANDROID_AUTH_QA_${status}`,
        api: report.api,
        ui: report.ui,
        issues: report.issues,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
