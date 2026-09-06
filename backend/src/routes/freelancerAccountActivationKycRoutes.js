const express = require("express");
const { requireAuth, requireFreelancer } = require("../middleware/rbacMiddleware");
const {
  uploadAccountActivationKyc,
  handleKycUploadErrors,
} = require("../middleware/accountActivationKycUploadMiddleware");
const controller = require("../controllers/freelancerAccountActivationKycController");

const router = express.Router();
router.use(requireAuth, requireFreelancer);

router.get("/account-activation", controller.getMyAccountActivation);
router.post(
  "/account-activation/submit",
  uploadAccountActivationKyc.fields([
    { name: "idFront", maxCount: 1 },
    { name: "idBack", maxCount: 1 },
  ]),
  handleKycUploadErrors,
  controller.submitMyAccountActivation,
);

module.exports = router;
