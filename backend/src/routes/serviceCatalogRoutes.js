/**
 * Smart Orders S2 — service catalog routes.
 *  - publicRouter (mounted at /api): read-only catalog of active, client-visible services.
 *  - adminRouter  (mounted at /api/admin): order-creation catalog (incl. admin-only services) and catalog
 *    management (service_catalog permission; super admin always).
 */
const express = require("express");
const { param } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");
const catalog = require("../services/serviceCatalogService");

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

function parseFieldTypes(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function sendCatalog(req, res, data) {
  const etag = `W/"cat-${data.catalogVersion}"`;
  res.set("ETag", etag);
  res.set("Cache-Control", "private, max-age=60");
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  return res.status(200).json({ success: true, data });
}

const publicRouter = express.Router();
publicRouter.get(
  "/catalog/services",
  wrap(async (req, res) => {
    const data = await catalog.listCatalog({ audience: "client", fieldTypes: parseFieldTypes(req.query.fieldTypes) });
    sendCatalog(req, res, data);
  }),
);

const adminRouter = express.Router();
const staff = [requireAuth, requireAnyRole(["super_admin", "admin"])];
const createOrderPerm = requirePermission("dashboard.admin.create_order");
const catalogPerm = requirePermission("dashboard.admin.service_catalog");
const idParam = [param("id").isInt({ min: 1 }).withMessage("Invalid id."), validateRequest];

adminRouter.get(
  "/service-catalog/order-options",
  ...staff,
  createOrderPerm,
  wrap(async (req, res) => sendCatalog(req, res, await catalog.listCatalog({ audience: "admin" }))),
);
adminRouter.get(
  "/service-catalog",
  ...staff,
  catalogPerm,
  wrap(async (req, res) => res.status(200).json({ success: true, data: await catalog.listAdminServices() })),
);
adminRouter.get(
  "/service-catalog/:id",
  ...staff,
  catalogPerm,
  ...idParam,
  wrap(async (req, res) => res.status(200).json({ success: true, data: await catalog.getAdminService(req.params.id) })),
);
adminRouter.post(
  "/service-catalog",
  ...staff,
  catalogPerm,
  adminWriteLimiter,
  wrap(async (req, res) =>
    res.status(201).json({
      success: true,
      data: await catalog.createService({ definition: req.body?.definition, actorUserId: req.auth.userId }),
    }),
  ),
);
adminRouter.put(
  "/service-catalog/:id",
  ...staff,
  catalogPerm,
  adminWriteLimiter,
  ...idParam,
  wrap(async (req, res) =>
    res.status(200).json({
      success: true,
      data: await catalog.updateService({
        id: req.params.id,
        definition: req.body?.definition,
        changeNote: req.body?.changeNote,
        actorUserId: req.auth.userId,
      }),
    }),
  ),
);
adminRouter.patch(
  "/service-catalog/:id/active",
  ...staff,
  catalogPerm,
  adminWriteLimiter,
  ...idParam,
  wrap(async (req, res) =>
    res.status(200).json({
      success: true,
      data: await catalog.setServiceActive({ id: req.params.id, active: req.body?.active === true, actorUserId: req.auth.userId }),
    }),
  ),
);

module.exports = { publicRouter, adminRouter };
