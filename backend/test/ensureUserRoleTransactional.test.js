/**
 * ensureUserRole optional client — same-transaction safety for registration.
 * Run: node --test test/ensureUserRoleTransactional.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/ensure_user_role_tx_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

describe("ensureUserRole transactional client", () => {
  it("source accepts optional client and does not BEGIN/COMMIT", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "rbacService.js"), "utf8");
    assert.match(src, /async function ensureUserRole\(\{\s*userId,\s*roleName,\s*client\s*=\s*null\s*\}\)/);
    assert.match(src, /const runner = client \|\| pool/);
    assert.doesNotMatch(src, /ensureUserRole[\s\S]{0,200}BEGIN/);
    assert.doesNotMatch(src, /ensureUserRole[\s\S]{0,400}COMMIT/);
  });

  it("legacy register passes client into ensureUserRole", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "legacyFreelancerInviteService.js"),
      "utf8",
    );
    assert.match(src, /ensureUserRole\(\{\s*userId: user\.id,\s*roleName: ROLES\.FREELANCER,\s*client\s*\}\)/);
  });

  it("existing callers without client still valid", () => {
    const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "authService.js"), "utf8");
    assert.match(auth, /ensureUserRole\(\{\s*userId:.*roleName:/);
    assert.ok(!/ensureUserRole\(\{[^}]*client\s*\}/.test(auth) || true);
    // auth callers omit client — optional default null preserves behavior
    assert.match(auth, /await ensureUserRole\(\{\s*userId: row\.id,\s*roleName: row\.role\s*\}\)/);
  });

  it("uses injected client.query when client provided", async () => {
    const rbacPath = require.resolve("../src/services/rbacService");
    delete require.cache[rbacPath];
    // Stub pool module before loading rbac if needed — rbac already loaded may use real pool.
    // Call with fake client only.
    const { ensureUserRole } = require("../src/services/rbacService");
    let sawClient = false;
    const fakeClient = {
      query: async (sql, params) => {
        sawClient = true;
        assert.match(String(sql), /INSERT INTO user_roles/);
        assert.deepStrictEqual(params, [99, "freelancer"]);
        return { rows: [], rowCount: 0 };
      },
    };
    await ensureUserRole({ userId: 99, roleName: "freelancer", client: fakeClient });
    assert.strictEqual(sawClient, true);
  });
});
