/**
 * Performance Phase 6 — public TTL cache + in-flight dedupe (no private data).
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchPublicCached,
  peekPublicCached,
  resetPublicRequestCache,
  PUBLIC_CACHE_TTL_MS,
} from "./lib/publicRequestCache.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Performance Phase 6 public request cache", () => {
  beforeEach(() => {
    resetPublicRequestCache();
  });

  it("dedupes in-flight fetches and serves TTL hits", async () => {
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return new Promise((resolve) => {
        setTimeout(() => resolve({ ok: true, calls }), 20);
      });
    };

    const [a, b] = await Promise.all([
      fetchPublicCached("GET /public/site-pages", fetcher),
      fetchPublicCached("GET /public/site-pages", fetcher),
    ]);
    assert.equal(calls, 1);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(peekPublicCached("GET /public/site-pages").ok, true);

    const c = await fetchPublicCached("GET /public/site-pages", fetcher);
    assert.equal(calls, 1);
    assert.equal(c.ok, true);
  });

  it("does not cache failed fetches", async () => {
    let calls = 0;
    const boom = () => {
      calls += 1;
      return Promise.reject(new Error("network"));
    };
    await assert.rejects(() => fetchPublicCached("GET /public/faq", boom), /network/);
    await assert.rejects(() => fetchPublicCached("GET /public/faq", boom), /network/);
    assert.equal(calls, 2);
    assert.equal(peekPublicCached("GET /public/faq"), undefined);
  });

  it("bypassCache still shares in-flight then stores a fresh value", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return { n: calls };
    };
    await fetchPublicCached("GET /public/home-stats", fetcher, { ttlMs: PUBLIC_CACHE_TTL_MS });
    const next = await fetchPublicCached("GET /public/home-stats", fetcher, { bypassCache: true });
    assert.equal(calls, 2);
    assert.equal(next.n, 2);
  });

  it("chrome hooks share the public cache helper and skip private endpoints", () => {
    const cache = read("lib/publicRequestCache.js");
    assert.match(cache, /Do not store auth\/session/);
    assert.match(cache, /dashboard, orders, financial, claims, or payment/);

    const sitePages = read("hooks/usePublicSitePages.js");
    const faq = read("hooks/usePublicFaq.js");
    const footer = read("hooks/usePublicFooterSettings.js");
    const training = read("hooks/usePublicTrainingPackages.js");
    const stats = read("hooks/usePublicHomeStats.js");
    const hiw = read("hooks/useHowItWorksNav.js");
    const navbar = read("components/layout/Navbar.jsx");
    const layout = read("components/layout/PublicLayout.jsx");
    const shell = read("styles/publicHomeShell.css");
    const marketing = read("components/sections/home-hero-marketing.css");
    const heroHook = read("hooks/useHeroWallpaperReady.js");

    for (const src of [sitePages, faq, footer, training, stats, hiw]) {
      assert.match(src, /from "\.\.\/lib\/publicRequestCache"/);
    }

    assert.match(sitePages, /GET \/public\/site-pages/);
    assert.match(faq, /GET \/public\/faq/);
    assert.match(footer, /GET \/public\/footer-settings/);
    assert.match(training, /GET \/public\/training-packages/);
    assert.match(stats, /GET \/public\/home-stats/);
    assert.match(hiw, /active === true/);
    assert.match(navbar, /howItWorksNavActive/);
    assert.match(navbar, /mobileDrawerOpen/);

    assert.doesNotMatch(sitePages, /\/client\/|\/freelancer\/|\/financial|notifications|auth\/me/);
    assert.doesNotMatch(faq, /\/client\/|\/freelancer\/orders/);
    assert.match(stats, /bypassCache: !initial/);

    assert.match(layout, /home-public-layout--wallpaper-ready/);
    assert.doesNotMatch(layout, /useHeroWallpaperReady/);
    assert.doesNotMatch(heroHook, /new Image/);
    assert.doesNotMatch(heroHook, /background\.webp/);
    assert.match(shell, /url\("\/hero\/background\.webp"\)/);
    const marketingUrls = marketing.match(/url\("\/hero\/background\.webp"\)/g) || [];
    assert.equal(marketingUrls.length, 0);
  });
});
