/**
 * Phase B5 schema readiness for Article Applications.
 */

const { pool } = require("../config/db");

let readyCache = null;

async function articleApplicationsSchemaReady(db = pool) {
  if (readyCache === true) return true;
  if (readyCache === false) return false;
  const { rows } = await db.query(
    `SELECT
       to_regclass('public.marketplace_article_applications') AS apps,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name='marketplace_economy_settings'
            AND column_name='article_applications_enabled'
       ) AS flag_col`,
  );
  readyCache = Boolean(rows[0]?.apps) && Boolean(rows[0]?.flag_col);
  return readyCache;
}

function clearArticleApplicationsSchemaCache() {
  readyCache = null;
}

module.exports = {
  articleApplicationsSchemaReady,
  clearArticleApplicationsSchemaCache,
};
