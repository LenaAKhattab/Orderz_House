/** @type {number | null} */
let latestVisitorsTotal = null;
/** @type {number | null} */
let latestActiveUsersTotal = null;

/** @type {((patch: { visitors?: number | null, activeUsers?: number | null }) => void) | null} */
let refetchPublicHomeStatsListener = null;
let pendingRefetch = false;

/**
 * Called after a local pageview is recorded. Optionally applies totals immediately,
 * then refetches GET /public/home-stats (or queues refetch if the hook is not mounted yet).
 * @param {number | null | undefined} [totalCount]
 * @param {number | null | undefined} [activeUsersLast7Days]
 */
export function triggerPublicHomeStatsRefetch(totalCount, activeUsersLast7Days) {
  if (totalCount != null && !Number.isNaN(Number(totalCount))) {
    latestVisitorsTotal = Math.trunc(Number(totalCount));
  }
  if (activeUsersLast7Days != null && !Number.isNaN(Number(activeUsersLast7Days))) {
    latestActiveUsersTotal = Math.trunc(Number(activeUsersLast7Days));
  }
  const patch = {
    visitors: latestVisitorsTotal,
    activeUsers: latestActiveUsersTotal,
  };
  if (refetchPublicHomeStatsListener) {
    refetchPublicHomeStatsListener(patch);
    pendingRefetch = false;
  } else {
    pendingRefetch = true;
  }
}

/** @param {((patch: { visitors?: number | null, activeUsers?: number | null }) => void) | null} listener */
export function setPublicHomeStatsRefetchListener(listener) {
  refetchPublicHomeStatsListener = listener;
  if (listener && pendingRefetch) {
    listener({
      visitors: latestVisitorsTotal,
      activeUsers: latestActiveUsersTotal,
    });
    pendingRefetch = false;
  }
}

/** @returns {number | null} */
export function peekLatestVisitorsTotal() {
  return latestVisitorsTotal;
}

/** @returns {number | null} */
export function peekLatestActiveUsersTotal() {
  return latestActiveUsersTotal;
}
