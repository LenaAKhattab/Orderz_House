const { pool } = require("../config/db");

function randomInt(min, max) {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

async function assertAdminOrSuperAdmin(userId, client) {
  const { rows } = await client.query(`SELECT role, is_active FROM users WHERE id = $1 LIMIT 1`, [Number(userId)]);
  const u = rows[0];
  if (!u || !u.is_active || !["admin", "super_admin"].includes(String(u.role || ""))) {
    const err = new Error("غير مصرح.");
    err.statusCode = 403;
    throw err;
  }
}

async function generateUniqueOrderCode(client) {
  for (let i = 0; i < 20; i += 1) {
    const code = `ORD-${new Date().getFullYear()}-${String(Math.floor(100000 + Math.random() * 900000))}`;
    // eslint-disable-next-line no-await-in-loop
    const { rowCount } = await client.query(`SELECT 1 FROM orders WHERE order_code = $1`, [code]);
    if (!rowCount) return code;
  }
  const err = new Error("تعذر توليد رقم طلب فريد.");
  err.statusCode = 500;
  throw err;
}

async function upsertSkillsAndAttach({ orderId, skills }, client) {
  const list = Array.isArray(skills) ? skills : [];
  const unique = Array.from(new Set(list.map((x) => String(x || "").trim()).filter(Boolean)));
  for (const name of unique) {
    const normalized = name.toLowerCase().replace(/\s+/g, " ").trim();
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await client.query(
      `INSERT INTO skills (name, normalized_name)
       VALUES ($1, $2)
       ON CONFLICT (normalized_name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name.slice(0, 80), normalized.slice(0, 80)],
    );
    const sid = rows[0]?.id;
    if (!sid) continue;
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO order_skills (order_id, skill_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [Number(orderId), Number(sid)],
    );
  }
}

function mapTemplate(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: row.title,
    description: row.description,
    categoryId: String(row.category_id),
    subcategoryId: row.subcategory_id ? String(row.subcategory_id) : null,
    subSubcategoryId: row.sub_subcategory_id ? String(row.sub_subcategory_id) : null,
    categoryName: row.category_name || null,
    skills: Array.isArray(row.skills) ? row.skills : [],
    minBudget: Number(row.min_budget),
    maxBudget: Number(row.max_budget),
    currency: row.currency || "JOD",
    minDuration: Number(row.min_duration),
    maxDuration: Number(row.max_duration),
    durationUnit: row.duration_unit,
    isActive: Boolean(row.is_active),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSettings(row, planRows = []) {
  if (!row) return null;
  return {
    minOrders: Number(row.min_orders),
    maxOrders: Number(row.max_orders),
    durationHours: Number(row.duration_hours),
    showFakeBadgeToFreelancers: Boolean(row.show_fake_badge_to_freelancers),
    expiryBehavior: row.expiry_behavior || "expire",
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    updatedAt: row.updated_at,
    planIds: planRows.map((p) => String(p.plan_id)),
    plans: planRows.map((p) => ({
      id: String(p.plan_id),
      title: p.title || p.name || `#${p.plan_id}`,
      name: p.name || null,
    })),
  };
}

async function createTemplate({ actorUserId, payload }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const { rows } = await client.query(
      `INSERT INTO fake_order_templates (
         title, description, category_id, subcategory_id, sub_subcategory_id,
         skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
         is_active, created_by, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6::jsonb,$7,$8,'JOD',$9,$10,$11,TRUE,$12,NOW(),NOW()
       )
       RETURNING *`,
      [
        String(payload.title || "").trim(),
        String(payload.description || "").trim(),
        Number(payload.categoryId),
        payload.subcategoryId ? Number(payload.subcategoryId) : null,
        payload.subSubcategoryId ? Number(payload.subSubcategoryId) : null,
        JSON.stringify(Array.isArray(payload.skills) ? payload.skills : []),
        Number(payload.minBudget),
        Number(payload.maxBudget),
        Number(payload.minDuration),
        Number(payload.maxDuration),
        payload.durationUnit || "days",
        Number(actorUserId),
      ],
    );
    const created = rows[0];
    const { rows: namedRows } = await client.query(
      `SELECT t.*, c.name AS category_name
       FROM fake_order_templates t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.id = $1
       LIMIT 1`,
      [Number(created.id)],
    );
    await client.query("COMMIT");
    return mapTemplate(namedRows[0] || created);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listTemplates({ includeInactive = false, page = 1, pageSize = 20 } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const s = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (p - 1) * s;
  const whereSql = includeInactive ? "" : "WHERE t.is_active = TRUE";
  const [{ rows }, countRes] = await Promise.all([
    pool.query(
      `SELECT t.*, c.name AS category_name
       FROM fake_order_templates t
       LEFT JOIN categories c ON c.id = t.category_id
       ${whereSql}
       ORDER BY t.id DESC
       LIMIT $1 OFFSET $2`,
      [s, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM fake_order_templates t
       ${includeInactive ? "" : "WHERE t.is_active = TRUE"}`,
    ),
  ]);
  const total = Number(countRes.rows[0]?.total || 0);
  return {
    templates: rows.map(mapTemplate),
    pagination: {
      page: p,
      pageSize: s,
      total,
      totalPages: Math.max(1, Math.ceil(total / s)),
    },
  };
}

async function updateTemplate({ actorUserId, templateId, patch }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const fields = [];
    const vals = [];
    let i = 1;
    const set = (col, val) => {
      fields.push(`${col} = $${i}`);
      vals.push(val);
      i += 1;
    };
    if (patch.title !== undefined) set("title", String(patch.title || "").trim());
    if (patch.description !== undefined) set("description", String(patch.description || "").trim());
    if (patch.categoryId !== undefined) set("category_id", Number(patch.categoryId));
    if (patch.subcategoryId !== undefined) set("subcategory_id", patch.subcategoryId ? Number(patch.subcategoryId) : null);
    if (patch.subSubcategoryId !== undefined) set("sub_subcategory_id", patch.subSubcategoryId ? Number(patch.subSubcategoryId) : null);
    if (patch.skills !== undefined) set("skills", JSON.stringify(Array.isArray(patch.skills) ? patch.skills : []));
    if (patch.minBudget !== undefined) set("min_budget", Number(patch.minBudget));
    if (patch.maxBudget !== undefined) set("max_budget", Number(patch.maxBudget));
    if (patch.minDuration !== undefined) set("min_duration", Number(patch.minDuration));
    if (patch.maxDuration !== undefined) set("max_duration", Number(patch.maxDuration));
    if (patch.durationUnit !== undefined) set("duration_unit", String(patch.durationUnit || "days"));
    if (patch.isActive !== undefined) set("is_active", Boolean(patch.isActive));
    set("updated_at", new Date());
    vals.push(Number(templateId));
    const { rows } = await client.query(
      `UPDATE fake_order_templates
       SET ${fields.join(", ")}
       WHERE id = $${i}
       RETURNING *`,
      vals,
    );
    const updated = rows[0] || null;
    let finalRow = updated;
    if (updated?.id) {
      const { rows: namedRows } = await client.query(
        `SELECT t.*, c.name AS category_name
         FROM fake_order_templates t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.id = $1
         LIMIT 1`,
        [Number(updated.id)],
      );
      finalRow = namedRows[0] || updated;
    }
    await client.query("COMMIT");
    return mapTemplate(finalRow);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function deactivateTemplate({ actorUserId, templateId }) {
  return updateTemplate({ actorUserId, templateId, patch: { isActive: false } });
}

async function getSettings() {
  const [settingsRes, planRes] = await Promise.all([
    pool.query(`SELECT * FROM fake_order_settings WHERE id = 1 LIMIT 1`),
    pool.query(
      `SELECT sp.plan_id, p.title, p.name
       FROM fake_order_settings_plans sp
       LEFT JOIN plans p ON p.id = sp.plan_id
       ORDER BY sp.id ASC`,
    ),
  ]);
  return mapSettings(settingsRes.rows[0], planRes.rows);
}

async function updateSettings({ actorUserId, patch }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const currentRes = await client.query(`SELECT * FROM fake_order_settings WHERE id = 1 LIMIT 1`);
    const current = currentRes.rows[0];
    if (!current) {
      const err = new Error("إعدادات الطلبات التجريبية غير متاحة.");
      err.statusCode = 500;
      throw err;
    }
    const minOrders = patch.minOrders !== undefined ? Number(patch.minOrders) : Number(current.min_orders);
    const maxOrders = patch.maxOrders !== undefined ? Number(patch.maxOrders) : Number(current.max_orders);
    const durationHours = patch.durationHours !== undefined ? Number(patch.durationHours) : Number(current.duration_hours);
    if (!(minOrders > 0) || !(maxOrders > 0) || minOrders > maxOrders) {
      const err = new Error("الحد الأدنى/الأعلى غير صالح.");
      err.statusCode = 400;
      throw err;
    }
    await client.query(
      `UPDATE fake_order_settings
       SET min_orders = $1,
           max_orders = $2,
           duration_hours = $3,
           show_fake_badge_to_freelancers = $4,
           expiry_behavior = $5,
           updated_by = $6,
           updated_at = NOW()
       WHERE id = 1`,
      [
        minOrders,
        maxOrders,
        durationHours,
        patch.showFakeBadgeToFreelancers !== undefined ? Boolean(patch.showFakeBadgeToFreelancers) : Boolean(current.show_fake_badge_to_freelancers),
        patch.expiryBehavior || current.expiry_behavior || "expire",
        Number(actorUserId),
      ],
    );
    if (Array.isArray(patch.planIds)) {
      const planIds = [...new Set(patch.planIds.map((x) => Number(x)).filter((x) => x > 0))];
      await client.query(`DELETE FROM fake_order_settings_plans`);
      for (const pid of planIds) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `INSERT INTO fake_order_settings_plans (plan_id, created_at)
           VALUES ($1, NOW())
           ON CONFLICT (plan_id) DO NOTHING`,
          [pid],
        );
      }
    }
    await client.query("COMMIT");
    return getSettings();
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createRound({ actorUserId, payload }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const settingsRes = await client.query(`SELECT * FROM fake_order_settings WHERE id = 1 LIMIT 1`);
    const settings = settingsRes.rows[0];
    if (!settings) {
      const err = new Error("يرجى ضبط إعدادات الطلبات التجريبية أولاً.");
      err.statusCode = 400;
      throw err;
    }
    const minOrders = Number(settings.min_orders);
    const maxOrders = Number(settings.max_orders);
    const durationHours = Number(settings.duration_hours);
    const generatedCount = randomInt(minOrders, maxOrders);
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);
    const showBadge = Boolean(settings.show_fake_badge_to_freelancers);
    const { rows: roundRows } = await client.query(
      `INSERT INTO fake_order_rounds (
         title, min_orders, max_orders, generated_count, duration_hours,
         starts_at, expires_at, status, show_fake_badge_to_freelancers,
         created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,NOW(),NOW())
       RETURNING *`,
      [String(payload.title || `جولة تدريبية ${startsAt.toLocaleDateString("en-GB")}`).trim(), minOrders, maxOrders, generatedCount, durationHours, startsAt, expiresAt, showBadge, Number(actorUserId)],
    );
    const round = roundRows[0];
    const { rows: settingsPlanRows } = await client.query(`SELECT plan_id FROM fake_order_settings_plans`);
    const planIds = [...new Set(settingsPlanRows.map((x) => Number(x.plan_id)).filter((x) => x > 0))];
    if (!planIds.length) {
      const err = new Error("يرجى اختيار الخطط المؤهلة من إعدادات الطلبات التجريبية.");
      err.statusCode = 400;
      throw err;
    }
    for (const pid of planIds) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO fake_order_round_plans (fake_round_id, plan_id, created_at)
         VALUES ($1,$2,NOW())
         ON CONFLICT (fake_round_id, plan_id) DO NOTHING`,
        [Number(round.id), Number(pid)],
      );
    }
    let templates = [];
    const templateIds = [...new Set((Array.isArray(payload.templateIds) ? payload.templateIds : []).map((x) => Number(x)).filter((x) => x > 0))];
    if (templateIds.length) {
      const { rows } = await client.query(`SELECT * FROM fake_order_templates WHERE id = ANY($1::bigint[]) AND is_active = TRUE`, [templateIds]);
      templates = rows;
    } else {
      const { rows } = await client.query(`SELECT * FROM fake_order_templates WHERE is_active = TRUE ORDER BY id ASC`);
      templates = rows;
    }
    if (!templates.length) {
      const err = new Error("لا توجد قوالب نشطة لإنشاء الجولة.");
      err.statusCode = 400;
      throw err;
    }

    for (let i = 0; i < generatedCount; i += 1) {
      const t = templates[i % templates.length];
      const budget = randomInt(Number(t.min_budget), Number(t.max_budget));
      const durationValue = randomInt(Number(t.min_duration), Number(t.max_duration));
      // eslint-disable-next-line no-await-in-loop
      const orderCode = await generateUniqueOrderCode(client);
      // eslint-disable-next-line no-await-in-loop
      const { rows } = await client.query(
        `INSERT INTO orders (
           order_code, title, description,
           category_id, subcategory_id, sub_subcategory_id,
           extra_category_ids, extra_category_details,
           project_type, budget, currency_code, duration_value, duration_unit,
           created_by_user_id, created_by_role, source_type,
           assigned_freelancer_id, is_direct_admin_assignment,
           received_at, started_at, due_at,
           is_published, is_open_for_pool, is_archived,
           payment_required, payment_status, order_status,
           bid_budget_min, bid_budget_max,
           is_fake, fake_round_id, fake_expires_at, fake_status, show_fake_badge,
           created_at, updated_at
         ) VALUES (
           $1,$2,$3,
           $4,$5,$6,
           '{}'::bigint[],'{}'::jsonb,
           'bidding',NULL,'JOD',$7,$8,
           $9,$10,$11,
           NULL,FALSE,
           NULL,NULL,NULL,
           TRUE,TRUE,FALSE,
           FALSE,'not_required','open_for_bids',
           $12,$13,
           TRUE,$14,$15,'active',$16,
           NOW(),NOW()
         )
         RETURNING id`,
        [
          orderCode,
          String(t.title || "").trim(),
          String(t.description || "").trim(),
          Number(t.category_id),
          t.subcategory_id ? Number(t.subcategory_id) : null,
          t.sub_subcategory_id ? Number(t.sub_subcategory_id) : null,
          durationValue,
          t.duration_unit || "days",
          Number(actorUserId),
          String((await client.query(`SELECT role FROM users WHERE id = $1`, [Number(actorUserId)])).rows?.[0]?.role || "admin"),
          "admin_created",
          Number(budget),
          Number(budget),
          Number(round.id),
          expiresAt,
          showBadge,
        ],
      );
      // eslint-disable-next-line no-await-in-loop
      await upsertSkillsAndAttach({ orderId: rows[0].id, skills: Array.isArray(t.skills) ? t.skills : [] }, client);
    }

    await client.query("COMMIT");
    return getRoundById({ roundId: round.id });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function mapRound(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: row.title,
    minOrders: Number(row.min_orders),
    maxOrders: Number(row.max_orders),
    generatedCount: Number(row.generated_count),
    durationHours: Number(row.duration_hours),
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    status: row.status,
    showFakeBadgeToFreelancers: Boolean(row.show_fake_badge_to_freelancers),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listRounds() {
  await markExpiredRounds();
  const { rows } = await pool.query(
    `SELECT r.*,
            COALESCE(COUNT(b.id), 0)::int AS total_bids,
            COALESCE(COUNT(DISTINCT b.freelancer_user_id), 0)::int AS unique_freelancers
     FROM fake_order_rounds r
     LEFT JOIN orders o ON o.fake_round_id = r.id AND o.is_fake = TRUE
     LEFT JOIN order_freelancer_bids b ON b.order_id = o.id
     GROUP BY r.id
     ORDER BY r.id DESC`,
  );
  return rows.map((r) => ({
    ...mapRound(r),
    totalBids: Number(r.total_bids || 0),
    uniqueFreelancers: Number(r.unique_freelancers || 0),
  }));
}

async function markExpiredRounds() {
  const { rows: behaviorRows } = await pool.query(`SELECT expiry_behavior FROM fake_order_settings WHERE id = 1 LIMIT 1`);
  const expiryBehavior = behaviorRows[0]?.expiry_behavior || "expire";
  await pool.query(
    `UPDATE fake_order_rounds
     SET status = $1, updated_at = NOW()
     WHERE status = 'active' AND expires_at <= NOW()`,
    [expiryBehavior === "stop" ? "stopped" : "expired"],
  );
  await pool.query(
    `UPDATE orders
     SET fake_status = $1, updated_at = NOW()
     WHERE is_fake = TRUE
       AND fake_status = 'active'
       AND fake_expires_at IS NOT NULL
       AND fake_expires_at <= NOW()`,
    [expiryBehavior === "stop" ? "stopped" : "expired"],
  );
}

async function getRoundById({ roundId }) {
  await markExpiredRounds();
  const { rows } = await pool.query(`SELECT * FROM fake_order_rounds WHERE id = $1 LIMIT 1`, [Number(roundId)]);
  const round = rows[0];
  if (!round) return null;
  const [planRes, ordersRes, bidsRes, bidRowsRes] = await Promise.all([
    pool.query(
      `SELECT p.id, p.title, p.name
       FROM fake_order_round_plans rp
       JOIN plans p ON p.id = rp.plan_id
       WHERE rp.fake_round_id = $1
       ORDER BY p.id ASC`,
      [Number(roundId)],
    ),
    pool.query(
      `SELECT o.id, o.order_code, o.title, o.fake_status, o.fake_expires_at,
              COUNT(b.id)::int AS bids_count
       FROM orders o
       LEFT JOIN order_freelancer_bids b ON b.order_id = o.id
       WHERE o.is_fake = TRUE
         AND o.fake_round_id = $1
       GROUP BY o.id
       ORDER BY o.id DESC`,
      [Number(roundId)],
    ),
    pool.query(
      `SELECT
         COUNT(b.id)::int AS total_bids,
         COUNT(DISTINCT b.freelancer_user_id)::int AS unique_freelancers,
         AVG(b.amount)::numeric(12,2) AS avg_bid,
         MIN(b.amount)::numeric(12,2) AS min_bid,
         MAX(b.amount)::numeric(12,2) AS max_bid
       FROM order_freelancer_bids b
       JOIN orders o ON o.id = b.order_id
       WHERE o.is_fake = TRUE
         AND o.fake_round_id = $1`,
      [Number(roundId)],
    ),
    pool.query(
      `SELECT
         o.id AS order_id,
         o.order_code,
         o.title AS order_title,
         b.id AS bid_id,
         b.amount,
         b.status,
         b.proposal_message,
         b.created_at,
         u.id AS freelancer_user_id,
         u.account_id,
         u.first_name,
         u.father_name,
         u.family_name,
         u.email
       FROM orders o
       JOIN order_freelancer_bids b ON b.order_id = o.id
       JOIN users u ON u.id = b.freelancer_user_id
       WHERE o.is_fake = TRUE
         AND o.fake_round_id = $1
       ORDER BY o.id DESC, b.created_at DESC`,
      [Number(roundId)],
    ),
  ]);
  const bidsByOrder = {};
  const bidsByFreelancer = {};
  for (const r of bidRowsRes.rows) {
    const oid = String(r.order_id);
    const fid = String(r.freelancer_user_id);
    if (!bidsByOrder[oid]) bidsByOrder[oid] = [];
    bidsByOrder[oid].push({
      bidId: String(r.bid_id),
      amount: Number(r.amount),
      status: r.status,
      message: r.proposal_message || null,
      createdAt: r.created_at,
      freelancer: {
        id: fid,
        accountId: r.account_id,
        firstName: r.first_name,
        fatherName: r.father_name,
        familyName: r.family_name,
        email: r.email,
      },
    });
    if (!bidsByFreelancer[fid]) bidsByFreelancer[fid] = [];
    bidsByFreelancer[fid].push({
      orderId: oid,
      orderCode: r.order_code,
      orderTitle: r.order_title,
      amount: Number(r.amount),
      status: r.status,
      message: r.proposal_message || null,
      createdAt: r.created_at,
    });
  }
  return {
    round: mapRound(round),
    plans: planRes.rows.map((r) => ({ id: String(r.id), name: r.name, title: r.title })),
    orders: ordersRes.rows.map((r) => ({
      id: String(r.id),
      orderCode: r.order_code,
      title: r.title,
      fakeStatus: r.fake_status,
      fakeExpiresAt: r.fake_expires_at,
      bidsCount: Number(r.bids_count || 0),
    })),
    analytics: {
      totalBids: Number(bidsRes.rows[0]?.total_bids || 0),
      uniqueFreelancers: Number(bidsRes.rows[0]?.unique_freelancers || 0),
      averageBid: bidsRes.rows[0]?.avg_bid != null ? Number(bidsRes.rows[0].avg_bid) : null,
      minBid: bidsRes.rows[0]?.min_bid != null ? Number(bidsRes.rows[0].min_bid) : null,
      maxBid: bidsRes.rows[0]?.max_bid != null ? Number(bidsRes.rows[0].max_bid) : null,
      bidsByOrder,
      bidsByFreelancer,
    },
  };
}

async function stopRound({ actorUserId, roundId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    await client.query(
      `UPDATE fake_order_rounds
       SET status = 'stopped', updated_at = NOW()
       WHERE id = $1`,
      [Number(roundId)],
    );
    await client.query(
      `UPDATE orders
       SET fake_status = 'stopped',
           is_open_for_pool = FALSE,
           updated_at = NOW()
       WHERE is_fake = TRUE
         AND fake_round_id = $1
         AND fake_status = 'active'`,
      [Number(roundId)],
    );
    await client.query("COMMIT");
    return getRoundById({ roundId });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getFreelancerCurrentPlanId(freelancerUserId, clientMaybe) {
  const runner = clientMaybe || pool;
  const { rows } = await runner.query(
    `SELECT plan_id
     FROM freelancer_subscriptions
     WHERE freelancer_user_id = $1
       AND is_current = TRUE
     ORDER BY id DESC
     LIMIT 1`,
    [Number(freelancerUserId)],
  );
  return rows[0]?.plan_id ? Number(rows[0].plan_id) : null;
}

async function isFreelancerEligibleForFakeOrder({ freelancerUserId, orderId }, clientMaybe) {
  const runner = clientMaybe || pool;
  const uid = Number(freelancerUserId);
  const oid = Number(orderId);
  if (!Number.isInteger(uid) || !Number.isInteger(oid)) return false;
  const { rows } = await runner.query(
    `SELECT o.id, o.is_fake, o.fake_round_id, o.fake_expires_at, o.fake_status
     FROM orders o
     WHERE o.id = $1
     LIMIT 1`,
    [oid],
  );
  const order = rows[0];
  if (!order) return false;
  if (!order.is_fake) return true;
  if (order.fake_status !== "active") return false;
  if (order.fake_expires_at && new Date(order.fake_expires_at).getTime() <= Date.now()) return false;
  const planId = await getFreelancerCurrentPlanId(uid, runner);
  if (!planId || !order.fake_round_id) return false;
  const { rowCount } = await runner.query(
    `SELECT 1
     FROM fake_order_round_plans
     WHERE fake_round_id = $1
       AND plan_id = $2
     LIMIT 1`,
    [Number(order.fake_round_id), Number(planId)],
  );
  return rowCount > 0;
}

module.exports = {
  createTemplate,
  listTemplates,
  updateTemplate,
  deactivateTemplate,
  createRound,
  getSettings,
  updateSettings,
  listRounds,
  getRoundById,
  stopRound,
  markExpiredRounds,
  isFreelancerEligibleForFakeOrder,
  getFreelancerCurrentPlanId,
};
