const { pool } = require("../config/db");

let readyCache = null;

async function marketplaceArticleSubmissionsSchemaReady(db = pool) {
  if (readyCache === true) return true;
  if (readyCache === false) return false;
  try {
    const { rows } = await db.query(
      `SELECT to_regclass('public.marketplace_article_submissions') AS tbl`,
    );
    readyCache = Boolean(rows[0]?.tbl);
  } catch {
    readyCache = false;
  }
  return readyCache;
}

function clearMarketplaceArticleSubmissionsSchemaCache() {
  readyCache = null;
}

module.exports = {
  marketplaceArticleSubmissionsSchemaReady,
  clearMarketplaceArticleSubmissionsSchemaCache,
};
