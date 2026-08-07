const { renderMobilePaymentReturnHtml } = require("../utils/mobilePaymentReturnHtml");

const ALLOWED_STATUS = new Set(["success", "cancel"]);

function mobilePaymentReturnPage(req, res) {
  const status = String(req.query.status || "")
    .trim()
    .toLowerCase();
  const orderId = String(req.query.orderId || "").trim();
  const sessionId = String(req.query.session_id || "").trim();

  if (!ALLOWED_STATUS.has(status)) {
    return res.status(400).send("حالة غير صالحة.");
  }
  if (!/^\d+$/.test(orderId)) {
    return res.status(400).send("معرّف الطلب غير صالح.");
  }
  if (sessionId && !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return res.status(400).send("معرّف الجلسة غير صالح.");
  }

  const scheme = String(process.env.MOBILE_APP_SCHEME || "orderzhouse").trim() || "orderzhouse";
  const deepPath = status === "success" ? "success" : "cancel";
  const params = new URLSearchParams();
  params.set("orderId", orderId);
  if (sessionId) {
    params.set("session_id", sessionId);
  }
  const deepLink = `${scheme}://payment/${deepPath}?${params.toString()}`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(
    renderMobilePaymentReturnHtml({
      deepLink,
      status,
    }),
  );
}

module.exports = { mobilePaymentReturnPage };
