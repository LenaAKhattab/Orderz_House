/**
 * Feedback topics service — mocked pool coverage (category-aware + legacy).
 * Run: node --test test/feedbackTopics.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/feedback_topics_test_placeholder";

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../src/services/feedbackTopicsService");
const categoriesPath = require.resolve("../src/services/feedbackCategoriesService");
const dbPath = require.resolve("../src/config/db");

function loadServiceWithPool(poolImpl) {
  delete require.cache[servicePath];
  delete require.cache[categoriesPath];
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: poolImpl },
  };
  return require(servicePath);
}

function isSchemaProbe(sql) {
  return String(sql).includes("information_schema.columns");
}

describe("feedbackTopicsService", () => {
  afterEach(() => {
    delete require.cache[servicePath];
    delete require.cache[categoriesPath];
    delete require.cache[dbPath];
  });

  it("listActiveTopicsByType excludes inactive and returns empty on missing schema", async () => {
    const queries = [];
    const pool = {
      query: async (sql, params) => {
        queries.push({ sql: String(sql), params });
        if (isSchemaProbe(sql)) return { rows: [] };
        if (String(sql).includes("is_active = TRUE")) {
          return {
            rows: [
              {
                id: 1,
                feedback_type: "problem",
                label: "تأخير",
                is_active: true,
                sort_order: 1,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const svc = loadServiceWithPool(pool);
    const items = await svc.listActiveTopicsByType("problem");
    assert.equal(items.length, 1);
    assert.equal(items[0].label, "تأخير");
    assert.ok(queries.some((q) => /is_active = TRUE/.test(q.sql)));

    const missing = {
      query: async (sql) => {
        if (isSchemaProbe(sql)) return { rows: [] };
        const err = new Error("missing");
        err.code = "42P01";
        throw err;
      },
    };
    const svc2 = loadServiceWithPool(missing);
    assert.deepEqual(await svc2.listActiveTopicsByType("suggestion"), []);
  });

  it("listActiveTopicsByCategory uses category_id when schema is ready", async () => {
    const pool = {
      query: async (sql, params) => {
        if (isSchemaProbe(sql)) return { rows: [{ "?column?": 1 }] };
        if (String(sql).includes("t.category_id = $1") && String(sql).includes("is_active = TRUE")) {
          assert.equal(params[0], 7);
          return {
            rows: [
              {
                id: 3,
                feedback_type: "cat_7",
                category_id: 7,
                label: "استفسار حساب",
                is_active: true,
                sort_order: 1,
                created_at: new Date(),
                updated_at: new Date(),
                category_key: "cat_7",
                category_label: "استفسار",
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const svc = loadServiceWithPool(pool);
    const items = await svc.listActiveTopicsByCategory({ categoryId: 7 });
    assert.equal(items.length, 1);
    assert.equal(items[0].categoryId, 7);
  });

  it("listAllTopics includes inactive for Super Admin", async () => {
    const pool = {
      query: async (sql) => {
        if (isSchemaProbe(sql)) return { rows: [] };
        return {
          rows: [
            {
              id: 1,
              feedback_type: "problem",
              label: "ظاهر",
              is_active: true,
              sort_order: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
            {
              id: 2,
              feedback_type: "problem",
              label: "مخفي",
              is_active: false,
              sort_order: 2,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      },
    };
    const svc = loadServiceWithPool(pool);
    const items = await svc.listAllTopics({ type: "problem" });
    assert.equal(items.length, 2);
    assert.equal(items[1].isActive, false);
  });

  it("resolveOptionalTopicForCreate allows omit/null and snapshots active matching topic", async () => {
    const pool = {
      query: async (sql) => {
        if (isSchemaProbe(sql)) return { rows: [] };
        return {
          rows: [
            {
              id: 9,
              feedback_type: "problem",
              label: "دفع",
              is_active: true,
              sort_order: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      },
    };
    const svc = loadServiceWithPool(pool);
    assert.deepEqual(await svc.resolveOptionalTopicForCreate({ type: "problem", topicId: null }), {
      topicId: null,
      topicLabelSnapshot: null,
    });
    const ok = await svc.resolveOptionalTopicForCreate({ type: "problem", topicId: 9 });
    assert.deepEqual(ok, { topicId: 9, topicLabelSnapshot: "دفع" });
  });

  it("resolveOptionalTopicForCreate rejects inactive, wrong type/category, and nonexistent", async () => {
    const inactivePool = {
      query: async (sql) => {
        if (isSchemaProbe(sql)) return { rows: [] };
        return {
          rows: [
            {
              id: 3,
              feedback_type: "problem",
              label: "قديم",
              is_active: false,
              sort_order: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      },
    };
    const svc = loadServiceWithPool(inactivePool);
    await assert.rejects(
      () => svc.resolveOptionalTopicForCreate({ type: "problem", topicId: 3 }),
      (err) => err.publicCode === "TOPIC_UNAVAILABLE",
    );

    const mismatchPool = {
      query: async (sql) => {
        if (isSchemaProbe(sql)) return { rows: [] };
        return {
          rows: [
            {
              id: 4,
              feedback_type: "problem",
              label: "مشكلة",
              is_active: true,
              sort_order: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      },
    };
    const svc2 = loadServiceWithPool(mismatchPool);
    await assert.rejects(
      () => svc2.resolveOptionalTopicForCreate({ type: "suggestion", topicId: 4 }),
      (err) => err.publicCode === "TOPIC_TYPE_MISMATCH",
    );

    const categoryMismatch = {
      query: async (sql) => {
        if (isSchemaProbe(sql)) return { rows: [{ "?column?": 1 }] };
        return {
          rows: [
            {
              id: 8,
              feedback_type: "problem",
              category_id: 1,
              label: "دفع",
              is_active: true,
              sort_order: 1,
              created_at: new Date(),
              updated_at: new Date(),
              category_key: "problem",
            },
          ],
        };
      },
    };
    const svc3 = loadServiceWithPool(categoryMismatch);
    await assert.rejects(
      () => svc3.resolveOptionalTopicForCreate({ categoryId: 2, topicId: 8 }),
      (err) => err.publicCode === "TOPIC_CATEGORY_MISMATCH",
    );

    const missingPool = {
      query: async (sql) => {
        if (isSchemaProbe(sql)) return { rows: [] };
        return { rows: [] };
      },
    };
    const svc4 = loadServiceWithPool(missingPool);
    await assert.rejects(
      () => svc4.resolveOptionalTopicForCreate({ type: "other", topicId: 999 }),
      (err) => err.publicCode === "TOPIC_UNAVAILABLE",
    );
  });

  it("reorderTopics rejects duplicate orderedIds", async () => {
    const client = {
      query: async (sql) => {
        const s = String(sql);
        if (s.includes("BEGIN") || s.includes("ROLLBACK") || s.includes("COMMIT")) return { rows: [] };
        if (isSchemaProbe(sql)) return { rows: [] };
        if (s.includes("SELECT id FROM user_feedback_topics")) {
          return { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] };
        }
        return { rows: [] };
      },
      release() {},
    };
    const pool = {
      connect: async () => client,
      query: async (sql) => {
        if (isSchemaProbe(sql)) return { rows: [] };
        return { rows: [] };
      },
    };
    const svc = loadServiceWithPool(pool);
    await assert.rejects(
      () => svc.reorderTopics({ type: "problem", orderedIds: [1, 2, 2] }),
      (err) => err.publicCode === "INVALID_TOPIC_REORDER",
    );
  });

  it("deleteTopic removes row and returns 404 when already gone", async () => {
    let deleted = false;
    const pool = {
      query: async (sql, params) => {
        const s = String(sql);
        if (isSchemaProbe(sql)) return { rows: [] };
        if (s.includes("FROM user_feedback_topics") && s.includes("WHERE") && s.includes("LIMIT 1")) {
          if (deleted || Number(params?.[0]) === 999) return { rows: [] };
          return {
            rows: [
              {
                id: 5,
                feedback_type: "other",
                label: "ملاحظة",
                is_active: true,
                sort_order: 1,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          };
        }
        if (s.includes("DELETE FROM user_feedback_topics")) {
          deleted = true;
          return { rowCount: 1, rows: [] };
        }
        return { rows: [] };
      },
    };
    const svc = loadServiceWithPool(pool);
    const out = await svc.deleteTopic(5);
    assert.deepEqual(out, { id: 5, deleted: true });
    await assert.rejects(() => svc.deleteTopic(5), (err) => err.publicCode === "TOPIC_NOT_FOUND");
    await assert.rejects(() => svc.deleteTopic(999), (err) => err.publicCode === "TOPIC_NOT_FOUND");
  });

  it("normalizeLabel trims and enforces non-empty via createTopic path", async () => {
    const client = {
      query: async (sql) => {
        const s = String(sql);
        if (s.includes("BEGIN") || s.includes("ROLLBACK") || s.includes("COMMIT")) return { rows: [] };
        if (isSchemaProbe(sql)) return { rows: [] };
        if (s.includes("user_feedback_categories") && s.includes("WHERE key")) return { rows: [] };
        if (s.includes("MAX(sort_order)")) return { rows: [{ max_order: 0 }] };
        if (s.includes("INSERT INTO user_feedback_topics")) {
          return { rows: [{ id: 11 }] };
        }
        return { rows: [] };
      },
      release() {},
    };
    const pool = {
      connect: async () => client,
      query: async (sql) => {
        if (isSchemaProbe(sql)) return { rows: [] };
        if (String(sql).includes("FROM user_feedback_topics") && String(sql).includes("LIMIT 1")) {
          return {
            rows: [
              {
                id: 11,
                feedback_type: "suggestion",
                label: "تحسين",
                is_active: true,
                sort_order: 1,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const svc = loadServiceWithPool(pool);
    await assert.rejects(() => svc.createTopic({ type: "suggestion", label: "   " }), (err) => {
      return err.publicCode === "TOPIC_LABEL_REQUIRED";
    });
    const created = await svc.createTopic({ type: "suggestion", label: "  تحسين  " });
    assert.equal(created.label, "تحسين");
  });

  it("listActiveTopicsByCategory rejects contradictory categoryId + type", async () => {
    const pool = {
      query: async (sql, params) => {
        if (isSchemaProbe(sql)) return { rows: [{ "?column?": 1 }] };
        if (String(sql).includes("WHERE id = $1") && String(sql).includes("user_feedback_categories")) {
          if (Number(params[0]) === 1) {
            return {
              rows: [
                {
                  id: 1,
                  key: "problem",
                  label: "مشكلة",
                  is_active: true,
                  sort_order: 1,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            };
          }
        }
        // CATEGORY_SELECT uses FROM user_feedback_categories WHERE id
        if (String(sql).includes("FROM user_feedback_categories") && String(sql).includes("WHERE id = $1")) {
          return {
            rows: [
              {
                id: 1,
                key: "problem",
                label: "مشكلة",
                is_active: true,
                sort_order: 1,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const svc = loadServiceWithPool(pool);
    await assert.rejects(
      () => svc.listActiveTopicsByCategory({ categoryId: 1, type: "suggestion" }),
      (err) => err.publicCode === "CATEGORY_TYPE_MISMATCH",
    );
    const ok = await svc.listActiveTopicsByCategory({ categoryId: 1, type: "problem" });
    assert.deepEqual(ok, []);
  });
});
