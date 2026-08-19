const { pool } = require("../config/db");

let readyCache = null;

async function bildazoArticlePublishSchemaReady(db = pool) {
  if (readyCache === true) return true;
  if (readyCache === false) return false;
  try {
    const { rows } = await db.query(
      `SELECT to_regclass('public.bildazo_article_publish_records') AS tbl`,
    );
    readyCache = Boolean(rows[0]?.tbl);
  } catch {
    readyCache = false;
  }
  return readyCache;
}

function clearBildazoArticlePublishSchemaCache() {
  readyCache = null;
}

module.exports = {
  bildazoArticlePublishSchemaReady,
  clearBildazoArticlePublishSchemaCache,
};
