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
  });
});
