/**
 * Transaction-aware "after commit" side effects for pg clients checked out from the shared pool.
 *
 * db.js instruments every checked-out client: BEGIN / COMMIT / ROLLBACK / SAVEPOINT statements sent through
 * client.query are tracked, and work registered with runAfterCommit() while that client's transaction is open
 * runs once, right after COMMIT succeeds. It is dropped on ROLLBACK, on a failed COMMIT, on a COMMIT that
 * PostgreSQL turned into ROLLBACK (the transaction had already failed), and on ROLLBACK TO SAVEPOINT for work
 * registered after that savepoint. Outside a transaction (the pool itself, a client in autocommit, or any
 * object this module never saw) the work runs immediately.
 *
 * Use it for externally visible side effects only (realtime, push, follow-up notifications) — business writes
 * belong inside the transaction itself.
 *
 * runInSavepoint() isolates best-effort database work (notification inserts) from the caller's transaction:
 * a failure there rolls back to its own savepoint instead of aborting the business transaction.
 *
 * Coverage limits (by design, documented + guarded by tests): only clients checked out through db.js
 * (pool.connect) are tracked, and only promise-style client.query("BEGIN") calls. A transaction opened on a
 * client created with `new Client()` or via callback-style query("BEGIN", cb) looks like autocommit here:
 * side effects would run immediately and no savepoint would be used. No notification producer does that today.
 */

const STATE = Symbol("ohAfterCommitState");

/** @returns {{ kind: string, name?: string } | null} */
function classifyStatement(arg) {
  const raw = typeof arg === "string" ? arg : arg && typeof arg === "object" ? arg.text : null;
  if (typeof raw !== "string") return null;
  const sql = raw.trim().replace(/;\s*$/, "").replace(/\s+/g, " ").toUpperCase();
  if (/^(BEGIN|START TRANSACTION)\b/.test(sql)) return { kind: "begin" };
  if (/^(COMMIT|END)( (WORK|TRANSACTION))?$/.test(sql)) return { kind: "commit" };
  let m = sql.match(/^ROLLBACK( (WORK|TRANSACTION))? TO( SAVEPOINT)? ("?)([A-Z0-9_]+)\4$/);
  if (m) return { kind: "rollback_to", name: m[5] };
  if (/^(ROLLBACK|ABORT)( (WORK|TRANSACTION))?$/.test(sql)) return { kind: "rollback" };
  m = sql.match(/^SAVEPOINT ("?)([A-Z0-9_]+)\1$/);
  if (m) return { kind: "savepoint", name: m[2] };
  m = sql.match(/^RELEASE( SAVEPOINT)? ("?)([A-Z0-9_]+)\2$/);
  if (m) return { kind: "release", name: m[3] };
  return null;
}

function reset(state) {
  state.inTx = false;
  state.pending = [];
  state.savepoints = [];
}

function runAll(work) {
  for (const fn of work) {
    try {
      const out = fn();
      if (out && typeof out.catch === "function") {
        out.catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[after-commit] side effect failed:", String(err?.code || err?.message || err).slice(0, 120));
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[after-commit] side effect failed:", String(err?.code || err?.message || err).slice(0, 120));
    }
  }
}

function onSuccess(state, stmt, result) {
  switch (stmt.kind) {
    case "begin":
      reset(state);
      state.inTx = true;
      return;
    case "commit": {
      const work = state.pending;
      // COMMIT of an already-failed transaction succeeds with command tag ROLLBACK: nothing was committed.
      const committed = String(result?.command || "COMMIT").toUpperCase() !== "ROLLBACK";
      reset(state);
      if (committed) runAll(work);
      return;
    }
    case "rollback":
      reset(state);
      return;
    case "savepoint":
      if (state.inTx) state.savepoints.push({ name: stmt.name, index: state.pending.length });
      return;
    case "rollback_to": {
      const at = state.savepoints.map((s) => s.name).lastIndexOf(stmt.name);
      if (at >= 0) {
        state.pending.length = state.savepoints[at].index;
        state.savepoints.length = at + 1; // the savepoint itself survives ROLLBACK TO
      }
      return;
    }
    case "release": {
      const at = state.savepoints.map((s) => s.name).lastIndexOf(stmt.name);
      if (at >= 0) state.savepoints.length = at;
      return;
    }
    default:
  }
}

function onFailure(state, stmt) {
  // A failed COMMIT/ROLLBACK leaves nothing committed; drop pending work.
  if (stmt.kind === "commit" || stmt.kind === "rollback") reset(state);
}

/** Idempotent: wraps client.query to follow the transaction state of this connection. */
function instrumentClient(client) {
  if (!client || typeof client.query !== "function" || client[STATE]) return client;
  const state = { inTx: false, pending: [], savepoints: [] };
  Object.defineProperty(client, STATE, { value: state, enumerable: false });
  const original = client.query;
  client.query = function queryWithTransactionTracking(...args) {
    const stmt = classifyStatement(args[0]);
    const out = original.apply(this, args);
    if (stmt && out && typeof out.then === "function") {
      out.then(
        (result) => onSuccess(state, stmt, result),
        () => onFailure(state, stmt),
      );
    }
    return out;
  };
  return client;
}

/** True while `runner` is an instrumented client inside an open transaction. */
function isInTransaction(runner) {
  return Boolean(runner && runner[STATE] && runner[STATE].inTx);
}

const ISOLATION_SAVEPOINT_PREFIX = "oh_iso_sp_";
let isolationSeq = 0;

/** Internal savepoint names: fixed prefix + process-local counter. Never derived from input. */
function nextIsolationSavepointName() {
  isolationSeq = isolationSeq >= Number.MAX_SAFE_INTEGER ? 1 : isolationSeq + 1;
  return `${ISOLATION_SAVEPOINT_PREFIX}${isolationSeq}`;
}

/**
 * Runs `fn` so that a database error inside it cannot abort `runner`'s open transaction.
 *
 * Inside a transaction: SAVEPOINT → fn → RELEASE. If `fn` throws: ROLLBACK TO SAVEPOINT → RELEASE, then the
 * error is rethrown unchanged (callers keep their own semantics: best-effort callers swallow it, others fail as
 * before). Work registered with runAfterCommit() inside `fn` is discarded together with the rolled-back writes.
 * Outside a transaction (pool, autocommit client, unknown runner) `fn` simply runs — no extra round trips.
 *
 * `onError(err, txState)` is told whether the surrounding transaction is still usable ("survived") or not
 * ("aborted": the savepoint could not be created or rolled back — the transaction had already failed or the
 * connection broke). Sequential use only: never run two isolated sections concurrently on one client.
 */
async function runInSavepoint(runner, fn, { onError } = {}) {
  if (!isInTransaction(runner)) return fn();
  const name = nextIsolationSavepointName();
  try {
    await runner.query(`SAVEPOINT ${name}`);
  } catch (err) {
    if (onError) onError(err, "aborted");
    throw err;
  }
  let result;
  try {
    result = await fn();
  } catch (err) {
    let txState = "aborted";
    try {
      await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
      await runner.query(`RELEASE SAVEPOINT ${name}`);
      txState = "survived";
    } catch {
      /* transaction unusable: the caller's COMMIT will not commit (tracked above) */
    }
    if (onError) onError(err, txState);
    throw err;
  }
  try {
    await runner.query(`RELEASE SAVEPOINT ${name}`);
  } catch (err) {
    if (onError) onError(err, "aborted");
    throw err;
  }
  return result;
}

/**
 * Runs `fn` now, or — when `runner` is inside an open transaction — once after that transaction commits.
 * @returns {"immediate" | "deferred"}
 */
function runAfterCommit(runner, fn) {
  if (typeof fn !== "function") return "immediate";
  if (isInTransaction(runner)) {
    runner[STATE].pending.push(fn);
    return "deferred";
  }
  runAll([fn]);
  return "immediate";
}

module.exports = {
  instrumentClient,
  isInTransaction,
  runAfterCommit,
  runInSavepoint,
  classifyStatement,
  ISOLATION_SAVEPOINT_PREFIX,
};
