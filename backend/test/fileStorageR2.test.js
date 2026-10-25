/**
 * Canonical private file storage (Cloudflare R2 + legacy dual-read).
 * No network, no database: R2 is a fake S3 client; authorization uses a fake query runner.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Readable, PassThrough } = require("node:stream");

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://u:p@localhost:5432/unit_tests_only";

const r2 = require("../src/config/r2");
const fileStorage = require("../src/services/fileStorageService");
const { pipeOrderFileToResponse, contentDisposition } = require("../src/utils/pipeOrderFileDownload");
const {
  sanitizeOriginalFilename,
  decodeMultipartFilename,
  validateUploadedFileSignatures,
} = require("../src/utils/orderUploadValidation");

const R2_ENV = {
  R2_ACCOUNT_ID: "acct-test",
  R2_ACCESS_KEY_ID: "AKIA_TEST",
  R2_SECRET_ACCESS_KEY: "secret-test",
  R2_BUCKET_PRIVATE: "orderzhouse-private-staging",
};

function withEnv(vars) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return () => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}

/** Minimal in-memory S3 (Put/Head/Get/Delete) keyed by bucket/key. */
function fakeS3() {
  const objects = new Map();
  const calls = [];
  return {
    objects,
    calls,
    async send(cmd) {
      const name = cmd.constructor.name;
      const { Bucket, Key } = cmd.input;
      calls.push({ name, Bucket, Key });
      const id = `${Bucket}/${Key}`;
      const notFound = () => {
        const e = new Error("NoSuchKey");
        e.name = name === "HeadObjectCommand" ? "NotFound" : "NoSuchKey";
        e.$metadata = { httpStatusCode: 404 };
        return e;
      };
      if (name === "PutObjectCommand") {
        objects.set(id, { body: Buffer.from(cmd.input.Body), type: cmd.input.ContentType, meta: cmd.input.Metadata });
        return {};
      }
      if (name === "HeadObjectCommand") {
        const o = objects.get(id);
        if (!o) throw notFound();
        return { ContentLength: o.body.length, ContentType: o.type, Metadata: o.meta };
      }
      if (name === "GetObjectCommand") {
        const o = objects.get(id);
        if (!o) throw notFound();
        return { Body: Readable.from([o.body]), ContentLength: o.body.length, ContentType: o.type };
      }
      if (name === "DeleteObjectCommand") {
        objects.delete(id);
        return {};
      }
      throw new Error(`unexpected ${name}`);
    },
  };
}

function fakeRes() {
  const res = new PassThrough();
  res.headers = {};
  res.statusCode = 200;
  res.body = null;
  res.headersSent = false;
  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    res.headersSent = true;
    res.end();
    return res;
  };
  const chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.collected = () => Buffer.concat(chunks);
  return res;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = Buffer.from("%PDF-1.7\n%test\n");

describe("object keys", () => {
  it("never contain the original name, only a random id + safe extension", () => {
    const key = fileStorage.buildPrivateObjectKey({
      scope: "orders",
      scopeId: 42,
      purpose: "delivery",
      originalname: "محمد أحمد - هوية john@example.com.pdf",
      now: new Date("2026-10-24T00:00:00Z"),
    });
    assert.match(key, /^orders\/42\/delivery\/2026\/10\/[0-9a-f-]{36}\.pdf$/);
    assert.ok(!key.includes("john"));
    assert.ok(!/[\u0600-\u06FF]/.test(key));
  });

  it("drops unsafe extensions and segments", () => {
    const key = fileStorage.buildPrivateObjectKey({ scope: "../etc", scopeId: "1/2", purpose: "x y", originalname: "a.p hp" });
    assert.match(key, /^files\/unscoped\/file\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
  });

  it("legacy migration keys are deterministic per row", () => {
    const a = fileStorage.buildLegacyMigrationKey({ scope: "orders", scopeId: 7, purpose: "brief", sourceTag: "of", sourceId: 99, originalname: "x.DOCX" });
    const b = fileStorage.buildLegacyMigrationKey({ scope: "orders", scopeId: 7, purpose: "brief", sourceTag: "of", sourceId: 99, originalname: "x.DOCX" });
    assert.equal(a, "orders/7/brief/legacy/of-99.docx");
    assert.equal(a, b);
  });
});

describe("R2 upload / read", () => {
  let restore;
  let s3;
  beforeEach(() => {
    restore = withEnv(R2_ENV);
    s3 = fakeS3();
    r2.setR2ClientForTests(s3);
  });
  afterEach(() => {
    r2.setR2ClientForTests(null);
    restore();
  });

  it("stores bytes with sha256 metadata in the private bucket", async () => {
    const out = await fileStorage.uploadPrivateFile({ buffer: PNG, mimetype: "image/png", key: "orders/1/brief/k.png" });
    const sha = crypto.createHash("sha256").update(PNG).digest("hex");
    assert.deepEqual(out, { provider: "r2", bucket: "orderzhouse-private-staging", key: "orders/1/brief/k.png", size: PNG.length, sha256: sha });
    const head = await fileStorage.headPrivateFile({ bucket: out.bucket, key: out.key });
    assert.equal(head.exists, true);
    assert.equal(head.sha256, sha);
  });

  it("missing / deleted object → FILE_NOT_FOUND (404)", async () => {
    await assert.rejects(
      fileStorage.openFileStream({ storage_provider: "r2", storage_bucket: "orderzhouse-private-staging", storage_key: "nope" }),
      (e) => e.statusCode === 404 && e.code === "FILE_NOT_FOUND",
    );
    const put = await fileStorage.uploadPrivateFile({ buffer: PDF, mimetype: "application/pdf", key: "orders/1/delivery/d.pdf" });
    await fileStorage.deletePrivateFile(put);
    assert.equal((await fileStorage.headPrivateFile(put)).exists, false);
  });

  it("malformed r2 row (no key) → 404, never a bucket listing", async () => {
    await assert.rejects(fileStorage.openFileStream({ storage_provider: "r2", storage_bucket: "b" }), (e) => e.statusCode === 404);
    assert.equal(s3.calls.length, 0);
  });

  it("storage outage → 502 STORAGE_UNAVAILABLE", async () => {
    r2.setR2ClientForTests({
      async send() {
        const e = new Error("socket hang up");
        e.$metadata = { httpStatusCode: 500 };
        throw e;
      },
    });
    await assert.rejects(
      fileStorage.openFileStream({ storage_provider: "r2", storage_bucket: "b", storage_key: "k" }),
      (e) => e.statusCode === 502 && e.code === "STORAGE_UNAVAILABLE",
    );
  });

  it("R2 not configured → 503 R2_NOT_CONFIGURED (no silent fallback for r2 rows)", async () => {
    const back = withEnv({ R2_ACCESS_KEY_ID: undefined });
    try {
      r2.setR2ClientForTests(null);
      assert.equal(fileStorage.isPrivateR2WriteEnabled(), false);
      assert.throws(() => r2.getR2Client(), (e) => e.code === "R2_NOT_CONFIGURED" && e.statusCode === 503);
    } finally {
      back();
    }
  });
});

describe("provider resolution + legacy parsing", () => {
  it("resolves provider from explicit column or legacy URL", () => {
    assert.equal(fileStorage.resolveProvider({ storage_provider: "r2" }), "r2");
    assert.equal(fileStorage.resolveProvider({ secure_url: "https://res.cloudinary.com/x/image/upload/v1/a.png" }), "cloudinary");
    assert.equal(fileStorage.resolveProvider({ file_path: "orders/1/a.pdf" }), "local");
  });

  it("parses Cloudinary image/raw delivery URLs", () => {
    assert.deepEqual(
      fileStorage.parseCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/v1712/orders/5/brief/abc.pdf"),
      { resourceType: "image", deliveryType: "upload", publicId: "orders/5/brief/abc", format: "pdf" },
    );
    assert.deepEqual(
      fileStorage.parseCloudinaryUrl("https://res.cloudinary.com/demo/raw/upload/v1/orders/5/x.docx"),
      { resourceType: "raw", deliveryType: "upload", publicId: "orders/5/x.docx", format: "" },
    );
    assert.equal(fileStorage.parseCloudinaryUrl("https://evil.example.com/image/upload/a.png"), null);
  });

  it("local legacy paths reject traversal and absolute paths", async () => {
    for (const p of ["../../.env", "orders/../../.env", "/etc/passwd", "C:\\Windows\\win.ini", ""]) {
      // eslint-disable-next-line no-await-in-loop
      await assert.rejects(fileStorage.openFileStream({ storage_provider: "local", file_path: p }), (e) =>
        [400, 404].includes(e.statusCode),
      );
    }
  });
});

describe("download response", () => {
  let restore;
  let s3;
  beforeEach(() => {
    restore = withEnv(R2_ENV);
    s3 = fakeS3();
    r2.setR2ClientForTests(s3);
  });
  afterEach(() => {
    r2.setR2ClientForTests(null);
    restore();
  });

  async function stream(row, { mimeType, name = "ملف التسليم (1).pdf", disposition } = {}) {
    const req = { query: disposition ? { disposition } : {}, originalUrl: "/api/x/files/1/download" };
    const res = fakeRes();
    let nextErr = null;
    await pipeOrderFileToResponse(req, res, (e) => {
      nextErr = e;
    }, { file: row, downloadName: name, mimeType });
    return { res, nextErr };
  }

  it("streams R2 bytes same-origin with private, no-store headers", async () => {
    const put = await fileStorage.uploadPrivateFile({ buffer: PDF, mimetype: "application/pdf", key: "orders/1/delivery/a.pdf" });
    const { res } = await stream({ storage_provider: "r2", storage_bucket: put.bucket, storage_key: put.key }, { mimeType: "application/pdf", disposition: "inline" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.collected(), PDF);
    assert.match(res.headers["content-disposition"], /^inline; /);
    assert.equal(res.headers["cache-control"], "private, no-store");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers.location, undefined);
  });

  it("DOCX inline request is served as attachment (unsupported preview)", async () => {
    const docx = Buffer.from([0x50, 0x4b, 3, 4, 9]);
    const put = await fileStorage.uploadPrivateFile({ buffer: docx, mimetype: "x", key: "orders/1/delivery/a.docx" });
    const { res } = await stream(
      { storage_provider: "r2", storage_bucket: put.bucket, storage_key: put.key },
      { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", disposition: "inline", name: "تقرير.docx" },
    );
    assert.match(res.headers["content-disposition"], /^attachment; /);
  });

  it("localized errors: view vs download, 404 vs storage failure", async () => {
    const missing = { storage_provider: "r2", storage_bucket: "orderzhouse-private-staging", storage_key: "gone" };
    const a = await stream(missing, { mimeType: "image/png", disposition: "inline" });
    assert.equal(a.res.statusCode, 404);
    assert.equal(a.res.body.message, "الملف غير موجود.");

    r2.setR2ClientForTests({
      async send() {
        throw Object.assign(new Error("down"), { $metadata: { httpStatusCode: 503 } });
      },
    });
    const v = await stream(missing, { mimeType: "image/png", disposition: "inline" });
    assert.equal(v.res.statusCode, 502);
    assert.equal(v.res.body.message, "تعذر فتح المرفق. حاول مرة أخرى.");
    const d = await stream(missing, { mimeType: "image/png" });
    assert.equal(d.res.body.message, "تعذر تنزيل المرفق. حاول مرة أخرى.");
    assert.ok(!JSON.stringify(d.res.body).includes("orderzhouse-private"));
  });

  it("Content-Disposition keeps Arabic/Unicode names (RFC 6266) with ASCII fallback", () => {
    const h = contentDisposition("attachment", 'تقرير "نهائي"\r\n(1).pdf');
    assert.ok(!/[\r\n]/.test(h));
    assert.match(h, /^attachment; filename="[\x20-\x7E]+"; filename\*=UTF-8''/);
    assert.equal(decodeURIComponent(h.split("UTF-8''")[1]), "تقرير  نهائي   (1).pdf");
  });

  it("missing payload goes to next() (no crash)", async () => {
    const res = fakeRes();
    let err = null;
    await pipeOrderFileToResponse({ query: {} }, res, (e) => {
      err = e;
    }, {});
    assert.ok(err instanceof Error);
  });
});

describe("order uploads → R2", () => {
  let restore;
  let s3;
  let ordersService;
  beforeEach(() => {
    restore = withEnv(R2_ENV);
    s3 = fakeS3();
    r2.setR2ClientForTests(s3);
    ordersService = require("../src/services/ordersService");
  });
  afterEach(() => {
    r2.setR2ClientForTests(null);
    restore();
  });

  it("stores provider/bucket/key/sha and no delivery URL", async () => {
    const out = await ordersService.uploadOrderFiles({
      orderId: 55,
      purpose: "delivery",
      files: [{ buffer: PNG, mimetype: "image/png", originalname: "صورة.png", size: PNG.length }],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].storageProvider, "r2");
    assert.equal(out[0].storageBucket, "orderzhouse-private-staging");
    assert.match(out[0].storageKey, /^orders\/55\/delivery\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    assert.equal(out[0].secureUrl, null);
    assert.equal(out[0].publicId, null);
    assert.equal(out[0].sha256.length, 64);
    assert.equal(ordersService.uploadFilesToCloudinary, ordersService.uploadOrderFiles);
  });

  it("a failed batch removes the objects already uploaded", async () => {
    const real = s3.send.bind(s3);
    let puts = 0;
    r2.setR2ClientForTests({
      async send(cmd) {
        if (cmd.constructor.name === "PutObjectCommand" && ++puts === 2) throw new Error("boom");
        return real(cmd);
      },
    });
    await assert.rejects(
      ordersService.uploadOrderFiles({
        orderId: 9,
        purpose: "brief",
        files: [
          { buffer: PNG, mimetype: "image/png", originalname: "a.png" },
          { buffer: PDF, mimetype: "application/pdf", originalname: "b.pdf" },
        ],
      }),
      (e) => e.statusCode === 500,
    );
    assert.equal(s3.objects.size, 0);
  });

  it("stored-order scope is separate from real order ids", async () => {
    const out = await ordersService.uploadOrderFiles({
      orderId: 3,
      purpose: "brief",
      scope: "stored-orders",
      files: [{ buffer: PDF, mimetype: "application/pdf", originalname: "x.pdf" }],
    });
    assert.match(out[0].storageKey, /^stored-orders\/3\/brief\//);
  });
});

describe("upload validation", () => {
  it("content must match declared inline/zip types", () => {
    assert.equal(validateUploadedFileSignatures([{ buffer: PNG, mimetype: "image/png" }]).ok, true);
    assert.equal(validateUploadedFileSignatures([{ buffer: PDF, mimetype: "application/pdf" }]).ok, true);
    assert.equal(
      validateUploadedFileSignatures([{ buffer: Buffer.from("<html><script>x</script>"), mimetype: "image/png", originalname: "a.png" }]).ok,
      false,
    );
    assert.equal(validateUploadedFileSignatures([{ buffer: Buffer.from("not a zip"), mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }]).ok, false);
    // CSV reported by browsers as application/vnd.ms-excel must still pass.
    assert.equal(validateUploadedFileSignatures([{ buffer: Buffer.from("a,b\n1,2"), mimetype: "application/vnd.ms-excel" }]).ok, true);
  });

  it("filenames: multipart UTF-8 repair (Arabic + other scripts), idempotent, sanitized", () => {
    const mangle = (s) => Buffer.from(s, "utf8").toString("latin1");
    assert.equal(sanitizeOriginalFilename(mangle("ملف التسليم (نهائي).docx")), "ملف التسليم (نهائي).docx");
    assert.equal(sanitizeOriginalFilename(mangle("résumé 履歴書.pdf")), "résumé 履歴書.pdf");
    assert.equal(decodeMultipartFilename("café.pdf"), "café.pdf");
    assert.equal(sanitizeOriginalFilename("..\\..\\x/evil\u202Egpj.exe"), "evilgpj.exe");
    assert.equal(sanitizeOriginalFilename(""), "file");
    const long = sanitizeOriginalFilename(`${"ا".repeat(400)}.pdf`);
    assert.equal(long.length, 200);
    assert.ok(long.endsWith(".pdf"));
  });
});

describe("startup storage environment", () => {
  it("blocks cross-environment buckets and honors REQUIRE_R2_STORAGE", () => {
    const prodBucketLocal = r2.evaluateStorageEnvironment("local", { ...R2_ENV, R2_BUCKET_PRIVATE: "orderzhouse-private-prod" });
    assert.equal(prodBucketLocal.ok, false);
    const stagingBucketProd = r2.evaluateStorageEnvironment("production", R2_ENV);
    assert.equal(stagingBucketProd.ok, false);
    assert.equal(r2.evaluateStorageEnvironment("production", { ...R2_ENV, R2_BUCKET_PRIVATE: "orderzhouse-private-prod" }).ok, true);
    assert.equal(r2.evaluateStorageEnvironment("production", { REQUIRE_R2_STORAGE: "1" }).ok, false);
    const warnOnly = r2.evaluateStorageEnvironment("production", {});
    assert.equal(warnOnly.ok, true);
    assert.equal(warnOnly.warnings.length, 1);
  });

  it("never echoes credential values", () => {
    const out = r2.evaluateStorageEnvironment("local", { R2_ACCESS_KEY_ID: "AKIA_SHOULD_NOT_APPEAR" });
    assert.ok(!JSON.stringify(out).includes("AKIA_SHOULD_NOT_APPEAR"));
    assert.deepEqual(r2.missingR2Variables({ R2_SECRET_ACCESS_KEY: "zzz" }).includes("R2_SECRET_ACCESS_KEY"), false);
  });
});

describe("authorization (IDOR) — knowing an id is not enough", () => {
  const authz = require("../src/services/orderAuthorizationService");
  const ORDERS = {
    10: { id: 10, source_type: "client_created", created_by_user_id: 100, assigned_freelancer_id: 200, accepted_freelancer_id: null },
  };
  const FILES = { 1: { id: 1, order_id: 10, purpose: "delivery" }, 2: { id: 2, order_id: 10, purpose: "brief" } };
  const db = {
    async query(sql, params) {
      if (/FROM order_files/.test(sql)) {
        const f = FILES[params[0]];
        return { rows: f && f.order_id === params[1] ? [f] : [] };
      }
      if (/FROM orders/.test(sql)) return { rows: ORDERS[params[0]] ? [ORDERS[params[0]]] : [] };
      throw new Error(`unexpected sql ${sql}`);
    },
  };
  const as = (userId, role) => ({ userId: String(userId), primaryRole: role, roles: [{ name: role }] });

  it("owner client and assigned freelancer may access delivery files", async () => {
    assert.equal((await authz.assertCanAccessOrderFile({ auth: as(100, "client"), orderId: 10, fileId: 1 }, db)).mode, "client");
    assert.equal(
      (await authz.assertCanAccessOrderFile({ auth: as(200, "freelancer"), orderId: 10, fileId: 1 }, db)).mode,
      "freelancer_assigned",
    );
  });

  it("another client is denied", async () => {
    await assert.rejects(authz.assertCanAccessOrderFile({ auth: as(101, "client"), orderId: 10, fileId: 1 }, db), (e) => e.statusCode === 403);
  });

  it("unassigned freelancer cannot read delivery files", async () => {
    await assert.rejects(authz.assertCanAccessOrderFile({ auth: as(201, "freelancer"), orderId: 10, fileId: 1 }, db), (e) => e.statusCode === 403);
  });

  it("a file id from another order is not found (no cross-order access)", async () => {
    await assert.rejects(authz.assertCanAccessOrderFile({ auth: as(100, "client"), orderId: 11, fileId: 1 }, db), (e) => e.statusCode === 404);
  });

  it("anonymous / malformed ids are rejected", async () => {
    await assert.rejects(authz.assertCanAccessOrderFile({ auth: {}, orderId: 10, fileId: 1 }, db), (e) => e.statusCode === 401);
    await assert.rejects(authz.assertCanAccessOrderFile({ auth: as(100, "client"), orderId: "10;--", fileId: 1 }, db), (e) => e.statusCode === 400);
  });
});
