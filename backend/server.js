const path = require("node:path");
const dotenv = require("dotenv");

// Load `.env` next to this file — do not rely on `process.cwd()` (breaks if Node is started from repo root).
dotenv.config({ path: path.join(__dirname, ".env"), override: true });
const { validateEnv } = require("./src/config/env");
validateEnv();

const { connectDB } = require("./src/config/db");
const app = require("./src/app");
const {
  isInProcessAutomationIntervalEnabled,
  getFakeOrdersTickMs,
} = require("./src/config/fakeOrdersAutomation");
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  const fakeOrdersService = require("./src/services/fakeOrdersService");
  const tickMs = getFakeOrdersTickMs();
  if (isInProcessAutomationIntervalEnabled()) {
    setInterval(() => {
      fakeOrdersService.runAutomationTick().catch((err) => {
        console.error("[fakeOrders] automation tick failed:", err?.message || err);
      });
    }, tickMs);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        component: "fake_orders_automation",
        event: "interval_started",
        tickMs,
      }),
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        component: "fake_orders_automation",
        event: "interval_disabled",
        hint: "Set FAKE_ORDERS_AUTOMATION_ENABLED=true for in-process ticks, or use POST /api/internal/fake-orders/automation-tick with FAKE_ORDERS_AUTOMATION_CRON_SECRET.",
      }),
    );
  }

  app.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
  });
};

startServer();
