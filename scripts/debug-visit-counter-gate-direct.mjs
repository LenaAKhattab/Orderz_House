/**
 * Directly invoke shouldIncrementVisitCounter in browser context (proves bundle + localStorage).
 */
import { chromium } from "playwright";

const HOME_URL = process.env.HOME_URL || "http://localhost:5173/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (msg) => logs.push(msg.text()));

  await page.goto(HOME_URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2000);

  console.log("=== Direct module calls (3x, simulating refresh logic) ===\n");

  for (let i = 0; i < 3; i++) {
    logs.length = 0;
    const result = await page.evaluate(async () => {
      const mod = await import("/src/utils/pageViewNavigation.js");
      const increment = mod.shouldIncrementVisitCounter();
      const raw = localStorage.getItem("oh_visit_counter_session");
      return { increment, raw, origin: window.location.origin };
    });
    console.log(`Call ${i + 1}:`);
    console.log("  return value:", result.increment);
    console.log("  origin:", result.origin);
    console.log("  localStorage after:", result.raw);
    logs.filter((t) => t.includes("SESSION GATE") || t.includes("[visit-counter-gate]")).forEach((t) => console.log(" ", t));
    console.log("");
    await page.waitForTimeout(1000);
  }

  console.log("=== Simulate full page reload then call again ===");
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2000);
  logs.length = 0;
  const afterReload = await page.evaluate(async () => {
    const mod = await import("/src/utils/pageViewNavigation.js");
    const increment = mod.shouldIncrementVisitCounter();
    return {
      increment,
      raw: localStorage.getItem("oh_visit_counter_session"),
      origin: window.location.origin,
    };
  });
  console.log("After reload call:");
  console.log("  return value:", afterReload.increment);
  console.log("  localStorage before call (same as persisted):", afterReload.raw);
  logs.filter((t) => t.includes("SESSION GATE") || t.includes("[visit-counter-gate]")).forEach((t) => console.log(" ", t));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
