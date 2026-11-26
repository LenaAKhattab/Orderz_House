#!/usr/bin/env node
/**
 * OrderzHouse one-command workflow (Windows dev PC, also works on POSIX).
 *
 *   node scripts/oh.mjs <command> [options]
 *
 * Local / read-only
 *   doctor                     toolchain, credentials presence (never values), git, Firebase config
 *   test:backend               backend unit tests
 *   test:frontend              frontend tests
 *   test:flutter               Flutter tests
 *   test:staging               backend integration tests against Staging (guarded: never Production)
 *   android:build              signed release AAB → artifacts/android + sha256 + full verification
 *   android:verify [--aab f]   verify an AAB (defaults to the one matching pubspec version)
 *   play:status                Google Play tracks / bundles (read-only)
 *   prod:health                public health + VPS HEAD/containers/origin parity (read-only)
 *
 * Gated actions (never implied by the commands above)
 *   play:internal [--aab f] [--notes-en ..] [--notes-ar ..] [--validate-only | --commit]
 *                              upload to the INTERNAL track only; plan-only without a flag
 *   prod:deploy --sha <full sha> --confirm-production [--migrations "219_x 220_y"] [--services "backend frontend"]
 *
 * Public Production promotion on Google Play is intentionally NOT automated.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIN = process.platform === "win32";
const SSH = WIN ? "C:/Windows/System32/OpenSSH/ssh.exe" : "ssh"; // Windows OpenSSH talks to the ssh-agent service
const SCP = WIN ? "C:/Windows/System32/OpenSSH/scp.exe" : "scp";
const HOST = "orderzhouse-prod";
const MOBILE = path.join(ROOT, "mobile", "orderzhouse_app");
const JBR = "C:/Program Files/Android/Android Studio/jbr";

function fail(msg, code = 1) {
  console.error(`\n[oh] FAILED: ${msg}`);
  process.exit(code);
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: WIN && !/\.exe$/i.test(cmd), ...opts });
  if (r.error) fail(`${cmd}: ${r.error.message}`);
  if (r.status !== 0 && !opts.allowFail) fail(`${cmd} ${args.join(" ")} exited with ${r.status}`);
  return r.status;
}
function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: WIN && !/\.exe$/i.test(cmd), ...opts });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const n = argv[i + 1];
      if (n !== undefined && !n.startsWith("--")) {
        o[a.slice(2)] = n;
        i++;
      } else o[a.slice(2)] = true;
    } else o._.push(a);
  }
  return o;
}
function pubspecVersion() {
  const m = fs.readFileSync(path.join(MOBILE, "pubspec.yaml"), "utf8").match(/^version:\s*([0-9.]+)\+(\d+)\s*$/m);
  if (!m) fail("cannot read version from pubspec.yaml");
  return { name: m[1], code: m[2] };
}
function defaultAab() {
  const v = pubspecVersion();
  return path.join(ROOT, "artifacts", "android", `orderzhouse-${v.name}+${v.code}-release.aab`);
}
function flutter() {
  return fs.existsSync("C:/flutter/bin/flutter.bat") ? "C:/flutter/bin/flutter.bat" : "flutter";
}
function withJava(env = process.env) {
  return fs.existsSync(JBR) && !env.JAVA_HOME ? { ...env, JAVA_HOME: JBR } : env;
}
const play = (args) => run(process.execPath, [path.join(ROOT, "scripts", "release", "orderzhouse-play.mjs"), ...args]);
const ssh = (remoteCmd, opts = {}) => capture(SSH, ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", HOST, remoteCmd], opts);

// ------------------------------------------------------------------ commands
function doctor() {
  const rows = [];
  const add = (name, ok, detail = "") => rows.push([ok ? "OK  " : "WARN", name, detail]);
  const ver = (cmd, args) => capture(cmd, args);
  add("node", true, process.version);
  const fl = ver(flutter(), ["--version"]);
  add("flutter", fl.ok, (fl.out.split("\n")[0] || fl.err).slice(0, 60));
  add("java (Android Studio JBR)", fs.existsSync(JBR), JBR);
  const adb = path.join(process.env.LOCALAPPDATA || "", "Android/Sdk/platform-tools/adb.exe");
  const devs = fs.existsSync(adb) ? capture(adb, ["devices"]).out.split("\n").slice(1).filter((l) => l.trim()) : [];
  add("adb", fs.existsSync(adb), `${devs.length} device(s): ${devs.join(" | ") || "none"}`);
  const gcFallback = "C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd";
  const gc = ver(fs.existsSync(gcFallback) ? `"${gcFallback}"` : "gcloud", ["auth", "list", "--format=value(account)"]);
  add("gcloud company login", gc.ok && gc.out.includes("battechno2017@gmail.com"), gc.ok ? gc.out.replace(/\n/g, ", ") : "gcloud not on PATH");
  const st = ver("stripe", ["version"]);
  add("stripe CLI", st.ok, st.out.split("\n")[0]);
  const gh = ver("gh", ["auth", "status"]);
  add("gh (GitHub)", gh.ok, (gh.out + gh.err).match(/account (\S+)/)?.[1] || "");
  const agent = capture(WIN ? "C:/Windows/System32/OpenSSH/ssh-add.exe" : "ssh-add", ["-l"]);
  add("ssh-agent VPS key", agent.ok && agent.out.includes("orderzhouse-newpc-vps"), agent.ok ? `${agent.out.split("\n").length} key(s)` : "agent not running / no keys");
  const gs = path.join(MOBILE, "android/app/google-services.json");
  let gsOk = false;
  try {
    const j = JSON.parse(fs.readFileSync(gs, "utf8"));
    gsOk = j.project_info?.project_id === "orderz-house" && j.client?.some((c) => c.client_info?.android_client_info?.package_name === "com.orderzhouse.app");
  } catch {}
  add("google-services.json (orderz-house / com.orderzhouse.app)", gsOk);
  add("android/key.properties (upload key)", fs.existsSync(path.join(MOBILE, "android/key.properties")));
  const envApp = (f) => {
    try {
      return (fs.readFileSync(path.join(ROOT, "backend", f), "utf8").match(/^APP_ENV=(.*)$/m) || [])[1] || "<unset>";
    } catch {
      return "<missing>";
    }
  };
  add("backend/.env APP_ENV", envApp(".env") !== "production", envApp(".env"));
  add("backend/.env.staging APP_ENV", envApp(".env.staging") === "staging", envApp(".env.staging"));
  const git = capture("git", ["-C", ROOT, "status", "--porcelain", "--untracked-files=no"]);
  const branch = capture("git", ["-C", ROOT, "rev-parse", "--abbrev-ref", "HEAD"]).out;
  add("git tracked tree clean", git.ok && !git.out, `branch ${branch}`);
  for (const [s, n, d] of rows) console.log(`${s} ${n.padEnd(58)} ${d}`);
}

function testStaging() {
  const loader = `
    const { loadStagingQaEnv, assertStagingQaTarget } = require("./src/config/stagingQaEnv");
    const env = {}; loadStagingQaEnv({ env, fillFromDefaultEnv: false });
    const t = assertStagingQaTarget(env);
    process.stderr.write("[oh] Staging target " + t.maskedTarget + "\\n");
    process.stdout.write(env.DATABASE_URL);`;
  const r = capture(process.execPath, ["-e", loader], { cwd: path.join(ROOT, "backend") });
  if (!r.ok || !r.out) fail(`Staging guard refused: ${r.err.split("\n").slice(-3).join(" ")}`);
  console.error(r.err);
  run("npm", ["run", "test:integration"], {
    cwd: path.join(ROOT, "backend"),
    env: { ...process.env, INTEGRATION_TEST_DATABASE_URL: r.out },
  });
}

function androidBuild() {
  const v = pubspecVersion();
  run(flutter(), ["build", "appbundle", "--release"], { cwd: MOBILE, env: withJava() });
  const out = path.join(MOBILE, "build/app/outputs/bundle/release/app-release.aab");
  const dest = defaultAab();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(out, dest);
  const sha = capture(process.execPath, ["-e", `const c=require("crypto"),f=require("fs");process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))`, dest]).out;
  fs.writeFileSync(`${dest}.sha256`, `${sha} *${path.basename(dest)}\n`);
  console.log(`[oh] built ${v.name}+${v.code} → ${dest}\n[oh] sha256 ${sha}`);
  play(["verify", "--aab", dest]);
}

async function prodHealth() {
  const res = await fetch("https://orderzhouse.com/api/health", { signal: AbortSignal.timeout(20000) }).catch((e) => ({ ok: false, status: e.name }));
  const body = res.ok ? await res.json() : {};
  console.log(`[oh] public API: ${res.status} status=${body.status} database=${body.database}`);
  const web = await fetch("https://orderzhouse.com/", { signal: AbortSignal.timeout(20000) }).catch(() => ({ status: "error" }));
  console.log(`[oh] public web: ${web.status}`);
  const r = ssh("hostname; cd /root/Orderz_House && git rev-parse HEAD && git status --porcelain --untracked-files=no | wc -l; docker ps --format '{{.Names}} {{.Status}}' | grep orderzhouse");
  if (!r.ok) fail(`SSH read-only check failed (is the ssh-agent running with the VPS key?): ${r.err.slice(0, 200)}`);
  const [host, head, dirty, ...containers] = r.out.split("\n");
  capture("git", ["-C", ROOT, "fetch", "-q", "origin", "main"]);
  const main = capture("git", ["-C", ROOT, "rev-parse", "origin/main"]).out;
  const diff = capture("git", ["-C", ROOT, "diff", "--name-only", head, main]).out.split("\n").filter(Boolean);
  const pkgRuntime = (f) => {
    // package.json matters only for dependencies / engines / start-build scripts, not test scripts.
    const pick = (rev) => {
      try {
        const j = JSON.parse(capture("git", ["-C", ROOT, "show", `${rev}:${f}`]).out);
        const s = j.scripts || {};
        return JSON.stringify([j.dependencies, j.devDependencies, j.engines, j.main, s.start, s.build, s.prestart]);
      } catch {
        return "missing";
      }
    };
    return pick(head) !== pick(main);
  };
  const runtime = diff.filter((f) =>
    /package(-lock)?\.json$/.test(f) && /^(backend|frontend)\/package\.json$/.test(f)
      ? pkgRuntime(f)
      : /^(backend\/(src|sql|package-lock|Dockerfile|ops)|frontend\/(src|public|index|package-lock|vite|Dockerfile|nginx)|docker-compose)/.test(f),
  );
  console.log(`[oh] VPS ${host} HEAD=${head.slice(0, 7)} tracked-changes=${dirty} origin/main=${main.slice(0, 7)}`);
  containers.forEach((c) => console.log(`[oh]   ${c}`));
  if (head === main) console.log("[oh] parity: VPS == origin/main");
  else if (!runtime.length) console.log(`[oh] parity: runtime-equivalent (${diff.length} non-runtime file(s) differ) — no deploy needed`);
  else console.log(`[oh] parity: DEPLOY NEEDED — runtime files differ:\n   ${runtime.join("\n   ")}`);
  if (!(res.ok && body.status === "ok" && body.database === "connected")) fail("Production health is not OK");
}

function prodDeploy(a) {
  if (a["confirm-production"] !== true) fail("prod:deploy requires --confirm-production");
  const sha = a.sha;
  if (!/^[0-9a-f]{40}$/.test(sha || "")) fail("--sha must be the full 40-char merged commit");
  capture("git", ["-C", ROOT, "fetch", "-q", "origin", "main"]);
  if (!capture("git", ["-C", ROOT, "merge-base", "--is-ancestor", sha, "origin/main"]).ok) fail(`${sha} is not on origin/main`);
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const remote = `/root/oh_deploy_${stamp}.sh`;
  const log = `/root/oh_deploy_${stamp}.log`;
  // Ship the script from the target commit (LF guaranteed by .gitattributes / git show).
  const script = capture("git", ["-C", ROOT, "show", `${sha}:scripts/deploy/orderzhouse-deploy.sh`]);
  const local = path.join(ROOT, "artifacts", `oh_deploy_${stamp}.sh`);
  const src = script.ok ? script.out : fs.readFileSync(path.join(ROOT, "scripts/deploy/orderzhouse-deploy.sh"), "utf8");
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, src.replace(/\r\n/g, "\n") + "\n");
  run(SCP, ["-q", "-o", "BatchMode=yes", local, `${HOST}:${remote}`]);
  fs.rmSync(local);
  const envs = [`TARGET_SHA=${sha}`, "CONFIRM=orderzhouse-production"];
  if (typeof a.migrations === "string") envs.push(`MIGRATIONS='${a.migrations.replace(/[^A-Za-z0-9_ ]/g, "")}'`);
  if (typeof a.services === "string") envs.push(`SERVICES='${a.services.replace(/[^a-z ]/g, "")}'`);
  const start = ssh(`${envs.join(" ")} setsid nohup bash ${remote} > ${log} 2>&1 < /dev/null & echo started`);
  if (!start.ok) fail(`could not start remote deploy: ${start.err}`);
  console.log(`[oh] deploy started on VPS; log ${log}. Polling…`);
  const deadline = Date.now() + 30 * 60 * 1000;
  let shown = 0;
  while (Date.now() < deadline) {
    spawnSync(process.execPath, ["-e", "setTimeout(()=>{},15000)"]);
    const t = ssh(`cat ${log}`);
    if (!t.ok) continue;
    const lines = t.out.split("\n");
    lines.slice(shown).filter((l) => /^(===|PASS|FAIL|DEPLOY_|migrations:)/.test(l)).forEach((l) => console.log(`[vps] ${l}`));
    shown = lines.length;
    if (/DEPLOY_DONE/.test(t.out)) return console.log("[oh] DEPLOY_DONE");
    if (/DEPLOY_FAIL|^FAIL /m.test(t.out) || /exit code|Error response from daemon/.test(t.out.slice(-400))) {
      fail(`deploy failed — inspect ${log} on the VPS`);
    }
  }
  fail(`deploy still running after 30 min — inspect ${log}`);
}

// --------------------------------------------------------------------- main
const a = parseArgs(process.argv.slice(2));
const cmd = a._[0];
const pass = process.argv.slice(3);
switch (cmd) {
  case "doctor":
    doctor();
    break;
  case "test:backend":
    run("npm", ["run", "test:unit"], { cwd: path.join(ROOT, "backend") });
    break;
  case "test:frontend":
    run("npm", ["test"], { cwd: path.join(ROOT, "frontend") });
    break;
  case "test:flutter":
    run(flutter(), ["test"], { cwd: MOBILE });
    break;
  case "test:staging":
    testStaging();
    break;
  case "android:build":
    androidBuild();
    break;
  case "android:verify":
    play(["verify", "--aab", typeof a.aab === "string" ? a.aab : defaultAab(), ...(a.sha256 ? ["--sha256", a.sha256] : [])]);
    break;
  case "play:status":
    play(["status"]);
    break;
  case "play:internal":
    play(["upload", "--track", "internal", ...(a.aab ? [] : ["--aab", defaultAab()]), ...pass]);
    break;
  case "prod:health":
    await prodHealth();
    break;
  case "prod:deploy":
    prodDeploy(a);
    break;
  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    process.exit(cmd ? 1 : 0);
}
