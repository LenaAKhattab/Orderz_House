import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidEmailSyntax, normalizeEmailInput } from "./utils/emailInput.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const BASE = "omarnabulsi@gmail.com";
const check = (raw) => isValidEmailSyntax(normalizeEmailInput(raw));

describe("auth email input (incident 2026-10-25)", () => {
  it("accepts the reported address and real-world variants", () => {
    const variants = [
      BASE,
      BASE.toUpperCase(),
      ` ${BASE}`,
      `${BASE} `,
      `  ${BASE}  `,
      `\u00A0${BASE}\u00A0`,
      `\u200B${BASE}\u200B`,
      `\uFEFF${BASE}`,
      `\u200E${BASE}\u200E`,
      `\u200F${BASE}`,
      `\u202B${BASE}\u202C`,
      // Addresses containing the letter "s" were rejected by the broken login regex.
      "sara.saleh@users.com",
      "first.last+tag@sub.example.com",
    ];
    for (const raw of variants) {
      assert.ok(check(raw), `rejected ${JSON.stringify(raw)}`);
    }
    assert.equal(normalizeEmailInput(`\u200F  ${BASE.toUpperCase()}\u00A0`), BASE);
  });

  it("rejects malformed and injection-style input", () => {
    for (const raw of ["", "   ", "omarnabulsigmail.com", "omarnabulsi@", "@gmail.com", "omar@gmail", "omar nabulsi@gmail.com", "omar@gmail.com\nBcc: x@y.com", "omar\u200Bnabulsi@gmail.com"]) {
      assert.ok(!check(raw), `accepted ${JSON.stringify(raw)}`);
    }
  });

  it("login, register and forgot password all use the canonical helpers", () => {
    for (const page of ["pages/Login.jsx", "pages/Register.jsx", "pages/ForgotPassword.jsx"]) {
      const src = read(page);
      assert.match(src, /from "\.\.\/utils\/emailInput"/, page);
      assert.match(src, /isValidEmailSyntax\(/, page);
      assert.ok(!/email\.trim\(\)/.test(src), `${page} still trims ad hoc`);
    }
    assert.match(read("pages/Login.jsx"), /await login\(normalizedEmail, password\)/);
  });

  it("no source file carries a regex with an escaped-away \\s (the root cause)", () => {
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(jsx?|mjs)$/.test(name) && !name.endsWith(".test.js") && /\[\^s@\]/.test(readFileSync(p, "utf8"))) offenders.push(p);
      }
    };
    walk(here);
    assert.deepEqual(offenders, []);
  });
});
