const { pool } = require("../config/db");

const PLATFORM_UI_SETTINGS_CACHE_MS = Math.min(
  Math.max(Number(process.env.PLATFORM_UI_SETTINGS_CACHE_MS) || 30_000, 10_000),
  120_000,
);

/** @type {{ value: object | null, expires: number }} */
let settingsCache = { value: null, expires: 0 };

function invalidatePlatformUiSettingsCache() {
  settingsCache = { value: null, expires: 0 };
}

async function getPlatformUiSettings() {
  if (settingsCache.value && settingsCache.expires > Date.now()) {
    return settingsCache.value;
  }
  const { rows } = await pool.query(
    `SELECT show_home_visitors_count AS "showHomeVisitorsCount",
            show_home_active_users_count AS "showHomeActiveUsersCount",
            updated_at AS "updatedAt"
     FROM platform_ui_settings WHERE id = 1 LIMIT 1`,
  );
  const value = rows.length
    ? rows[0]
    : {
        showHomeVisitorsCount: false,
        showHomeActiveUsersCount: false,
        updatedAt: null,
      };
  settingsCache = { value, expires: Date.now() + PLATFORM_UI_SETTINGS_CACHE_MS };
  return value;
}

/**
 * Merge-update homepage visibility flags (partial patch supported).
 * @param {{ showHomeVisitorsCount?: boolean, showHomeActiveUsersCount?: boolean }} patch
 */
async function updatePlatformUiSettings(patch = {}) {
  const current = await getPlatformUiSettings();
  const nextVisitors =
    patch.showHomeVisitorsCount !== undefined ? Boolean(patch.showHomeVisitorsCount) : Boolean(current.showHomeVisitorsCount);
  const nextActive =
    patch.showHomeActiveUsersCount !== undefined
      ? Boolean(patch.showHomeActiveUsersCount)
      : Boolean(current.showHomeActiveUsersCount);

  await pool.query(
    `INSERT INTO platform_ui_settings (id, show_home_visitors_count, show_home_active_users_count, updated_at)
     VALUES (1, $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET
       show_home_visitors_count = EXCLUDED.show_home_visitors_count,
       show_home_active_users_count = EXCLUDED.show_home_active_users_count,
       updated_at = NOW()`,
    [nextVisitors, nextActive],
  );
  invalidatePlatformUiSettingsCache();
  return getPlatformUiSettings();
}

module.exports = {
  getPlatformUiSettings,
  updatePlatformUiSettings,
  invalidatePlatformUiSettingsCache,
};
