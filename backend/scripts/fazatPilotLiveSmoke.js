/**
 * Controlled live pilot smoke against a running Orderz API (default http://127.0.0.1:5000).
 * Creates at most one partner order (idempotent). Does not delete data.
 *
 *   DOTENV_CONFIG_PATH=.env.fazat-pilot.local node scripts/fazatPilotLiveSmoke.js
 */
const path = require("node:path");
const dotenvPath = process.env.DOTENV_CONFIG_PATH
  ? path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)
  : path.resolve(process.cwd(), ".env.fazat-pilot.local");
require("dotenv").config({ path: dotenvPath, override: true, quiet: true });

const { buildSigningPayload, signHmacSha256Hex } = require("../src/utils/fazatCrypto");
const { sanitizeOrderForFreelancerAssigned } = require("../src/utils/orderViewerSanitize");
const { attachPartnerMetaToOrder } = require("../src/services/fazatOrderEnrichmentService");
const ordersService = require("../src/services/ordersService");
const { pool } = require("../src/config/db");

const base = String(process.env.ORDERZ_PUBLIC_API_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
const apiKey = process.env.FAZAT_INTEGRATION_API_KEY;
const secret = process.env.FAZAT_INTEGRATION_SHARED_SECRET;

async function signedFetch(method, pathWithQuery, bodyObj = null) {
  const rawBody = bodyObj == null ? "" : JSON.stringify(bodyObj);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = `pilot_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const payload = buildSigningPayload({
    timestamp,
    nonce,
    method,
    pathWithQuery,
    rawBody,
  });
  const signature = signHmacSha256Hex(secret, payload);
  const headers = {
    "X-Orderz-Partner-Key": apiKey,
    "X-Orderz-Timestamp": timestamp,
    "X-Orderz-Nonce": nonce,
    "X-Orderz-Signature": signature,
  };
  if (bodyObj != null) {
    headers["Content-Type"] = "application/json";
    headers["X-Idempotency-Key"] = process.env.FAZAT_PILOT_IDEMPOTENCY_KEY || "fazat-pilot-order-v1";
  }
  const resp = await fetch(`${base}${pathWithQuery}`, {
    method,
    headers,
    body: bodyObj == null ? undefined : rawBody,
  });
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: resp.status, json };
}

(async () => {
  const results = {};

  // Invalid signature
  const badTs = String(Math.floor(Date.now() / 1000));
  const bad = await fetch(`${base}/api/integrations/fazat/freelancers`, {
    headers: {
      "X-Orderz-Partner-Key": apiKey,
      "X-Orderz-Timestamp": badTs,
      "X-Orderz-Nonce": `bad_${Date.now()}`,
      "X-Orderz-Signature": "00",
    },
  });
  results.invalidSignatureStatus = bad.status;

  results.listFreelancers = await signedFetch("GET", "/api/integrations/fazat/freelancers");

  // UNAPPROVED must fail
  results.createUnapproved = await signedFetch("POST", "/api/integrations/fazat/orders", {
    externalAssignmentId: `fazat-pilot-unapproved-${Date.now()}`,
    externalOrderId: "fazat-pilot-ext-unapproved",
    title: "Pilot should fail UNAPPROVED",
    sanitizedBrief: "يجب أن يفشل لأن الرتبة غير موافقة.",
    selectedFreelancerId: 3707,
    categoryId: 1,
    durationValue: 2,
    durationUnit: "days",
    budget: 1,
  });

  // Non-allowlisted must fail (use random high id unlikely allowlisted)
  results.createNotAllowlisted = await signedFetch("POST", "/api/integrations/fazat/orders", {
    externalAssignmentId: `fazat-pilot-notlist-${Date.now()}`,
    title: "Pilot should fail allowlist",
    sanitizedBrief: "يجب أن يفشل خارج القائمة.",
    selectedFreelancerId: 1,
    categoryId: 1,
    durationValue: 2,
    durationUnit: "days",
    budget: 1,
  });

  const orderBody = {
    externalAssignmentId: "fazat-pilot-asg-001",
    externalOrderId: "fazat-pilot-ord-001",
    title: "مهمة تجريبية مُدارة من Orderz",
    sanitizedBrief: "موجز آمن لمهمة مُدارة — بدون ذكر هوية العميل الأصلية أو روابط خارجية.",
    selectedFreelancerId: 2404,
    categoryId: 1,
    durationValue: 3,
    durationUnit: "days",
    budget: 1,
    preferredSkills: ["تجريبي"],
    priority: "normal",
    internalAdminNotes: "controlled live pilot — do not expand",
  };
  results.createApproved = await signedFetch("POST", "/api/integrations/fazat/orders", orderBody);
  results.createApprovedReplay = await signedFetch("POST", "/api/integrations/fazat/orders", orderBody);

  const orderzOrderId =
    results.createApproved?.json?.data?.orderzOrderId ||
    results.createApprovedReplay?.json?.data?.orderzOrderId ||
    null;

  if (orderzOrderId) {
    results.getOrder = await signedFetch("GET", `/api/integrations/fazat/orders/${orderzOrderId}`);
    results.postMessage = await signedFetch("POST", `/api/integrations/fazat/orders/${orderzOrderId}/messages`, {
      message: "رسالة تجريبية من الإدارة عبر البروكسي.",
      externalMessageId: "fazat-pilot-msg-1",
    });
    results.getMessages = await signedFetch("GET", `/api/integrations/fazat/orders/${orderzOrderId}/messages`);
    results.getDeliveries = await signedFetch("GET", `/api/integrations/fazat/orders/${orderzOrderId}/deliveries`);

    const raw = await ordersService.getOrderById(orderzOrderId);
    const enriched = await attachPartnerMetaToOrder(raw);
    const safe = sanitizeOrderForFreelancerAssigned(enriched);
    const blob = JSON.stringify(safe).toLowerCase();
    results.freelancerVisibility = {
      clientDisplayName: safe.clientDisplayName || null,
      managedByOrderz: safe.managedByOrderz === true,
      hidesFazat: !blob.includes("fazat") && !blob.includes("faz3at"),
      hidesExternalIds: !Object.prototype.hasOwnProperty.call(safe, "externalAssignmentId"),
    };
  }

  const { rows: counts } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM partner_orders WHERE partner_code='FAZAT') AS partner_orders,
       (SELECT COUNT(*)::int FROM partner_freelancer_profiles WHERE partner_code='FAZAT') AS profiles,
       (SELECT COUNT(*)::int FROM partner_order_messages) AS messages`,
  );

  console.log(
    JSON.stringify(
      {
        base,
        counts: counts[0],
        results: {
          invalidSignatureStatus: results.invalidSignatureStatus,
          listStatus: results.listFreelancers.status,
          listCount: results.listFreelancers.json?.count,
          createUnapprovedStatus: results.createUnapproved.status,
          createUnapprovedCode: results.createUnapproved.json?.code || results.createUnapproved.json?.message,
          createNotAllowlistedStatus: results.createNotAllowlisted.status,
          createApprovedStatus: results.createApproved.status,
          createApprovedReplayStatus: results.createApprovedReplay.status,
          createApprovedIdempotent: Boolean(results.createApprovedReplay.json?.idempotentReplay),
          orderzOrderId,
          getOrderStatus: results.getOrder?.status,
          postMessageStatus: results.postMessage?.status,
          getMessagesCount: results.getMessages?.json?.count,
          getDeliveriesStatus: results.getDeliveries?.status,
          freelancerVisibility: results.freelancerVisibility || null,
        },
      },
      null,
      2,
    ),
  );
  await pool.end();
})().catch(async (err) => {
  console.error("[fazatPilotLiveSmoke] FAIL", err && err.stack ? err.stack : err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
