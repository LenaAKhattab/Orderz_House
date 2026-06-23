/**
 * One-off investigation helper — schema + counts for fake_orders cleanup planning.
 * Read-only. Safe to run anytime.
 */
require("dotenv").config();
const { pool } = require("../src/config/db");

async function main() {
  const { rows: fkRows } = await pool.query(`
    SELECT
      tc.table_name AS child_table,
      kcu.column_name AS child_column,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'fake_orders'
      AND tc.table_schema = 'public'
    ORDER BY child_table, child_column
  `);

  const { rows: [counts] } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM fake_orders) AS total_fake_orders,
      (SELECT COUNT(*)::int FROM fake_order_round_items) AS round_items,
      (SELECT COUNT(*)::int FROM fake_order_applications) AS applications,
      (SELECT COUNT(*)::int FROM fake_order_rounds) AS rounds,
      (SELECT COUNT(*)::int FROM fake_order_templates) AS templates,
      (SELECT COUNT(*)::int FROM orders) AS real_orders,
      (SELECT COUNT(*)::int FROM orders WHERE COALESCE(is_archived, FALSE) = FALSE AND order_status = 'completed') AS real_completed
  `);

  const { rows: batchMarkers } = await pool.query(`
    SELECT
      elem AS batch_marker,
      COUNT(DISTINCT fo.id)::int AS fake_orders,
      COUNT(DISTINCT fot.id)::int AS templates
    FROM fake_order_templates fot
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(fot.skills, '[]'::jsonb)) AS elem
    LEFT JOIN fake_orders fo ON fo.template_id = fot.id
    WHERE elem LIKE '__batch_id:%'
    GROUP BY elem
    ORDER BY fake_orders DESC, templates DESC, batch_marker DESC
    LIMIT 20
  `);

  const { rows: seedMarkers } = await pool.query(`
    SELECT
      elem AS seed_marker,
      COUNT(DISTINCT fo.id)::int AS fake_orders,
      COUNT(DISTINCT fot.id)::int AS templates
    FROM fake_order_templates fot
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(fot.skills, '[]'::jsonb)) AS elem
    LEFT JOIN fake_orders fo ON fo.template_id = fot.id
    WHERE elem LIKE '__seed_marker:%' OR elem LIKE '__source_type:%'
    GROUP BY elem
    ORDER BY fake_orders DESC, templates DESC
    LIMIT 20
  `);

  const { rows: [createdAtStats] } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE created_at IS NULL)::int AS null_created_at,
      MIN(created_at) AS min_created_at,
      MAX(created_at) AS max_created_at,
      MIN(id) AS min_id,
      MAX(id) AS max_id
    FROM fake_orders
  `);

  const { rows: idMonotonic } = await pool.query(`
    SELECT COUNT(*)::int AS out_of_order_pairs
    FROM fake_orders a
    JOIN fake_orders b ON b.id > a.id AND b.created_at < a.created_at
  `);

  const { rows: [newest400] } = await pool.query(`
    WITH keep AS (
      SELECT id, created_at
      FROM fake_orders
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 400
    )
    SELECT
      COUNT(*)::int AS kept_count,
      MIN(id) AS first_kept_id,
      MAX(id) AS last_kept_id,
      MIN(created_at) AS oldest_kept_created_at,
      MAX(created_at) AS newest_kept_created_at,
      (SELECT COUNT(*)::int FROM fake_orders fo WHERE fo.id NOT IN (SELECT id FROM keep)) AS delete_candidates,
      (SELECT MIN(id) FROM fake_orders fo WHERE fo.id NOT IN (SELECT id FROM keep)) AS first_deleted_id,
      (SELECT MAX(id) FROM fake_orders fo WHERE fo.id NOT IN (SELECT id FROM keep)) AS last_deleted_id
    FROM keep
  `);

  const { rows: [relatedDeleteImpact] } = await pool.query(`
    WITH keep AS (
      SELECT id FROM fake_orders
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 400
    ),
    delete_ids AS (
      SELECT fo.id FROM fake_orders fo WHERE fo.id NOT IN (SELECT id FROM keep)
    )
    SELECT
      (SELECT COUNT(*)::int FROM fake_order_round_items ri WHERE ri.fake_order_id IN (SELECT id FROM delete_ids)) AS round_items_affected,
      (SELECT COUNT(*)::int FROM fake_order_applications fa WHERE fa.fake_order_id IN (SELECT id FROM delete_ids)) AS applications_affected,
      (SELECT COUNT(*)::int FROM delete_ids d
        INNER JOIN fake_orders fo ON fo.id = d.id
        WHERE fo.was_marketplace_visible = TRUE) AS deleted_was_visible,
      (SELECT COUNT(*)::int FROM delete_ids d
        INNER JOIN fake_orders fo ON fo.id = d.id
        WHERE EXISTS (
          SELECT 1 FROM fake_order_round_items ri
          INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
          WHERE ri.fake_order_id = fo.id AND ri.status = 'active' AND fr.status = 'active'
            AND ri.visible_from <= NOW() AND ri.visible_until > NOW()
        )) AS deleted_currently_visible_in_pool
  `);

  const { rows: [templateStats] } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE template_id IS NULL)::int AS null_template_id,
      COUNT(*) FILTER (WHERE template_id IS NOT NULL)::int AS with_template_id,
      COUNT(DISTINCT template_id)::int AS distinct_templates_used
    FROM fake_orders
  `);

  const { rows: sourceTypes } = await pool.query(`
    SELECT COALESCE(source_type, '(null)') AS source_type, COUNT(*)::int AS n
    FROM fake_orders
    GROUP BY source_type
    ORDER BY n DESC
    LIMIT 15
  `);

  const { rows: activeRound } = await pool.query(`
    SELECT fr.id, fr.status, fr.generated_count, fr.created_at,
      (SELECT COUNT(*)::int FROM fake_order_round_items ri WHERE ri.round_id = fr.id) AS item_count,
      (SELECT COUNT(*)::int FROM fake_order_round_items ri
        WHERE ri.round_id = fr.id AND ri.status = 'active' AND ri.visible_until > NOW()) AS active_items
    FROM fake_order_rounds fr
    ORDER BY fr.id DESC
    LIMIT 5
  `);

  const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");
  publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
  const hero = await publicHomeOrderStatsService.queryHeroOrderCounts();

  const { rows: [postCleanupHeroEstimate] } = await pool.query(`
    WITH keep AS (
      SELECT id FROM fake_orders
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 400
    ),
    delete_ids AS (
      SELECT fo.id FROM fake_orders fo WHERE fo.id NOT IN (SELECT id FROM keep)
    )
    SELECT
      (
        SELECT COUNT(*)::int FROM fake_orders fo
        WHERE fo.id IN (SELECT id FROM delete_ids)
          AND fo.was_marketplace_visible = TRUE
          AND fo.first_visible_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM fake_orders fo_vis
            INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo_vis.id
            INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
            WHERE fo_vis.id = fo.id
              AND fo_vis.fake_status = 'active'
              AND fo_vis.is_published = TRUE
              AND fo_vis.is_open_for_pool = TRUE
              AND fo_vis.assigned_freelancer_id IS NULL
              AND fo_vis.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')
              AND ri.status = 'active'
              AND fr.status = 'active'
              AND ri.visible_from <= NOW()
              AND ri.visible_until > NOW()
          )
      ) AS training_rotations_removed
  `);

  const trainingRemoved = Number(postCleanupHeroEstimate?.training_rotations_removed) || 0;

  console.log(JSON.stringify({
    fkReferences: fkRows,
    counts,
    batchMarkers,
    seedMarkers,
    createdAtStats,
    idMonotonic: idMonotonic[0],
    newest400,
    relatedDeleteImpact,
    templateStats,
    sourceTypes,
    activeRound,
    homepageStats: hero,
    estimatedHomepageAfterCleanup: {
      completedOrdersReal: hero.completedOrdersReal,
      trainingRotationsCompletedBefore: hero.trainingRotationsCompleted,
      trainingRotationsCompletedAfter: Math.max(0, hero.trainingRotationsCompleted - trainingRemoved),
      completedOrdersBefore: hero.completedOrders,
      completedOrdersAfter: hero.completedOrdersReal + Math.max(0, hero.trainingRotationsCompleted - trainingRemoved),
      availableOrdersNowBefore: hero.availableOrdersNow,
      note: "availableOrdersNow may change if currently-visible fake orders are deleted; see deleted_currently_visible_in_pool",
    },
    completedOrdersFormula: "completedReal + trainingRotationsCompleted (NOT real-only — WARN before delete)",
  }, null, 2));

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch (_) { /* ignore */ }
  process.exit(1);
});
