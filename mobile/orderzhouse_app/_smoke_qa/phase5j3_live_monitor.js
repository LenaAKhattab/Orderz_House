/**
 * Phase 5J-3 re-monitor — watch reject/accept while user clicks.
 * Polls API every 2s + captures flutter logcat keywords.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");
const { spawn } = require("child_process");

const BASE = "http://127.0.0.1:5000/api";
const OUT = path.join(__dirname, "phase5j3_live_monitor.json");
const LOG = path.join(__dirname, "phase5j3_live_logcat.txt");
const ADB = path.join(process.env.LOCALAPPDATA || "", "Android/Sdk/platform-tools/adb.exe");
const CLIENT = { email: "qa.client@orderzhouse.test", password: "Test123456!" };

const REJECT = { orderId: "30113", bidId: "75" };
const ACCEPT = { orderId: "30114", bidId: "76" };

const events = [];
function note(type, detail) {
  const row = { at: new Date().toISOString(), type, ...detail };
  events.push(row);
  console.log(`[${type}]`, JSON.stringify(detail).slice(0, 500));
  fs.writeFileSync(OUT, JSON.stringify({ events, latest: detail, REJECT, ACCEPT }, null, 2));
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

async function login() {
  const res = await request("POST", "/auth/login", { body: CLIENT });
  const d = res.json?.data || {};
  return d.accessToken || d.token || d.tokens?.accessToken;
}

async function readState(token) {
  const [rBids, aBids, rOrd, aOrd] = await Promise.all([
    request("GET", `/client/orders/${REJECT.orderId}/bids`, { token }),
    request("GET", `/client/orders/${ACCEPT.orderId}/bids`, { token }),
    request("GET", `/client/orders/${REJECT.orderId}`, { token }),
    request("GET", `/client/orders/${ACCEPT.orderId}`, { token }),
  ]);
  const rOrder = rOrd.json?.data?.order || rOrd.json?.data || {};
  const aOrder = aOrd.json?.data?.order || aOrd.json?.data || {};
  const rList = rBids.json?.data?.bids || [];
  const aList = aBids.json?.data?.bids || [];
  const rBid = rList.find((b) => String(b.id) === REJECT.bidId);
  const aBid = aList.find((b) => String(b.id) === ACCEPT.bidId);
  // bidUsers may still show rejected status on detail
  const rUsers = rOrder.bidUsers || [];
  const aUsers = aOrder.bidUsers || [];
  const rUserBid = rUsers.find((b) => String(b.bidId || b.id) === REJECT.bidId);
  const aUserBid = aUsers.find((b) => String(b.bidId || b.id) === ACCEPT.bidId);

  return {
    reject: {
      orderStatus: rOrder.orderStatus,
      paymentStatus: rOrder.paymentStatus,
      assigned: !!rOrder.hasAssignedFreelancer || !!rOrder.assignedFreelancerId,
      bidInOpenList: !!rBid,
      bidOpenStatus: rBid?.status || null,
      bidUserStatus: rUserBid?.status || null,
      hasOpenPool: rBids.json?.data?.orderSummary?.hasOpenPool,
      openBidsCount: rList.length,
    },
    accept: {
      orderStatus: aOrder.orderStatus,
      paymentStatus: aOrder.paymentStatus,
      assigned: !!aOrder.hasAssignedFreelancer || !!aOrder.assignedFreelancerId,
      bidInOpenList: !!aBid,
      bidOpenStatus: aBid?.status || null,
      bidUserStatus: aUserBid?.status || null,
      hasOpenPool: aBids.json?.data?.orderSummary?.hasOpenPool,
      openBidsCount: aList.length,
    },
  };
}

function startLogcat() {
  const out = fs.createWriteStream(LOG, { flags: "w" });
  const child = spawn(
    ADB,
    [
      "logcat",
      "-v",
      "time",
      "flutter:V",
      "AndroidRuntime:E",
      "*:S",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  let buf = "";
  const onChunk = (chunk) => {
    const text = chunk.toString();
    out.write(text);
    buf += text;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || "";
    for (const line of lines) {
      if (
        /رفض|قبول|Live|Stripe|checkout|cs_live_|bids\/reject|bids\/accept|SnackBar|Exception|Error|Dio|401|403|500|blocked|لا يجب/i.test(
          line
        )
      ) {
        note("LOGCAT", { line: line.slice(0, 400) });
      }
    }
  };
  child.stdout.on("data", onChunk);
  child.stderr.on("data", onChunk);
  note("MONITOR", { msg: "logcat started", file: LOG });
  return child;
}

async function main() {
  const token = await login();
  if (!token) {
    console.error("login failed");
    process.exit(1);
  }
  const logcat = startLogcat();
  let prev = null;
  const start = Date.now();
  const durationMs = 12 * 60 * 1000; // 12 minutes

  note("MONITOR", {
    msg: "READY — user can click Reject then Accept now",
    reject: REJECT,
    accept: ACCEPT,
  });

  const baseline = await readState(token);
  note("BASELINE", baseline);
  prev = JSON.stringify(baseline);

  while (Date.now() - start < durationMs) {
    try {
      const state = await readState(token);
      const key = JSON.stringify(state);
      if (key !== prev) {
        note("STATE_CHANGE", state);
        prev = key;

        const rejectDone =
          state.reject.bidUserStatus === "rejected" ||
          (!state.reject.bidInOpenList && state.reject.bidOpenStatus !== "pending");
        const acceptDone =
          state.accept.bidUserStatus === "selected_pending_payment" ||
          state.accept.bidUserStatus === "accepted" ||
          state.accept.bidUserStatus === "selected" ||
          state.accept.orderStatus !== "open_for_bids" ||
          state.accept.bidOpenStatus === "selected_pending_payment";

        if (rejectDone) note("REJECT_LIKELY_DONE", state.reject);
        if (acceptDone) note("ACCEPT_LIKELY_DONE", state.accept);
        if (rejectDone && acceptDone) {
          note("BOTH_DONE", { msg: "Both reject and accept appear completed" });
          break;
        }
      }
    } catch (e) {
      note("POLL_ERROR", { message: e.message });
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  try {
    logcat.kill();
  } catch (_) {}

  // Final DB-ish API snapshot
  const finalState = await readState(token);
  note("FINAL", finalState);
  console.log("\nMonitor ended. Report file:", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
