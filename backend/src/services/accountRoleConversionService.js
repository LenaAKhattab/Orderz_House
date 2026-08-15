/**
 * One-time self-service account role conversion: freelancer ↔ client.
 * Purges role-scoped work so the user starts fresh in the target role.
 */

const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const { ROLES } = require("../constants/roles");
const { createPublicApiError } = require("../utils/publicApiError");

const ALLOWED = new Set([ROLES.FREELANCER, ROLES.CLIENT]);

function isMissingRelation(err) {
  return err && (err.code === "42P01" || String(err.message || "").includes("does not exist"));
}

function isMissingColumn(err) {
  return err && err.code === "42703";
}

function isSkippableOptionalError(err) {
  if (!err) return false;
  if (isMissingRelation(err) || isMissingColumn(err)) return true;
  // FK / check violations on optional cleanup
  return err.code === "23503" || err.code === "23514";
}

/**
 * Run SQL inside an optional SAVEPOINT so a failed cleanup statement
 * does not abort the outer conversion transaction.
 * Works with both transactional clients and plain pool queries.
 */
async function q(client, sql, params = []) {
  const sp = `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let inSavepoint = false;

  try {
    await client.query(`SAVEPOINT ${sp}`);
    inSavepoint = true;
  } catch {
    // Not in a transaction (e.g. pool) — run without savepoint.
    try {
      return await client.query(sql, params);
    } catch (err) {
      if (isSkippableOptionalError(err)) {
        if (err.code === "23503" || err.code === "23514") {
          // eslint-disable-next-line no-console
          console.warn("[role-conversion] skip delete:", err.code, String(err.message || "").slice(0, 160));
        }
        return { rows: [], rowCount: 0, skipped: true };
      }
      throw err;
    }
  }

  try {
    const result = await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (err) {
    if (inSavepoint) {
      try {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      } catch {
        /* ignore */
      }
    }
    if (isSkippableOptionalError(err)) {
      if (err.code === "23503" || err.code === "23514") {
        // eslint-disable-next-line no-console
        console.warn("[role-conversion] skip delete:", err.code, String(err.message || "").slice(0, 160));
      }
      return { rows: [], rowCount: 0, skipped: true };
    }
    throw err;
  }
}

async function deleteOrdersByIds(client, orderIds) {
  const ids = (orderIds || []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return 0;

  const childDeletes = [
    `DELETE FROM order_revision_requests WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM order_submissions WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM order_freelancer_priority_application_boosts WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM marketplace_normal_order_application_economics WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM order_freelancer_bid_work_token_economics WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM order_freelancer_bids WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM order_claims WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM client_order_payments WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM freelancer_reviews WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM order_files WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM order_skills WHERE order_id = ANY($1::bigint[])`,
    `DELETE FROM fake_order_interactions WHERE order_id = ANY($1::bigint[])`,
    `UPDATE orders SET selected_bid_id = NULL WHERE id = ANY($1::bigint[]) AND selected_bid_id IS NOT NULL`,
  ];
  for (const sql of childDeletes) {
    // eslint-disable-next-line no-await-in-loop
    await q(client, sql, [ids]);
  }
  const del = await q(client, `DELETE FROM orders WHERE id = ANY($1::bigint[])`, [ids]);
  return del.rowCount || 0;
}

async function purgeFreelancerRoleData(client, userId) {
  const uid = Number(userId);

  // Marketplace bid credits
  await q(
    client,
    `DELETE FROM marketplace_bid_credit_reservation_slices
     WHERE reservation_id IN (
       SELECT id FROM marketplace_bid_credit_reservations WHERE freelancer_user_id = $1
     )`,
    [uid],
  );
  await q(client, `DELETE FROM marketplace_bid_credit_reservations WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM marketplace_bid_credit_ledger_entries WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM marketplace_bid_credit_grants WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM marketplace_bid_credit_purchases WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM marketplace_bid_distribution_allocations WHERE freelancer_user_id = $1`, [uid]);

  // Work tokens
  await q(client, `DELETE FROM work_token_reservations WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM work_token_ledger_entries WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM freelancer_work_token_wallets WHERE freelancer_user_id = $1`, [uid]);

  // Articles / elite / priority
  await q(client, `DELETE FROM marketplace_article_applications WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM marketplace_article_financial_entries WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM elite_direct_order_entitlement_events WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM elite_direct_offers WHERE target_freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM order_freelancer_priority_application_boosts WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM priority_auction_bids WHERE freelancer_user_id = $1`, [uid]);

  // Membership tree (null self-FK first — ON DELETE RESTRICT)
  await q(
    client,
    `UPDATE marketplace_membership_cycle_usage
     SET related_usage_id = NULL
     WHERE cycle_id IN (
       SELECT c.id FROM marketplace_membership_cycles c
       JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
       WHERE m.freelancer_user_id = $1
     )`,
    [uid],
  );
  await q(
    client,
    `DELETE FROM marketplace_membership_cycle_usage
     WHERE cycle_id IN (
       SELECT c.id FROM marketplace_membership_cycles c
       JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
       WHERE m.freelancer_user_id = $1
     )`,
    [uid],
  );
  await q(
    client,
    `DELETE FROM marketplace_membership_cycles
     WHERE membership_id IN (
       SELECT id FROM freelancer_marketplace_memberships WHERE freelancer_user_id = $1
     )`,
    [uid],
  );
  await q(
    client,
    `DELETE FROM marketplace_membership_audit_logs
     WHERE membership_id IN (
       SELECT id FROM freelancer_marketplace_memberships WHERE freelancer_user_id = $1
     )`,
    [uid],
  );
  await q(client, `DELETE FROM marketplace_membership_activation_requests WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM freelancer_marketplace_memberships WHERE freelancer_user_id = $1`, [uid]);

  // Order participation + assigned work
  await q(
    client,
    `UPDATE orders SET selected_bid_id = NULL
     WHERE selected_bid_id IN (
       SELECT id FROM order_freelancer_bids WHERE freelancer_user_id = $1
     )`,
    [uid],
  );

  const assigned = await q(
    client,
    `SELECT id FROM orders WHERE assigned_freelancer_id = $1`,
    [uid],
  );
  await deleteOrdersByIds(
    client,
    (assigned.rows || []).map((r) => r.id),
  );

  await q(client, `DELETE FROM order_freelancer_bid_work_token_economics WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM order_freelancer_bids WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM order_claims WHERE freelancer_user_id = $1`, [uid]);
  await q(
    client,
    `UPDATE orders SET assigned_freelancer_id = NULL
     WHERE assigned_freelancer_id = $1`,
    [uid],
  );

  // Financial claims (freelancer_id column)
  await q(
    client,
    `DELETE FROM financial_freelancer_payment_allocations
     WHERE payment_id IN (
       SELECT id FROM financial_freelancer_payments WHERE freelancer_id = $1
     )`,
    [uid],
  );
  await q(client, `DELETE FROM financial_freelancer_payments WHERE freelancer_id = $1`, [uid]);
  await q(
    client,
    `DELETE FROM financial_claim_status_history WHERE claim_id IN (
      SELECT id FROM financial_claims WHERE freelancer_id = $1
    )`,
    [uid],
  );
  await q(client, `DELETE FROM financial_claims WHERE freelancer_id = $1`, [uid]);

  // Pantry
  await q(
    client,
    `DELETE FROM pantry_delivery_files WHERE delivery_id IN (
      SELECT id FROM pantry_deliveries WHERE freelancer_id = $1
    )`,
    [uid],
  );
  await q(client, `DELETE FROM pantry_deliveries WHERE freelancer_id = $1`, [uid]);
  await q(client, `DELETE FROM pantry_bids WHERE freelancer_id = $1`, [uid]);
  await q(
    client,
    `UPDATE pantry_requests SET assigned_freelancer_id = NULL, accepted_bid_id = NULL
     WHERE assigned_freelancer_id = $1`,
    [uid],
  );
  await q(client, `DELETE FROM freelancer_starter_pantry_opportunity WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM pantry_application_bid_credit_economics WHERE freelancer_user_id = $1`, [uid]);

  // Courses / subscriptions / reviews / misc
  await q(client, `DELETE FROM course_lesson_progress WHERE freelancer_id = $1`, [uid]);
  await q(client, `DELETE FROM course_assignments WHERE freelancer_id = $1`, [uid]);
  await q(client, `DELETE FROM freelancer_subscriptions WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM freelancer_account_holds WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM freelancer_reviews WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM fake_order_applications WHERE freelancer_user_id = $1`, [uid]);
  await q(client, `DELETE FROM institution_members WHERE user_id = $1`, [uid]);
  await q(client, `DELETE FROM partner_freelancer_profiles WHERE freelancer_user_id = $1`, [uid]);

  // Clear freelancer profile fields
  await q(
    client,
    `UPDATE users SET
       freelancer_categories = NULL,
       professional_title = NULL,
       bio = NULL,
       skills = NULL,
       website_url = NULL,
       linkedin_url = NULL,
       github_url = NULL,
       behance_url = NULL,
       portfolio_url = NULL,
       preferred_withdrawal_method = NULL,
       payout_notes_hint = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [uid],
  );
}

async function purgeClientRoleData(client, userId) {
  const uid = Number(userId);

  const owned = await q(
    client,
    `SELECT id FROM orders WHERE created_by_user_id = $1`,
    [uid],
  );
  await deleteOrdersByIds(
    client,
    (owned.rows || []).map((r) => r.id),
  );

  await q(client, `DELETE FROM client_order_payments WHERE client_id = $1`, [uid]);

  await q(
    client,
    `UPDATE users SET
       company_name = NULL,
       billing_name = NULL,
       billing_country = NULL,
       billing_city = NULL,
       billing_notes = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [uid],
  );
}

async function flipRole(client, userId, newRole) {
  const { rows: roleRows } = await client.query(`SELECT id FROM roles WHERE name = $1 LIMIT 1`, [newRole]);
  const role = roleRows[0];
  if (!role) {
    throw createPublicApiError("دور النظام غير متاح.", 500, "ROLE_NOT_FOUND");
  }

  const withFlag = await q(
    client,
    `UPDATE users
     SET role = $2,
         role_converted_at = COALESCE(role_converted_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [userId, newRole],
  );
  if (withFlag.skipped) {
    await client.query(`UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1`, [userId, newRole]);
  }
  await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
  await client.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, role.id],
  );
}

/**
 * @param {{ userId: number|string, currentPassword: string, confirmation: string }} input
 */
async function convertOwnAccountRole(input) {
  const uid = Number(input.userId);
  if (!Number.isInteger(uid) || uid < 1) {
    throw createPublicApiError("معرّف المستخدم غير صالح.", 400, "INVALID_USER");
  }

  const conf = String(input.confirmation || "").trim();
  if (conf !== "تحويل" && conf.toUpperCase() !== "CONVERT") {
    throw createPublicApiError('اكتب كلمة «تحويل» للتأكيد.', 400, "CONFIRMATION_REQUIRED");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, role, password_hash, is_active FROM users WHERE id = $1 FOR UPDATE`,
      [uid],
    );
    const user = rows[0];
    if (!user) {
      throw createPublicApiError("المستخدم غير موجود.", 404, "NOT_FOUND");
    }
    if (user.is_active === false) {
      throw createPublicApiError("الحساب معطّل.", 403, "ACCOUNT_DISABLED");
    }

    const convertedCheck = await q(client, `SELECT role_converted_at FROM users WHERE id = $1`, [uid]);
    if (convertedCheck.skipped) {
      throw createPublicApiError(
        "تحويل الحساب غير متاح حالياً. يلزم تطبيق ترحيل قاعدة البيانات 158.",
        503,
        "MIGRATION_REQUIRED",
      );
    }
    const roleConvertedAt = convertedCheck.rows?.[0]?.role_converted_at || null;

    const fromRole = String(user.role || "").trim().toLowerCase();
    if (!ALLOWED.has(fromRole)) {
      throw createPublicApiError("تحويل الحساب متاح للمستقل والعميل فقط.", 403, "ROLE_NOT_CONVERTIBLE");
    }
    if (roleConvertedAt) {
      throw createPublicApiError(
        "تم تحويل الحساب مسبقاً. التحويل مسموح مرة واحدة فقط.",
        409,
        "ROLE_ALREADY_CONVERTED",
      );
    }

    const match = await bcrypt.compare(String(input.currentPassword || ""), user.password_hash);
    if (!match) {
      throw createPublicApiError("كلمة المرور الحالية غير صحيحة.", 400, "INVALID_PASSWORD");
    }

    const toRole = fromRole === ROLES.FREELANCER ? ROLES.CLIENT : ROLES.FREELANCER;

    if (fromRole === ROLES.FREELANCER) {
      await purgeFreelancerRoleData(client, uid);
    } else {
      await purgeClientRoleData(client, uid);
    }

    await flipRole(client, uid, toRole);

    // Best-effort: clear role-scoped notifications
    await q(client, `DELETE FROM notifications WHERE recipient_user_id = $1`, [uid]);

    await client.query("COMMIT");

    return {
      fromRole,
      toRole,
      convertedAt: new Date().toISOString(),
      requiresRelogin: true,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function getConversionEligibility(userId) {
  const uid = Number(userId);
  const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1 LIMIT 1`, [uid]);
  const user = rows[0];
  if (!user) {
    throw createPublicApiError("المستخدم غير موجود.", 404, "NOT_FOUND");
  }

  let roleConvertedAt = null;
  let migrationReady = true;
  try {
    const converted = await pool.query(`SELECT role_converted_at FROM users WHERE id = $1 LIMIT 1`, [uid]);
    roleConvertedAt = converted.rows?.[0]?.role_converted_at || null;
  } catch (err) {
    if (isMissingColumn(err) || isMissingRelation(err)) {
      migrationReady = false;
    } else {
      throw err;
    }
  }

  const fromRole = String(user.role || "").trim().toLowerCase();
  const alreadyConverted = Boolean(roleConvertedAt);
  const allowed = ALLOWED.has(fromRole) && !alreadyConverted;
  return {
    fromRole,
    toRole: fromRole === ROLES.FREELANCER ? ROLES.CLIENT : fromRole === ROLES.CLIENT ? ROLES.FREELANCER : null,
    alreadyConverted,
    convertedAt: roleConvertedAt || null,
    canConvert: allowed,
    migrationReady,
  };
}

module.exports = {
  convertOwnAccountRole,
  getConversionEligibility,
};
