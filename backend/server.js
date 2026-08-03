const path = require("node:path");
const dotenv = require("dotenv");

// Load `.env` next to this file — do not rely on `process.cwd()` (breaks if Node is started from repo root).
// Never use override:true: Docker/PM2/systemd production env (NODE_ENV, PORT, secrets) must win over a
// leftover backend/.env on the host. File values only fill variables that are not already set.
dotenv.config({ path: path.join(__dirname, ".env") });
const { validateEnv } = require("./src/config/env");
validateEnv();

const { registerProcessLifecycleLogging, logProcessEvent } = require("./src/config/processLifecycleLogging");
const { connectDB, pool } = require("./src/config/db");
const app = require("./src/app");
const { isInProcessAutomationIntervalEnabled } = require("./src/config/fakeOrdersAutomation");

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

let server = null;
let shuttingDown = false;

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logProcessEvent("graceful_shutdown_begin", { signal, host: HOST, port: PORT });

  const forceTimer = setTimeout(() => {
    logProcessEvent("graceful_shutdown_forced", { signal });
    process.exit(1);
  }, 10_000);
  forceTimer.unref?.();

  const closeServer = () =>
    new Promise((resolve) => {
      if (!server) return resolve();
      server.close((err) => {
        if (err) {
          logProcessEvent("server_close_error", { message: err.message });
        } else {
          logProcessEvent("server_closed", {});
        }
        resolve();
      });
    });

  closeServer()
    .then(() => pool.end())
    .then(() => {
      logProcessEvent("db_pool_ended", {});
      process.exit(0);
    })
    .catch((err) => {
      logProcessEvent("graceful_shutdown_failed", { message: err?.message || String(err) });
      process.exit(1);
    });
}

registerProcessLifecycleLogging({ onShutdown: gracefulShutdown });

const startServer = async () => {
  logProcessEvent("startup_begin", {
    node: process.version,
    nodeEnv: process.env.NODE_ENV || "unset",
    host: HOST,
    port: PORT,
  });

  await connectDB();
  logProcessEvent("startup_db_ready", {});

  const fakeOrdersService = require("./src/services/fakeOrdersService");

  try {
    await fakeOrdersService.syncLocalDevAutomationFlags();
  } catch (err) {
    console.error("[fakeOrders] syncLocalDevAutomationFlags failed:", err?.message || err);
  }

  const scheduler = fakeOrdersService.startFakeOrdersAutomationScheduler();
  if (scheduler.enabled) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        component: "fake_orders_automation",
        event: "interval_started",
        tickMs: scheduler.tickMs,
      }),
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        component: "fake_orders_automation",
        event: "interval_disabled",
        hint: "Set FAKE_ORDERS_AUTOMATION_ENABLED=true for in-process ticks (single instance only), or use POST /api/internal/fake-orders/automation-tick with FAKE_ORDERS_AUTOMATION_CRON_SECRET.",
      }),
    );
  }

  try {
    const health = await fakeOrdersService.getFakeOrdersAutomationHealth();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ component: "fake_orders_automation", event: "startup_health", health }));
    if (health.warnings?.length) {
      console.warn(`[fakeOrders] startup warnings: ${health.warnings.join(", ")}`);
    }
  } catch (err) {
    console.error("[fakeOrders] startup health check failed:", err?.message || err);
  }

  // Bootstrap guarantee: when training display is enabled but there are no visible fake orders, generate immediately.
  fakeOrdersService
    .ensureMinimumVisibleFakeOrders({ reason: "server_startup" })
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          component: "fake_orders_automation",
          event: "startup_ensure_min_visible_done",
          result: r,
        }),
      );
    })
    .catch((err) => {
      console.error("[fakeOrders] startup ensureMinimumVisibleFakeOrders failed:", err?.message || err);
    });

  if (!isInProcessAutomationIntervalEnabled()) {
    // eslint-disable-next-line no-console
    console.warn(
      "[fakeOrders] In-process automation ticks are disabled — scheduled 12h rotation requires FAKE_ORDERS_AUTOMATION_ENABLED=true or external cron hitting /api/internal/fake-orders/automation-tick.",
    );
  }

  try {
    const { startInstitutionalReleaseScheduler } = require("./src/config/institutionalReleaseScheduler");
    const instScheduler = startInstitutionalReleaseScheduler();
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        component: "institutional_release",
        event: instScheduler.enabled ? "interval_started" : "interval_disabled",
        tickMs: instScheduler.tickMs,
      }),
    );
  } catch (err) {
    console.error("[institutionalRelease] scheduler start failed:", err?.message || err);
  }

  server = app.listen(PORT, HOST, () => {
    logProcessEvent("startup_listening", { host: HOST, port: PORT });
    console.log(`Backend server listening on ${HOST}:${PORT}`);
  });
};

startServer().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      component: "process_lifecycle",
      event: "startServer_failed",
      message: err?.message || String(err),
      stack: err?.stack || null,
    }),
  );
  process.exit(1);
});
