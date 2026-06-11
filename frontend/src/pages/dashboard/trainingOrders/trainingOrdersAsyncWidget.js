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
