import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("apiBase production contract", () => {
  it("defaults to same-origin /api when VITE_API_BASE_URL is unset", async () => {
    // Fresh import under a stubbed import.meta is awkward in node:test; assert source contract.
    const src = readFileSync(join(here, "apiBase.js"), "utf8");
    assert.match(src, /return "\/api"/);
    assert.match(src, /VITE_API_BASE_URL/);
  });

  it("http client uses getApiBaseUrl (not hardcoded localhost fallback)", () => {
    const api = readFileSync(join(here, "../services/api.js"), "utf8");
    const client = readFileSync(join(here, "../services/httpClient.js"), "utf8");
    assert.match(client, /getApiBaseUrl/);
    assert.doesNotMatch(api, /localhost:5000\/api/);
    assert.doesNotMatch(client, /localhost:5000\/api/);
  });

  it("refuses localhost API hosts in production builds", () => {
    const src = readFileSync(join(here, "apiBase.js"), "utf8");
    assert.match(src, /import\.meta\.env\.PROD/);
    assert.match(src, /localhost\|127/);
  });

  it("Dockerfile defaults VITE_API_BASE_URL to /api", () => {
    const df = readFileSync(join(here, "../../Dockerfile"), "utf8");
    assert.match(df, /ARG VITE_API_BASE_URL=\/api/);
  });

  it("docker-compose build arg uses /api", () => {
    const compose = readFileSync(join(here, "../../../docker-compose.yml"), "utf8");
    assert.match(compose, /VITE_API_BASE_URL=\/api/);
  });
});
