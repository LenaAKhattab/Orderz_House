require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows } = await pool.query(`
    SELECT
      ss.id,
      ss.slug,
      ss.name,
      ss.name_en,
      ss.sort_order,
      ss.is_active,
      ss.created_at,
      ss.updated_at,
      s.id AS subcategory_id,
      s.slug AS subcategory_slug,
      s.name AS subcategory_name,
      s.sort_order AS subcategory_sort_order,
      s.is_active AS subcategory_is_active,
      c.id AS category_id,
      c.slug AS category_slug,
      c.name AS category_name,
      c.sort_order AS category_sort_order,
      c.is_active AS category_is_active,
      COALESCE(ro.real_orders, 0)::int AS real_orders,
      COALESCE(tr.training_orders, 0)::int AS training_orders
    FROM sub_subcategories ss
    JOIN subcategories s ON s.id = ss.subcategory_id
    JOIN categories c ON c.id = s.category_id
    LEFT JOIN (
      SELECT sub_subcategory_id, COUNT(*)::int AS real_orders
      FROM orders
      WHERE sub_subcategory_id IS NOT NULL
      GROUP BY sub_subcategory_id
    ) ro ON ro.sub_subcategory_id = ss.id
    LEFT JOIN (
      SELECT sub_subcategory_id, COUNT(*)::int AS training_orders
      FROM fake_orders
      WHERE sub_subcategory_id IS NOT NULL
      GROUP BY sub_subcategory_id
    ) tr ON tr.sub_subcategory_id = ss.id
    ORDER BY c.sort_order, c.id, s.sort_order, s.id, ss.sort_order, ss.id
  `);

  const countsRes = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM categories) AS main_categories,
      (SELECT COUNT(*)::int FROM subcategories) AS sub_categories,
      (SELECT COUNT(*)::int FROM sub_subcategories) AS sub_sub_categories,
      (SELECT COUNT(*)::int FROM sub_subcategories WHERE is_active = TRUE) AS active_sub_sub,
      (SELECT COUNT(*)::int FROM sub_subcategories WHERE is_active = FALSE) AS inactive_sub_sub,
      (SELECT COUNT(*)::int FROM sub_subcategories ss
         JOIN subcategories s ON s.id = ss.subcategory_id
         JOIN categories c ON c.id = s.category_id
         WHERE ss.is_active = TRUE AND s.is_active = TRUE AND c.is_active = TRUE) AS homepage_eligible
  `);

  const outPath = path.join(__dirname, "subsub-inventory.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ counts: countsRes.rows[0], rows }, null, 2),
    "utf8",
  );
  console.log(`Wrote ${rows.length} rows to ${outPath}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
