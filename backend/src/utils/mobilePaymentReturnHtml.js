function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsString(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

/**
 * Minimal HTML bridge: Stripe HTTPS return → custom scheme deep link.
 * Does not prove payment — app must call pay-confirm / refresh order.
 */
function renderMobilePaymentReturnHtml({ deepLink, status }) {
  const safeHref = escapeHtml(deepLink);
  const safeJs = escapeJsString(deepLink);
  const title = status === "success" ? "تم الدفع" : "إلغاء الدفع";
  const message =
    status === "success"
      ? "يتم إعادتك إلى التطبيق لتأكيد حالة الدفع..."
      : "يتم إعادتك إلى التطبيق...";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — أوردرز هاوس</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #f5f7fc; color: #0f172a; text-align: center; }
    .card { max-width: 420px; margin: 2rem auto; padding: 1.5rem; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(47,59,101,.08); }
    a { color: #2f3b65; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p><a id="open-app" href="${safeHref}">اضغط هنا للعودة إلى التطبيق</a></p>
  </div>
  <script>
    (function () {
      var target = '${safeJs}';
      try { window.location.replace(target); } catch (e) {}
      setTimeout(function () {
        try { window.location.href = target; } catch (e2) {}
      }, 400);
    })();
  </script>
</body>
</html>`;
}

module.exports = { renderMobilePaymentReturnHtml, escapeHtml };
