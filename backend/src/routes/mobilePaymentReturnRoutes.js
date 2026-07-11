const express = require("express");
const { mobilePaymentReturnPage } = require("../controllers/mobilePaymentReturnController");

const router = express.Router();

router.get("/mobile/payment-return", mobilePaymentReturnPage);

module.exports = router;
