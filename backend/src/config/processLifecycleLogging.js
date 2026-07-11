/**
 * Process-level diagnostics for local QA / ops (QA-OPS-1).
 * Logs lifecycle signals — does not change business logic.
 */

function logProcessEvent(event, extra = {}) {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      component: "process_lifecycle",
      event,
      pid: process.pid,
      ts: new Date().toISOString(),
      ...extra,
    }),
  );
}

function formatError(err) {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

/**
 * Register once at server startup. Safe for local + production (logging only).
 */
function registerProcessLifecycleLogging() {
  if (registerProcessLifecycleLogging._registered) return;
  registerProcessLifecycleLogging._registered = true;

  process.on("unhandledRejection", (reason) => {
    logProcessEvent("unhandledRejection", formatError(reason));
  });

  process.on("uncaughtException", (err) => {
    logProcessEvent("uncaughtException", formatError(err));
    process.exit(1);
  });

  process.on("SIGTERM", () => {
    logProcessEvent("SIGTERM", { hint: "external shutdown (orchestrator, taskkill, host sleep)" });
  });

  process.on("SIGINT", () => {
    logProcessEvent("SIGINT", { hint: "Ctrl+C or terminal interrupt" });
  });
}

module.exports = {
  registerProcessLifecycleLogging,
  logProcessEvent,
};
