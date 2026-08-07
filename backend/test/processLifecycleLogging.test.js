/**
 * QA-OPS-1: process lifecycle logging is registered at server entry.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("process lifecycle logging", () => {
  it("server.js registers lifecycle handlers before startServer", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.ok(src.includes("registerProcessLifecycleLogging"));
    assert.ok(src.includes("startServer().catch"));
  });

  it("processLifecycleLogging handles unhandledRejection and signals", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "config", "processLifecycleLogging.js"),
      "utf8",
    );
    assert.ok(src.includes('process.on("unhandledRejection"'));
    assert.ok(src.includes('process.on("uncaughtException"'));
    assert.ok(src.includes('process.on("SIGTERM"'));
    assert.ok(src.includes('process.on("SIGINT"'));
    assert.ok(src.includes("onShutdown"));
  });

  it("server.js performs graceful shutdown (close listen + pool.end)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.ok(src.includes("gracefulShutdown"));
    assert.ok(src.includes("pool.end"));
    assert.ok(src.includes('HOST = process.env.HOST || "0.0.0.0"'));
    assert.ok(src.includes("app.listen(PORT, HOST"));
  });

  it("server.js dotenv does not override host/orchestrator environment", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.ok(src.includes("dotenv.config"));
    assert.ok(!/dotenv\.config\(\{[^}]*override:\s*true/.test(src));
  });
});
