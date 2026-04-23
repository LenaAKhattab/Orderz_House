const ordersService = require("../services/ordersService");
const adminUsersService = require("../services/adminUsersService");

function parsePreferredSkills(raw) {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    // Accept comma-separated as a fallback for simpler clients
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
}

const createInternalOrder = async (req, res, next) => {
  try {
    const actorRole = req.user?.role;
    let extraCategoryIds = [];
    try {
      const raw = req.body.extraCategoryIds;
      if (raw === undefined || raw === null || raw === "") {
        extraCategoryIds = [];
      } else if (Array.isArray(raw)) {
        extraCategoryIds = raw;
      } else {
        const parsed = JSON.parse(String(raw));
        extraCategoryIds = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      extraCategoryIds = [];
    }
    let extraCategoryDetails = {};
    try {
      const raw = req.body.extraCategoryDetails;
      if (raw === undefined || raw === null || raw === "") {
        extraCategoryDetails = {};
      } else if (typeof raw === "object" && !Array.isArray(raw)) {
        extraCategoryDetails = raw;
      } else {
        const parsed = JSON.parse(String(raw));
        extraCategoryDetails = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      }
    } catch {
      extraCategoryDetails = {};
    }
    const payload = {
      orderCode: req.body.orderCode,
      title: req.body.title,
      description: req.body.description,
      categoryId: req.body.categoryId,
      subcategoryId: req.body.subcategoryId || null,
      subSubcategoryId: req.body.subSubcategoryId || null,
      projectType: req.body.projectType,
      currencyCode: req.body.projectType === "bidding" ? null : (req.body.currencyCode || null),
      budget: req.body.projectType === "bidding" ? null : req.body.budget,
      durationValue: req.body.durationValue,
      durationUnit: req.body.durationUnit,
      preferredSkills: parsePreferredSkills(req.body.preferredSkills),
      assignedFreelancerId: req.body.assignedFreelancerId || null,
      archive: String(req.body.archive || "").toLowerCase() === "true",
      extraCategoryIds,
      extraCategoryDetails,
    };

    const order = await ordersService.createInternalOrder({
      actorUserId: req.auth.userId,
      actorRole,
      payload,
      uploadedFiles: req.files || [],
    });
    return res.status(201).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const listInternalOrders = async (req, res, next) => {
  try {
    const limit = req.query.limit;
    const offset = req.query.offset;
    const orders = await ordersService.listAdminInternalOrders({ limit, offset });
    return res.status(200).json({ success: true, data: { orders } });
  } catch (err) {
    return next(err);
  }
};

const searchFreelancers = async (req, res, next) => {
  try {
    const freelancers = await adminUsersService.searchFreelancers({ q: req.query.q, limit: req.query.limit });
    return res.status(200).json({ success: true, data: { freelancers } });
  } catch (err) {
    return next(err);
  }
};

const activateArchivedOrder = async (req, res, next) => {
  try {
    const actorRole = req.user?.role;
    if (actorRole !== "admin" && actorRole !== "super_admin") {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
    const order = await ordersService.activateArchivedInternalOrder({ orderId: req.params.id });
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const acceptTakenOrder = async (req, res, next) => {
  try {
    const actorRole = req.user?.role;
    if (actorRole !== "admin" && actorRole !== "super_admin") {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
    const order = await ordersService.approvePoolClaimAdmin({ actorUserId: req.auth.userId, orderId: req.params.id, claimId: req.body.claimId });
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const listOrderClaims = async (req, res, next) => {
  try {
    const actorRole = req.user?.role;
    if (actorRole !== "admin" && actorRole !== "super_admin") {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
    const claims = await ordersService.listOrderClaimsAdmin({ orderId: req.params.id });
    return res.status(200).json({ success: true, data: { claims } });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createInternalOrder,
  listInternalOrders,
  searchFreelancers,
  activateArchivedOrder,
  acceptTakenOrder,
  listOrderClaims,
};

