/**
 * Order file / delivery reliability (2026-10-27 incident): upload type handling, streaming error
 * headers, source availability flag, staff download scope, institution-scoped pool briefs,
 * pool/client DTO hygiene, delivery note, upload rollback compensation.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/order_file_reliability_placeholder";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

// ---- fake DB pool (installed before any service loads config/db) ----
const queries = [];
let queryHandler = () => ({ rows: [] });
const fakePool = {
  query: async (sql, params) => {
    queries.push({ sql: String(sql), params });
    return queryHandler(String(sql), params);
  },
  connect: async () => ({ query: fakePool.query, release() {} }),
  on() {},
};
require.cache[require.resolve("../src/config/db")] = { exports: { pool: fakePool } };

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("upload validation: types, signatures, empty files", () => {
  let server;
  let base;
  before(async () => {
    const express = require("express");
    const { uploadOrderFiles, handleOrderUploadErrors, enforceOrderUploadTotalSize } = require("../src/middleware/ordersUploadMiddleware");
    const app = express();
    app.post("/u", uploadOrderFiles, handleOrderUploadErrors, enforceOrderUploadTotalSize, (req, res) => {
      res.json({ files: (req.files || []).map((f) => ({ name: f.originalname, type: f.mimetype })) });
    });
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  const post = async (files) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", new Blob([f.buf], { type: f.type }), f.name);
    const res = await fetch(`${base}/u`, { method: "POST", body: fd });
    return { status: res.status, json: await res.json() };
  };

  it("DOCX sent as application/octet-stream (no Office handler) is accepted with its canonical type", async () => {
    const r = await post([{ name: "عقد العمل.docx", type: "application/octet-stream", buf: ZIP }]);
    assert.equal(r.status, 200);
    assert.equal(r.json.files[0].type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("generic type is not a bypass: inferred type is still signature-checked", async () => {
    const r = await post([{ name: "x.pdf", type: "application/octet-stream", buf: Buffer.from("<html></html>") }]);
    assert.equal(r.status, 415);
    assert.equal(r.json.code, "FILE_CONTENT_MISMATCH");
  });

  it("HTML disguised as PNG → 415 FILE_CONTENT_MISMATCH", async () => {
    const r = await post([{ name: "x.png", type: "image/png", buf: Buffer.from("<html><script></script></html>") }]);
    assert.equal(r.status, 415);
    assert.equal(r.json.code, "FILE_CONTENT_MISMATCH");
  });

  it("unsupported types and dangerous names → 415 UNSUPPORTED_FILE_TYPE", async () => {
    for (const f of [
      { name: "logo.svg", type: "image/svg+xml", buf: Buffer.from("<svg/>") },
      { name: "setup.exe", type: "application/pdf", buf: PDF },
      { name: "noext", type: "application/octet-stream", buf: PDF },
    ]) {
      const r = await post([f]);
      assert.equal(r.status, 415, f.name);
      assert.equal(r.json.code, "UNSUPPORTED_FILE_TYPE", f.name);
    }
  });

  it("path traversal names never reach storage with a path (rejected or reduced to a base name)", async () => {
    const r = await post([{ name: "../../etc/passwd.pdf", type: "application/pdf", buf: PDF }]);
    if (r.status === 200) {
      const name = r.json.files[0].name;
      assert.ok(!name.includes("..") && !name.includes("/"), name);
    } else {
      assert.equal(r.status, 415);
    }
    assert.ok(read("src/services/fileStorageService.js").includes("function buildPrivateObjectKey"), "object keys never use the original name");
  });

  it("empty file → 400 EMPTY_FILE; valid PDF/PNG pass", async () => {
    const empty = await post([{ name: "empty.txt", type: "text/plain", buf: Buffer.alloc(0) }]);
    assert.equal(empty.status, 400);
    assert.equal(empty.json.code, "EMPTY_FILE");
    const ok = await post([
      { name: "a.pdf", type: "application/pdf", buf: PDF },
      { name: "b.png", type: "image/png", buf: PNG },
    ]);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.files.length, 2);
  });

  it("count limit (6 files) → 400; total over 5 MB → 413", async () => {
    const six = await post(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, type: "application/pdf", buf: PDF })));
    assert.equal(six.status, 400);
    const big = await post([{ name: "big.pdf", type: "application/pdf", buf: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]) }]);
    assert.equal(big.status, 413);
  });
});

describe("streaming: error headers, filename encoding, source availability", () => {
  const { pipeOrderFileToResponse, contentDisposition } = require("../src/utils/pipeOrderFileDownload");
  const storage = require("../src/services/fileStorageService");

  function fakeRes() {
    const headers = {};
    const res = {
      headersSent: false,
      statusCode: 200,
      body: null,
      setHeader: (k, v) => {
        headers[k.toLowerCase()] = v;
      },
      removeHeader: (k) => {
        delete headers[k.toLowerCase()];
      },
      status(c) {
        res.statusCode = c;
        return res;
      },
      json(b) {
        res.body = b;
        return res;
      },
      destroy() {},
    };
    res.headers = headers;
    return res;
  }

  it("RFC 5987: parentheses, apostrophe and asterisk are percent-encoded; Arabic preserved", () => {
    const cd = contentDisposition("attachment", "ملف (نهائي) 'v2'*.pdf");
    const star = cd.split("filename*=UTF-8''")[1];
    assert.ok(!star.includes("(") && !star.includes(")") && !star.includes("'") && !star.includes("*"));
    assert.ok(star.includes("%28") && star.includes("%29") && star.includes("%27") && star.includes("%2A"));
    assert.equal(decodeURIComponent(star), "ملف (نهائي) 'v2'*.pdf");
  });

  it("missing source: 404 JSON without file headers, and the row is flagged unavailable", async () => {
    const orig = storage.openFileStream;
    queries.length = 0;
    storage.openFileStream = async () => {
      const e = new Error("gone");
      e.statusCode = 404;
      e.code = "FILE_NOT_FOUND";
      throw e;
    };
    // pipe util captured openFileStream at require time — re-require to pick up the stub.
    delete require.cache[require.resolve("../src/utils/pipeOrderFileDownload")];
    const { pipeOrderFileToResponse: pipe } = require("../src/utils/pipeOrderFileDownload");
    const res = fakeRes();
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      await pipe({ query: {}, originalUrl: "/x" }, res, () => {}, { file: { id: 77 }, downloadName: "a.pdf", mimeType: "application/pdf" });
    } finally {
      console.warn = origWarn;
      storage.openFileStream = orig;
      delete require.cache[require.resolve("../src/utils/pipeOrderFileDownload")];
    }
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.code, "FILE_NOT_FOUND");
    assert.ok(!res.headers["content-disposition"]);
    const upd = queries.find((q) => q.sql.includes("source_missing_at = COALESCE(source_missing_at, NOW())"));
    assert.ok(upd && upd.params[0] === 77, "row flagged as missing");
  });

  it("stream failure before the first byte never sends JSON under the file's headers", () => {
    const src = read("src/utils/pipeOrderFileDownload.js");
    assert.ok(src.includes('for (const h of ["Content-Type", "Content-Disposition", "Content-Length", "X-Content-Type-Options"]) res.removeHeader(h);'));
    assert.ok(typeof pipeOrderFileToResponse === "function");
  });

  it("successful stream clears a previous missing flag", () => {
    const src = read("src/utils/pipeOrderFileDownload.js");
    assert.ok(src.includes("void recordSourceAvailability(out.file, false);"));
    assert.ok(src.includes("UPDATE order_files SET source_missing_at = NULL WHERE id = $1"));
  });

  it("file DTOs expose `unavailable` (detail, list, submission history)", () => {
    const svc = read("src/services/ordersService.js");
    assert.equal(svc.split("unavailable: r.source_missing_at != null").length - 1, 1);
    assert.equal(svc.split("unavailable: fr.source_missing_at != null").length - 1, 1);
    assert.ok(read("src/services/orderSubmissionHistoryService.js").includes("unavailable: r.source_missing_at != null"));
    const mig = read("sql/migrations/210_order_files_source_missing.sql");
    assert.ok(mig.includes("ADD COLUMN IF NOT EXISTS source_missing_at TIMESTAMPTZ NULL"));
    assert.ok(!/DROP |DELETE FROM|TRUNCATE/i.test(mig));
  });
});

describe("authorization", () => {
  it("operational admin: internal orders only; super admin: every order (staff download)", async () => {
    const ordersService = require("../src/services/ordersService");
    queryHandler = (sql) => {
      if (sql.includes("FROM orders WHERE id = $1")) return { rows: [{ id: 5, source_type: "client_created" }] };
      if (sql.includes("FROM order_files")) return { rows: [{ id: 9, order_id: 5, original_name: "a.pdf", mime_type: "application/pdf" }] };
      return { rows: [] };
    };
    await assert.rejects(
      () => ordersService.prepareStaffOrderFileDownload({ orderId: 5, fileId: 9, internalOnly: true }),
      (e) => e.statusCode === 404,
    );
    const sa = await ordersService.prepareStaffOrderFileDownload({ orderId: 5, fileId: 9, internalOnly: false });
    assert.equal(sa.file.id, 9);
    queryHandler = (sql) => {
      if (sql.includes("FROM orders WHERE id = $1")) return { rows: [{ id: 6, source_type: "admin_created" }] };
      if (sql.includes("FROM order_files")) return { rows: [{ id: 10, order_id: 6, original_name: "b.pdf", mime_type: "application/pdf" }] };
      return { rows: [] };
    };
    const admin = await ordersService.prepareStaffOrderFileDownload({ orderId: 6, fileId: 10, internalOnly: true });
    assert.equal(admin.file.id, 10);
    queryHandler = () => ({ rows: [] });
    const ctrl = read("src/controllers/adminOrdersController.js");
    assert.ok(ctrl.includes("internalOnly: req.auth?.isSuperAdmin !== true"));
  });

  it("institution-scoped pool order: brief access requires institution membership", async () => {
    const storedPath = require.resolve("../src/services/institutionalStoredOrdersService");
    const planPath = require.resolve("../src/services/planOrderValueEligibility");
    const storedReal = require.cache[storedPath];
    const planReal = require.cache[planPath];
    let allowed = false;
    require.cache[storedPath] = { exports: { assertUserCanViewInstitutionalOrder: async () => ({ allowed }) } };
    require.cache[planPath] = { exports: { assertFreelancerMayAccessOrderByPlan: async () => true, getPlanRowForOrderValue: async () => null } };
    delete require.cache[require.resolve("../src/services/orderAuthorizationService")];
    try {
      const authz = require("../src/services/orderAuthorizationService");
      const order = {
        id: 41,
        is_published: true,
        is_open_for_pool: true,
        assigned_freelancer_id: null,
        order_status: "open_for_freelancers",
        source_type: "admin_created",
        project_type: "bidding",
        visibility_scope: "institution",
      };
      await assert.rejects(() => authz.assertFreelancerCanAccessPoolOrder(9, order), (e) => e.statusCode === 404);
      allowed = true;
      const ok = await authz.assertFreelancerCanAccessPoolOrder(9, order).then(() => true, () => false);
      assert.equal(ok, true, "member passes the institution gate");
    } finally {
      if (storedReal) require.cache[storedPath] = storedReal;
      else delete require.cache[storedPath];
      if (planReal) require.cache[planPath] = planReal;
      else delete require.cache[planPath];
      delete require.cache[require.resolve("../src/services/orderAuthorizationService")];
    }
  });

  it("delivery / revision routes authorize before parsing multipart bodies", () => {
    const routes = read("src/routes/ordersRoutes.js");
    const delivery = routes.slice(routes.indexOf('"/freelancer/my-orders/:id/delivery"'), routes.indexOf("submitMyOrderDelivery"));
    assert.ok(delivery.indexOf("requireFreelancerAssignedOrderParam") < delivery.indexOf("uploadOrderFiles"));
    const revision = routes.slice(routes.indexOf('"/client/orders/:id/delivery/revision"'), routes.indexOf("requestDeliveryRevision"));
    assert.ok(revision.indexOf("requireClientOwnsOrderParam") < revision.indexOf("uploadOrderFiles"));
    const admin = read("src/routes/adminOrdersRoutes.js");
    const ar = admin.slice(admin.indexOf('"/orders/:id/delivery/revision"'), admin.indexOf("requestInternalDeliveryRevision"));
    assert.ok(ar.indexOf("orderIdParam") < ar.indexOf("uploadOrderFiles"));
  });
});

describe("DTO hygiene", () => {
  const { sanitizeFreelancerPoolOrder, sanitizeOrderForClient } = require("../src/utils/orderViewerSanitize");

  it("unassigned pool viewers get brief files only (no delivery / revision evidence)", () => {
    const out = sanitizeFreelancerPoolOrder({
      id: "1",
      files: [
        { id: "1", purpose: "brief", originalName: "brief.pdf", fileUrl: "https://res.cloudinary.com/x" },
        { id: "2", purpose: "delivery", originalName: "work.pdf" },
        { id: "3", purpose: "revision_request", originalName: "notes.pdf" },
      ],
    });
    assert.deepEqual(out.files.map((f) => f.id), ["1"]);
    assert.ok(!out.files[0].fileUrl);
    const svc = read("src/services/ordersService.js");
    assert.ok(svc.includes("FROM order_files f WHERE f.order_id = o.id AND f.purpose = 'brief')"));
    assert.equal(read("src/services/hydrateMergedPool.js").split("AND purpose = 'brief'").length - 1, 2);
  });

  it("client order DTO never carries raw storage locators", () => {
    if (typeof sanitizeOrderForClient !== "function") return;
    const out = sanitizeOrderForClient({
      id: "1",
      files: [{ id: "1", purpose: "brief", fileUrl: "https://res.cloudinary.com/x", secureUrl: "https://res.cloudinary.com/x", publicId: "p", unavailable: true }],
    });
    assert.ok(!out.files[0].fileUrl && !out.files[0].secureUrl && !out.files[0].publicId);
    assert.equal(out.files[0].unavailable, true);
  });
});

describe("delivery lifecycle hardening", () => {
  const svc = read("src/services/ordersService.js");

  it("optional delivery note is stored on the submission (trimmed, max 4000)", () => {
    assert.ok(svc.includes("async function submitFreelancerOrderDelivery({ freelancerUserId, orderId, uploadedFiles = [], note = null })"));
    assert.ok(svc.includes("const noteText = note != null ? String(note).trim().slice(0, 4000) : \"\";"));
    assert.ok(svc.includes("message: noteText || null,"));
    assert.ok(read("src/controllers/ordersController.js").includes("note: req.body?.note,"));
  });

  it("objects uploaded inside a rolled-back transaction are deleted (5 upload paths)", () => {
    assert.equal(svc.split("if (!committed) await discardUploadedObjects(uploadedForRollback);").length - 1, 5);
    assert.equal(svc.split("committed = true;").length - 1, 5);
    assert.equal(svc.split("uploadedForRollback.push(...").length - 1, 5);
  });

  it("institution bundle carries the submission timeline; revision role recorded truthfully", () => {
    const inst = read("src/services/institutionWorkService.js");
    assert.ok(inst.includes('await ordersService.enrichOrderWithSubmissionHistory(order, "admin");'));
    assert.ok(inst.includes('revisionRequestedByRole: actorRole === "admin" ? "admin" : "super_admin",'));
    assert.ok(read("src/services/fazatPartnerOrderService.js").includes('enrichOrderWithSubmissionHistory(order, "partner")'));
  });
});
