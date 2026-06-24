export function widgetErrMsg(e) {
  return e?.response?.data?.message || e?.message || "حدث خطأ غير متوقع.";
}

/** @returns {Promise<{ status: 'success', data: T } | { status: 'error', error: string }>} */
export async function loadWidget(fetcher) {
  try {
    const data = await fetcher();
    return { status: "success", data };
  } catch (e) {
    return { status: "error", error: widgetErrMsg(e) };
  }
}

export const WIDGET_IDLE = { status: "loading", data: null, error: "" };

/**
 * Load a dashboard widget; keeps previous data during silent/background refresh.
 * @param {import("react").Dispatch<import("react").SetStateAction<{ status: string, data: unknown, error: string }>>} setter
 * @param {() => Promise<unknown>} fetcher
 * @param {{ silent?: boolean, initialLoadDone?: boolean }} [options]
 */
export async function runWidgetLoad(setter, fetcher, { silent = false, initialLoadDone = false } = {}) {
  const keepStale = silent || initialLoadDone;
  if (!keepStale) {
    setter({ status: "loading", data: null, error: "" });
  }
  const result = await loadWidget(fetcher);
  setter((prev) => ({
    status:
      result.status === "success"
        ? "success"
        : keepStale && prev.data != null
          ? "success"
          : "error",
    data: result.status === "success" ? result.data : prev.data,
    error: result.status === "error" ? result.error : "",
  }));
  return result;
}
