const { pool } = require("../config/db");
const {
  ORDERZHOUSE_PLAN_IDS,
  mergeApiPlansWithCatalog,
} = require("../constants/orderzhousePlansCatalog");
const {
  planEligibleForFreelancerSelfCheckout,
  attachFeaturesToPlans,
  resolveCheckoutPlanId,
  resolvePlanRowForCheckout,
} = require("./plansService");

function mapPlanPage(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: row.title,
    subtitle: row.subtitle || null,
    slug: row.slug || null,
    pageType: row.page_type,
    isPublic: Boolean(row.is_public),
    isActive: Boolean(row.is_active),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isPlanPageWithinSchedule(page) {
  const now = new Date();
  if (page.startsAt && new Date(page.startsAt) > now) return false;
  if (page.endsAt && new Date(page.endsAt) < now) return false;
  return true;
}

function isPlanPageAccessible(page) {
  if (!page || !page.isActive) return false;
  return isPlanPageWithinSchedule(page);
}

async function listPlanPages() {
  const { rows } = await pool.query(
    `SELECT *
     FROM plan_pages
     ORDER BY page_type = 'default' DESC, id ASC`,
  );
  return rows.map(mapPlanPage);
}

async function getPlanPageById(id) {
  const { rows } = await pool.query(`SELECT * FROM plan_pages WHERE id = $1 LIMIT 1`, [Number(id)]);
  return mapPlanPage(rows[0]);
}

async function getDefaultPlanPage() {
  const { rows } = await pool.query(
    `SELECT * FROM plan_pages WHERE page_type = 'default' ORDER BY id ASC LIMIT 1`,
  );
  return mapPlanPage(rows[0]);
}

async function getPlanPageBySlug(slug) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) return null;
  const { rows } = await pool.query(
    `SELECT * FROM plan_pages WHERE LOWER(slug) = $1 LIMIT 1`,
    [normalized],
  );
  return mapPlanPage(rows[0]);
}

async function listPlansForPageRow(pageRow, { mergeCatalog = false } = {}) {
  const { rows } = await pool.query(
    `SELECT p.*
     FROM plans p
     WHERE p.deleted_at IS NULL
       AND p.is_visible = TRUE
       AND p.is_active = TRUE
       AND p.plan_page_id = $1
     ORDER BY p.sort_order ASC, p.id ASC`,
    [Number(pageRow.id)],
  );

  let plans = await attachFeaturesToPlans(rows);
  plans = await Promise.all(
    plans.map(async (plan) => {
      const row = rows.find((r) => String(r.id) === plan.id);
      const checkoutPlanId = resolveCheckoutPlanId(row);
      const checkoutRow = await resolvePlanRowForCheckout(row.id);
      return {
        ...plan,
        checkoutPlanId: checkoutPlanId != null ? String(checkoutPlanId) : plan.id,
        selfCheckoutEligible: checkoutRow ? planEligibleForFreelancerSelfCheckout(checkoutRow) : false,
        adminNotes: undefined,
      };
    }),
  );

  if (mergeCatalog && pageRow.page_type === "default") {
    return mergeApiPlansWithCatalog(plans);
  }
  return plans;
}

async function getPublicPlanPageBySlug(slug) {
  const page = await getPlanPageBySlug(slug);
  if (!page || !isPlanPageAccessible(page)) {
    const err = new Error("Plan page not found or unavailable.");
    err.statusCode = 404;
    throw err;
  }
  const plans = await listPlansForPageRow(
    { id: page.id, page_type: page.pageType },
    { mergeCatalog: false },
  );
  return { page, plans };
}

async function getPublicDefaultPlanPage() {
  const page = await getDefaultPlanPage();
  if (!page || !isPlanPageAccessible(page)) {
    const plansService = require("./plansService");
    const plans = await plansService.listPublicCatalogPlans();
    return {
      page: page || {
        id: null,
        title: null,
        subtitle: null,
        slug: null,
        pageType: "default",
        isPublic: true,
        isActive: true,
      },
      plans,
    };
  }
  const plans = await listPlansForPageRow(
    { id: page.id, page_type: page.pageType },
    { mergeCatalog: true },
  );
  return { page, plans };
}

async function createPlanPage({ payload }) {
  const {
    title,
    subtitle = null,
    slug = null,
    pageType = "special",
    isPublic = true,
    isActive = true,
    startsAt = null,
    endsAt = null,
  } = payload;

  if (pageType === "default") {
    const existing = await getDefaultPlanPage();
    if (existing) {
      const err = new Error("A default plan page already exists.");
      err.statusCode = 400;
      throw err;
    }
  }

  const normalizedSlug = slug ? String(slug).trim().toLowerCase() : null;
  const { rows } = await pool.query(
    `INSERT INTO plan_pages (
      title, subtitle, slug, page_type, is_public, is_active, starts_at, ends_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      title,
      subtitle,
      normalizedSlug,
      pageType,
      Boolean(isPublic),
      Boolean(isActive),
      startsAt || null,
      endsAt || null,
    ],
  );
  return mapPlanPage(rows[0]);
}

async function updatePlanPage({ id, patch }) {
  const fields = [];
  const values = [];
  let i = 1;

  const set = (col, val) => {
    fields.push(`${col} = $${i}`);
    values.push(val);
    i += 1;
  };

  if (patch.title !== undefined) set("title", patch.title);
  if (patch.subtitle !== undefined) set("subtitle", patch.subtitle);
  if (patch.slug !== undefined) set("slug", patch.slug ? String(patch.slug).trim().toLowerCase() : null);
  if (patch.pageType !== undefined) set("page_type", patch.pageType);
  if (patch.isPublic !== undefined) set("is_public", Boolean(patch.isPublic));
  if (patch.isActive !== undefined) set("is_active", Boolean(patch.isActive));
  if (patch.startsAt !== undefined) set("starts_at", patch.startsAt || null);
  if (patch.endsAt !== undefined) set("ends_at", patch.endsAt || null);
  set("updated_at", new Date());

  values.push(Number(id));

  const { rows } = await pool.query(
    `UPDATE plan_pages
     SET ${fields.join(", ")}
     WHERE id = $${i}
     RETURNING *`,
    values,
  );

  if (!rows[0]) {
    const err = new Error("Plan page not found.");
    err.statusCode = 404;
    throw err;
  }
  return mapPlanPage(rows[0]);
}

async function deletePlanPage({ id }) {
  const page = await getPlanPageById(id);
  if (!page) {
    const err = new Error("Plan page not found.");
    err.statusCode = 404;
    throw err;
  }
  if (page.pageType === "default") {
    const err = new Error("The default plan page cannot be deleted.");
    err.statusCode = 400;
    throw err;
  }

  const { rowCount } = await pool.query(`DELETE FROM plan_pages WHERE id = $1`, [Number(id)]);
  if (rowCount === 0) {
    const err = new Error("Plan page not found.");
    err.statusCode = 404;
    throw err;
  }
  return true;
}

module.exports = {
  mapPlanPage,
  isPlanPageAccessible,
  listPlanPages,
  getPlanPageById,
  getDefaultPlanPage,
  getPlanPageBySlug,
  getPublicPlanPageBySlug,
  getPublicDefaultPlanPage,
  listPlansForPageRow,
  createPlanPage,
  updatePlanPage,
  deletePlanPage,
  ORDERZHOUSE_PLAN_IDS,
};
