/**
 * Feedback categories service — mocked pool coverage.
 * Run: node --test test/feedbackCategories.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/feedback_categories_test_placeholder";

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../src/services/feedbackCategoriesService");
const dbPath = require.resolve("../src/config/db");

function loadServiceWithPool(poolImpl) {
  delete require.cache[servicePath];
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: poolImpl },
  };
  return require(servicePath);
}

function legacyRows() {
  return [
    {
      id: 1,
      key: "problem",
      label: "مشكلة",
      is_active: true,
      sort_order: 1,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 2,
      key: "suggestion",
      label: "اقتراح",
      is_active: true,
      sort_order: 2,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 3,
      key: "other",
      label: "ملاحظة أخرى",
      is_active: false,
      sort_order: 3,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];
}

describe("feedbackCategoriesService", () => {
  afterEach(() => {
    delete require.cache[servicePath];
    delete require.cache[dbPath];
  });

  it("maps default three categories and excludes inactive from user list", async () => {
    const pool = {
      query: async (sql) => {
        if (String(sql).includes("is_active = TRUE")) {
          return { rows: legacyRows().filter((r) => r.is_active) };
        }
        return { rows: legacyRows() };
      },
    };
    const svc = loadServiceWithPool(pool);
    const active = await svc.listActiveCategories();
    assert.equal(active.length, 2);
    assert.deepEqual(
      active.map((c) => c.key),
      ["problem", "suggestion"],
    );
    const all = await svc.listAllCategories();
    assert.equal(all.length, 3);
    assert.equal(all[2].isActive, false);
  });

  it("createCategory generates stable cat_<id> key and rejects duplicates", async () => {
    let inserted = false;
    const client = {
      query: async (sql, params) => {
        const s = String(sql);
        if (s.includes("BEGIN") || s.includes("COMMIT") || s.includes("ROLLBACK")) return { rows: [] };
        if (s.includes("SELECT id FROM user_feedback_categories") && s.includes("lower(label)")) {
          if (String(params?.[0]) === "مشكلة") {
            return { rows: [{ id: 1 }] };
          }
          return { rows: [] };
        }
        if (s.includes("MAX(sort_order)")) return { rows: [{ max_order: 3 }] };
        if (s.includes("INSERT INTO user_feedback_categories")) {
          inserted = true;
          return { rows: [{ id: 10 }] };
        }
        if (s.includes("UPDATE user_feedback_categories") && s.includes("key = $1")) {
          return {
            rows: [
              {
                id: 10,
                key: params[0],
                label: "استفسار",
                is_active: true,
                sort_order: 4,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      },
      release() {},
    };
    const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
    const svc = loadServiceWithPool(pool);
    await assert.rejects(() => svc.createCategory({ label: "مشكلة" }), (err) => {
      return err.publicCode === "CATEGORY_LABEL_DUPLICATE";
    });
    const created = await svc.createCategory({ label: "  استفسار  " });
    assert.equal(created.key, "cat_10");
    assert.equal(created.label, "استفسار");
    assert.equal(inserted, true);
  });

  it("updateCategory renames and toggles visibility", async () => {
    const rowsById = {
      2: {
        id: 2,
        key: "suggestion",
        label: "اقتراح",
        is_active: true,
        sort_order: 2,
        created_at: new Date(),
        updated_at: new Date(),
      },
    };
    const pool = {
      query: async (sql, params) => {
        const s = String(sql);
        if (s.includes("WHERE id = $1 LIMIT 1")) {
          return { rows: rowsById[params[0]] ? [rowsById[params[0]]] : [] };
        }
        if (s.includes("lower(label)")) return { rows: [] };
        if (s.includes("UPDATE user_feedback_categories")) {
          const next = {
            ...rowsById[2],
            label: params.includes("اقتراحات") ? "اقتراحات" : rowsById[2].label,
            is_active: params.includes(false) ? false : rowsById[2].is_active,
          };
          if (params.includes("اقتراحات")) next.label = "اقتراحات";
          if (params.some((p) => p === false)) next.is_active = false;
          rowsById[2] = next;
          return { rows: [next] };
        }
        return { rows: [] };
      },
    };
    const svc = loadServiceWithPool(pool);
    const renamed = await svc.updateCategory(2, { label: "اقتراحات" });
    assert.equal(renamed.label, "اقتراحات");
    assert.equal(renamed.key, "suggestion");
    const hidden = await svc.updateCategory(2, { isActive: false });
    assert.equal(hidden.isActive, false);
  });

  it("deleteCategory blocks when topics or historical feedback exist", async () => {
    const base = {
      id: 1,
      key: "problem",
      label: "مشكلة",
      is_active: true,
      sort_order: 1,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const poolTopics = {
      query: async (sql) => {
        if (String(sql).includes("WHERE id = $1 LIMIT 1")) return { rows: [base] };
        if (String(sql).includes("FROM user_feedback_topics")) return { rows: [{ c: 2 }] };
        return { rows: [{ c: 0 }] };
      },
    };
    const svc1 = loadServiceWithPool(poolTopics);
    await assert.rejects(() => svc1.deleteCategory(1), (err) => err.publicCode === "CATEGORY_HAS_TOPICS");

    const poolFeedback = {
      query: async (sql) => {
        if (String(sql).includes("WHERE id = $1 LIMIT 1")) return { rows: [base] };
        if (String(sql).includes("FROM user_feedback_topics")) return { rows: [{ c: 0 }] };
        if (String(sql).includes("FROM user_feedback")) return { rows: [{ c: 4 }] };
        return { rows: [] };
      },
    };
    const svc2 = loadServiceWithPool(poolFeedback);
    await assert.rejects(() => svc2.deleteCategory(1), (err) => err.publicCode === "CATEGORY_HAS_FEEDBACK");
  });

  it("deleteCategory removes unused category", async () => {
    const base = {
      id: 9,
      key: "cat_9",
      label: "تجريبي",
      is_active: true,
      sort_order: 4,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const pool = {
      query: async (sql) => {
        if (String(sql).includes("WHERE id = $1 LIMIT 1")) return { rows: [base] };
        if (String(sql).includes("COUNT(*)")) return { rows: [{ c: 0 }] };
        if (String(sql).includes("DELETE FROM user_feedback_categories")) return { rowCount: 1, rows: [] };
        return { rows: [] };
      },
    };
    const svc = loadServiceWithPool(pool);
    assert.deepEqual(await svc.deleteCategory(9), { id: 9, deleted: true });
  });

  it("reorderCategories rejects invalid orderedIds", async () => {
    const client = {
      query: async (sql) => {
        if (String(sql).includes("BEGIN") || String(sql).includes("ROLLBACK")) return { rows: [] };
        if (String(sql).includes("SELECT id FROM user_feedback_categories")) {
          return { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] };
        }
        return { rows: [] };
      },
      release() {},
    };
    const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
    const svc = loadServiceWithPool(pool);
    await assert.rejects(
      () => svc.reorderCategories({ orderedIds: [1, 2] }),
      (err) => err.publicCode === "INVALID_CATEGORY_REORDER",
    );
  });

  it("resolveCategoryForCreate accepts legacy type and rejects inactive", async () => {
    const pool = {
      query: async (sql, params) => {
        if (String(sql).includes("WHERE key = $1")) {
          if (params[0] === "other") {
            return {
              rows: [
                {
                  id: 3,
                  key: "other",
                  label: "ملاحظة أخرى",
                  is_active: false,
                  sort_order: 3,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            };
          }
          if (params[0] === "problem") {
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
        if (String(sql).includes("WHERE id = $1")) {
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
    const legacy = await svc.resolveCategoryForCreate({ type: "problem" });
    assert.equal(legacy.categoryId, 1);
    assert.equal(legacy.categoryLabelSnapshot, "مشكلة");
    assert.equal(legacy.type, "problem");

    const byId = await svc.resolveCategoryForCreate({ categoryId: 1 });
    assert.equal(byId.categoryId, 1);

    await assert.rejects(
      () => svc.resolveCategoryForCreate({ type: "other" }),
      (err) => err.publicCode === "CATEGORY_INACTIVE",
    );
  });

  it("rejects unknown keys and categoryId/type contradictions", async () => {
    const pool = {
      query: async (sql, params) => {
        if (String(sql).includes("WHERE key = $1")) {
          if (params[0] === "cat_12") {
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
          return { rows: [] };
        }
        if (String(sql).includes("WHERE id = $1")) {
          if (Number(params[0]) === 12) {
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
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const svc = loadServiceWithPool(pool);

    await assert.rejects(
      () => svc.resolveCategoryForCreate({ type: "bug" }),
      (err) => err.publicCode === "INVALID_CATEGORY",
    );
    await assert.rejects(
      () => svc.resolveCategoryForCreate({ type: "cat_999999" }),
      (err) => err.publicCode === "INVALID_CATEGORY",
    );

    const matched = await svc.resolveCategoryForCreate({ categoryId: 12, type: "cat_12" });
    assert.equal(matched.categoryId, 12);
    assert.equal(matched.type, "cat_12");

    await assert.rejects(
      () => svc.resolveCategoryForCreate({ categoryId: 12, type: "problem" }),
      (err) => err.publicCode === "CATEGORY_TYPE_MISMATCH",
    );
    await assert.rejects(
      () => svc.resolveCategoryForCreate({ categoryId: 1, type: "suggestion" }),
      (err) => err.publicCode === "CATEGORY_TYPE_MISMATCH",
    );

    const adminFilter = await svc.resolveCategoryForAdminFilter({ type: "cat_12" });
    assert.equal(adminFilter.categoryId, 12);
    assert.equal(adminFilter.key, "cat_12");

    // Hidden categories remain filterable for Super Admin history.
    const hiddenPool = {
      query: async (sql, params) => {
        if (String(sql).includes("WHERE id = $1") && Number(params[0]) === 3) {
          return {
            rows: [
              {
                id: 3,
                key: "other",
                label: "ملاحظة أخرى",
                is_active: false,
                sort_order: 3,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const svc2 = loadServiceWithPool(hiddenPool);
    const hidden = await svc2.resolveCategoryForAdminFilter({ categoryId: 3 });
    assert.equal(hidden.isActive, false);
    assert.equal(hidden.key, "other");
  });
});
