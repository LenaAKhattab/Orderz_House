const { pool } = require("../config/db");

let readyCache = null;

async function bildazoAuthorLinkSchemaReady(db = pool) {
  if (readyCache === true) return true;
  try {
    const { rows } = await db.query(
      `SELECT to_regclass('public.freelancer_bildazo_author_links') AS tbl`,
    );
    readyCache = Boolean(rows[0]?.tbl);
  } catch {
    readyCache = false;
  }
  return readyCache;
}

function clearBildazoAuthorLinkSchemaCache() {
  readyCache = null;
}

module.exports = {
  bildazoAuthorLinkSchemaReady,
  clearBildazoAuthorLinkSchemaCache,
};
