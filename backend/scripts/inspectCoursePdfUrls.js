/**
 * Read-only inspection: DB URLs vs CDN delivery.
 * Usage: node scripts/inspectCoursePdfUrls.js [courseId]
 */
require("dotenv").config();
const { pool } = require("../src/config/db");
const { getCloudinary } = require("../src/config/cloudinary");

async function probeUrl(label, url) {
  if (!url) {
    console.log(`[${label}] (empty)`);
    return null;
  }
  const hasPdfSuffix = /\.pdf(\?|$)/i.test(url);
  const pathPart = (() => {
    try {
      return decodeURIComponent(new URL(url).pathname);
    } catch {
      return url;
    }
  })();
  let head = { status: null, contentType: null, bytes: 0, magic: "" };
  try {
    const r = await fetch(url, { method: "GET" });
    const buf = Buffer.from(await r.arrayBuffer());
    head = {
      status: r.status,
      contentType: r.headers.get("content-type"),
      bytes: buf.length,
      magic: buf.slice(0, 8).toString("ascii"),
    };
  } catch (e) {
    head = { error: e.message };
  }
  console.log(`\n--- ${label} ---`);
  console.log("url:", url);
  console.log("pathname:", pathPart);
  console.log("endsWithPdfInPath:", hasPdfSuffix);
  console.log("delivery:", head);
  return { url, hasPdfSuffix, ...head };
}

async function inspectCloudinaryResource(publicId) {
  if (!publicId) return;
  try {
    const c = getCloudinary();
    const r = await c.api.resource(publicId, { resource_type: "raw" });
    console.log("\n--- Cloudinary API (raw) ---");
    console.log({
      public_id: r.public_id,
      resource_type: r.resource_type,
      type: r.type,
      bytes: r.bytes,
      format: r.format,
      secure_url: r.secure_url,
      access_mode: r.access_mode,
      access_control: r.access_control,
    });
    await probeUrl("secure_url from API", r.secure_url);
  } catch (e) {
    console.log("\n--- Cloudinary API (raw) failed:", e.message || e, "---");
    try {
      const c = getCloudinary();
      const r = await c.api.resource(publicId, { resource_type: "image" });
      console.log("Found as image:", {
        public_id: r.public_id,
        resource_type: r.resource_type,
        secure_url: r.secure_url,
        bytes: r.bytes,
      });
      await probeUrl("image secure_url", r.secure_url);
    } catch (e2) {
      console.log("Not found as image either:", e2.message || e2);
    }
  }
}

function publicIdFromCloudinaryUrl(url) {
  if (!url || !url.includes("res.cloudinary.com")) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const uploadIdx = parts.indexOf("upload");
    if (uploadIdx < 0) return null;
    let i = uploadIdx + 1;
    if (parts[i]?.startsWith("v") && /^v\d+$/.test(parts[i])) i += 1;
    if (parts[i]?.startsWith("s--")) i += 1;
    return decodeURIComponent(parts.slice(i).join("/"));
  } catch {
    return null;
  }
}

async function main() {
  const courseId = process.argv[2] || null;
  const where = courseId ? "WHERE id = $1" : "WHERE test_file_url IS NOT NULL OR test_prompt_file_url IS NOT NULL";
  const params = courseId ? [Number(courseId)] : [];
  const { rows } = await pool.query(
    `SELECT id, title, test_file_url, test_prompt_file_url, updated_at
     FROM courses ${where}
     ORDER BY id DESC
     LIMIT ${courseId ? 1 : 20}`,
    params,
  );

  console.log("=== Course PDF URL inspection ===");
  console.log("courses found:", rows.length);

  for (const row of rows) {
    console.log("\n========================================");
    console.log("Course", row.id, row.title);
    console.log("updated_at:", row.updated_at);

    const testProbe = await probeUrl("DB test_file_url", row.test_file_url);
    const promptProbe = await probeUrl("DB test_prompt_file_url", row.test_prompt_file_url);

    if (row.test_file_url) {
      const pid = publicIdFromCloudinaryUrl(row.test_file_url);
      console.log("derived public_id (test):", pid);
      await inspectCloudinaryResource(pid);
    }
    if (row.test_prompt_file_url) {
      const pid = publicIdFromCloudinaryUrl(row.test_prompt_file_url);
      console.log("derived public_id (prompt):", pid);
      await inspectCloudinaryResource(pid);
    }

    console.log("summary:", {
      courseId: row.id,
      testOk: testProbe?.status === 200 && testProbe?.magic?.startsWith("%PDF"),
      promptOk: promptProbe?.status === 200 && promptProbe?.magic?.startsWith("%PDF"),
      testLegacyPdfPath: testProbe?.hasPdfSuffix,
      promptLegacyPdfPath: promptProbe?.hasPdfSuffix,
    });
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
