/**
 * Start backend using .env.fazat-pilot.local with override (no secret logging).
 *   node scripts/startFazatPilotServer.js
 */
const path = require("node:path");
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.fazat-pilot.local"),
  override: true,
  quiet: true,
});
process.env.FAKE_ORDERS_AUTOMATION_ENABLED = "false";
process.env.INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED = "false";
// eslint-disable-next-line no-console
console.log(
  JSON.stringify({
    starting: true,
    fazatEnabled: process.env.FAZAT_INTEGRATION_ENABLED,
    pilotIds: process.env.FAZAT_PILOT_FREELANCER_IDS,
    fakeAutomation: process.env.FAKE_ORDERS_AUTOMATION_ENABLED,
    port: process.env.PORT || 5000,
  }),
);
require("../server.js");
