/**
 * Auth email normalization: boundary whitespace/invisible characters are stripped, the address is
 * lowercased, invisible characters inside the address are rejected (validator's isEmail accepts them).
 * Run: node --test test/authEmailNormalization.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/auth_email_normalization_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { validationResult } = require("express-validator");
const { normalizeEmailInput, hasInvisibleEmailChars, sqlEmailEquals } = require("../src/utils/emailNormalization");
const validators = require("../src/validators/authValidators");

const BASE = "omarnabulsi@gmail.com";

async function runEmail(chain, email) {
  const req = { body: { email, password: "Passw0rd!", otp: "123456", resetToken: "x".repeat(32), newPassword: "Passw0rd!1" } };
  for (const v of chain) await v.run(req);
  const emailErrors = validationResult(req).array().filter((e) => e.path === "email");
  return { ok: emailErrors.length === 0, email: req.body.email, errors: emailErrors };
}

describe("normalizeEmailInput", () => {
  const valid = {
    plain: BASE,
    upper: BASE.toUpperCase(),
    leading: ` ${BASE}`,
    trailing: `${BASE} `,
    surrounding: `  ${BASE}  `,
    tabsNewlines: `\t${BASE}\n`,
    nbsp: `\u00A0${BASE}\u00A0`,
    zeroWidth: `\u200B${BASE}\u200B`,
    bom: `\uFEFF${BASE}`,
    lrm: `\u200E${BASE}\u200E`,
    rlm: `\u200F${BASE}`,
    rtlEmbedding: `\u202B${BASE}\u202C`,
    isolate: `\u2067${BASE}\u2069`,
  };
  for (const [name, raw] of Object.entries(valid)) {
    it(`strips boundary characters: ${name}`, () => {
      assert.equal(normalizeEmailInput(raw), BASE);
    });
  }

  it("removes invisible characters anywhere but keeps real address characters", () => {
    assert.equal(normalizeEmailInput("omar\u200Bnabulsi@gmail.com"), BASE);
    assert.ok(!hasInvisibleEmailChars(normalizeEmailInput("omar\u200Bnabulsi@gmail.com")));
    assert.equal(normalizeEmailInput("first.last+tag@sub.example.com"), "first.last+tag@sub.example.com");
  });

  it("handles nullish input", () => {
    assert.equal(normalizeEmailInput(undefined), "");
    assert.equal(normalizeEmailInput(null), "");
  });
});

describe("auth validators use the canonical email", () => {
  const chains = {
    login: validators.loginValidators,
    register: validators.registerValidators,
    forgotPassword: validators.forgotPasswordValidators,
    verifyForgotOtp: validators.verifyForgotPasswordOtpValidators,
    resetPassword: validators.resetPasswordValidators,
    resendRegisterOtp: validators.resendRegisterOtpValidators,
    verifyRegisterOtp: validators.verifyRegisterOtpValidators,
  };

  for (const [name, chain] of Object.entries(chains)) {
    it(`${name}: accepts and canonicalizes legitimate variants`, async () => {
      assert.ok(Array.isArray(chain), `${name} validators exported`);
      for (const raw of [BASE, BASE.toUpperCase(), `  ${BASE}  `, `\u00A0${BASE}`, `\u200F${BASE}\u200E`, `\u200B${BASE}\uFEFF`, "omar\u200Bnabulsi@gmail.com"]) {
        const r = await runEmail(chain, raw);
        assert.ok(r.ok, `${name} rejected ${JSON.stringify(raw)}: ${JSON.stringify(r.errors)}`);
        assert.equal(r.email, BASE, `${name} did not canonicalize ${JSON.stringify(raw)}`);
      }
    });

    it(`${name}: still rejects malformed addresses`, async () => {
      for (const raw of ["omarnabulsigmail.com", "omarnabulsi@", "@gmail.com", "omar nabulsi@gmail.com", "omar@gmail.com\nBcc: x@y.com", ""]) {
        const r = await runEmail(chain, raw);
        assert.ok(!r.ok, `${name} accepted ${JSON.stringify(raw)}`);
      }
    });
  }
});

describe("legacy accounts with invisible characters stored in users.email", () => {
  it("lookups compare the stored address with invisible characters removed", () => {
    const sql = sqlEmailEquals("email", "$1");
    assert.ok(sql.includes("lower(email::text) = lower($1::text)"), sql);
    assert.ok(sql.includes("regexp_replace(email::text, '["), sql);
    assert.ok(sql.includes("'', 'g')) = lower($1::text)"), sql);
    assert.ok(!sql.includes(String.fromCharCode(92)), "no escape sequences in SQL text");
  });

  it("login, register duplicate check and OTP user lookups use the tolerant predicate", () => {
    const fsMod = require("node:fs");
    const auth = fsMod.readFileSync(require.resolve("../src/services/authService.js"), "utf8");
    const otp = fsMod.readFileSync(require.resolve("../src/services/authOtpService.js"), "utf8");
    const tolerant = "FROM users WHERE ${sqlEmailEquals(" + '"email", "$1"' + ")}";
    assert.equal(auth.split(tolerant).length - 1, 3);
    assert.equal(otp.split(tolerant).length - 1, 3);
    assert.ok(!(auth + otp).includes("FROM users WHERE lower(email::text) = lower("));
  });
});
