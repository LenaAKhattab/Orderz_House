import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..");
const read = (p) => readFileSync(join(src, p), "utf8");
const json = (p) => JSON.parse(read(p));

const AR_VIEW = "تعذر فتح المرفق. حاول مرة أخرى.";
const AR_DOWNLOAD = "تعذر تنزيل المرفق. حاول مرة أخرى.";

describe("order file view/download (R2 same-origin streaming)", () => {
  const api = read("services/api.js");

  it("transport/storage failures never surface a raw axios message", () => {
    const fn = api.slice(api.indexOf("async function attachBlobErrorMessage"), api.indexOf("export async function fetchOrderFileBlob"));
    assert.match(fn, /err\.message = st === 401 \|\| st === 403 \|\| st === 404 \? serverMessage : ""/);
  });

  it("preview keeps the real content type (images are not relabelled as PDF) and falls back to download", () => {
    const fn = api.slice(api.indexOf("export async function viewOrderFileForRole"), api.indexOf("export const downloadClientOrderFile"));
    assert.ok(!fn.includes("showPdfBlobInTab"));
    assert.match(fn, /ORDER_FILE_INLINE_TYPES\.has\(type\)/);
    assert.match(fn, /openPdfPreviewTab\(\)/);
    assert.match(fn, /closePreviewTab\(tab\)/);
    for (const t of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) assert.ok(api.includes(`"${t}"`));
  });

  it("submission timeline handles view/download errors (via the shared FileList)", () => {
    const tl = read("components/orders/submission-history/SubmissionHistoryTimeline.jsx");
    // Delivery files and revision attachments both render through FileList, which owns the localized error toasts.
    assert.equal((tl.match(/<FileList /g) || []).length, 2);
    assert.match(tl, /fileAccess=\{fileAccess\}/);
  });

  it("FileList uses action-specific localized fallbacks", () => {
    const fl = read("components/orders/order-details/FileList.jsx");
    assert.match(fl, /ordersAdmin\.orderDetails\.files\.openError/);
    assert.match(fl, /ordersAdmin\.orderDetails\.files\.downloadError/);
  });

  it("dashboard shell hides only the site footer, not card action footers (delivery entry point)", () => {
    const css = read("styles/freelancerDashboardShell.css");
    assert.ok(!/\.page-shell:has\(\.fdl-shell\)\s+footer\s*\{/.test(css));
    assert.match(css, /\.page-shell:has\(\.fdl-shell\) \.site-footer \{\s*display: none;/);
    assert.match(read("components/orders/ClientOrderCardCompact.jsx"), /<footer className="coc__foot"/);
    assert.match(read("components/orders/OrderDialog.jsx"), /<footer className="oh-dialog__foot"/);
  });

  it("locales carry the required Arabic messages (and English equivalents)", () => {
    const arOA = json("locales/ar/ordersAdmin.json").orderDetails.files;
    const enOA = json("locales/en/ordersAdmin.json").orderDetails.files;
    assert.equal(arOA.openError, AR_VIEW);
    assert.equal(arOA.downloadError, AR_DOWNLOAD);
    assert.ok(enOA.openError && enOA.downloadError);
    const arCA = read("locales/ar/clientArea.json");
    assert.ok(arCA.includes(`"viewError": "${AR_VIEW}"`));
    assert.ok(arCA.includes(`"downloadError": "${AR_DOWNLOAD}"`));
  });
});
