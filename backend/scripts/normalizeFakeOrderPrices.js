const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { pool } = require("../src/config/db");
const {
  isAllowedCleanBudgetRange,
  inferComplexityProfile,
  normalizeToCleanBudgetRange,
} = require("../src/utils/fakeBudgetRanges");

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply"),
    apply: argv.includes("--apply"),
  };
}

function hasDecimals(n) {
  const x = Number(n);
  return Number.isFinite(x) && Math.floor(x) !== x;
}

function isInvalidPair(min, max) {
  if (!Number.isFinite(Number(min)) || !Number.isFinite(Number(max))) return true;
  if (Number(min) >= Number(max)) return true;
  if (hasDecimals(min) || hasDecimals(max)) return true;
  return !isAllowedCleanBudgetRange(Number(min), Number(max));
}

async function loadTemplates(client) {
  const { rows } = await client.query(
    `SELECT t.id, t.title, t.description, t.min_budget, t.max_budget,
            c.name AS category_name, c.slug AS category_slug, s.name AS subcategory_name
     FROM fake_order_templates t
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN subcategories s ON s.id = t.subcategory_id`,
  );
  return rows;
}

async function loadFakeOrders(client) {
  const { rows } = await client.query(
    `SELECT fo.id, fo.title, fo.description, fo.project_type, fo.budget, fo.bid_budget_min, fo.bid_budget_max,
            c.name AS category_name, c.slug AS category_slug, s.name AS subcategory_name
     FROM fake_orders fo
     LEFT JOIN categories c ON c.id = fo.category_id
     LEFT JOIN subcategories s ON s.id = fo.subcategory_id`,
  );
  return rows;
}

async function main() {
  const args = parseArgs(process.argv);
  const client = await pool.connect();
  try {
    const templates = await loadTemplates(client);
    const fakeOrders = await loadFakeOrders(client);

    const templateChanges = [];
    for (const r of templates) {
      const min = Number(r.min_budget);
      const max = Number(r.max_budget);
      if (!isInvalidPair(min, max)) continue;
      const profile = inferComplexityProfile({
        categoryBucket: r.category_slug,
        title: r.title,
        description: r.description,
        categoryName: r.category_name,
        subcategoryName: r.subcategory_name,
      });
      const fixed = normalizeToCleanBudgetRange(min, max, profile);
      templateChanges.push({ id: Number(r.id), from: [min, max], to: [fixed.min, fixed.max] });
    }

    const fakeOrderChanges = [];
    for (const r of fakeOrders) {
      if (String(r.project_type) === "bidding") {
        const min = Number(r.bid_budget_min);
        const max = Number(r.bid_budget_max);
        if (!isInvalidPair(min, max)) continue;
        const profile = inferComplexityProfile({
          categoryBucket: r.category_slug,
          title: r.title,
          description: r.description,
          categoryName: r.category_name,
          subcategoryName: r.subcategory_name,
        });
        const fixed = normalizeToCleanBudgetRange(min, max, profile);
        fakeOrderChanges.push({ id: Number(r.id), projectType: "bidding", from: [min, max], to: [fixed.min, fixed.max] });
      } else {
        const b = Number(r.budget);
        if (!Number.isFinite(b) || !hasDecimals(b)) continue;
        fakeOrderChanges.push({ id: Number(r.id), projectType: "fixed", fromBudget: b, toBudget: Math.round(b) });
      }
    }

    const preInvalidTemplates = templates.filter((r) => isInvalidPair(r.min_budget, r.max_budget)).length;
    const preInvalidOrders = fakeOrders.filter((r) => {
      if (String(r.project_type) === "bidding") return isInvalidPair(r.bid_budget_min, r.bid_budget_max);
      return Number.isFinite(Number(r.budget)) && hasDecimals(Number(r.budget));
    }).length;

    console.log(
      JSON.stringify(
        {
          mode: args.apply ? "apply" : "dry-run",
          templateRowsScanned: templates.length,
          fakeOrdersScanned: fakeOrders.length,
          preInvalidTemplates,
          preInvalidOrders,
          templateRowsToChange: templateChanges.length,
          fakeOrderRowsToChange: fakeOrderChanges.length,
          sampleTemplateChanges: templateChanges.slice(0, 5),
          sampleFakeOrderChanges: fakeOrderChanges.slice(0, 5),
        },
        null,
        2,
      ),
    );

    if (!args.apply) return;

    await client.query("BEGIN");
    for (const ch of templateChanges) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `UPDATE fake_order_templates
         SET min_budget = $1, max_budget = $2, updated_at = NOW()
         WHERE id = $3`,
        [ch.to[0], ch.to[1], ch.id],
      );
    }
    for (const ch of fakeOrderChanges) {
      if (ch.projectType === "bidding") {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `UPDATE fake_orders
           SET bid_budget_min = $1, bid_budget_max = $2, updated_at = NOW()
           WHERE id = $3`,
          [ch.to[0], ch.to[1], ch.id],
        );
      } else {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `UPDATE fake_orders
           SET budget = $1, updated_at = NOW()
           WHERE id = $2`,
          [ch.toBudget, ch.id],
        );
      }
    }
    await client.query("COMMIT");

    const templatesAfter = await loadTemplates(client);
    const ordersAfter = await loadFakeOrders(client);
    const postInvalidTemplates = templatesAfter.filter((r) => isInvalidPair(r.min_budget, r.max_budget)).length;
    const postInvalidOrders = ordersAfter.filter((r) => {
      if (String(r.project_type) === "bidding") return isInvalidPair(r.bid_budget_min, r.bid_budget_max);
      return Number.isFinite(Number(r.budget)) && hasDecimals(Number(r.budget));
    }).length;
    const visibleInvalidFakeOrders = (
      await client.query(
        `SELECT COUNT(*)::int AS c
         FROM fake_orders fo
         INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id
         INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
         WHERE fo.fake_status = 'active'
           AND fo.is_published = TRUE
           AND fo.is_open_for_pool = TRUE
           AND ri.status = 'active'
           AND ri.visible_from <= NOW()
           AND ri.visible_until >= NOW()
           AND fr.status = 'active'
           AND (
             (fo.project_type = 'bidding' AND (
               floor(fo.bid_budget_min) <> fo.bid_budget_min OR
               floor(fo.bid_budget_max) <> fo.bid_budget_max OR
               fo.bid_budget_min >= fo.bid_budget_max
             ))
             OR
             (fo.project_type <> 'bidding' AND fo.budget IS NOT NULL AND floor(fo.budget) <> fo.budget)
           )`,
      )
    ).rows[0].c;

    console.log(
      JSON.stringify(
        {
          postInvalidTemplates,
          postInvalidOrders,
          visibleInvalidFakeOrders: Number(visibleInvalidFakeOrders || 0),
        },
        null,
        2,
      ),
    );
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
