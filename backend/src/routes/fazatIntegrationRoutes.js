const express = require("express");
const { requireFazatPartnerAuth } = require("../middleware/fazatIntegrationAuth");
const controller = require("../controllers/fazatIntegrationController");

const router = express.Router();

// All FAZAT integration routes are backend-to-backend only (HMAC + partner key).
router.use(requireFazatPartnerAuth);

router.get("/freelancers", controller.listFreelancers);
router.patch("/freelancers/:freelancerId/rank", controller.patchFreelancerRank);

router.post("/orders", controller.createOrder);
router.get("/orders/:orderId", controller.getOrder);
router.post("/orders/:orderId/messages", controller.postMessage);
router.get("/orders/:orderId/messages", controller.listMessages);
router.get("/orders/:orderId/deliveries", controller.listDeliveries);
router.post("/orders/:orderId/revision", controller.requestRevision);

module.exports = router;
