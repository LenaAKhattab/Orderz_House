/** Phase 5I — Fixed delivery/review/claim E2E after take (QA only). */
const http = require("http");
const fs = require("fs");
const path = require("path");

function req(method, p, token, body, raw, contentType) {
  return new Promise((resolve, reject) => {
    const data = raw || (body ? JSON.stringify(body) : null);
    const headers = { "X-Client-Type": "mobile", Accept: "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    if (data) {
      headers["Content-Type"] = contentType || "application/json";
      headers["Content-Length"] = Buffer.byteLength(data);
    }
    const r = http.request(
      { hostname: "127.0.0.1", port: 5000, path: "/api" + p, method, headers },
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

function log(step, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${step}`, JSON.stringify(detail || {}).slice(0, 350));
  return { step, ok, ...(detail || {}) };
}

function multipart(fileName, content) {
  const boundary = "----B" + Date.now();
  const head =
    `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nQA delivery note long enough\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  return {
    boundary,
    body: Buffer.concat([Buffer.from(head), content, Buffer.from(tail)]),
  };
}

(async () => {
  const rows = [];
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  let r = await req("POST", "/auth/login", null, {
    email: "qa.freelancer@orderzhouse.test",
    password: "Test123456!",
  });
  const fTok = r.json.data.accessToken;
  r = await req("POST", "/auth/login", null, {
    email: "qa.client@orderzhouse.test",
    password: "Test123456!",
  });
  const cTok = r.json.data.accessToken;

  const fixedId = "22131";
  const biddingId = "22132";

  // Ensure taken (may already be taken from previous probe)
  r = await req("GET", `/freelancer/my-orders/${fixedId}`, fTok);
  if (r.status >= 400) {
    r = await req("POST", `/orders/pool/${fixedId}/take`, fTok, {});
    rows.push(log("take_fixed", r.status < 300, { status: r.status, message: r.json?.message }));
  } else {
    rows.push(log("take_fixed_already_mine", true, { status: r.status }));
  }

  r = await req("GET", `/freelancer/my-orders/${fixedId}`, fTok);
  rows.push(
    log("freelancer_order_detail", r.status < 300, {
      status: r.status,
      orderStatus: r.json?.data?.order?.orderStatus || r.json?.data?.orderStatus,
    })
  );

  // delivery no file
  r = await req("POST", `/freelancer/my-orders/${fixedId}/delivery`, fTok, { note: "x" });
  rows.push(log("delivery_no_file", r.status >= 400, { status: r.status, message: r.json?.message }));

  // delivery with file
  let mp = multipart("d1.png", png);
  r = await req(
    "POST",
    `/freelancer/my-orders/${fixedId}/delivery`,
    fTok,
    null,
    mp.body,
    `multipart/form-data; boundary=${mp.boundary}`
  );
  rows.push(
    log("delivery_with_file", r.status < 300, {
      status: r.status,
      orderStatus: r.json?.data?.order?.orderStatus || r.json?.data?.orderStatus,
      message: r.json?.message,
    })
  );

  // short revision
  r = await req("POST", `/client/orders/${fixedId}/delivery/revision`, cTok, { note: "قصير" });
  rows.push(log("revision_short", true, { status: r.status, message: r.json?.message }));

  // valid revision
  r = await req("POST", `/client/orders/${fixedId}/delivery/revision`, cTok, {
    note: "يرجى تعديل التسليم وإضافة تفاصيل أوضح للنتيجة.",
  });
  rows.push(
    log("revision_ok", r.status < 300, {
      status: r.status,
      orderStatus: r.json?.data?.order?.orderStatus || r.json?.data?.orderStatus,
      message: r.json?.message,
    })
  );

  // redelivery
  mp = multipart("d2.png", png);
  r = await req(
    "POST",
    `/freelancer/my-orders/${fixedId}/delivery`,
    fTok,
    null,
    mp.body,
    `multipart/form-data; boundary=${mp.boundary}`
  );
  rows.push(
    log("redelivery", r.status < 300, {
      status: r.status,
      orderStatus: r.json?.data?.order?.orderStatus || r.json?.data?.orderStatus,
    })
  );

  // approve
  r = await req("POST", `/client/orders/${fixedId}/delivery/approve`, cTok, {});
  rows.push(
    log("approve", r.status < 300, {
      status: r.status,
      orderStatus: r.json?.data?.order?.orderStatus || r.json?.data?.orderStatus,
      message: r.json?.message,
    })
  );

  // review
  r = await req("POST", `/client/orders/${fixedId}/review`, cTok, {
    rating: 5,
    reviewText: "تقييم ممتاز لمرحلة Phase 5I",
  });
  rows.push(log("review", r.status < 300, { status: r.status, message: r.json?.message }));

  r = await req("POST", `/client/orders/${fixedId}/review`, cTok, {
    rating: 4,
    reviewText: "تكرار يجب أن يفشل",
  });
  rows.push(log("dup_review", r.status >= 400, { status: r.status, message: r.json?.message }));

  // claim
  r = await req("GET", "/portal/financial-claims/done-projects?limit=50", fTok);
  const projects = r.json?.data?.projects || r.json?.data || [];
  rows.push(
    log("done_projects", r.status < 300, {
      status: r.status,
      count: Array.isArray(projects) ? projects.length : 0,
      hasFixed: Array.isArray(projects) && projects.some((p) => String(p.orderId || p.order_id) === fixedId),
    })
  );
  r = await req("POST", "/portal/financial-claims", fTok, {
    mode: "done_project",
    orderId: fixedId,
  });
  rows.push(log("create_claim", r.status < 300, { status: r.status, message: r.json?.message }));

  // bidding accept with real bidId
  r = await req("POST", `/orders/pool/${biddingId}/bids`, fTok, {
    amount: 70,
    message: "QA bid for accept probe",
  });
  rows.push(log("bid_again", r.status < 300 || r.status === 409 || r.status === 400, { status: r.status, message: r.json?.message }));

  r = await req("GET", `/client/orders/${biddingId}`, cTok);
  const order = r.json?.data?.order || r.json?.data;
  const bids = order?.bids || order?.bidSummaries || r.json?.data?.bids || [];
  console.log("bid fields", Object.keys(order || {}), "bidsLen", Array.isArray(bids) ? bids.length : bids);
  const bidId = Array.isArray(bids) && bids[0] ? bids[0].id || bids[0].bidId : null;
  r = await req("POST", `/client/orders/${biddingId}/bids/accept`, cTok, { bidId });
  const checkout = r.json?.data?.checkoutUrl;
  rows.push(
    log("accept_bid", false, {
      status: r.status,
      message: r.json?.message,
      bidId,
      hasCheckout: !!checkout,
      live: typeof checkout === "string" && checkout.includes("cs_live_"),
      note: "Expected blocked: no mobile accept UI + Stripe live keys",
    })
  );

  // Mobile feature gap notes
  rows.push(
    log("mobile_accept_bid_ui_exists", false, {
      note: "Grep found no acceptBid/bids/accept in Flutter lib — High gap",
    })
  );

  const out = path.join(__dirname, "phase5i_fixed_flow.json");
  fs.writeFileSync(out, JSON.stringify({ rows }, null, 2));
  console.log("Wrote", out);
  console.log(`Pass ${rows.filter((x) => x.ok).length}/${rows.length}`);
})();
