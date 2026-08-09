/**
 * Shared guards for destructive fake/training order maintenance scripts.
 * Execution requires BOTH an execute flag and a script-specific confirmation.
 */

function envBool(name, fallback = false, env = process.env) {
  const v = env[name];
  if (v == null || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function getDatabaseTargetHint(env = process.env) {
  const nodeEnv = env.NODE_ENV || "(unset)";
  const url = env.DATABASE_URL;
  if (!url) return `DATABASE_URL=(not set), NODE_ENV=${nodeEnv}`;
  try {
    const u = new URL(url);
    const host = u.hostname || "?";
    const port = u.port || "5432";
    const db = (u.pathname || "").replace(/^\//, "") || "?";
    return `${host}:${port}/${db}, NODE_ENV=${nodeEnv}`;
  } catch {
    return `DATABASE_URL=(set, unparsed), NODE_ENV=${nodeEnv}`;
  }
}

/**
 * @param {{
 *   scriptName: string,
 *   specificExecuteVar: string,
 *   confirmVar: string,
 *   legacyExecuteVar?: string,
 *   executeCommandExample: string,
 *   env?: NodeJS.ProcessEnv,
 * }} options
 */
function resolveDestructiveScriptMode(options) {
  const {
    scriptName,
    specificExecuteVar,
    confirmVar,
    legacyExecuteVar = "EXECUTE",
    executeCommandExample,
    env = process.env,
  } = options;

  const confirm = envBool(confirmVar, false, env);
  const specificExecute = envBool(specificExecuteVar, false, env);
  const genericExecute = envBool(legacyExecuteVar, false, env);
  const executeRequested = specificExecute || genericExecute;
  const execute = executeRequested && confirm;
  const dryRun = !execute;

  const warnings = [];

  if (genericExecute && !confirm) {
    warnings.push(
      `Stale or incomplete env: ${legacyExecuteVar}=true without ${confirmVar}=true — forced DRY RUN (no writes).`,
    );
  } else if (specificExecute && !confirm) {
    warnings.push(
      `Stale or incomplete env: ${specificExecuteVar}=true without ${confirmVar}=true — forced DRY RUN (no writes).`,
    );
  }

  if (confirm && !executeRequested) {
    warnings.push(
      `${confirmVar}=true without ${specificExecuteVar}=true or ${legacyExecuteVar}=true — DRY RUN only.`,
    );
  }

  return {
    scriptName,
    specificExecuteVar,
    confirmVar,
    legacyExecuteVar,
    mode: execute ? "EXECUTE" : "DRY_RUN",
    dryRun,
    execute,
    confirm,
    specificExecute,
    genericExecute,
    executeRequested,
    warnings,
    executeCommandExample,
  };
}

/**
 * @param {ReturnType<typeof resolveDestructiveScriptMode>} safety
 * @param {{ databaseTarget?: string }} [opts]
 */
function printSafetyBanner(safety, opts = {}) {
  const databaseTarget = opts.databaseTarget ?? getDatabaseTargetHint();
  // eslint-disable-next-line no-console
  console.log("\n=== Script safety banner ===");
  // eslint-disable-next-line no-console
  console.log(`Script:              ${safety.scriptName}`);
  // eslint-disable-next-line no-console
  console.log(`Mode:                ${safety.mode}${safety.dryRun ? " (no writes)" : ""}`);
  // eslint-disable-next-line no-console
  console.log(`Required confirm:    ${safety.confirmVar}=true`);
  // eslint-disable-next-line no-console
  console.log(`Execute flags:       ${safety.specificExecuteVar}=true OR ${safety.legacyExecuteVar}=true (both need confirm)`);
  // eslint-disable-next-line no-console
  console.log(`Database target:     ${databaseTarget}`);
  // eslint-disable-next-line no-console
  console.log(
    `Env execute state:   ${safety.specificExecuteVar}=${safety.specificExecute ? "true" : "false"}, ` +
      `${safety.legacyExecuteVar}=${safety.genericExecute ? "true" : "false"}, ` +
      `${safety.confirmVar}=${safety.confirm ? "true" : "false"}`,
  );
  if (safety.genericExecute) {
    // eslint-disable-next-line no-console
    console.warn(
      `WARNING: Generic ${safety.legacyExecuteVar}=true detected in environment. ` +
        `Ignored unless ${safety.confirmVar}=true is also set.`,
    );
  }
  for (const w of safety.warnings) {
    // eslint-disable-next-line no-console
    console.warn(`WARNING: ${w}`);
  }
}

/**
 * Guards mutating maintenance/QA scripts. Always prints the DB target.
 * In production, requires confirmVar=true or the process exits.
 *
 * @param {{ scriptName: string, confirmVar: string, requireConfirmAlways?: boolean, env?: NodeJS.ProcessEnv }} options
 */
function assertMutatingScriptAllowed(options) {
  const { scriptName, confirmVar, requireConfirmAlways = false, env = process.env } = options;
  const databaseTarget = getDatabaseTargetHint(env);
  const confirmed = envBool(confirmVar, false, env);
  const isProductionNode = env.NODE_ENV === "production";

  let dbIsProduction = false;
  try {
    const {
      isProductionDatabase,
      maskDatabaseTarget,
    } = require("../../src/utils/databaseEnvironmentSafety");
    dbIsProduction = isProductionDatabase(env.DATABASE_URL, env);
    // Prefer masked host/db classification over NODE_ENV-only hints.
    // eslint-disable-next-line no-console
    console.log("\n=== Mutating script guard ===");
    // eslint-disable-next-line no-console
    console.log(`Script:          ${scriptName}`);
    // eslint-disable-next-line no-console
    console.log(`Database target: ${maskDatabaseTarget(env.DATABASE_URL)}`);
    // eslint-disable-next-line no-console
    console.log(`NODE_ENV:        ${env.NODE_ENV || "(unset)"}`);
    // eslint-disable-next-line no-console
    console.log(`DB production:   ${dbIsProduction ? "YES" : "no"}`);
  } catch {
    // eslint-disable-next-line no-console
    console.log("\n=== Mutating script guard ===");
    // eslint-disable-next-line no-console
    console.log(`Script:          ${scriptName}`);
    // eslint-disable-next-line no-console
    console.log(`Database target: ${databaseTarget}`);
    // eslint-disable-next-line no-console
    console.log(`NODE_ENV:        ${env.NODE_ENV || "(unset)"}`);
  }

  // Hard-block shared/production Neon for QA/maintenance scripts regardless of NODE_ENV.
  if (dbIsProduction) {
    // eslint-disable-next-line no-console
    console.error(
      `QA_PRODUCTION_DATABASE_BLOCKED: refusing ${scriptName} against production/shared DATABASE_URL.`,
    );
    process.exit(1);
  }

  if (isProductionNode && !confirmed) {
    // eslint-disable-next-line no-console
    console.error(
      `Refusing to run in production without ${confirmVar}=true.`,
    );
    process.exit(1);
  }

  if (requireConfirmAlways && !confirmed) {
    // eslint-disable-next-line no-console
    console.error(`Refusing to run without ${confirmVar}=true.`);
    process.exit(1);
  }

  if (isProductionNode && confirmed) {
    // eslint-disable-next-line no-console
    console.warn(`WARNING: Running mutating script in production (${scriptName}).`);
  }

  return { databaseTarget, confirmed, isProduction: isProductionNode || dbIsProduction };
}

function printDryRunExecuteHint(safety, extraEnv = "") {
  // eslint-disable-next-line no-console
  console.log("\nDry-run complete. No changes were made.");
  // eslint-disable-next-line no-console
  console.log("To execute after backup + review:");
  const prefix = extraEnv ? `${extraEnv} ` : "";
  // eslint-disable-next-line no-console
  console.log(`  ${prefix}${safety.executeCommandExample}`);
}

module.exports = {
  envBool,
  getDatabaseTargetHint,
  resolveDestructiveScriptMode,
  assertMutatingScriptAllowed,
  printSafetyBanner,
  printDryRunExecuteHint,
};
