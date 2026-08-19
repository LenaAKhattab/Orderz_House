/**
 * Phase 0D — isolated local apply of 164 + OrderzHouse-only manual-link QA.
 *
 * NEVER uses the workstation DATABASE_URL (currently production Neon).
 * NEVER git add/commit/deploy. Does not call Bildazo. Does not collect passwords.
 *
 * Usage (from backend/):
 *   node scripts/runBildazoAuthorLinkPhase0dGate.js
 */

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const dotenv = require("dotenv");
const {
  classifyDatabaseUrl,
  maskDatabaseTarget,
  scanSqlForDangerousStatements,
} = require("../src/utils/databaseEnvironmentSafety");
const {
  ensureMigrationsTable,
  listAppliedMigrationVersions,
  applyOneMigration,
  DEFAULT_MIGRATIONS_DIR,
} = require("./lib/migrationRunnerCore");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "bildazo_author_link_0d_pg");
const PORT = 55464;
const DB_NAME = "orderz_house_bildazo_0d";
const USER = "postgres";
const PASSWORD = "password";
const MIGRATION_FILE = "164_freelancer_bildazo_author_links.sql";
const MIGRATION_VERSION = "164_freelancer_bildazo_author_links";

function buildUrl(database = DB_NAME) {
  return `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${database}`;
}

function classifyWorkstationEnvFile() {
  const envPath = path.join(BACKEND_ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    return { missing: true, classification: "MISSING", isProduction: false, maskedTarget: "(no backend/.env)" };
  }
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  const db = classifyDatabaseUrl(parsed.DATABASE_URL);
  return {
    missing: false,
    ...db,
    appEnv: String(parsed.APP_ENV || "").trim() || "(unset)",
    stripeLive: /^sk_live_/i.test(String(parsed.STRIPE_SECRET_KEY || "")),
  };
}

async function startEmbeddedPostgres() {
  let EmbeddedPostgres;
  try {
    ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
  } catch {
    throw new Error(
      "embedded-postgres is required for Phase 0D isolated migrate. Install: npm install --no-save embedded-postgres@18.4.0-beta.17",
    );
  }
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB_NAME);
  return pg;
}

async function bootstrapUsers(client) {
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      account_id VARCHAR(32) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT 'x',
      role VARCHAR(32) NOT NULL,
      first_name VARCHAR(80) NOT NULL DEFAULT '',
      father_name VARCHAR(80) NOT NULL DEFAULT '',
      family_name VARCHAR(80) NOT NULL DEFAULT '',
      phone VARCHAR(32) NOT NULL DEFAULT '',
      country VARCHAR(8) NOT NULL DEFAULT 'JO',
      bio TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      email_verified BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function reviewMigrationSql() {
  const filePath = path.join(DEFAULT_MIGRATIONS_DIR, MIGRATION_FILE);
  const raw = fs.readFileSync(filePath, "utf8");
  const scan = scanSqlForDangerousStatements(raw);
  const stripped = raw
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  const scanNoComments = scanSqlForDangerousStatements(stripped);
  return {
    filePath,
    raw,
    scan,
    scanNoComments,
    hasCreateTable: /CREATE TABLE IF NOT EXISTS freelancer_bildazo_author_links/i.test(raw),
    hasDropTable: /\bDROP TABLE\b/i.test(stripped),
    hasDeleteFrom: /\bDELETE FROM\b/i.test(stripped),
    hasTruncateTable: /\bTRUNCATE TABLE\b/i.test(stripped),
    hasDestructiveAlter: /\bALTER TABLE\b[\s\S]*\bDROP\b/i.test(stripped),
  };
}

async function seedActors(client) {
  const freelancer = await client.query(
    `INSERT INTO users (account_id, email, role, first_name, father_name, family_name, phone, country, email_verified)
     VALUES ('FL00000001', 'freelancer@orderzhouse.test', 'freelancer', 'أحمد', 'علي', 'حسن', '+962790000001', 'JO', TRUE)
     RETURNING id, email`,
  );
  const unlinked = await client.query(
    `INSERT INTO users (account_id, email, role, first_name, father_name, family_name, phone, country, email_verified)
     VALUES ('FL00000002', 'unlinked@orderzhouse.test', 'freelancer', 'سارة', 'محمد', 'خالد', '+962790000002', 'JO', TRUE)
     RETURNING id, email`,
  );
  const admin = await client.query(
    `INSERT INTO users (account_id, email, role, first_name, father_name, family_name, phone, country, email_verified)
     VALUES ('SA00000001', 'superadmin@orderzhouse.test', 'super_admin', 'Admin', 'Orderz', 'House', '+962790000099', 'JO', TRUE)
     RETURNING id, email`,
  );
  const clientUser = await client.query(
    `INSERT INTO users (account_id, email, role, first_name, father_name, family_name, phone, country, email_verified)
     VALUES ('CL00000001', 'client@orderzhouse.test', 'client', 'عميل', 'تجربة', 'اختبار', '+962790000003', 'JO', TRUE)
     RETURNING id, email`,
  );
  return {
    freelancer: freelancer.rows[0],
    unlinked: unlinked.rows[0],
    admin: admin.rows[0],
    clientUser: clientUser.rows[0],
  };
}

function termsBody(overrides = {}) {
  return {
    acceptedTermsVersion: "2026-08-18-v1",
    acceptedTermsAcknowledged: true,
    ...overrides,
  };
}

async function runQa(client, actors) {
  const { clearBildazoAuthorLinkSchemaCache } = require("../src/utils/bildazoAuthorLinkSchema");
  const {
    getMyBildazoAuthorLink,
    submitBildazoAuthorLinkRequest,
    assertBildazoAuthorLinkedForArticleApply,
  } = require("../src/services/bildazoAuthorLinkService");
  const {
    listBildazoAuthorLinks,
    manualLinkBildazoAuthor,
  } = require("../src/services/bildazoAuthorLinkAdminService");
  const db = client;

  clearBildazoAuthorLinkSchemaCache();

  const empty = await getMyBildazoAuthorLink(actors.freelancer.id, { db });
  assert.equal(empty.status, "not_started");
  assert.equal(empty.orderzVerifiedEmail, actors.freelancer.email);
  assert.equal(empty.canApplyToArticles, true); // gate default off

  const created = await submitBildazoAuthorLinkRequest(
    actors.freelancer.id,
    termsBody({
      linkFlow: "new_account",
      fullName: "أحمد علي حسن",
      email: "spoof@evil.test",
      phoneE164: "+962790000001",
      countryIso: "JO",
    }),
    { db },
  );
  assert.equal(created.link.status, "pending_new_account");
  assert.equal(created.link.orderzVerifiedEmail, actors.freelancer.email);
  assert.notEqual(created.link.orderzVerifiedEmail, "spoof@evil.test");

  await assert.rejects(
    () =>
      submitBildazoAuthorLinkRequest(
        actors.freelancer.id,
        termsBody({ linkFlow: "new_account", fullName: "أحمد علي حسن", password: "secret" }),
        { db },
      ),
    (err) => err.publicCode === "BILDAZO_AUTHOR_PASSWORD_NOT_ALLOWED",
  );

  const sameEmail = await submitBildazoAuthorLinkRequest(
    actors.freelancer.id,
    termsBody({
      linkFlow: "existing_account",
      existingBildazoEmail: actors.freelancer.email,
    }),
    { db },
  );
  assert.equal(sameEmail.link.status, "pending_existing_account");
  assert.equal(sameEmail.link.submitted.emailMatchesOrderz, true);

  const differentEmail = await submitBildazoAuthorLinkRequest(
    actors.freelancer.id,
    termsBody({
      linkFlow: "existing_account",
      existingBildazoEmail: "other-writer@bildazo.test",
    }),
    { db },
  );
  assert.equal(differentEmail.link.status, "pending_external_verification");
  assert.notEqual(differentEmail.link.status, "linked");
  assert.equal(differentEmail.link.submitted.emailMatchesOrderz, false);

  const byPublicId = await submitBildazoAuthorLinkRequest(
    actors.freelancer.id,
    termsBody({
      linkFlow: "existing_account",
      existingBildazoPublicId: "writer-qa-1",
      existingBildazoProfileUrl: "https://bildazo.com/u/writer-qa-1",
    }),
    { db },
  );
  assert.equal(byPublicId.link.status, "pending_existing_account");

  await assert.rejects(
    () => getMyBildazoAuthorLink(actors.clientUser.id, { db }),
    (err) => err.statusCode === 403,
  );

  const listed = await listBildazoAuthorLinks({ status: "pending_existing_account" }, { db });
  assert.ok(listed.items.some((row) => String(row.freelancerUserId) === String(actors.freelancer.id)));

  await assert.rejects(
    () =>
      manualLinkBildazoAuthor(
        listed.items[0].id,
        { bildazoPublicId: "writer-qa-1", bildazoProfileUrl: "https://bildazo.com/u/writer-qa-1" },
        actors.admin.id,
        { db },
      ),
    (err) => err.publicCode === "BILDAZO_AUTHOR_LINK_CONFIRM_REQUIRED",
  );

  const linked = await manualLinkBildazoAuthor(
    listed.items[0].id,
    {
      confirmVerified: true,
      bildazoUserId: "42",
      bildazoPublicId: "writer-qa-1",
      bildazoProfileUrl: "https://bildazo.com/u/writer-qa-1",
      manualReviewReason: "Phase 0D isolated QA verification",
    },
    actors.admin.id,
    { db },
  );
  assert.equal(linked.link.status, "linked");
  assert.equal(linked.link.bildazoPublicId, "writer-qa-1");
  assert.equal(linked.link.bildazoProfileUrl, "https://bildazo.com/u/writer-qa-1");
  assert.equal(linked.link.linkedByUserId, String(actors.admin.id));
  assert.ok(linked.link.linkedAt);

  const meLinked = await getMyBildazoAuthorLink(actors.freelancer.id, { db });
  assert.equal(meLinked.status, "linked");
  assert.equal(meLinked.linked.bildazoPublicId, "writer-qa-1");
  assert.equal(meLinked.linked.bildazoProfileUrl, "https://bildazo.com/u/writer-qa-1");
  assert.equal(meLinked.messageKey, "linked");

  delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
  const gateOffUnlinked = await assertBildazoAuthorLinkedForArticleApply(actors.unlinked.id, { db });
  assert.equal(gateOffUnlinked.required, false);

  process.env.BILDAZO_AUTHOR_GATE_ENABLED = "true";
  await assert.rejects(
    () => assertBildazoAuthorLinkedForArticleApply(actors.unlinked.id, { db }),
    (err) => err.statusCode === 409 && err.publicCode === "BILDAZO_AUTHOR_LINK_REQUIRED",
  );
  const gateOnLinked = await assertBildazoAuthorLinkedForArticleApply(actors.freelancer.id, { db });
  assert.equal(gateOnLinked.linked, true);
  delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;

  const src = fs.readFileSync(
    path.join(BACKEND_ROOT, "src/services/marketplaceArticleApplicationsService.js"),
    "utf8",
  );
  const gateAt = src.indexOf("assertBildazoAuthorLinkedForArticleApply");
  const reserveAt = src.indexOf("reserveBidCreditsFefo");
  assert.ok(gateAt > 0 && reserveAt > gateAt, "gate must run before Bid reserve");

  return {
    pendingNewAccount: created.link.status,
    existingSameEmail: sameEmail.link.status,
    existingDifferentEmail: differentEmail.link.status,
    existingPublicId: byPublicId.link.status,
    linkedStatus: linked.link.status,
    linkedPublicId: linked.link.bildazoPublicId,
    linkedBy: linked.link.linkedByUserId,
    freelancerLinkedMessageKey: meLinked.messageKey,
  };
}

async function main() {
  const workstation = classifyWorkstationEnvFile();
  const review = reviewMigrationSql();

  console.log("\n=== Phase 0D Bildazo author link staging QA ===");
  console.log(`Workstation APP_ENV:     ${workstation.appEnv || "(n/a)"}`);
  console.log(`Workstation DB:          ${workstation.maskedTarget}`);
  console.log(`Workstation class:       ${workstation.classification}${workstation.isProduction ? "  <<< PRODUCTION — NOT TOUCHED" : ""}`);
  console.log(`Migration file:          ${MIGRATION_FILE}`);
  console.log(`CREATE TABLE:            ${review.hasCreateTable}`);
  console.log(`DROP/DELETE/TRUNCATE (SQL, comments stripped): ${review.hasDropTable || review.hasDeleteFrom || review.hasTruncateTable}`);
  console.log(`Dangerous scan (raw file, includes comments): ${review.scan.findings.join(", ") || "(none)"}`);
  console.log(`Dangerous scan (no comments): ${review.scanNoComments.findings.join(", ") || "(none)"}`);

  if (workstation.isProduction) {
    console.log("\nREFUSED: npm run db:migrate against workstation DATABASE_URL (production Neon).");
    console.log("Applying 164 only on an isolated local embedded Postgres cluster.");
  }

  assert.equal(review.hasDropTable, false);
  assert.equal(review.hasDeleteFrom, false);
  assert.equal(review.hasTruncateTable, false);
  assert.equal(review.hasDestructiveAlter, false);
  assert.equal(review.hasCreateTable, true);

  const isolatedUrl = buildUrl();
  const isolatedClass = classifyDatabaseUrl(isolatedUrl);
  if (isolatedClass.isProduction || (!isolatedClass.looksLocal && isolatedClass.classification !== "ISOLATED_TEST")) {
    throw new Error(`Refusing isolated migrate on ${isolatedClass.maskedTarget} (${isolatedClass.classification})`);
  }

  let pg;
  const client = new Client({ connectionString: isolatedUrl, ssl: false });
  try {
    pg = await startEmbeddedPostgres();
    process.env.DATABASE_URL = isolatedUrl;
    process.env.APP_ENV = "local";
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "phase0d-isolated-jwt-secret";
    process.env.CLIENT_URL = "http://localhost:5173";
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;

    await client.connect();
    await ensureMigrationsTable(client);
    await bootstrapUsers(client);

    const appliedBefore = await listAppliedMigrationVersions(client);
    const { rows: tableBefore } = await client.query(
      `SELECT to_regclass('public.freelancer_bildazo_author_links') AS tbl`,
    );
    console.log("\n=== Isolated local target ===");
    console.log(`Database:               ${maskDatabaseTarget(isolatedUrl)}`);
    console.log(`Classification:         ${isolatedClass.classification}`);
    console.log(`Applied before:         ${appliedBefore.length}`);
    console.log(`164 registered before:  ${appliedBefore.includes(MIGRATION_VERSION)}`);
    console.log(`Table exists before:    ${Boolean(tableBefore[0]?.tbl)}`);

    const migration = {
      file: MIGRATION_FILE,
      version: MIGRATION_VERSION,
      filePath: review.filePath,
      raw: review.raw,
      scan: review.scanNoComments,
    };
    await applyOneMigration(client, migration);

    const appliedAfter = await listAppliedMigrationVersions(client);
    const { rows: tableAfter } = await client.query(
      `SELECT to_regclass('public.freelancer_bildazo_author_links') AS tbl`,
    );
    console.log(`Applied after:          ${appliedAfter.length}`);
    console.log(`164 registered after:   ${appliedAfter.includes(MIGRATION_VERSION)}`);
    console.log(`Table exists after:     ${Boolean(tableAfter[0]?.tbl)}`);

    const actors = await seedActors(client);
    const qa = await runQa(client, actors);
    console.log("\n=== QA results ===");
    console.log(JSON.stringify(qa, null, 2));
    console.log("\nPhase 0D isolated migrate + QA: PASS");
    console.log("Recommendation: production may later apply 164 via db:migrate:production; keep BILDAZO_AUTHOR_GATE_ENABLED=false until then.");
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    if (pg) {
      try {
        await pg.stop();
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error("Phase 0D FAIL:", err && err.message ? err.message : err);
  process.exit(1);
});
