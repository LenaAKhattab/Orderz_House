/**
 * Shared cleanup for institutional storage / institutions integration tests.
 * Deletes only IDs created by the current test run, in FK-safe order.
 * Never run against production.
 */
function assertCleanupEnvironmentSafe(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "").toLowerCase();
  const dbUrl = String(env.DATABASE_URL || env.DB_URL || "");
  if (nodeEnv === "production") {
    throw new Error("Refusing institutional test cleanup: NODE_ENV=production");
  }
  if (/prod|production/i.test(dbUrl) && !/test|staging|dev|local|127\.0\.0\.1|localhost/i.test(dbUrl)) {
    throw new Error("Refusing institutional test cleanup: DATABASE_URL looks like production");
  }
}

/**
 * @param {import("pg").Pool|import("pg").PoolClient} pool
 * @param {object} ids
 */
async function cleanupInstitutionalTestRecords(pool, ids = {}) {
  assertCleanupEnvironmentSafe();
  const prefix = ids.logPrefix || "[institutionalCleanup]";
  const errors = [];
  const failFast = Boolean(ids.failFast);

  const run = async (sql, params = []) => {
    try {
      await pool.query(sql, params);
    } catch (e) {
      const msg = e?.message || String(e);
      // eslint-disable-next-line no-console
      console.error(`${prefix} cleanup step failed:`, msg);
      errors.push(`${sql.split("\n")[0].trim()}: ${msg}`);
      if (failFast) {
        throw e;
      }
    }
  };

  const storageIds = [ids.storageId, ...(ids.storageIds || [])]
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const institutionIds = [ids.institutionId, ...(ids.institutionIds || [])]
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const userIds = (ids.userIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const releasedOrderIds = (ids.releasedOrderIds || [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  for (const storageId of storageIds) {
    const { rows: liveOrders } = await pool.query(
      `SELECT id FROM orders
       WHERE institutional_storage_id = $1
          OR institutional_stored_order_id IN (
               SELECT id FROM institutional_stored_orders WHERE storage_id = $1)
          OR id IN (
               SELECT released_order_id FROM institutional_stored_orders
               WHERE storage_id = $1 AND released_order_id IS NOT NULL)`,
      [storageId],
    );
    const liveIds = (liveOrders || []).map((r) => Number(r.id)).filter(Boolean);
    if (liveIds.length) {
      await run(`DELETE FROM order_files WHERE order_id = ANY($1::bigint[])`, [liveIds]);
      await run(`DELETE FROM order_freelancer_bids WHERE order_id = ANY($1::bigint[])`, [liveIds]);
      await run(`DELETE FROM order_claims WHERE order_id = ANY($1::bigint[])`, [liveIds]);
      await run(`DELETE FROM order_skills WHERE order_id = ANY($1::bigint[])`, [liveIds]);
      await run(
        `UPDATE institutional_stored_orders SET released_order_id = NULL
         WHERE released_order_id = ANY($1::bigint[])`,
        [liveIds],
      );
      await run(
        `UPDATE institutional_batch_orders SET released_order_id = NULL
         WHERE released_order_id = ANY($1::bigint[])`,
        [liveIds],
      );
      await run(`DELETE FROM orders WHERE id = ANY($1::bigint[])`, [liveIds]);
    }

    await run(`DELETE FROM institutional_release_logs WHERE storage_id = $1`, [storageId]);
    await run(
      `DELETE FROM institutional_batch_orders WHERE batch_id IN (
         SELECT id FROM institutional_release_batches WHERE storage_id = $1)`,
      [storageId],
    );
    await run(`DELETE FROM institutional_release_batches WHERE storage_id = $1`, [storageId]);
    await run(`DELETE FROM institutional_storage_months WHERE storage_id = $1`, [storageId]);
    await run(`DELETE FROM institutional_order_reviews WHERE storage_id = $1`, [storageId]);
    await run(
      `DELETE FROM institutional_stored_order_files WHERE stored_order_id IN (
        SELECT id FROM institutional_stored_orders WHERE storage_id = $1)`,
      [storageId],
    );
    await run(`DELETE FROM institutional_storage_audit_logs WHERE storage_id = $1`, [storageId]);
    await run(`DELETE FROM institutional_stored_orders WHERE storage_id = $1`, [storageId]);
    await run(`DELETE FROM institutional_storage_institutions WHERE storage_id = $1`, [storageId]);
    await run(`DELETE FROM institutional_order_storages WHERE id = $1`, [storageId]);
  }

  if (releasedOrderIds.length) {
    await run(`DELETE FROM order_files WHERE order_id = ANY($1::bigint[])`, [releasedOrderIds]);
    await run(`DELETE FROM order_freelancer_bids WHERE order_id = ANY($1::bigint[])`, [releasedOrderIds]);
    await run(`DELETE FROM order_claims WHERE order_id = ANY($1::bigint[])`, [releasedOrderIds]);
    await run(`DELETE FROM order_skills WHERE order_id = ANY($1::bigint[])`, [releasedOrderIds]);
    await run(
      `UPDATE institutional_stored_orders SET released_order_id = NULL
       WHERE released_order_id = ANY($1::bigint[])`,
      [releasedOrderIds],
    );
    await run(`DELETE FROM orders WHERE id = ANY($1::bigint[])`, [releasedOrderIds]);
  }

  for (const institutionId of institutionIds) {
    await run(`DELETE FROM institutional_storage_institutions WHERE institution_id = $1`, [institutionId]);
    await run(`DELETE FROM institution_members WHERE institution_id = $1`, [institutionId]);
    await run(`DELETE FROM institutions WHERE id = $1`, [institutionId]);
  }

  if (userIds.length) {
    const { rows: owned } = await pool
      .query(`SELECT id FROM orders WHERE created_by_user_id = ANY($1::bigint[])`, [userIds])
      .catch(() => ({ rows: [] }));
    const ownedIds = (owned || []).map((r) => Number(r.id)).filter(Boolean);
    if (ownedIds.length) {
      await run(`DELETE FROM order_files WHERE order_id = ANY($1::bigint[])`, [ownedIds]);
      await run(`DELETE FROM order_freelancer_bids WHERE order_id = ANY($1::bigint[])`, [ownedIds]);
      await run(`DELETE FROM order_claims WHERE order_id = ANY($1::bigint[])`, [ownedIds]);
      await run(`DELETE FROM order_skills WHERE order_id = ANY($1::bigint[])`, [ownedIds]);
      await run(
        `UPDATE institutional_stored_orders SET released_order_id = NULL
         WHERE released_order_id = ANY($1::bigint[])`,
        [ownedIds],
      );
      await run(`DELETE FROM orders WHERE id = ANY($1::bigint[])`, [ownedIds]);
    }
    await run(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [userIds]);
  }

  const fakeOrderIds = (ids.fakeOrderIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (fakeOrderIds.length) {
    await run(`DELETE FROM fake_orders WHERE id = ANY($1::bigint[])`, [fakeOrderIds]);
  }

  if (errors.length) {
    throw new Error(`${prefix} cleanup completed with ${errors.length} failure(s): ${errors.join("; ")}`);
  }
}

module.exports = {
  assertCleanupEnvironmentSafe,
  cleanupInstitutionalTestRecords,
};
