const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const BACKEND = "C:/Users/Batman/Desktop/Orderz_House/backend";
const DATA_DIR = path.join(BACKEND, ".tmp", "marketplace_work_token_review_probe_pg");
const PORT = 55434;
const DB_NAME = "orderz_house_test";
const USER = "postgres";
const PASSWORD = "password";
const URL = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;

process.chdir(BACKEND);
module.paths.unshift(path.join(BACKEND, "node_modules"));

async function main() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const { splitSqlStatements, stripSqlLineComments } = require(path.join(BACKEND, "scripts/lib/splitSqlStatements"));
  const { classifyDatabaseUrl } = require(path.join(BACKEND, "src/utils/databaseEnvironmentSafety"));

  const cls = classifyDatabaseUrl(URL);
  if (cls.isProduction) throw new Error("refuse production");

  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR, user: USER, password: PASSWORD, port: PORT, persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB_NAME);

  const client = new Client({ connectionString: URL, ssl: false });
  await client.connect();
  const runFile = async (p) => {
    const raw = fs.readFileSync(p, "utf8");
    for (const stmt of splitSqlStatements(stripSqlLineComments(raw))) await client.query(stmt);
  };
  await runFile(path.join(BACKEND, "sql/init.sql"));
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE`);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  for (const f of [
    "134_marketplace_membership_plans.sql",
    "135_marketplace_economy_settings.sql",
    "136_marketplace_membership_priority_bid.sql",
    "137_marketplace_memberships_cycles.sql",
    "138_marketplace_membership_phase3_1_hardening.sql",
    "139_marketplace_work_token_wallet_ledger.sql",
  ]) {
    await runFile(path.join(BACKEND, "sql/migrations", f));
    await client.query(`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, [f.replace(/\.sql$/i, "")]);
  }
  // migration-only empty check before service mutations
  const empty = await client.query(`SELECT
    (SELECT COUNT(*)::int FROM freelancer_work_token_wallets) AS wallets,
    (SELECT COUNT(*)::int FROM work_token_reservations) AS reservations,
    (SELECT COUNT(*)::int FROM work_token_ledger_entries) AS ledger`);
  await client.end();

  process.env.DATABASE_URL = URL;
  process.env.APP_ENV = "test";
  process.env.ORDERZ_GATE_ISOLATED_DB = "1";
  process.env.JWT_SECRET = "review-probe-secret-32chars!!";
  delete process.env.STRIPE_SECRET_KEY;

  Object.keys(require.cache).forEach((k) => {
    if (k.replace(/\\/g,"/").includes("Orderz_House/backend")) delete require.cache[k];
  });

  const { pool } = require(path.join(BACKEND, "src/config/db"));
  const svc = require(path.join(BACKEND, "src/services/marketplaceWorkTokenWalletService"));

  async function seedUser() {
    const suffix = Math.random().toString(16).slice(2, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (account_id, email, password_hash, role, first_name, father_name, family_name, phone, whatsapp, gender, country, is_active, terms_accepted, email_verified)
       VALUES ($1,$2,'x','freelancer','R','T','U',$3,$3,'ذكر','JO',TRUE,TRUE,TRUE) RETURNING id`,
      [`R${suffix}`.slice(0,10).toUpperCase(), `r_${suffix}@ex.com`, `+9627${String(Math.floor(Math.random()*1e8)).padStart(8,"0")}`],
    );
    return rows[0].id;
  }

  const results = { emptyAfterMigrationOnly: empty.rows[0] };

  {
    const uid = await seedUser();
    await svc.creditWorkTokens({ freelancerUserId: uid, amountTokens: 500, referenceType: "t", referenceId: `c-${uid}` });
    await svc.reserveWorkTokens({ freelancerUserId: uid, amountTokens: 100, referenceType: "bid", referenceId: "X", eventType: "PRIORITY_BID_RESERVE" });
    const i1 = await svc.increaseWorkTokenReservation({ freelancerUserId: uid, referenceType: "bid", referenceId: "X", desiredTotal: 180, eventType: "PRIORITY_BID_INCREASE_RESERVE" });
    const i2 = await svc.increaseWorkTokenReservation({ freelancerUserId: uid, referenceType: "bid", referenceId: "X", desiredTotal: 220, eventType: "PRIORITY_BID_INCREASE_RESERVE" });
    const i2r = await svc.increaseWorkTokenReservation({ freelancerUserId: uid, referenceType: "bid", referenceId: "X", desiredTotal: 220, eventType: "PRIORITY_BID_INCREASE_RESERVE" });
    const snap = await svc.getWorkTokenWalletSnapshot(uid);
    const { rows: ledger } = await pool.query(
      `SELECT event_type, amount_tokens, reference_id FROM work_token_ledger_entries WHERE freelancer_user_id=$1 AND balance_effect='reserve' ORDER BY id`,
      [uid],
    );
    results.multipleIncreases = {
      after1: { avail: i1.wallet.availableTokens, res: i1.wallet.reservedTokens, delta: i1.delta },
      after2: { avail: i2.wallet.availableTokens, res: i2.wallet.reservedTokens, delta: i2.delta },
      retry2: { idempotent: i2r.idempotent, avail: i2r.wallet.availableTokens, res: i2r.wallet.reservedTokens },
      final: snap,
      ledgerReserveEvents: ledger,
      ok: snap.availableTokens === 280 && snap.reservedTokens === 220 && i1.delta === 80 && i2.delta === 40 && i2r.idempotent === true
        && ledger.length === 3 && Number(ledger[0].amount_tokens) === 100 && Number(ledger[1].amount_tokens) === 80 && Number(ledger[2].amount_tokens) === 40,
    };
  }

  {
    const a = await seedUser();
    const b = await seedUser();
    await svc.creditWorkTokens({ freelancerUserId: a, amountTokens: 50, referenceType: "t", referenceId: `c-${a}` });
    await svc.creditWorkTokens({ freelancerUserId: b, amountTokens: 50, referenceType: "t", referenceId: `c-${b}` });
    await svc.reserveWorkTokens({ freelancerUserId: a, amountTokens: 10, referenceType: "priority_bid", referenceId: "123" });
    let errCode = null; let errMsg = null;
    try {
      await svc.reserveWorkTokens({ freelancerUserId: b, amountTokens: 10, referenceType: "priority_bid", referenceId: "123" });
    } catch (e) {
      errCode = e.publicCode || e.code || null;
      errMsg = e.message;
    }
    const { rows } = await pool.query(`SELECT freelancer_user_id FROM work_token_reservations WHERE reference_type='priority_bid' AND reference_id='123'`);
    results.crossWalletSameRef = {
      secondError: errCode,
      secondMessage: errMsg,
      reservationRows: rows.length,
      blockedSecondFreelancer: rows.length === 1 && errCode != null,
    };
  }

  {
    const uid = await seedUser();
    await svc.creditWorkTokens({ freelancerUserId: uid, amountTokens: 200, referenceType: "t", referenceId: `c-${uid}` });
    const settled = await Promise.allSettled([
      svc.reserveWorkTokens({ freelancerUserId: uid, amountTokens: 50, referenceType: "same", referenceId: "S1" }),
      svc.reserveWorkTokens({ freelancerUserId: uid, amountTokens: 50, referenceType: "same", referenceId: "S1" }),
    ]);
    const snap = await svc.getWorkTokenWalletSnapshot(uid);
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM work_token_reservations WHERE reference_type='same' AND reference_id='S1'`);
    results.concurrentSameRef = {
      fulfilled: settled.filter((x) => x.status === "fulfilled").length,
      rejected: settled.filter((x) => x.status === "rejected").length,
      rejectCodes: settled.filter((x)=>x.status==="rejected").map((r) => r.reason?.publicCode || r.reason?.code),
      snap,
      reservationCount: rows[0].c,
      ok: rows[0].c === 1 && snap.reservedTokens === 50 && snap.availableTokens === 150,
    };
  }

  {
    const uid = await seedUser();
    await svc.creditWorkTokens({ freelancerUserId: uid, amountTokens: 200, referenceType: "t", referenceId: `c-${uid}` });
    await svc.reserveWorkTokens({ freelancerUserId: uid, amountTokens: 80, referenceType: "race", referenceId: "RC1" });
    const settled = await Promise.allSettled([
      svc.releaseWorkTokenReservation({ freelancerUserId: uid, referenceType: "race", referenceId: "RC1" }),
      svc.consumeWorkTokenReservation({ freelancerUserId: uid, referenceType: "race", referenceId: "RC1" }),
    ]);
    const { rows: res } = await pool.query(`SELECT status, reserved_tokens, consumed_tokens FROM work_token_reservations WHERE reference_type='race' AND reference_id='RC1'`);
    const snap = await svc.getWorkTokenWalletSnapshot(uid);
    const integrity = await svc.verifyWorkTokenWalletIntegrity(uid);
    results.releaseVsConsume = {
      fulfilled: settled.filter((x) => x.status === "fulfilled").length,
      rejected: settled.filter((x) => x.status === "rejected").length,
      rejectCodes: settled.filter((x)=>x.status==="rejected").map((r) => r.reason?.publicCode),
      reservation: res[0],
      snap,
      integrityOk: integrity.ok,
      exactlyOneTerminal: res[0] && (res[0].status === "released" || res[0].status === "consumed"),
      consistent:
        (res[0]?.status === "released" && snap.availableTokens === 200 && snap.reservedTokens === 0) ||
        (res[0]?.status === "consumed" && snap.availableTokens === 120 && snap.reservedTokens === 0),
    };
  }

  {
    const uid = await seedUser();
    await svc.creditWorkTokens({ freelancerUserId: uid, amountTokens: 500, referenceType: "t", referenceId: `c-${uid}` });
    await svc.reserveWorkTokens({ freelancerUserId: uid, amountTokens: 100, referenceType: "inc", referenceId: "I1", eventType: "PRIORITY_BID_RESERVE" });
    const settled = await Promise.allSettled([
      svc.increaseWorkTokenReservation({ freelancerUserId: uid, referenceType: "inc", referenceId: "I1", desiredTotal: 180, eventType: "PRIORITY_BID_INCREASE_RESERVE" }),
      svc.increaseWorkTokenReservation({ freelancerUserId: uid, referenceType: "inc", referenceId: "I1", desiredTotal: 220, eventType: "PRIORITY_BID_INCREASE_RESERVE" }),
    ]);
    const snap = await svc.getWorkTokenWalletSnapshot(uid);
    const integrity = await svc.verifyWorkTokenWalletIntegrity(uid);
    results.concurrentIncrease = {
      outcomes: settled.map((s) => s.status === "fulfilled" ? { ok: true, delta: s.value.delta, reserved: s.value.reservation?.reservedTokens, idem: s.value.idempotent } : { ok: false, code: s.reason?.publicCode, msg: s.reason?.message }),
      snap,
      integrityOk: integrity.ok,
      consistent: integrity.ok && (snap.reservedTokens === 180 || snap.reservedTokens === 220) && (snap.availableTokens + snap.reservedTokens === 500),
    };
  }

  console.log(JSON.stringify(results, null, 2));
  await pool.end();
  await pg.stop();
}

main().catch(async (e) => {
  console.error("PROBE_FAIL", e);
  process.exit(1);
});
