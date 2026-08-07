const http = require("http");

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      "X-Client-Type": "mobile",
      Accept: "application/json",
    };
    if (token) headers.Authorization = "Bearer " + token;
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(data);
    }
    const r = http.request(
      { hostname: "127.0.0.1", port: 5000, path: "/api" + path, method, headers },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(d);
          } catch (_) {}
          resolve({ status: res.statusCode, json, raw: d });
        });
      }
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  let res = await req("POST", "/auth/login", null, {
    email: "qa.freelancer@orderzhouse.test",
    password: "Test123456!",
  });
  const token = res.json.data.accessToken;
  console.log("login", res.status);

  res = await req("GET", "/orders/pool?page=1&limit=20", token);
  const orders = res.json?.data?.orders || res.json?.data?.items || res.json?.data || [];
  console.log("pool status", res.status, "keys", Object.keys(res.json?.data || {}));
  const list = Array.isArray(orders) ? orders : [];
  console.log(
    "titles",
    list.slice(0, 5).map((o) => ({ id: o.id, title: o.title, status: o.orderStatus || o.status }))
  );
  const fixed = list.find((o) => (o.title || "").includes("QA-2C Pool Fixed"));
  console.log("fixed", fixed && { id: fixed.id, status: fixed.orderStatus || fixed.status });

  if (fixed) {
    res = await req("POST", `/orders/pool/${fixed.id}/take`, token, {});
    console.log("take", res.status, res.json?.message || res.json?.success, res.json?.data?.order?.orderStatus);
  }

  res = await req("GET", "/freelancer/my-orders", token);
  const mine = res.json?.data?.orders || res.json?.data || [];
  console.log("my-orders", res.status, Array.isArray(mine) ? mine.length : typeof mine, Object.keys(res.json?.data || {}));

  // client accept bid probe
  res = await req("POST", "/auth/login", null, {
    email: "qa.client@orderzhouse.test",
    password: "Test123456!",
  });
  const cTok = res.json.data.accessToken;
  res = await req("GET", "/client/orders/22132", cTok);
  console.log("client order 22132", res.status, Object.keys(res.json?.data || {}));
  const bids = res.json?.data?.bids || res.json?.data?.order?.bids || res.json?.data?.bidSummaries;
  console.log("bids sample", JSON.stringify(bids)?.slice(0, 400));
})();
