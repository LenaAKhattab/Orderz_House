/**
 * Full gate log capture on port 5174 — 3 refreshes.
 */
import { chromium } from "playwright";

const URL = "http://localhost:5174/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const gateLines = [];
  let postCount = 0;

  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("SESSION GATE VERSION 1")) gateLines.push({ step: gateLines.length, type: "version", text });
    if (text.includes("[visit-counter-gate]")) gateLines.push({ step: gateLines.length, type: "gate", text });
    if (text.includes("local pageview recorded")) gateLines.push({ step: gateLines.length, type: "recorded", text });
    if (text.includes("visit counter skipped")) gateLines.push({ step: gateLines.length, type: "skipped", text });
  });
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/public/analytics/pageview")) postCount += 1;
  });

  for (let i = 0; i < 3; i++) {
    if (i === 0) {
      await page.goto(URL, { waitUntil: "load", timeout: 30000 });
    } else {
      await page.waitForTimeout(2000);
      await page.reload({ waitUntil: "load", timeout: 30000 });
    }
    await page.waitForTimeout(4000);
    const s = await page.evaluate(() => ({
      origin: window.location.origin,
      raw: localStorage.getItem("oh_visit_counter_session"),
    }));
    console.log(`\n--- After ${i === 0 ? "initial load" : `refresh ${i}`} ---`);
    console.log("origin:", s.origin);
    console.log("oh_visit_counter_session:", s.raw);
    console.log("cumulative POST /pageview:", postCount);
  }

  console.log("\n=== All gate-related console lines ===");
  gateLines.forEach((l, idx) => console.log(`${idx + 1}. [${l.type}] ${l.text}`));

  await browser.close();
}

main().catch(console.error);
