/**
 * Phase 5J-1 — short bidding accept/reject API QA (no Stripe live open).
 * Bid create response returns order; bid id is read from list endpoint.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const BASE = "http://127.0.0.1:5000/api";
const OUT = path.join(__dirname, "phase5j1_qa_report.json");
const CLIENT = { email: "qa.client@orderzhouse.test", password: "Test123456!" };
const FREELANCER = { email: "qa.freelancer@orderzhouse.test", password: "Test123456!" };

const results = [];
function log(step, ok, detail = {}) {
  const row = { step, ok, ...detail, at: new Date().toISOString() };
  results.push(row);
  console.log(`${ok ? "PASS" : "FAIL"} | ${step}`, JSON.stringify(detail).slice(0, 450));
}

function request(method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${BASE}${urlPath}`);
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = { "X-Client-Type": "mobile", Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
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
  const data = res.json?.data || {};
  const token = data.accessToken || data.token || data.tokens?.accessToken || res.json?.accessToken;
  return { res, token, user: data.user || res.json?.user };
}

async function main() {
  const health = await request("GET", "/health");
  log("health", health.json?.success === true, {});

  const clientLogin = await login(CLIENT);
  const flLogin = await login(FREELANCER);
  log("client_login", !!clientLogin.token, { status: clientLogin.res.status });
  log("freelancer_login", !!flLogin.token, { status: flLogin.res.status });
  if (!clientLogin.token || !flLogin.token) {
    fs.writeFileSync(OUT, JSON.stringify({ blocked: "login", results }, null, 2));
    process.exit(1);
  }

  const cTok = clientLogin.token;
  const fTok = flLogin.token;
  const cats = await request("GET", "/categories", { token: cTok });
  const catList = cats.json?.data || [];
  const categoryId = String((Array.isArray(catList) ? catList[0] : null)?.id || "1");

  const created = await request("POST", "/client/orders", {
    token: cTok,
    body: {
      projectType: "bidding",
      categoryId,
      title: "QA-5J1 Bidding accept " + Date.now(),
      description: "طلب مناقصة لاختبار قبول العرض من الموبايل Phase 5J-1.",
      durationValue: 5,
      durationUnit: "days",
      bidBudgetMin: 50,
      bidBudgetMax: 100,
    },
  });
  const order = created.json?.data?.order || created.json?.data;
  const orderId = String(order?.id || "");
  log("client_create_bidding", created.status < 300 && !!orderId, {
    status: created.status,
    orderId,
    orderStatus: order?.orderStatus,
  });

  const bidRes = await request("POST", `/orders/pool/${orderId}/bids`, {
    token: fTok,
    body: { amount: 70, message: "عرض QA Phase 5J-1" },
  });
  log("freelancer_bid", bidRes.status < 300, {
    status: bidRes.status,
    bidsCount: bidRes.json?.data?.order?.bidsCount,
  });

  const list = await request("GET", `/client/orders/${orderId}/bids`, { token: cTok });
  const bids = list.json?.data?.bids || [];
  const bidId = String(bids[0]?.id || "");
  log("client_sees_bid", list.status === 200 && bids.length > 0 && !!bidId, {
    status: list.status,
    count: bids.length,
    bidId,
    amount: bids[0]?.amount,
    displayName: bids[0]?.displayName,
    hasOpenPool: list.json?.data?.orderSummary?.hasOpenPool,
  });

  const created2 = await request("POST", "/client/orders", {
    token: cTok,
    body: {
      projectType: "bidding",
      categoryId,
      title: "QA-5J1 Bidding reject " + Date.now(),
      description: "طلب مناقصة لاختبار رفض العرض Phase 5J-1.",
      durationValue: 4,
      durationUnit: "days",
      bidBudgetMin: 50,
      bidBudgetMax: 100,
    },
  });
  const orderId2 = String(created2.json?.data?.order?.id || "");
  await request("POST", `/orders/pool/${orderId2}/bids`, {
    token: fTok,
    body: { amount: 65, message: "عرض للرفض" },
  });
  const list2 = await request("GET", `/client/orders/${orderId2}/bids`, { token: cTok });
  const bidId2 = String(list2.json?.data?.bids?.[0]?.id || "");
  const reject = await request("POST", `/client/orders/${orderId2}/bids/reject`, {
    token: cTok,
    body: { bidId: bidId2 },
  });
  log("client_reject_bid", reject.status < 300 && !!bidId2, {
    status: reject.status,
    orderId: orderId2,
    bidId: bidId2,
  });

  const accept = await request("POST", `/client/orders/${orderId}/bids/accept`, {
    token: cTok,
    body: { bidId },
  });
  const checkoutUrl = accept.json?.data?.checkoutUrl || "";
  const isLive = checkoutUrl.includes("cs_live_");
  const isTest = checkoutUrl.includes("cs_test_");
  log("client_accept_bid", accept.status < 300 && !!checkoutUrl, {
    status: accept.status,
    requiresPayment: accept.json?.data?.requiresPayment,
    isLive,
    isTest,
    checkoutPrefix: checkoutUrl.slice(0, 56),
  });
  log("flutter_live_guard_would_block_cs_live", isLive, {
    note: isLive
      ? "launchStripeCheckoutUrl blocks in debug/profile"
      : "test checkout would be allowed to open",
  });

  fs.writeFileSync(OUT, JSON.stringify({ results }, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log("\n=== Phase 5J-1 QA summary ===");
  console.log(`passed=${results.length - failed.length} failed=${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
