/**
 * Phase 5J-3 — prepare Reject + Accept bidding orders with pending bids.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const BASE = "http://127.0.0.1:5000/api";
const OUT = path.join(__dirname, "phase5j3_manual_prep.json");
const CLIENT = { email: "qa.client@orderzhouse.test", password: "Test123456!" };
const FREELANCER = { email: "qa.freelancer@orderzhouse.test", password: "Test123456!" };
const stamp = Date.now();

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
  const d = res.json?.data || {};
  const token = d.accessToken || d.token || d.tokens?.accessToken;
  return { token, status: res.status };
}

async function createBidding(token, title) {
  const cats = await request("GET", "/categories", { token });
  const list = cats.json?.data || [];
  const categoryId = String((Array.isArray(list) ? list[0] : null)?.id || "1");
  const created = await request("POST", "/client/orders", {
    token,
    body: {
      projectType: "bidding",
      categoryId,
      title,
      description: "QA Phase 5J-3 manual verification bidding order with pending bid.",
      durationValue: 5,
      durationUnit: "days",
      bidBudgetMin: 50,
      bidBudgetMax: 100,
    },
  });
  const order = created.json?.data?.order || created.json?.data;
  return {
    ok: created.status < 300 && !!order?.id,
    orderId: String(order?.id || ""),
    orderStatus: order?.orderStatus,
    title,
    status: created.status,
  };
}

async function main() {
  const health = await request("GET", "/health");
  if (!health.json?.success) {
    console.error("HEALTH FAIL", health.json);
    process.exit(1);
  }
  console.log("HEALTH OK");

  const client = await login(CLIENT);
  const fl = await login(FREELANCER);
  if (!client.token || !fl.token) {
    console.error("LOGIN FAIL", { c: client.status, f: fl.status });
    process.exit(1);
  }

  const rejectOrder = await createBidding(client.token, `QA5J3-REJECT-${stamp}`);
  const acceptOrder = await createBidding(client.token, `QA5J3-ACCEPT-${stamp}`);
  console.log("CREATED", rejectOrder, acceptOrder);

  const rejectBidRes = await request("POST", `/orders/pool/${rejectOrder.orderId}/bids`, {
    token: fl.token,
    body: { amount: 60, message: "QA5J3 reject bid — please reject this offer" },
  });
  const acceptBidRes = await request("POST", `/orders/pool/${acceptOrder.orderId}/bids`, {
    token: fl.token,
    body: { amount: 75, message: "QA5J3 accept bid — please accept this offer" },
  });

  const rejectList = await request("GET", `/client/orders/${rejectOrder.orderId}/bids`, {
    token: client.token,
  });
  const acceptList = await request("GET", `/client/orders/${acceptOrder.orderId}/bids`, {
    token: client.token,
  });

  const rejectBid = (rejectList.json?.data?.bids || [])[0];
  const acceptBid = (acceptList.json?.data?.bids || [])[0];

  const report = {
    stamp,
    health: health.json,
    reject: {
      orderId: rejectOrder.orderId,
      title: rejectOrder.title,
      orderStatus: rejectOrder.orderStatus,
      bidId: rejectBid ? String(rejectBid.id) : null,
      amount: rejectBid?.amount,
      message: rejectBid?.message,
      status: rejectBid?.status,
      displayName: rejectBid?.displayName,
      bidCreateStatus: rejectBidRes.status,
    },
    accept: {
      orderId: acceptOrder.orderId,
      title: acceptOrder.title,
      orderStatus: acceptOrder.orderStatus,
      bidId: acceptBid ? String(acceptBid.id) : null,
      amount: acceptBid?.amount,
      message: acceptBid?.message,
      status: acceptBid?.status,
      displayName: acceptBid?.displayName,
      bidCreateStatus: acceptBidRes.status,
    },
    login: {
      client: CLIENT.email,
      freelancer: FREELANCER.email,
      password: "Test123456!",
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("\n=== Phase 5J-3 Manual Prep ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("\nSaved:", OUT);

  if (!report.reject.bidId || !report.accept.bidId) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
