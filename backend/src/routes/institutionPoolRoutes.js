/**
 * Authenticated institution-member private pool.
 */
const express = require("express");
const { requireAuth } = require("../middleware/rbacMiddleware");
const controller = require("../controllers/institutionalStorageController");
const institutionsService = require("../services/institutionsService");

const router = express.Router();

async function requireInstitutionMember(req, res, next) {
  try {
    const uid = Number(req.auth?.userId);
    const ids = await institutionsService.listActiveInstitutionIdsForUser(uid);
    if (!ids.length) {
      return res.status(403).json({
        success: false,
        code: "NOT_INSTITUTION_MEMBER",
        message: "هذه الصفحة متاحة لأعضاء المؤسسات فقط.",
      });
    }
    req.institutionIds = ids;
    return next();
  } catch (e) {
    return next(e);
  }
}

router.get("/membership", requireAuth, controller.getMyInstitutionMembership);
router.get("/orders/pool", requireAuth, requireInstitutionMember, controller.listInstitutionPool);

module.exports = router;
