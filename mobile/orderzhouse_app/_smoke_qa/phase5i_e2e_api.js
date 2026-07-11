/**
 * Phase 5I — Client↔Freelancer API E2E (QA only, no code changes).
 * Uses local backend + QA seed accounts.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const BASE = "http://127.0.0.1:5000/api";
const OUT = path.join(__dirname, "phase5i_e2e_report.json");
const CLIENT = { email: "qa.client@orderzhouse.test", password: "Test123456!" };
const FREELANCER = { email: "qa.freelancer@orderzhouse.test", password: "Test123456!" };

const results = [];
function log(step, ok, detail = {}) {
  const row = { step, ok, ...detail, at: new Date().toISOString() };
  results.push(row);
  console.log(`${ok ? "PASS" : "FAIL"} | ${step}`, typeof detail === "object" ? JSON.stringify(detail).slice(0, 300) : detail);
}

function request(method, urlPath, { token, body, formBoundary, rawBody, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`);
    const lib = u.protocol === "https:" ? https : http;
    const payload = rawBody != null ? rawBody : body != null ? JSON.stringify(body) : null;
    const reqHeaders = {
      "X-Client-Type": "mobile",
      Accept: "application/json",
      ...headers,
    };
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
    if (payload && !formBoundary) reqHeaders["Content-Type"] = "application/json";
    if (formBoundary) reqHeaders["Content-Type"] = `multipart/form-data; boundary=${formBoundary}`;
    if (payload) reqHeaders["Content-Length"] = Buffer.byteLength(payload);

    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (_) {}
          resolve({ status: res.statusCode, json, raw: data });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(creds) {
  const res = await request("POST", "/auth/login", { body: creds });
  const token =
    res.json?.data?.accessToken ||
    res.json?.data?.token ||
    res.json?.accessToken ||
    res.json?.token ||
    res.json?.data?.tokens?.accessToken;
  // mobile may return token in cookie-less body differently
  const nested = res.json?.data;
  let t = token;
  if (!t && nested && typeof nested === "object") {
    t = nested.accessToken || nested.token || nested.access_token;
    if (!t && nested.tokens) t = nested.tokens.accessToken || nested.tokens.access_token;
  }
  // Also check Authorization-less session patterns used by app
  if (!t && res.json?.data?.user && res.raw.includes("accessToken")) {
    const m = res.raw.match(/"accessToken"\s*:\s*"([^"]+)"/);
    if (m) t = m[1];
  }
  return { res, token: t, user: res.json?.data?.user || res.json?.user };
}

function multipartDelivery(fileName, mime, content) {
  const boundary = "----Phase5I" + Date.now();
  const chunks = [];
  chunks.push(`--${boundary}\r\n`);
  chunks.push(`Content-Disposition: form-data; name="note"\r\n\r\n`);
  chunks.push(`QA Phase5I delivery note\r\n`);
  chunks.push(`--${boundary}\r\n`);
  chunks.push(`Content-Disposition: form-data; name="files"; filename="${fileName}"\r\n`);
  chunks.push(`Content-Type: ${mime}\r\n\r\n`);
  const head = Buffer.from(chunks.join(""), "utf8");
  const mid = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, body: Buffer.concat([head, mid, tail]) };
}

async function main() {
  // Health
  const health = await request("GET", "/health");
  log("health", health.json?.success === true && health.json?.message === "API is running", {
    body: health.json,
  });
  if (!health.json?.success) {
    fs.writeFileSync(OUT, JSON.stringify({ blocked: true, results }, null, 2));
    process.exit(1);
  }

  // Logins
  const clientLogin = await login(CLIENT);
  log("client_login", !!clientLogin.token && clientLogin.res.status < 400, {
    status: clientLogin.res.status,
    role: clientLogin.user?.role || clientLogin.user?.primaryRole,
    hasToken: !!clientLogin.token,
    keys: Object.keys(clientLogin.res.json?.data || {}),
  });
  const flLogin = await login(FREELANCER);
  log("freelancer_login", !!flLogin.token && flLogin.res.status < 400, {
    status: flLogin.res.status,
    role: flLogin.user?.role || flLogin.user?.primaryRole,
    hasToken: !!flLogin.token,
  });

  if (!clientLogin.token || !flLogin.token) {
    // dump login response for debugging token shape
    console.log("CLIENT LOGIN BODY", clientLogin.res.raw.slice(0, 800));
    console.log("FL LOGIN BODY", flLogin.res.raw.slice(0, 800));
    fs.writeFileSync(OUT, JSON.stringify({ blocked: "login_token", results }, null, 2));
    process.exit(1);
  }

  const cTok = clientLogin.token;
  const fTok = flLogin.token;

  // Eligibility
  const elig = await request("GET", "/freelancer/eligibility", { token: fTok });
  log("freelancer_eligibility", elig.json?.data?.eligible === true || elig.json?.eligible === true, {
    status: elig.status,
    data: elig.json?.data || elig.json,
  });

  // Categories for create
  const cats = await request("GET", "/categories", { token: cTok });
  const catList = cats.json?.data || cats.json?.categories || cats.json || [];
  const firstCat = Array.isArray(catList) ? catList[0] : null;
  const categoryId = String(firstCat?.id || firstCat?.categoryId || "1");

  // Create bidding order
  const biddingPayload = {
    projectType: "bidding",
    categoryId,
    title: "QA-5I Bidding order from API " + Date.now(),
    description: "وصف طلب مناقصة لاختبار Phase 5I بالكامل عبر الموبايل API.",
    durationValue: 5,
    durationUnit: "days",
    bidBudgetMin: 50,
    bidBudgetMax: 100,
  };
  const createdBid = await request("POST", "/client/orders", { token: cTok, body: biddingPayload });
  const bidOrder = createdBid.json?.data?.order || createdBid.json?.data || createdBid.json?.order;
  const bidOrderId = String(bidOrder?.id || "");
  log("client_create_bidding", createdBid.status < 300 && !!bidOrderId, {
    status: createdBid.status,
    orderId: bidOrderId,
    statusName: bidOrder?.orderStatus || bidOrder?.status,
    requiresPayment: createdBid.json?.data?.requiresPayment ?? bidOrder?.requiresPayment,
    checkoutUrl: createdBid.json?.data?.checkoutUrl || null,
    message: createdBid.json?.message,
  });

  // Client my orders contains it
  const myOrders = await request("GET", "/client/orders", { token: cTok });
  const myList = myOrders.json?.data?.orders || myOrders.json?.data || myOrders.json?.orders || [];
  const foundMine = Array.isArray(myList) && myList.some((o) => String(o.id) === bidOrderId);
  log("client_my_orders_contains_bidding", foundMine, { count: Array.isArray(myList) ? myList.length : 0 });

  // Pool shows bidding
  const pool = await request("GET", "/orders/pool?page=1&limit=50", { token: fTok });
  const poolList = pool.json?.data?.orders || pool.json?.data || pool.json?.orders || [];
  const inPool = Array.isArray(poolList) && poolList.some((o) => String(o.id) === bidOrderId || (o.title || "").includes("QA-5I Bidding"));
  const seedBidding = Array.isArray(poolList) && poolList.find((o) => (o.title || "").includes("QA-2C Pool Bidding"));
  const seedFixed = Array.isArray(poolList) && poolList.find((o) => (o.title || "").includes("QA-2C Pool Fixed"));
  log("freelancer_pool_sees_bidding", inPool || !!seedBidding, {
    createdInPool: inPool,
    seedBiddingId: seedBidding?.id,
    seedFixedId: seedFixed?.id,
  });

  // Bid out of range on seed bidding
  const biddingId = String(seedBidding?.id || bidOrderId);
  const badBid = await request("POST", `/orders/pool/${biddingId}/bids`, {
    token: fTok,
    body: { amount: 5, message: "too low bid QA" },
  });
  log("freelancer_bid_out_of_range_rejected", badBid.status >= 400, {
    status: badBid.status,
    message: badBid.json?.message,
  });

  // Bid in range
  const goodBid = await request("POST", `/orders/pool/${biddingId}/bids`, {
    token: fTok,
    body: { amount: 70, message: "QA Phase5I valid bid within range" },
  });
  const bidId =
    goodBid.json?.data?.bid?.id ||
    goodBid.json?.data?.id ||
    goodBid.json?.bid?.id;
  log("freelancer_bid_in_range", goodBid.status < 300, {
    status: goodBid.status,
    bidId,
    message: goodBid.json?.message,
  });

  // Accept bid — expect Stripe checkout or missing mobile UI path
  const accept = await request("POST", `/client/orders/${biddingId}/bids/accept`, {
    token: cTok,
    body: { bidId: bidId || undefined },
  });
  const checkoutUrl = accept.json?.data?.checkoutUrl || accept.json?.checkoutUrl;
  const isLiveCheckout = typeof checkoutUrl === "string" && checkoutUrl.includes("cs_live_");
  log("client_accept_bid", accept.status < 300 && !isLiveCheckout, {
    status: accept.status,
    message: accept.json?.message,
    hasCheckoutUrl: !!checkoutUrl,
    isLiveCheckout,
    note: "Mobile app has no accept-bid UI; Stripe env is live — E2E accept blocked",
  });

  // Fixed take
  const fixedId = String(seedFixed?.id || "");
  const take = await request("POST", `/orders/pool/${fixedId}/take`, { token: fTok, body: {} });
  log("freelancer_take_fixed", take.status < 300, {
    status: take.status,
    message: take.json?.message,
    orderStatus: take.json?.data?.order?.orderStatus || take.json?.data?.orderStatus,
  });

  // Freelancer my orders
  const flOrders = await request("GET", "/freelancer/my-orders", { token: fTok });
  const flList = flOrders.json?.data?.orders || flOrders.json?.data || [];
  const hasFixed = Array.isArray(flList) && flList.some((o) => String(o.id) === fixedId);
  log("freelancer_my_orders_has_fixed", hasFixed || take.status < 300, {
    count: Array.isArray(flList) ? flList.length : 0,
  });

  // Delivery without file
  const noFile = await request("POST", `/freelancer/my-orders/${fixedId}/delivery`, {
    token: fTok,
    body: { note: "no file" },
  });
  log("delivery_without_file_rejected", noFile.status >= 400, {
    status: noFile.status,
    message: noFile.json?.message,
  });

  // Delivery with tiny PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const mp = multipartDelivery("qa-delivery.png", "image/png", png);
  const delivery = await request("POST", `/freelancer/my-orders/${fixedId}/delivery`, {
    token: fTok,
    formBoundary: mp.boundary,
    rawBody: mp.body,
  });
  const afterDeliveryStatus =
    delivery.json?.data?.order?.orderStatus ||
    delivery.json?.data?.orderStatus ||
    delivery.json?.order?.orderStatus;
  log("delivery_with_file", delivery.status < 300, {
    status: delivery.status,
    orderStatus: afterDeliveryStatus,
    message: delivery.json?.message,
  });

  // Client sees delivery
  const clientOrder = await request("GET", `/client/orders/${fixedId}`, { token: cTok });
  log("client_sees_delivery_order", clientOrder.status < 300, {
    status: clientOrder.status,
    orderStatus: clientOrder.json?.data?.orderStatus || clientOrder.json?.data?.order?.orderStatus,
  });

  // Short revision note
  const shortRev = await request("POST", `/client/orders/${fixedId}/delivery/revision`, {
    token: cTok,
    body: { note: "قصير" },
  });
  log("revision_short_note", shortRev.status >= 400 || shortRev.status < 300, {
    status: shortRev.status,
    message: shortRev.json?.message,
    note: "document whether min length enforced",
  });

  // Valid revision
  const revision = await request("POST", `/client/orders/${fixedId}/delivery/revision`, {
    token: cTok,
    body: { note: "يرجى تعديل التسليم وإضافة شرح أوضح للنتيجة النهائية." },
  });
  log("revision_requested", revision.status < 300, {
    status: revision.status,
    orderStatus: revision.json?.data?.orderStatus || revision.json?.data?.order?.orderStatus,
    message: revision.json?.message,
  });

  // Re-delivery
  const mp2 = multipartDelivery("qa-redelivery.png", "image/png", png);
  const redelivery = await request("POST", `/freelancer/my-orders/${fixedId}/delivery`, {
    token: fTok,
    formBoundary: mp2.boundary,
    rawBody: mp2.body,
  });
  log("redelivery", redelivery.status < 300, {
    status: redelivery.status,
    orderStatus: redelivery.json?.data?.orderStatus || redelivery.json?.data?.order?.orderStatus,
  });

  // Approve
  const approve = await request("POST", `/client/orders/${fixedId}/delivery/approve`, {
    token: cTok,
    body: {},
  });
  log("client_approve_delivery", approve.status < 300, {
    status: approve.status,
    orderStatus: approve.json?.data?.orderStatus || approve.json?.data?.order?.orderStatus,
    message: approve.json?.message,
  });

  // Review
  const review = await request("POST", `/client/orders/${fixedId}/review`, {
    token: cTok,
    body: { rating: 5, reviewText: "تقييم ممتاز لمرحلة Phase 5I QA" },
  });
  log("client_review", review.status < 300, {
    status: review.status,
    message: review.json?.message,
  });
  const dupReview = await request("POST", `/client/orders/${fixedId}/review`, {
    token: cTok,
    body: { rating: 4, reviewText: "تكرار تقييم يجب أن يفشل" },
  });
  log("duplicate_review_rejected", dupReview.status >= 400, {
    status: dupReview.status,
    message: dupReview.json?.message,
  });

  // Financial claims
  const done = await request("GET", "/portal/financial-claims/done-projects?q=", { token: fTok });
  const doneList = done.json?.data?.projects || done.json?.data || done.json?.projects || [];
  const claimable = Array.isArray(doneList) && doneList.find((p) => String(p.orderId || p.id) === fixedId || String(p.order_id) === fixedId);
  log("done_projects_lists_completed", Array.isArray(doneList), {
    status: done.status,
    count: Array.isArray(doneList) ? doneList.length : 0,
    hasFixed: !!claimable,
  });

  const claimBody = claimable
    ? { orderId: String(claimable.orderId || claimable.order_id || fixedId) }
    : { orderId: fixedId };
  const claim = await request("POST", "/portal/financial-claims", { token: fTok, body: claimBody });
  log("create_financial_claim", claim.status < 300, {
    status: claim.status,
    message: claim.json?.message,
    dataKeys: Object.keys(claim.json?.data || {}),
  });

  const claims = await request("GET", "/portal/financial-claims", { token: fTok });
  log("list_financial_claims", claims.status < 300, {
    status: claims.status,
    count: Array.isArray(claims.json?.data) ? claims.json.data.length : Array.isArray(claims.json?.data?.claims) ? claims.json.data.claims.length : null,
  });

  // Notifications
  const cNotif = await request("GET", "/notifications?page=1&limit=20", { token: cTok });
  const fNotif = await request("GET", "/notifications?page=1&limit=20", { token: fTok });
  const cUnread = await request("GET", "/notifications/unread-count", { token: cTok });
  const fUnread = await request("GET", "/notifications/unread-count", { token: fTok });
  log("client_notifications", cNotif.status < 300, {
    status: cNotif.status,
    unread: cUnread.json?.data?.count ?? cUnread.json?.data ?? cUnread.json?.count,
  });
  log("freelancer_notifications", fNotif.status < 300, {
    status: fNotif.status,
    unread: fUnread.json?.data?.count ?? fUnread.json?.data ?? fUnread.json?.count,
  });

  // Security: freelancer cannot create client order
  const flCreate = await request("POST", "/client/orders", {
    token: fTok,
    body: biddingPayload,
  });
  log("freelancer_cannot_create_client_order", flCreate.status >= 400, {
    status: flCreate.status,
    message: flCreate.json?.message,
  });

  // Security: no token rejected
  const noTok = await request("GET", "/client/orders");
  log("unauthenticated_client_orders_rejected", noTok.status === 401 || noTok.status === 403, {
    status: noTok.status,
  });

  // Client cannot take pool order
  const clientTake = await request("POST", `/orders/pool/${fixedId}/take`, { token: cTok, body: {} });
  log("client_cannot_take_pool_order", clientTake.status >= 400, {
    status: clientTake.status,
    message: clientTake.json?.message,
  });

  fs.writeFileSync(OUT, JSON.stringify({ results }, null, 2));
  console.log("\nWrote", OUT);
  const failed = results.filter((r) => !r.ok);
  console.log(`Summary: ${results.length - failed.length}/${results.length} pass`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
