/**
 * Compare gate behavior on port 5173 vs 5174 (Vite actual port).
 */
import { chromium } from "playwright";

async function testOrigin(url, label) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  const posts = [];

  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("SESSION GATE") || t.includes("[visit-counter-gate]") || t.includes("local pageview recorded")) {
      logs.push(t);
    }
  });
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/public/analytics/pageview")) posts.push(true);
  });

  console.log(`\n========== ${label}: ${url} ==========`);

  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(6000);
  let storage = await page.evaluate(() => ({
    origin: window.location.origin,
    key: localStorage.getItem("oh_visit_counter_session"),
  }));
  console.log("Load 1 — origin:", storage.origin, "| session key:", storage.key, "| POSTs:", posts.length);
  logs.forEach((l) => console.log(" ", l));
  logs.length = 0;

  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(6000);
  const postsBefore = posts.length;
  storage = await page.evaluate(() => ({
    origin: window.location.origin,
    key: localStorage.getItem("oh_visit_counter_session"),
  }));
  console.log("Refresh — origin:", storage.origin, "| session key:", storage.key, "| POSTs this refresh:", posts.length - postsBefore);
  logs.forEach((l) => console.log(" ", l));

  await browser.close();
}

async function main() {
  await testOrigin("http://localhost:5174/", "Vite (current dev server)");
  await testOrigin("http://localhost:5173/", "Port 5173 (stale/other process)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
