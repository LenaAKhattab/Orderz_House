const express = require("express");
const specialOfferPackageController = require("../controllers/specialOfferPackageController");

const router = express.Router();

router.get("/special-offer-package", specialOfferPackageController.getPublic);

module.exports = router;
