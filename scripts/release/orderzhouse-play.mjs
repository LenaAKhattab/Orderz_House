#!/usr/bin/env node
/**
 * OrderzHouse Android release tool — Google Play Developer API v3 (androidpublisher).
 *
 * Package is pinned to com.orderzhouse.app; only allow-listed testing tracks can be written,
 * and the production track is refused unconditionally (promotion is a separate, manual gate).
 *
 * Auth is keyless: the company gcloud login (battechno2017@gmail.com) impersonates the
 * dedicated service account via IAM Credentials generateAccessToken. No JSON key is used.
 *
 * Commands
 *   status                                   read-only: tracks, releases, uploaded bundles
 *   verify  --aab <file> [--sha256 <hex>]    local artifact integrity (no network)
 *   upload  --aab <file> [--sha256 <hex>] [--track internal]
 *           [--notes-en <text>] [--notes-ar <text>]
 *           [--validate-only | --commit] [--draft] [--replace-pending]
 *       default (neither flag): PLAN ONLY — verifies artifact + Play state, changes nothing
 *       --validate-only: uploads into a temporary edit, validates, then discards the edit
 *       --commit:        uploads, updates the track, validates, commits, re-reads to verify
 *
 * See docs/ANDROID_RELEASE_AUTOMATION.md.
 */

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, "play-release.config.json"), "utf8"));
const PINNED_PACKAGE = "com.orderzhouse.app";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const UPLOAD_API = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const CHUNK = 8 * 1024 * 1024;

if (CONFIG.packageName !== PINNED_PACKAGE) {
  die(`config packageName '${CONFIG.packageName}' is not ${PINNED_PACKAGE}; refusing.`);
}
const PKG = PINNED_PACKAGE;

// ---------------------------------------------------------------- utilities
function die(msg, code = 1) {
  console.error(`\n[play] ERROR: ${msg}`);
  process.exit(code);
}
function log(msg) {
  console.log(`[play] ${msg}`);
}
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sha256File(file) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(1 << 20);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest("hex");
}

function findJavaTool(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const candidates = [
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, "bin", exe),
    "C:/Program Files/Android/Android Studio/jbr/bin/" + exe,
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return exe;
}

// ---------------------------------------------------------- protobuf manifest
function readVarint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [result, pos];
    shift += 7n;
    if (shift > 63n) return null;
  }
  return null;
}
function parseProto(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    if (!tag) return null;
    pos = tag[1];
    const field = Number(tag[0] >> 3n);
    const wire = Number(tag[0] & 7n);
    if (field === 0) return null;
    if (wire === 0) {
      const v = readVarint(buf, pos);
      if (!v) return null;
      fields.push({ field, wire, value: v[0] });
      pos = v[1];
    } else if (wire === 2) {
      const len = readVarint(buf, pos);
      if (!len) return null;
      pos = len[1];
      const end = pos + Number(len[0]);
      if (end > buf.length) return null;
      fields.push({ field, wire, value: buf.subarray(pos, end) });
      pos = end;
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else return null;
  }
  return pos === buf.length ? fields : null;
}
/** Collect aapt2 proto XmlAttribute {name(2), value(3)} pairs anywhere in the tree. */
function manifestAttributes(buf) {
  const attrs = [];
  const walk = (b, depth) => {
    if (depth > 40 || b.length === 0) return;
    const fields = parseProto(b);
    if (!fields) return;
    const name = fields.find((f) => f.field === 2 && f.wire === 2);
    const value = fields.find((f) => f.field === 3 && f.wire === 2);
    if (name && value) {
      const n = name.value.toString("utf8");
      if (/^[A-Za-z]+$/.test(n)) attrs.push({ name: n, value: value.value.toString("utf8") });
    }
    for (const f of fields) if (f.wire === 2) walk(f.value, depth + 1);
  };
  walk(buf, 0);
  return attrs;
}

// ------------------------------------------------------------- AAB verify
function extractAab(aab) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orderzhouse-aab-"));
  const tar = process.platform === "win32" ? "C:/Windows/System32/tar.exe" : "unzip";
  const args = process.platform === "win32" ? ["-xf", aab, "-C", dir, "base"] : ["-q", aab, "base/*", "-d", dir];
  const r = spawnSync(tar, args, { stdio: "pipe" });
  if (r.status !== 0) die(`could not extract ${aab}: ${String(r.stderr || "").slice(0, 300)}`);
  return dir;
}
function walkFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

const SECRET_PATTERNS = [
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----\s*[A-Za-z0-9+/]{40}/],
  ["service account json", /"type"\s*:\s*"service_account"/],
  ["private_key field", /"private_key"\s*:\s*"/],
  ["Stripe live secret", /sk_live_[A-Za-z0-9]{20,}/],
  ["Stripe test secret", /sk_test_[A-Za-z0-9]{20,}/],
  ["Stripe restricted key", /rk_(live|test)_[A-Za-z0-9]{20,}/],
  ["Stripe webhook secret", /whsec_[A-Za-z0-9]{20,}/],
  ["postgres URL with password", /postgres(ql)?:\/\/[^:\s/"']+:[^@\s"']{6,}@/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
];

export function verifyAab(aab, expectedSha) {
  if (!fs.existsSync(aab)) die(`AAB not found: ${aab}`);
  const report = { file: path.resolve(aab), checks: [] };
  const check = (name, ok, detail) => report.checks.push({ name, ok: !!ok, detail });

  const sha = sha256File(aab);
  report.sha256 = sha;
  if (expectedSha) check("sha256 matches expected", sha === expectedSha.toLowerCase(), sha);
  const sidecar = `${aab}.sha256`;
  if (fs.existsSync(sidecar)) {
    const recorded = fs.readFileSync(sidecar, "utf8").trim().split(/\s+/)[0].toLowerCase();
    check("sha256 matches .sha256 sidecar", recorded === sha, recorded);
  }

  const keytool = findJavaTool("keytool");
  const cert = spawnSync(keytool, ["-printcert", "-jarfile", aab], { encoding: "utf8" });
  const certSha = (cert.stdout || "").match(/SHA256:\s*([0-9A-F:]{95})/);
  report.signingCertSha256 = certSha ? certSha[1] : null;
  check("signed with OrderzHouse upload certificate", certSha && certSha[1] === CONFIG.uploadCertSha256, report.signingCertSha256 || "unsigned / keytool unavailable");

  const dir = extractAab(aab);
  try {
    const manifest = fs.readFileSync(path.join(dir, "base/manifest/AndroidManifest.xml"));
    const attrs = manifestAttributes(manifest);
    const get = (n) => attrs.find((a) => a.name === n)?.value;
    report.package = get("package");
    report.versionCode = get("versionCode") ? Number(get("versionCode")) : null;
    report.versionName = get("versionName") || null;
    check(`package is ${PKG}`, report.package === PKG, report.package);
    check("versionCode present", Number.isInteger(report.versionCode) && report.versionCode > 0, report.versionCode);
    check("POST_NOTIFICATIONS permission", attrs.some((a) => a.value === "android.permission.POST_NOTIFICATIONS"), "");

    const resources = fs.readFileSync(path.join(dir, "base/resources.pb"));
    const has = (s) => resources.includes(Buffer.from(s));
    check("Firebase google_app_id resource", has("google_app_id") && has("gcm_defaultSenderId"), "");
    check(`Firebase app ${CONFIG.firebase.androidAppId}`, has(CONFIG.firebase.androidAppId), "");
    check(`Firebase project ${CONFIG.firebase.projectId}`, has(CONFIG.firebase.projectId), "");

    const libapp = walkFiles(dir).find((f) => f.endsWith(path.join("arm64-v8a", "libapp.so")));
    const libText = libapp ? fs.readFileSync(libapp).toString("latin1") : "";
    check(`release API ${CONFIG.productionApiBaseUrl}`, libText.includes(CONFIG.productionApiBaseUrl), libapp ? "" : "libapp.so missing");

    const hits = [];
    for (const f of walkFiles(dir)) {
      const text = fs.readFileSync(f).toString("latin1");
      for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) hits.push(`${label} in ${path.relative(dir, f)}`);
      const base = path.basename(f).toLowerCase();
      if (["google-services.json", "key.properties", ".env"].includes(base) || /\.(jks|keystore|p12|pem)$/.test(base)) {
        hits.push(`forbidden file ${path.relative(dir, f)}`);
      }
    }
    check("no embedded secrets or credential files", hits.length === 0, hits.join("; "));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  report.ok = report.checks.every((c) => c.ok);
  return report;
}

function printVerify(r) {
  log(`artifact ${r.file}`);
  log(`  package=${r.package} versionName=${r.versionName} versionCode=${r.versionCode}`);
  log(`  sha256=${r.sha256}`);
  for (const c of r.checks) console.log(`   ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok || !c.detail ? "" : `  (${c.detail})`}`);
  log(r.ok ? "artifact verification PASSED" : "artifact verification FAILED");
}

// ------------------------------------------------------------------- auth
let cachedToken = null;
function gcloud(args) {
  const fallback = "C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd";
  const cmd = process.platform === "win32" ? (fs.existsSync(fallback) ? `"${fallback}"` : "gcloud.cmd") : "gcloud";
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" }).trim();
}
async function accessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const sa = CONFIG.serviceAccountEmail;
  if (!sa || sa.includes("REPLACE_")) die("serviceAccountEmail is not configured in scripts/release/play-release.config.json");
  let userToken;
  try {
    userToken = gcloud(["auth", "print-access-token", `--account=${CONFIG.gcloudAccount}`]);
  } catch (e) {
    die(`gcloud has no usable login for ${CONFIG.gcloudAccount}. Run: gcloud auth login ${CONFIG.gcloudAccount}`);
  }
  const res = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(sa)}:generateAccessToken`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: [SCOPE], lifetime: "3600s" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`impersonation of ${sa} failed (${res.status}): ${body?.error?.message || "unknown"}`);
  cachedToken = { token: body.accessToken, exp: Date.parse(body.expireTime) };
  return cachedToken.token;
}

// ------------------------------------------------------------------- http
async function api(method, url, { body, query, retries = 4, raw = false, headers = {} } = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query || {})) u.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(u, {
        method,
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new Error(`${method} ${u.pathname}: network error ${e.name}`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (raw) return res;
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = new Error(`${method} ${u.pathname} → ${res.status}: ${json?.error?.message || text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }
}

const app = `${API}/applications/${PKG}`;
const newEdit = async () => (await api("POST", `${app}/edits`, { body: {} })).id;
const deleteEdit = async (id) => {
  try {
    await api("DELETE", `${app}/edits/${id}`);
  } catch {
    /* edits expire on their own */
  }
};

async function readState(editId) {
  const [tracks, bundles, details, listings] = await Promise.all([
    api("GET", `${app}/edits/${editId}/tracks`),
    api("GET", `${app}/edits/${editId}/bundles`),
    api("GET", `${app}/edits/${editId}/details`),
    api("GET", `${app}/edits/${editId}/listings`),
  ]);
  return {
    tracks: tracks.tracks || [],
    bundles: bundles.bundles || [],
    defaultLanguage: details.defaultLanguage,
    languages: (listings.listings || []).map((l) => l.language),
  };
}

function printState(s) {
  log(`app ${PKG}  default language=${s.defaultLanguage}  listing languages=${s.languages.join(",") || "-"}`);
  log(`uploaded bundles: ${s.bundles.map((b) => b.versionCode).sort((a, b) => a - b).join(", ") || "none"}`);
  for (const t of s.tracks) {
    const rel = t.releases || [];
    if (!rel.length) {
      log(`track ${t.track}: (no releases)`);
      continue;
    }
    for (const r of rel) {
      log(`track ${t.track}: "${r.name || ""}" status=${r.status} versionCodes=${(r.versionCodes || []).join(",")}${r.userFraction ? ` fraction=${r.userFraction}` : ""}`);
    }
  }
}

// ------------------------------------------------------------- resumable upload
async function uploadBundle(editId, aab) {
  const size = fs.statSync(aab).size;
  const start = await api("POST", `${UPLOAD_API}/applications/${PKG}/edits/${editId}/bundles`, {
    query: { uploadType: "resumable" },
    raw: true,
    headers: { "X-Upload-Content-Type": "application/octet-stream", "X-Upload-Content-Length": String(size), "Content-Type": "application/json" },
    body: {},
  });
  if (!start.ok) throw new Error(`upload session failed (${start.status}): ${(await start.text()).slice(0, 300)}`);
  const session = start.headers.get("location");
  if (!session) throw new Error("upload session has no Location header");

  const fd = fs.openSync(aab, "r");
  let offset = 0;
  let failures = 0;
  try {
    while (true) {
      const len = Math.min(CHUNK, size - offset);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      let res;
      try {
        res = await fetch(session, {
          method: "PUT",
          headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Length": String(len), "Content-Range": `bytes ${offset}-${offset + len - 1}/${size}` },
          body: buf,
          signal: AbortSignal.timeout(300_000),
        });
      } catch (e) {
        res = null;
      }
      if (res && (res.status === 200 || res.status === 201)) {
        process.stdout.write(`\r[play] uploaded ${size}/${size} bytes            \n`);
        return res.json();
      }
      if (res && res.status === 308) {
        const range = res.headers.get("range");
        offset = range ? Number(range.split("-")[1]) + 1 : 0;
        failures = 0;
        process.stdout.write(`\r[play] uploaded ${offset}/${size} bytes`);
        continue;
      }
      // 4xx (other than 408/429) is a definitive rejection (e.g. Play refusing the bundle) — surface it, don't retry.
      if (res && res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        throw new Error(`upload rejected at byte ${offset} (${res.status}): ${(await res.text()).slice(0, 800)}`);
      }
      if (++failures > 6) throw new Error(`upload failed at byte ${offset} (${res ? res.status : "network"})`);
      await sleep(1000 * 2 ** failures);
      // Ask the server how much it has, then resume from there.
      const probe = await fetch(session, {
        method: "PUT",
        headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Length": "0", "Content-Range": `bytes */${size}` },
      }).catch(() => null);
      if (probe && (probe.status === 200 || probe.status === 201)) return probe.json();
      if (probe && probe.status === 308) {
        const range = probe.headers.get("range");
        offset = range ? Number(range.split("-")[1]) + 1 : 0;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

// ------------------------------------------------------------------ commands
async function cmdStatus() {
  const id = await newEdit();
  try {
    printState(await readState(id));
  } finally {
    await deleteEdit(id);
  }
  log("read-only: temporary edit discarded, nothing changed");
}

function buildNotes(args, languages, defaultLanguage) {
  const en = args["notes-en"];
  const ar = args["notes-ar"];
  const notes = [];
  const enLang = languages.find((l) => l.startsWith("en"));
  const arLang = languages.find((l) => l.startsWith("ar"));
  if (en && enLang) notes.push({ language: enLang, text: en });
  if (ar && arLang) notes.push({ language: arLang, text: ar });
  if (!notes.length && (en || ar)) notes.push({ language: defaultLanguage, text: en || ar });
  for (const n of notes) if (n.text.length > 500) die(`release notes for ${n.language} exceed 500 characters`);
  return notes;
}

async function cmdUpload(args) {
  const aab = args.aab;
  if (!aab || aab === true) die("--aab <file> is required");
  const track = args.track || "internal";
  if (track === "production") die("the production track is never written by this tool (manual, owner-approved gate).");
  if (!CONFIG.allowedTracks.includes(track)) die(`track '${track}' is not allow-listed (${CONFIG.allowedTracks.join(", ")})`);
  const mode = args.commit ? "commit" : args["validate-only"] ? "validate-only" : "plan";
  if (args.commit && args["validate-only"]) die("choose either --commit or --validate-only");

  const v = verifyAab(aab, typeof args.sha256 === "string" ? args.sha256 : undefined);
  printVerify(v);
  if (!v.ok) die("artifact verification failed; nothing uploaded");

  const editId = await newEdit();
  let committed = false;
  let failure = null;
  try {
    const state = await readState(editId);
    printState(state);
    const existing = state.bundles.find((b) => Number(b.versionCode) === v.versionCode);
    const maxCode = Math.max(0, ...state.bundles.map((b) => Number(b.versionCode)));
    if (existing && existing.sha256 && existing.sha256.toLowerCase() !== v.sha256) {
      throw new Error(`versionCode ${v.versionCode} already exists on Play with a DIFFERENT artifact (sha256 ${existing.sha256}). Build a higher versionCode.`);
    }
    if (!existing && v.versionCode <= maxCode) {
      throw new Error(`versionCode ${v.versionCode} is not higher than the highest uploaded (${maxCode}). Build a higher versionCode.`);
    }
    const current = state.tracks.find((t) => t.track === track) || { track, releases: [] };
    const pending = (current.releases || []).filter((r) => ["draft", "inProgress", "halted"].includes(r.status));
    if (pending.length && !args["replace-pending"]) {
      throw new Error(`track ${track} has pending release(s) ${pending.map((r) => `"${r.name}" (${r.status})`).join(", ")}; re-run with --replace-pending only if the owner approved discarding them.`);
    }
    const notes = buildNotes(args, state.languages, state.defaultLanguage);
    const release = {
      name: `${v.versionName} (${v.versionCode})`,
      versionCodes: [String(v.versionCode)],
      status: args.draft ? "draft" : "completed",
      ...(notes.length ? { releaseNotes: notes } : {}),
    };
    log(`plan: ${existing ? "reuse already-uploaded bundle" : "upload bundle"} ${v.versionCode} → track ${track} as "${release.name}" status=${release.status}; notes: ${notes.map((n) => n.language).join(",") || "none"}`);
    if (mode === "plan") {
      log("PLAN ONLY — no upload, no track change. Re-run with --validate-only or --commit.");
      return;
    }

    if (!existing) {
      const uploaded = await uploadBundle(editId, aab);
      log(`Play accepted bundle versionCode=${uploaded.versionCode} sha256=${uploaded.sha256}`);
      if (Number(uploaded.versionCode) !== v.versionCode) throw new Error("Play reports a different versionCode than the local manifest");
      if (uploaded.sha256 && uploaded.sha256.toLowerCase() !== v.sha256) throw new Error("Play-computed sha256 differs from the local artifact");
    }
    await api("PUT", `${app}/edits/${editId}/tracks/${track}`, { body: { track, releases: [release] } });
    await api("POST", `${app}/edits/${editId}:validate`);
    log("edit validated by Google Play");
    if (mode === "validate-only") {
      log("VALIDATE-ONLY — edit discarded, nothing published.");
      return;
    }
    await api("POST", `${app}/edits/${editId}:commit`);
    committed = true;
    log("edit COMMITTED");
  } catch (e) {
    failure = e;
  } finally {
    if (!committed) await deleteEdit(editId);
  }
  if (failure) die(failure.message);
  if (mode !== "commit") return;

  // Post-commit verification from a fresh edit.
  const check = await newEdit();
  try {
    const s = await readState(check);
    const t = s.tracks.find((x) => x.track === track);
    const rel = (t?.releases || []).find((r) => (r.versionCodes || []).includes(String(v.versionCode)));
    if (!rel) die(`post-commit check: ${v.versionCode} not found on track ${track}`);
    log(`post-commit: track ${track} release "${rel.name}" status=${rel.status} versionCodes=${rel.versionCodes.join(",")}`);
    log(rel.status === "completed" ? "rolled out to the track's testers (Play may still be processing the bundle)" : `release is ${rel.status} — not yet available to testers`);
  } finally {
    await deleteEdit(check);
  }
}

// ------------------------------------------------------------------- main
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
try {
  if (cmd === "status") await cmdStatus();
  else if (cmd === "verify") {
    if (!args.aab || args.aab === true) die("--aab <file> is required");
    const r = verifyAab(args.aab, typeof args.sha256 === "string" ? args.sha256 : undefined);
    printVerify(r);
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === "upload") await cmdUpload(args);
  else {
    console.log("usage: node scripts/release/orderzhouse-play.mjs <status|verify|upload> [options]  (see file header)");
    process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  die(e.message);
}
