const path = require("node:path");
const dotenv = require("dotenv");

// Load `.env` next to this file — do not rely on `process.cwd()` (breaks if Node is started from repo root).
dotenv.config({ path: path.join(__dirname, ".env"), override: true });
const { validateEnv } = require("./src/config/env");
validateEnv();
const { registerProcessLifecycleLogging } = require("./src/config/processLifecycleLogging");
registerProcessLifecycleLogging();

const { connectDB } = require("./src/config/db");
const app = require("./src/app");
const { isInProcessAutomationIntervalEnabled } = require("./src/config/fakeOrdersAutomation");
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

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

  app.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
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
