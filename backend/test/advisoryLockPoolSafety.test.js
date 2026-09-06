/**
 * Advisory-lock pool safety — institutional session lock + fake-order xact lock contracts.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const storageSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "institutionalStorageService.js"),
  "utf8",
);
const storedSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "institutionalStoredOrdersService.js"),
  "utf8",
);
const fakeSrc = fs.readFileSync(path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"), "utf8");
const dbSrc = fs.readFileSync(path.join(__dirname, "..", "src", "config", "db.js"), "utf8");

/** Mirrors production helper — keeps offline unit tests from requiring `db.js`. */
function releaseClientAfterSessionLock(client, { acquired, unlockResult } = {}) {
  if (!client) return;
  if (acquired && unlockResult && (!unlockResult.ok || !unlockResult.released)) {
    client.release(new Error("institutional_advisory_unlock_failed"));
    return;
  }
  client.release();
}

describe("advisory lock pool safety (source contracts)", () => {
  it("does not query from pool.on('release')", () => {
    assert.doesNotMatch(dbSrc, /pool\.on\(\s*["']release["']/);
  });

  it("fake-order generation uses transaction-scoped try lock", () => {
    assert.match(fakeSrc, /pg_try_advisory_xact_lock/);
    assert.match(fakeSrc, /tryAcquireGenerationLock/);
    assert.match(fakeSrc, /releaseGenerationLock/);
  });

  it("institutional tick uses session lock with unlock before releaseClientAfterSessionLock", () => {
    assert.match(storageSrc, /pg_try_advisory_lock/);
    assert.match(storageSrc, /pg_advisory_unlock/);
    assert.match(storageSrc, /releaseClientAfterSessionLock/);
    assert.match(storedSrc, /releaseClientAfterSessionLock\(lockClient/);
    assert.match(storedSrc, /if \(acquired\)/);
  });

  it("unlock failure destroys the pooled client instead of returning it", () => {
    assert.match(storageSrc, /client\.release\(new Error\("institutional_advisory_unlock_failed"\)\)/);
  });
});

describe("releaseClientAfterSessionLock behavior", () => {
  it("never queries after a successful pool release path", () => {
    let releasedWith = null;
    let queryCount = 0;
    const client = {
      query: async () => {
        queryCount += 1;
        return { rows: [{ released: true }] };
      },
      release(arg) {
        releasedWith = arg === undefined ? "idle" : arg;
      },
    };
    releaseClientAfterSessionLock(client, {
      acquired: true,
      unlockResult: { ok: true, released: true },
    });
    assert.equal(queryCount, 0);
    assert.equal(releasedWith, "idle");
  });

  it("destroys client when unlock failed after acquire", () => {
    let releasedWith = null;
    const client = {
      release(arg) {
        releasedWith = arg;
      },
    };
    releaseClientAfterSessionLock(client, {
      acquired: true,
      unlockResult: { ok: false, released: false, error: "boom" },
    });
    assert.ok(releasedWith instanceof Error);
    assert.match(releasedWith.message, /institutional_advisory_unlock_failed/);
  });

  it("production releaseReleaseLock returns structured result (source)", () => {
    assert.match(storageSrc, /return \{ ok: true, released:/);
    assert.match(storageSrc, /return \{ ok: false, released: false/);
  });
});

describe("xact lock mutual exclusion (live DB when available)", () => {
  it("two concurrent xact lock attempts: only one succeeds inside overlapping transactions", async (t) => {
    if (!process.env.DATABASE_URL) {
      t.skip("DATABASE_URL not set");
      return;
    }

    const { Pool } = require("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
    });
    const KEY = 882947361;
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query("BEGIN");
      await b.query("BEGIN");
      const gotA = await a.query(`SELECT pg_try_advisory_xact_lock($1::bigint) AS got`, [KEY]);
      const gotB = await b.query(`SELECT pg_try_advisory_xact_lock($1::bigint) AS got`, [KEY]);
      assert.equal(Boolean(gotA.rows[0].got), true);
      assert.equal(Boolean(gotB.rows[0].got), false);

      await a.query("ROLLBACK");
      const gotB2 = await b.query(`SELECT pg_try_advisory_xact_lock($1::bigint) AS got`, [KEY]);
      assert.equal(Boolean(gotB2.rows[0].got), true);
      await b.query("COMMIT");

      const ping = await a.query("SELECT 1 AS ok");
      assert.equal(Number(ping.rows[0].ok), 1);
    } finally {
      try {
        await a.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      try {
        await b.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      a.release();
      b.release();
      await pool.end();
    }
  });

  it("session lock is cleared before client returns to pool on success path", async (t) => {
    if (!process.env.DATABASE_URL) {
      t.skip("DATABASE_URL not set");
      return;
    }

    const {
      tryAcquireReleaseLock,
      releaseReleaseLock,
      releaseClientAfterSessionLock: releaseAfter,
    } = require("../src/services/institutionalStorageService");
    const { pool } = require("../src/config/db");

    const client = await pool.connect();
    let acquired = false;
    let unlockResult = { ok: true, released: false };
    try {
      acquired = await tryAcquireReleaseLock(client);
      if (!acquired) {
        t.skip("institutional advisory lock held by another process");
        return;
      }
      await client.query("SELECT 1");
    } finally {
      if (acquired) unlockResult = await releaseReleaseLock(client);
      releaseAfter(client, { acquired, unlockResult });
    }

    assert.equal(unlockResult.ok, true);
    assert.equal(unlockResult.released, true);

    const client2 = await pool.connect();
    try {
      const again = await tryAcquireReleaseLock(client2);
      assert.equal(again, true);
      const unlock2 = await releaseReleaseLock(client2);
      assert.equal(unlock2.released, true);
      releaseAfter(client2, { acquired: true, unlockResult: unlock2 });
    } catch (e) {
      client2.release(e);
      throw e;
    }
  });
});
