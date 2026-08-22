/**
 * Staging-only seed for the free onboarding article course.
 * Loads backend/.env.staging only — never production DATABASE_URL.
 *
 * Usage (from backend/):
 *   npm run db:seed-free-onboarding-article-course:staging
 */

const { spawnSync } = require("child_process");
const path = require("path");
const { loadStagingEnvOnly, logStagingTarget, BACKEND_ROOT } = require("./lib/loadStagingEnvOnly");

function exitOnError(err) {
  // eslint-disable-next-line no-console
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}

function main() {
  let gate;
  try {
    gate = loadStagingEnvOnly("staging free onboarding article course seed");
  } catch (err) {
    exitOnError(err);
    return;
  }

  logStagingTarget(gate.db);
  // eslint-disable-next-line no-console
  console.log("Seeding free onboarding course (idempotent)…\n");

  const scriptPath = path.join(__dirname, "seedFreelancerFreeOnboardingArticleCourse.js");
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: BACKEND_ROOT,
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

main();
