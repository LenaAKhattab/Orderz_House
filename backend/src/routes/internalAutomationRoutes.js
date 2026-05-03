/**
 * Optional trigger for fake-orders automation when in-process setInterval is disabled
 * (e.g. multi-instance: run crons/pg_cron against one URL with the shared secret).
 */
const express = require("express");
const fakeOrdersService = require("../services/fakeOrdersService");
const { getAutomationCronSecret } = require("../config/fakeOrdersAutomation");

const router = express.Router();

router.post("/fake-orders/automation-tick", async (req, res, next) => {
  const secret = getAutomationCronSecret();
  if (!secret) {
    return res.status(404).end();
  }
  const hdr = req.headers["x-fake-orders-automation-secret"];
  if (typeof hdr !== "string" || hdr !== secret) {
    return res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "غير مصرح.",
    });
  }
  try {
    await fakeOrdersService.runAutomationTick();
    return res.status(200).json({ success: true });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
