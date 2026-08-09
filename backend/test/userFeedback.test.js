/**
 * Problems & Suggestions (user_feedback) — source guards + service behavior.
 * Run: node --test test/userFeedback.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/user_feedback_test_placeholder";

const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "..", "sql", "migrations", "127_user_feedback.sql");
const userRoutesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "feedbackRoutes.js"),
  "utf8",
);
const adminRoutesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "superAdminFeedbackRoutes.js"),
  "utf8",
);
const appSrc = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const servicePath = require.resolve("../src/services/feedbackService");
const controllerPath = require.resolve("../src/controllers/feedbackController");

describe("migration 127_user_feedback", () => {
  it("creates additive user_feedback table with snapshots and indexes", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS user_feedback"));
    assert.ok(sql.includes("user_name_snapshot"));
    assert.ok(sql.includes("user_email_snapshot"));
    assert.ok(sql.includes("user_role"));
    assert.ok(sql.includes("admin_note"));
    assert.ok(sql.includes("priority"));
    assert.ok(sql.includes("'problem'"));
    assert.ok(sql.includes("'suggestion'"));
    assert.ok(sql.includes("'other'"));
    assert.ok(sql.includes("'new'"));
    assert.ok(sql.includes("'in_review'"));
    assert.ok(sql.includes("'resolved'"));
    assert.ok(sql.includes("'closed'"));
    assert.ok(sql.includes("ix_user_feedback_user_id_created") || sql.includes("idx_user_feedback_user_created"));
    assert.ok(sql.includes("ix_user_feedback_status") || sql.includes("idx_user_feedback_status_created"));
    assert.ok(!sql.includes("DROP TABLE"));
    assert.ok(!sql.includes("TRUNCATE"));
  });
});

const topicsMigrationPath = path.join(
  __dirname,
  "..",
  "sql",
  "migrations",
  "132_user_feedback_topics.sql",
);

describe("migration 132_user_feedback_topics", () => {
  it("adds topics table and nullable topic columns without destructive SQL", () => {
    const sql = fs.readFileSync(topicsMigrationPath, "utf8");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS user_feedback_topics"));
    assert.ok(sql.includes("feedback_type"));
    assert.ok(sql.includes("is_active"));
    assert.ok(sql.includes("sort_order"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS topic_id"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS topic_label_snapshot"));
    assert.ok(sql.includes("ON DELETE SET NULL"));
    assert.ok(!sql.includes("DROP TABLE"));
    assert.ok(!sql.includes("TRUNCATE"));
  });
});

describe("feedback routes — auth and mounts", () => {
  it("user routes require auth + client/freelancer", () => {
    assert.ok(userRoutesSrc.includes("requireAuth"));
    assert.ok(userRoutesSrc.includes('requireAnyRole(["client", "freelancer"])'));
    assert.ok(userRoutesSrc.includes('"/feedback"'));
    assert.ok(userRoutesSrc.includes('"/feedback/my"'));
    assert.ok(userRoutesSrc.includes('"/feedback/topics"'));
    assert.ok(appSrc.includes("feedbackRoutes"));
  });

  it("admin routes require Super Admin only", () => {
    assert.ok(adminRoutesSrc.includes("requireSuperAdmin"));
    assert.ok(adminRoutesSrc.includes('"/feedback"'));
    assert.ok(adminRoutesSrc.includes('"/feedback/topics"'));
    assert.ok(adminRoutesSrc.includes("adminReorderTopics"));
    assert.ok(adminRoutesSrc.includes("adminDeleteTopic"));
    assert.ok(adminRoutesSrc.includes('router.delete'));
    assert.ok(appSrc.includes("superAdminFeedbackRoutes"));
    assert.ok(!adminRoutesSrc.includes('requireAnyRole(["admin"'));
  });
});

describe("feedbackService pure helpers", () => {
  beforeEach(() => {
    delete require.cache[servicePath];
  });
  afterEach(() => {
    delete require.cache[servicePath];
  });

  it("sanitizePlainText strips tags and null bytes", () => {
    const svc = require("../src/services/feedbackService");
    const cleaned = svc.sanitizePlainText("<script>alert(1)</script>hello\u0000", { maxLen: 100 });
    assert.equal(cleaned, "alert(1)hello");
    assert.ok(!cleaned.includes("<script>"));
  });

  it("normalizeCreateInput accepts unknown type keys for deferred category resolution", () => {
    const svc = require("../src/services/feedbackService");
    // Semantic existence check happens in resolveCategoryForCreate / createFeedback — not a fixed enum.
    const out = svc.normalizeCreateInput({
      type: "bug",
      subject: "abc",
      description: "long enough text for validation",
    });
    assert.equal(out.type, "bug");
    assert.equal(out.categoryId, null);
  });

  it("normalizeCreateInput rejects short fields", () => {
    const svc = require("../src/services/feedbackService");
    assert.throws(
      () => svc.normalizeCreateInput({ type: "problem", subject: "a", description: "long enough text" }),
      (err) => err.publicCode === "SUBJECT_REQUIRED",
    );
    assert.throws(
      () => svc.normalizeCreateInput({ type: "suggestion", subject: "Valid", description: "short" }),
      (err) => err.publicCode === "DESCRIPTION_REQUIRED",
    );
  });

  it("normalizeCreateInput accepts categoryId without legacy type", () => {
    const svc = require("../src/services/feedbackService");
    const out = svc.normalizeCreateInput({
      categoryId: 12,
      subject: "عنوان صالح",
      description: "هذا وصف مفصل بما يكفي للاختبار الآلي.",
    });
    assert.equal(out.categoryId, 12);
    assert.equal(out.type, null);
  });

  it("normalizeCreateInput accepts problem/suggestion/other and ignores identity payload fields", () => {
    const svc = require("../src/services/feedbackService");
    const out = svc.normalizeCreateInput({
      type: "problem",
      subject: "مشكلة في استلام الطلب",
      description: "هذا وصف مفصل بما يكفي للاختبار الآلي.",
      userId: 999,
      email: "spoof@example.com",
      role: "super_admin",
      name: "Attacker",
    });
    assert.equal(out.type, "problem");
    assert.equal(out.subject, "مشكلة في استلام الطلب");
    assert.equal(out.topicId, null);
    assert.ok(!("userId" in out));
    assert.ok(!("email" in out));
    assert.ok(!("role" in out));
  });

  it("normalizeCreateInput accepts optional topicId", () => {
    const svc = require("../src/services/feedbackService");
    const out = svc.normalizeCreateInput({
      type: "suggestion",
      subject: "تحسين الواجهة",
      description: "هذا وصف مفصل بما يكفي للاختبار الآلي.",
      topicId: 12,
    });
    assert.equal(out.topicId, 12);
  });

  it("mapPublicFeedback includes topic snapshot fields when present", () => {
    const svc = require("../src/services/feedbackService");
    const mapped = svc.mapPublicFeedback({
      id: 1,
      type: "problem",
      topic_id: 9,
      topic_label_snapshot: "تأخير الدفع",
      subject: "Issue",
      description: "Details long enough",
      status: "new",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      reviewed_at: null,
      resolved_at: null,
    });
    assert.equal(mapped.topicId, 9);
    assert.equal(mapped.topicLabel, "تأخير الدفع");
  });

  it("mapPublicFeedback keeps null topic for legacy rows", () => {
    const svc = require("../src/services/feedbackService");
    const mapped = svc.mapPublicFeedback({
      id: 2,
      type: "other",
      topic_id: null,
      topic_label_snapshot: null,
      subject: "Note",
      description: "Legacy feedback without topic",
      status: "new",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      reviewed_at: null,
      resolved_at: null,
    });
    assert.equal(mapped.topicId, null);
    assert.equal(mapped.topicLabel, null);
  });

  it("mapPublicFeedback never exposes adminNote or priority", () => {
    const svc = require("../src/services/feedbackService");
    const mapped = svc.mapPublicFeedback({
      id: 1,
      type: "suggestion",
      subject: "Idea",
      description: "Details",
      status: "new",
      priority: "urgent",
      admin_note: "SECRET INTERNAL",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      reviewed_at: null,
      resolved_at: null,
    });
    assert.equal(mapped.subject, "Idea");
    assert.equal(mapped.adminNote, undefined);
    assert.equal(mapped.priority, undefined);
    assert.ok(!JSON.stringify(mapped).includes("SECRET"));
  });

  it("mapAdminFeedback includes internal fields for Super Admin", () => {
    const svc = require("../src/services/feedbackService");
    const mapped = svc.mapAdminFeedback({
      id: 2,
      user_id: 10,
      user_name_snapshot: "Ali",
      user_email_snapshot: "ali@example.com",
      user_role: "client",
      type: "other",
      subject: "Note",
      description: "Body",
      status: "in_review",
      priority: "high",
      admin_note: "Follow up",
      assigned_admin_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      reviewed_at: null,
      resolved_at: null,
    });
    assert.equal(mapped.userName, "Ali");
    assert.equal(mapped.userEmail, "ali@example.com");
    assert.equal(mapped.adminNote, "Follow up");
    assert.equal(mapped.priority, "high");
  });
});

describe("feedbackService create/list with mocked pool", () => {
  let poolMock;
  let notifySuperAdminsMock;
  let lastClient;

  beforeEach(() => {
    delete require.cache[servicePath];
    delete require.cache[require.resolve("../src/config/db")];
    delete require.cache[require.resolve("../src/services/notificationEventsService")];
    lastClient = null;

    const sampleAdminRow = {
      id: 7,
      user_id: 42,
      user_name_snapshot: "Sara Client",
      user_email_snapshot: "sara@example.com",
      user_role: "client",
      type: "suggestion",
      subject: "A",
      description: "Desc A",
      status: "new",
      priority: "normal",
      admin_note: "internal",
      assigned_admin_id: null,
      created_at: "2026-08-08T11:00:00.000Z",
      updated_at: "2026-08-08T11:00:00.000Z",
      reviewed_at: null,
      resolved_at: null,
    };

    poolMock = {
      connect: mock.fn(async () => {
        lastClient = {
          query: mock.fn(async (sql) => {
            const s = String(sql);
            if (s.includes("BEGIN") || s.includes("COMMIT") || s.includes("ROLLBACK")) {
              return { rows: [] };
            }
            if (s.includes("information_schema.columns")) {
              return { rows: [] };
            }
            if (s.includes("FROM users")) {
              return {
                rows: [
                  {
                    id: 42,
                    first_name: "Sara",
                    father_name: "",
                    family_name: "Client",
                    email: "sara@example.com",
                    role: "client",
                    is_active: true,
                  },
                ],
              };
            }
            if (s.includes("INSERT INTO user_feedback")) {
              return {
                rows: [
                  {
                    id: 7,
                    type: "suggestion",
                    subject: "تحسين الواجهة",
                    description: "أحتاج تحسينات على لوحة التحكم للمستخدم.",
                    status: "new",
                    created_at: "2026-08-08T10:00:00.000Z",
                    updated_at: "2026-08-08T10:00:00.000Z",
                    reviewed_at: null,
                    resolved_at: null,
                  },
                ],
              };
            }
            if (s.includes("UPDATE user_feedback")) {
              return {
                rows: [
                  {
                    ...sampleAdminRow,
                    status: "resolved",
                    priority: "urgent",
                    admin_note: "done",
                    resolved_at: "2026-08-08T12:00:00.000Z",
                  },
                ],
              };
            }
            return { rows: [] };
          }),
          release: mock.fn(),
        };
        return lastClient;
      }),
      query: mock.fn(async (sql, params) => {
        const s = String(sql);
        if (s.includes("information_schema.columns")) {
          return { rows: [] };
        }
        if (s.includes("COUNT(*)") && s.includes("user_id")) {
          return { rows: [{ c: 1 }] };
        }
        if (s.includes("FROM user_feedback") && s.includes("user_id = $1") && s.includes("LIMIT")) {
          return {
            rows: [
              {
                id: 7,
                type: "suggestion",
                subject: "تحسين الواجهة",
                description: "أحتاج تحسينات على لوحة التحكم للمستخدم.",
                status: "new",
                created_at: "2026-08-08T10:00:00.000Z",
                updated_at: "2026-08-08T10:00:00.000Z",
                reviewed_at: null,
                resolved_at: null,
                admin_note: "should not leak",
                priority: "urgent",
              },
            ],
          };
        }
        if (s.includes("WHERE id = $1 AND user_id = $2")) {
          if (Number(params[0]) === 999 || Number(params[1]) !== 42) return { rows: [] };
          return {
            rows: [
              {
                id: Number(params[0]),
                type: "problem",
                subject: "Own only",
                description: "Visible to owner",
                status: "new",
                created_at: "2026-08-08T10:00:00.000Z",
                updated_at: "2026-08-08T10:00:00.000Z",
                reviewed_at: null,
                resolved_at: null,
              },
            ],
          };
        }
        if (s.includes("COUNT(*) FILTER")) {
          return {
            rows: [
              {
                total: 2,
                new_count: 1,
                in_review_count: 1,
                resolved_count: 0,
                closed_count: 0,
                problem_count: 1,
                suggestion_count: 1,
                other_count: 0,
              },
            ],
          };
        }
        if (s.includes("COUNT(*)::int AS c FROM user_feedback WHERE")) {
          return { rows: [{ c: 2 }] };
        }
        if (s.includes("FROM user_feedback") && s.includes("ORDER BY created_at DESC")) {
          return {
            rows: [
              { ...sampleAdminRow, id: 2 },
              {
                id: 1,
                user_id: 99,
                user_name_snapshot: "Omar Freelancer",
                user_email_snapshot: "omar@example.com",
                user_role: "freelancer",
                type: "problem",
                subject: "B",
                description: "Desc B",
                status: "in_review",
                priority: "high",
                admin_note: "secret",
                assigned_admin_id: null,
                created_at: "2026-08-08T10:00:00.000Z",
                updated_at: "2026-08-08T10:00:00.000Z",
                reviewed_at: null,
                resolved_at: null,
              },
            ],
          };
        }
        if (s.includes("SELECT * FROM user_feedback WHERE id = $1")) {
          return { rows: [{ ...sampleAdminRow, id: Number(params[0]) }] };
        }
        return { rows: [] };
      }),
    };

    notifySuperAdminsMock = mock.fn(async () => []);
    require.cache[require.resolve("../src/config/db")] = {
      id: require.resolve("../src/config/db"),
      filename: require.resolve("../src/config/db"),
      loaded: true,
      exports: { pool: poolMock },
    };
    require.cache[require.resolve("../src/services/notificationEventsService")] = {
      id: require.resolve("../src/services/notificationEventsService"),
      filename: require.resolve("../src/services/notificationEventsService"),
      loaded: true,
      exports: {
        notifySuperAdmins: notifySuperAdminsMock,
        notifyUsers: mock.fn(async () => []),
      },
    };
  });

  afterEach(() => {
    delete require.cache[servicePath];
    delete require.cache[require.resolve("../src/config/db")];
    delete require.cache[require.resolve("../src/services/notificationEventsService")];
    mock.restoreAll();
  });

  it("createFeedback snapshots identity from auth user, not request body", async () => {
    const svc = require("../src/services/feedbackService");
    const created = await svc.createFeedback(42, {
      type: "suggestion",
      subject: "تحسين الواجهة",
      description: "أحتاج تحسينات على لوحة التحكم للمستخدم.",
      userId: 1,
      email: "attacker@evil.com",
      role: "super_admin",
      name: "Hacker",
    });
    assert.equal(created.id, 7);
    assert.equal(created.type, "suggestion");
    assert.equal(notifySuperAdminsMock.mock.callCount(), 1);
    assert.ok(lastClient);
    const insertCall = lastClient.query.mock.calls.find((c) =>
      String(c.arguments[0]).includes("INSERT INTO user_feedback"),
    );
    assert.ok(insertCall);
    const values = insertCall.arguments[1];
    assert.equal(values[0], 42);
    assert.equal(values[1], "Sara Client");
    assert.equal(values[2], "sara@example.com");
    assert.equal(values[3], "client");
  });

  it("listMyFeedback returns own public rows without admin note", async () => {
    const svc = require("../src/services/feedbackService");
    const data = await svc.listMyFeedback(42, { page: 1, limit: 10 });
    assert.equal(data.items.length, 1);
    assert.equal(data.pagination.total, 1);
    assert.equal(data.items[0].adminNote, undefined);
    assert.ok(!JSON.stringify(data).includes("should not leak"));
  });

  it("getMyFeedbackById denies another user's submission", async () => {
    const svc = require("../src/services/feedbackService");
    await assert.rejects(() => svc.getMyFeedbackById(42, 999), (err) => err.statusCode === 404);
  });

  it("adminListFeedback returns pagination, summary, and search filters", async () => {
    const svc = require("../src/services/feedbackService");
    const data = await svc.adminListFeedback({
      q: "sara",
      type: "suggestion",
      status: "new",
      userRole: "client",
      page: 1,
      limit: 20,
    });
    assert.equal(data.items.length, 2);
    assert.equal(data.pagination.total, 2);
    assert.equal(data.summary.total, 2);
    assert.equal(data.items[0].adminNote, "internal");
    const listQuery = poolMock.query.mock.calls.find((c) =>
      String(c.arguments[0]).includes("user_name_snapshot ILIKE"),
    );
    assert.ok(listQuery);
  });

  it("adminListFeedback filters by dynamic categoryId including custom keys", async () => {
    // Reset module caches so category column probe + categories service share this pool mock.
    delete require.cache[servicePath];
    delete require.cache[require.resolve("../src/services/feedbackCategoriesService")];
    delete require.cache[require.resolve("../src/services/feedbackTopicsService")];
    delete require.cache[require.resolve("../src/config/db")];

    const pool = {
      query: mock.fn(async (sql, params) => {
        const s = String(sql);
        if (s.includes("information_schema.columns") && s.includes("category_id")) {
          return { rows: [{ "?column?": 1 }] };
        }
        if (s.includes("information_schema.columns") && s.includes("topic_id")) {
          return { rows: [{ "?column?": 1 }] };
        }
        if (s.includes("FROM user_feedback_categories") && s.includes("WHERE id = $1")) {
          assert.equal(Number(params[0]), 12);
          return {
            rows: [
              {
                id: 12,
                key: "cat_12",
                label: "استفسار",
                is_active: true,
                sort_order: 4,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          };
        }
        if (s.includes("COUNT(*) FILTER")) {
          return {
            rows: [
              {
                total: 1,
                new_count: 1,
                in_review_count: 0,
                resolved_count: 0,
                closed_count: 0,
                problem_count: 0,
                suggestion_count: 0,
                other_count: 0,
              },
            ],
          };
        }
        if (s.includes("COUNT(*)::int AS c FROM user_feedback WHERE")) {
          assert.match(s, /category_id = \$/);
          return { rows: [{ c: 1 }] };
        }
        if (s.includes("FROM user_feedback") && s.includes("ORDER BY created_at DESC")) {
          assert.equal(params[0], 12);
          assert.equal(params[1], "cat_12");
          return {
            rows: [
              {
                id: 99,
                user_id: 1,
                user_name_snapshot: "A",
                user_email_snapshot: "a@b.com",
                user_role: "client",
                type: "cat_12",
                category_id: 12,
                category_label_snapshot: "استفسار",
                subject: "Q",
                description: "Details",
                status: "new",
                priority: "normal",
                admin_note: null,
                assigned_admin_id: null,
                created_at: "2026-08-08T10:00:00.000Z",
                updated_at: "2026-08-08T10:00:00.000Z",
                reviewed_at: null,
                resolved_at: null,
              },
            ],
          };
        }
        return { rows: [] };
      }),
      connect: mock.fn(async () => ({
        query: mock.fn(async () => ({ rows: [] })),
        release: mock.fn(),
      })),
    };

    require.cache[require.resolve("../src/config/db")] = {
      id: require.resolve("../src/config/db"),
      filename: require.resolve("../src/config/db"),
      loaded: true,
      exports: { pool },
    };
    require.cache[require.resolve("../src/services/notificationEventsService")] = {
      id: require.resolve("../src/services/notificationEventsService"),
      filename: require.resolve("../src/services/notificationEventsService"),
      loaded: true,
      exports: {
        notifySuperAdmins: mock.fn(async () => []),
        notifyUsers: mock.fn(async () => []),
      },
    };

    const svc = require("../src/services/feedbackService");
    const data = await svc.adminListFeedback({ categoryId: 12, page: 1, limit: 20 });
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].type, "cat_12");
    assert.equal(data.items[0].categoryId, 12);
  });

  it("createFeedback rejects unknown type when categories schema is ready", async () => {
    delete require.cache[servicePath];
    delete require.cache[require.resolve("../src/services/feedbackCategoriesService")];
    delete require.cache[require.resolve("../src/services/feedbackTopicsService")];
    delete require.cache[require.resolve("../src/config/db")];

    const client = {
      query: mock.fn(async (sql, params) => {
        const s = String(sql);
        if (s.includes("BEGIN") || s.includes("ROLLBACK") || s.includes("COMMIT")) return { rows: [] };
        if (s.includes("information_schema.columns") && s.includes("category_id")) {
          return { rows: [{ "?column?": 1 }] };
        }
        if (s.includes("information_schema.columns") && s.includes("topic_id")) {
          return { rows: [{ "?column?": 1 }] };
        }
        if (s.includes("FROM users")) {
          return {
            rows: [
              {
                id: 42,
                first_name: "Sara",
                father_name: "",
                family_name: "Client",
                email: "sara@example.com",
                role: "client",
                is_active: true,
              },
            ],
          };
        }
        if (s.includes("FROM user_feedback_categories") && s.includes("WHERE key = $1")) {
          assert.equal(params[0], "bug");
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: mock.fn(),
    };
    const pool = {
      connect: mock.fn(async () => client),
      query: mock.fn(async () => ({ rows: [] })),
    };
    require.cache[require.resolve("../src/config/db")] = {
      id: require.resolve("../src/config/db"),
      filename: require.resolve("../src/config/db"),
      loaded: true,
      exports: { pool },
    };
    require.cache[require.resolve("../src/services/notificationEventsService")] = {
      id: require.resolve("../src/services/notificationEventsService"),
      filename: require.resolve("../src/services/notificationEventsService"),
      loaded: true,
      exports: {
        notifySuperAdmins: mock.fn(async () => []),
        notifyUsers: mock.fn(async () => []),
      },
    };

    const svc = require("../src/services/feedbackService");
    await assert.rejects(
      () =>
        svc.createFeedback(42, {
          type: "bug",
          subject: "عنوان صالح",
          description: "هذا وصف مفصل بما يكفي للاختبار الآلي.",
        }),
      (err) => err.publicCode === "INVALID_CATEGORY",
    );
  });

  it("adminUpdateFeedback can set status, priority, and admin note", async () => {
    const svc = require("../src/services/feedbackService");
    const updated = await svc.adminUpdateFeedback(
      7,
      { status: "resolved", priority: "urgent", adminNote: "done" },
      1,
    );
    assert.equal(updated.status, "resolved");
    assert.equal(updated.priority, "urgent");
    assert.equal(updated.adminNote, "done");
  });
});

describe("feedbackController identity source", () => {
  it("create uses req.auth.userId only", async () => {
    delete require.cache[controllerPath];
    delete require.cache[servicePath];

    const createFeedback = mock.fn(async (userId, body) => ({ id: 1, ...body, userId }));
    require.cache[servicePath] = {
      id: servicePath,
      filename: servicePath,
      loaded: true,
      exports: { createFeedback },
    };

    const controller = require("../src/controllers/feedbackController");
    const req = {
      auth: { userId: 55 },
      body: {
        type: "problem",
        subject: "Issue title here",
        description: "Enough detail for validation path.",
        userId: 1,
        email: "nope@x.com",
      },
    };
    const res = {
      statusCode: 0,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return this;
      },
    };
    await controller.createFeedback(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 201);
    assert.equal(createFeedback.mock.calls[0].arguments[0], 55);
    delete require.cache[controllerPath];
    delete require.cache[servicePath];
  });
});

describe("frontend navigation remains role-scoped", () => {
  it("client/freelancer/super-admin nav include feedback without removing settings", () => {
    const clientNav = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "constants", "clientNav.js"),
      "utf8",
    );
    const freelancerNav = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "constants", "freelancerNav.js"),
      "utf8",
    );
    const superAdminNav = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "constants", "superAdminNav.js"),
      "utf8",
    );
    assert.ok(clientNav.includes("/dashboard/client/feedback"));
    assert.ok(clientNav.includes("/dashboard/client/settings"));
    assert.ok(freelancerNav.includes("/dashboard/freelancer/feedback"));
    assert.ok(freelancerNav.includes("/dashboard/freelancer/settings"));
    assert.ok(superAdminNav.includes("/dashboard/super-admin/feedback"));
    assert.ok(superAdminNav.includes("problemsSuggestions"));
  });
});
