/**
 * Phase 5J-3 API+backend watcher (no adb required).
 * Polls bid/order state and tails backend terminal for reject/accept routes.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const BASE = "http://127.0.0.1:5000/api";
const OUT = path.join(__dirname, "phase5j3_live_monitor.json");
const BACKEND_TERMINAL = path.join(
  process.env.USERPROFILE || "",
  ".cursor/projects/c-Users-acer-OneDrive-Desktop-Orderz-House/terminals/3.txt"
);
const CLIENT = { email: "qa.client@orderzhouse.test", password: "Test123456!" };
const REJECT = { orderId: "30113", bidId: "75" };
const ACCEPT = { orderId: "30114", bidId: "76" };

const events = [];
function note(type, detail = {}) {
  const row = { at: new Date().toISOString(), type, ...detail };
  events.push(row);
  console.log(`[${type}]`, JSON.stringify(detail).slice(0, 550));
  fs.writeFileSync(
    OUT,
    JSON.stringify({ REJECT, ACCEPT, events, latestType: type, latest: detail }, null, 2)
  );
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
  const rOrder = rOrd.json?.data?.order || {};
  const aOrder = aOrd.json?.data?.order || {};
  const rList = rBids.json?.data?.bids || [];
  const aList = aBids.json?.data?.bids || [];
  const rUsers = rOrder.bidUsers || [];
  const aUsers = aOrder.bidUsers || [];
  return {
    reject: {
      orderStatus: rOrder.orderStatus,
      paymentStatus: rOrder.paymentStatus,
      assigned: !!rOrder.hasAssignedFreelancer,
      openListHas75: rList.some((b) => String(b.id) === "75"),
      openStatus75: rList.find((b) => String(b.id) === "75")?.status || null,
      userStatus75: rUsers.find((b) => String(b.bidId) === "75")?.status || null,
      openCount: rList.length,
      hasOpenPool: rBids.json?.data?.orderSummary?.hasOpenPool,
    },
    accept: {
      orderStatus: aOrder.orderStatus,
      paymentStatus: aOrder.paymentStatus,
      assigned: !!aOrder.hasAssignedFreelancer,
      openListHas76: aList.some((b) => String(b.id) === "76"),
      openStatus76: aList.find((b) => String(b.id) === "76")?.status || null,
      userStatus76: aUsers.find((b) => String(b.bidId) === "76")?.status || null,
      openCount: aList.length,
      hasOpenPool: aBids.json?.data?.orderSummary?.hasOpenPool,
    },
  };
}

function watchBackendTerminal() {
  let offset = 0;
  try {
    offset = fs.statSync(BACKEND_TERMINAL).size;
  } catch (_) {}
  const seen = new Set();
  return setInterval(() => {
    try {
      const st = fs.statSync(BACKEND_TERMINAL);
      if (st.size < offset) offset = 0;
      if (st.size === offset) return;
      const fd = fs.openSync(BACKEND_TERMINAL, "r");
      const len = st.size - offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      fs.closeSync(fd);
      offset = st.size;
      const text = buf.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!/bids\/(reject|accept)|30113|30114/.test(line)) continue;
        const key = line.slice(0, 240);
        if (seen.has(key)) continue;
        seen.add(key);
        note("BACKEND_LOG", { line: key });
      }
    } catch (e) {
      // ignore missing file briefly
    }
  }, 1000);
}

async function main() {
  const token = await login();
  if (!token) {
    console.error("login failed");
    process.exit(1);
  }

  note("READY", {
    msg: "Monitoring API + backend logs. Start emulator and click Reject then Accept.",
    reject: REJECT,
    accept: ACCEPT,
  });

  const baseline = await readState(token);
  note("BASELINE", baseline);
  let prev = JSON.stringify(baseline);
  const backendTimer = watchBackendTerminal();

  const endAt = Date.now() + 15 * 60 * 1000;
  while (Date.now() < endAt) {
    try {
      const state = await readState(token);
      const key = JSON.stringify(state);
      if (key !== prev) {
        note("STATE_CHANGE", state);
        prev = key;

        const rejectDone =
          state.reject.userStatus75 === "rejected" ||
          (!state.reject.openListHas75 && state.reject.openStatus75 !== "pending");
        const acceptDone =
          ["selected_pending_payment", "accepted", "selected"].includes(state.accept.userStatus76) ||
          state.accept.openStatus76 === "selected_pending_payment" ||
          state.accept.orderStatus !== "open_for_bids";

        if (rejectDone) note("REJECT_DONE", state.reject);
        if (acceptDone) note("ACCEPT_DONE", state.accept);
        if (rejectDone && acceptDone) {
          note("BOTH_DONE", {});
          break;
        }
      }
    } catch (e) {
      note("POLL_ERROR", { message: e.message });
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  clearInterval(backendTimer);
  note("FINAL", await readState(token));
  console.log("Monitor finished ->", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
