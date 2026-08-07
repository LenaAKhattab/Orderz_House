const path = require("node:path");
const backendRoot = path.join(__dirname, "..");
require(path.join(backendRoot, "node_modules", "dotenv")).config({ path: path.join(backendRoot, ".env") });
const authService = require(path.join(backendRoot, "src", "services", "authService"));
const { pool } = require(path.join(backendRoot, "src", "config", "db"));

const BASE = "http://localhost:5000/api";

async function req(method, p, { token, body } = {}) {
  const h = { "X-Client-Type": "mobile" };
  if (token) h.Authorization = `Bearer ${token}`;
  const opts = { method, headers: h };
  if (body !== undefined) {
    h["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(BASE + p, opts);
  return { status: r.status, data: await r.json() };
}

async function main() {
  const f = await authService.buildAuthResponseForUserId(
    (await pool.query("SELECT id FROM users WHERE email='qa.freelancer@orderzhouse.test'")).rows[0].id,
  );
  const elig = await req("GET", "/freelancer/eligibility", { token: f.token });
  console.log("eligibility", elig.data?.data);

  const poolRes = await req("GET", "/orders/pool?page=1&limit=30");
  const orders = poolRes.data?.data?.orders || [];
  const bid = orders.find((o) => String(o.title || "").includes("Pool Bidding"));
  console.log("bidding in pool", bid?.id, bid?.bidBudgetMin, bid?.bidBudgetMax);

  const own = await pool.query(
    "SELECT id, created_by_user_id, bid_budget_min, bid_budget_max, order_status FROM orders WHERE id IN (22131, 22132)",
  );
  console.log("ownership", own.rows);

  if (bid?.id) {
    const good = await req("POST", `/orders/pool/${bid.id}/bids`, {
      token: f.token,
      body: { amount: 70, message: "QA-3A verify" },
    });
    console.log("bid amount 70", good.status, good.data?.message);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
