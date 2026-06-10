/**
 * Runtime repro — network failures + wait for hero + longer settle time.
 */
import { chromium } from "playwright";

const HOME_URL = process.env.HOME_URL || "http://localhost:5173/";

async function runVisit(label, page, allConsole, pageviewPosts) {
  allConsole.length = 0;
  const postsBefore = pageviewPosts.length;

  await page.waitForTimeout(5000);

  const storage = await page.evaluate(() => {
    const raw = localStorage.getItem("oh_visit_counter_session");
    let parsed = null;
    let parseError = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (e) {
      parseError = e?.message || String(e);
    }
    return {
      origin: window.location.origin,
      raw,
      parsed,
      parseError,
      clientSid: localStorage.getItem("oh_client_sid"),
      keys: Object.keys(localStorage),
    };
  });

  const gateLogs = allConsole.filter(
    (m) => m.text.includes("SESSION GATE VERSION 1") || m.text.includes("[visit-counter-gate]"),
  );
  const analyticsLogs = allConsole.filter((m) => m.text.includes("[analytics]"));

  console.log(`\n=== ${label} ===`);
  console.log("Origin:", storage.origin);
  console.log("localStorage keys:", storage.keys.join(", ") || "(none)");
  console.log("oh_visit_counter_session:", storage.raw);
  console.log("oh_client_sid:", storage.clientSid);
  console.log("Parsed:", JSON.stringify(storage.parsed));
  console.log("JSON.parse throws:", storage.parseError || "no");
  console.log("POST /pageview (delta):", pageviewPosts.length - postsBefore);
  console.log("SESSION GATE VERSION 1 seen:", gateLogs.some((l) => l.text.includes("SESSION GATE VERSION 1")));
  console.log("Gate console output:");
  if (gateLogs.length === 0) console.log("  (none)");
  gateLogs.forEach((l) => console.log(" ", l.text));
  console.log("Analytics sample:");
  analyticsLogs.slice(0, 6).forEach((l) => console.log(" ", l.text));

  return { storage, gateLogs };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const allConsole = [];
  const pageErrors = [];
  const pageviewPosts = [];
  const failedRequests = [];

  page.on("console", (msg) => allConsole.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("requestfailed", (req) => {
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText || "failed"}`);
  });
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/public/analytics/pageview")) {
      pageviewPosts.push(req.url());
    }
  });

  console.log("Loading homepage...");
  await page.goto(HOME_URL, { waitUntil: "load", timeout: 60000 });
  try {
    await page.waitForSelector(".home-hero-metrics, .home-stats-strip, .home-public-layout", { timeout: 20000 });
    console.log("Hero/home selector found.");
  } catch {
    console.log("Hero/home selector NOT found within 20s.");
  }

  const step0 = await runVisit("STEP 0: initial homepage load", page, allConsole, pageviewPosts);

  await page.reload({ waitUntil: "load", timeout: 60000 });
  try {
    await page.waitForSelector(".home-hero-metrics, .home-stats-strip, .home-public-layout", { timeout: 20000 });
  } catch {
    /* ignore */
  }
  const step1 = await runVisit("STEP 1: refresh within 5 seconds", page, allConsole, pageviewPosts);

  await page.waitForTimeout(5000);
  await page.reload({ waitUntil: "load", timeout: 60000 });
  try {
    await page.waitForSelector(".home-hero-metrics, .home-stats-strip, .home-public-layout", { timeout: 20000 });
  } catch {
    /* ignore */
  }
  const step2 = await runVisit("STEP 2: second refresh within 5 seconds", page, allConsole, pageviewPosts);

  console.log("\n=== SUMMARY ===");
  console.log("Origin stable:", step0.storage.origin === step1.storage.origin && step1.storage.origin === step2.storage.origin);
  console.log("All origins:", step0.storage.origin);
  console.log("Catch block entered:", [...step0.gateLogs, ...step1.gateLogs, ...step2.gateLogs].some((l) => l.text.includes("catch fail-open")));
  console.log("Total POST /pageview:", pageviewPosts.length);
  console.log("Page errors:", pageErrors.length ? pageErrors : "(none)");
  console.log("Failed requests (first 10):", failedRequests.slice(0, 10).length ? failedRequests.slice(0, 10) : "(none)");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
