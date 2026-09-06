/**
 * Deterministic backend env loading.
 *
 * Normal development / default:
 *   process env first, then backend/.env fills unset keys (never override:true).
 *   `.env.local` is NOT required.
 *
 * Sandbox / test tooling:
 *   dedicated file ONLY — fail closed, never fall back to backend/.env.
 *
 * Production:
 *   process/orchestrator env first; backend/.env may fill unset keys only.
 *
 * Destructive DB/QA protections live in databaseEnvironmentSafety + script guards,
 * not in this loader and not in normal API startup.
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const BACKEND_ROOT = path.join(__dirname, "..", "..");

function resolveBackendRoot() {
  return BACKEND_ROOT;
}

function createEnvLoadError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Resolve load profile from already-set process env (Compose/shell), before file load.
 * @returns {"default"|"sandbox"|"test"|"production"|"none"}
 */
function resolveLoadProfile(env = process.env, explicit) {
  if (explicit === "local" || explicit === "default") return "default";
  if (explicit && explicit !== "auto") return explicit;

  const appEnv = String(env.APP_ENV || "").trim().toLowerCase();
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();

  if (appEnv === "production" || nodeEnv === "production") return "production";
  if (appEnv === "sandbox") return "sandbox";
  if (appEnv === "test") return "test";
  if (appEnv === "staging") return "production";
  // Normal workstation / npm run dev → backend/.env
  return "default";
}

/**
 * @param {{
 *   profile?: "local"|"sandbox"|"test"|"production"|"default"|"none"|"auto",
 *   override?: boolean,
 *   failClosed?: boolean,
 *   quiet?: boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} [opts]
 */
function loadBackendEnv(opts = {}) {
  const {
    profile: profileOpt = "auto",
    override = false,
    failClosed = true,
    quiet = false,
    env = process.env,
  } = opts;

  if (override) {
    throw createEnvLoadError(
      "ENV_OVERRIDE_FORBIDDEN",
      "loadBackendEnv refuses override:true — production/process env must win over files.",
    );
  }

  const profile = resolveLoadProfile(env, profileOpt);
  const root = module.exports.resolveBackendRoot();
  const loaded = [];

  function loadFile(relName, { required }) {
    const filePath = path.join(root, relName);
    if (!fs.existsSync(filePath)) {
      if (required && failClosed) {
        const code =
          relName === ".env.sandbox"
            ? "SANDBOX_ENV_NOT_LOADED"
            : relName === ".env.test"
              ? "TEST_ENV_NOT_LOADED"
              : "ENV_FILE_NOT_LOADED";
        throw createEnvLoadError(
          code,
          `${code}: required env file missing: ${relName}. Fail-closed — will not fall back to backend/.env.`,
        );
      }
      return false;
    }
    dotenv.config({ path: filePath, override: false, quiet });
    loaded.push(relName);
    return true;
  }

  if (profile === "none") {
    return { profile, loaded, root };
  }

  if (profile === "sandbox") {
    loadFile(".env.sandbox", { required: true });
    return { profile, loaded, root };
  }

  if (profile === "test") {
    loadFile(".env.test", { required: true });
    return { profile, loaded, root };
  }

  if (profile === "production") {
    loadFile(".env", { required: false });
    return { profile, loaded, root };
  }

  // default — normal npm run dev / generic scripts
  loadFile(".env", { required: false });
  return { profile: "default", loaded, root };
}

module.exports = {
  loadBackendEnv,
  resolveBackendRoot,
  resolveLoadProfile,
};
