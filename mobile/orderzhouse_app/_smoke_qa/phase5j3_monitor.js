/**
 * Phase 5J-3 — poll reject/accept order bid state while user tests manually.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");
const { spawn } = require("child_process");

const BASE = "http://127.0.0.1:5000/api";
const PREP = JSON.parse(fs.readFileSync(path.join(__dirname, "phase5j3_manual_prep.json"), "utf8"));
const OUT = path.join(__dirname, "phase5j3_monitor.json");
const ADB = path.join(process.env.LOCALAPPDATA || "", "Android/Sdk/platform-tools/adb.exe");
const CLIENT = PREP.login;

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
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login() {
  const res = await request("POST", "/auth/login", {
    body: { email: CLIENT.client, password: CLIENT.password },
  });
  const d = res.json?.data || {};
  return d.accessToken || d.token || d.tokens?.accessToken;
}

function startLogcat() {
  const logFile = path.join(__dirname, "phase5j3_logcat.txt");
  const out = fs.createWriteStream(logFile);
  const child = spawn(ADB, ["logcat", "-v", "time", "flutter:I", "*:S"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  console.log("logcat ->", logFile);
  return child;
}

async function snapshot(token) {
  const rejectList = await request("GET", `/client/orders/${PREP.reject.orderId}/bids`, { token });
  const acceptList = await request("GET", `/client/orders/${PREP.accept.orderId}/bids`, { token });
  const rejectDetail = await request("GET", `/client/orders/${PREP.reject.orderId}`, { token });
  const acceptDetail = await request("GET", `/client/orders/${PREP.accept.orderId}`, { token });
  return {
    at: new Date().toISOString(),
    reject: {
      orderId: PREP.reject.orderId,
      bidId: PREP.reject.bidId,
      bids: rejectList.json?.data?.bids || [],
      hasOpenPool: rejectList.json?.data?.orderSummary?.hasOpenPool,
      orderStatus: rejectDetail.json?.data?.order?.orderStatus || rejectDetail.json?.data?.orderStatus,
    },
    accept: {
      orderId: PREP.accept.orderId,
      bidId: PREP.accept.bidId,
      bids: acceptList.json?.data?.bids || [],
      hasOpenPool: acceptList.json?.data?.orderSummary?.hasOpenPool,
      orderStatus: acceptDetail.json?.data?.order?.orderStatus || acceptDetail.json?.data?.orderStatus,
      paymentStatus: acceptDetail.json?.data?.order?.paymentStatus,
    },
  };
}

async function main() {
  const token = await login();
  if (!token) {
    console.error("login failed");
    process.exit(1);
  }
  const logcat = startLogcat();
  const history = [];
  let last = null;

  console.log("\n=== Monitoring 5J-3 orders ===");
  console.log("REJECT order", PREP.reject.orderId, "bid", PREP.reject.bidId, PREP.reject.title);
  console.log("ACCEPT order", PREP.accept.orderId, "bid", PREP.accept.bidId, PREP.accept.title);
  console.log("Poll every 8s for ~6 minutes. Ctrl+C to stop early.\n");

  const endAt = Date.now() + 6 * 60 * 1000;
  while (Date.now() < endAt) {
    try {
      const snap = await snapshot(token);
      history.push(snap);
      const rejectGone =
        !snap.reject.bids.some((b) => String(b.id) === String(PREP.reject.bidId)) ||
        snap.reject.bids.every((b) => b.status !== "pending");
      const acceptChanged =
        !snap.accept.bids.some((b) => String(b.id) === String(PREP.accept.bidId) && b.status === "pending") ||
        snap.accept.orderStatus !== "open_for_bids";

      const line = {
        rejectPendingBids: snap.reject.bids.filter((b) => b.status === "pending").length,
        acceptPendingBids: snap.accept.bids.filter((b) => b.status === "pending").length,
        rejectStatus: snap.reject.orderStatus,
        acceptStatus: snap.accept.orderStatus,
        rejectGone,
        acceptChanged,
      };
      const key = JSON.stringify(line);
      if (key !== last) {
        console.log(new Date().toISOString(), line);
        last = key;
      }
      fs.writeFileSync(
        OUT,
        JSON.stringify(
          {
            prep: { reject: PREP.reject, accept: PREP.accept },
            latest: snap,
            inferred: {
              rejectLikelyDone: rejectGone,
              acceptLikelyDone: acceptChanged,
            },
            historyCount: history.length,
          },
          null,
          2
        )
      );
      if (rejectGone && acceptChanged) {
        console.log("\nBoth orders appear updated — manual reject+accept likely done.");
        break;
      }
    } catch (e) {
      console.log("poll error", e.message);
    }
    await new Promise((r) => setTimeout(r, 8000));
  }

  try {
    logcat.kill();
  } catch (_) {}
  console.log("Monitor finished. See", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
