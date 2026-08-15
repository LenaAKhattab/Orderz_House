const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const path = require("node:path");
const stripeWebhookRoutes = require("./routes/stripeWebhookRoutes");
const healthRoutes = require("./routes/healthRoutes");
const authRoutes = require("./routes/authRoutes");
const categoriesRoutes = require("./routes/categoriesRoutes");
const plansRoutes = require("./routes/plansRoutes");
const planPagesRoutes = require("./routes/planPagesRoutes");
const marketplaceMembershipPlansRoutes = require("./routes/marketplaceMembershipPlansRoutes");
const defaultPlanCatalogRoutes = require("./routes/defaultPlanCatalogRoutes");
const superAdminDefaultPlanCatalogRoutes = require("./routes/superAdminDefaultPlanCatalogRoutes");
const superAdminMarketplaceMembershipPlansRoutes = require("./routes/superAdminMarketplaceMembershipPlansRoutes");
const superAdminMarketplaceEconomySettingsRoutes = require("./routes/superAdminMarketplaceEconomySettingsRoutes");
const superAdminMarketplaceArticlesRoutes = require("./routes/superAdminMarketplaceArticlesRoutes");
const superAdminMarketplaceArticleApplicationsRoutes = require("./routes/superAdminMarketplaceArticleApplicationsRoutes");
const marketplaceArticlesRoutes = require("./routes/marketplaceArticlesRoutes");
const freelancerMarketplaceArticleApplicationsRoutes = require("./routes/freelancerMarketplaceArticleApplicationsRoutes");
const adminPlanPagesRoutes = require("./routes/adminPlanPagesRoutes");
const adminPlansRoutes = require("./routes/adminPlansRoutes");
const adminSubscriptionsRoutes = require("./routes/adminSubscriptionsRoutes");
const adminOrdersRoutes = require("./routes/adminOrdersRoutes");
const adminCoursesRoutes = require("./routes/adminCoursesRoutes");
const adminFakeOrdersRoutes = require("./routes/adminFakeOrdersRoutes");
const institutionalStorageRoutes = require("./routes/institutionalStorageRoutes");
const institutionPoolRoutes = require("./routes/institutionPoolRoutes");
const adminAdsRoutes = require("./routes/adminAdsRoutes");
const freelancerSubscriptionsRoutes = require("./routes/freelancerSubscriptionsRoutes");
const freelancerMarketplaceMembershipRoutes = require("./routes/freelancerMarketplaceMembershipRoutes");
const freelancerWorkTokenWalletRoutes = require("./routes/freelancerWorkTokenWalletRoutes");
const freelancerBidCreditsRoutes = require("./routes/freelancerBidCreditsRoutes");
const freelancerPriorityAuctionRoutes = require("./routes/freelancerPriorityAuctionRoutes");
const freelancerEliteDirectOrdersRoutes = require("./routes/freelancerEliteDirectOrdersRoutes");
const clientEliteDirectOrdersRoutes = require("./routes/clientEliteDirectOrdersRoutes");
const freelancerCoursesRoutes = require("./routes/freelancerCoursesRoutes");
const freelancerDashboardRoutes = require("./routes/freelancerDashboardRoutes");
const superAdminMarketplaceMembershipsRoutes = require("./routes/superAdminMarketplaceMembershipsRoutes");
const superAdminWorkTokenWalletRoutes = require("./routes/superAdminWorkTokenWalletRoutes");
const superAdminBidCreditsRoutes = require("./routes/superAdminBidCreditsRoutes");
const superAdminBidDistributionPoolsRoutes = require("./routes/superAdminBidDistributionPoolsRoutes");
const superAdminPriorityAuctionRoutes = require("./routes/superAdminPriorityAuctionRoutes");
const superAdminFairDistributionRoutes = require("./routes/superAdminFairDistributionRoutes");
const superAdminEliteDirectOrdersRoutes = require("./routes/superAdminEliteDirectOrdersRoutes");
const ordersRoutes = require("./routes/ordersRoutes");
const notificationsRoutes = require("./routes/notificationsRoutes");
const deviceTokensRoutes = require("./routes/deviceTokensRoutes");
const profileRoutes = require("./routes/profileRoutes");
const portalFinancialClaimsRoutes = require("./routes/portalFinancialClaimsRoutes");
const superAdminFinancialCenterRoutes = require("./routes/superAdminFinancialCenterRoutes");
const financialUserRoutes = require("./routes/financialUserRoutes");
const superAdminFinancialClaimsRoutes = require("./routes/superAdminFinancialClaimsRoutes");
const superAdminAnalyticsRoutes = require("./routes/superAdminAnalyticsRoutes");
const superAdminAdminsRoutes = require("./routes/superAdminAdminsRoutes");
const rateLimitExemptionsRoutes = require("./routes/rateLimitExemptionsRoutes");
const superAdminFeedbackRoutes = require("./routes/superAdminFeedbackRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const superAdminWebsiteRoutes = require("./routes/superAdminWebsiteRoutes");
const mobilePaymentReturnRoutes = require("./routes/mobilePaymentReturnRoutes");
const publicRoutes = require("./routes/publicRoutes");
const translationRoutes = require("./routes/translationRoutes");
const internalAutomationRoutes = require("./routes/internalAutomationRoutes");
const fazatIntegrationRoutes = require("./routes/fazatIntegrationRoutes");
const { adminPantryRouter, freelancerPantryRouter } = require("./routes/pantryRoutes");
const { notFoundMiddleware, errorMiddleware } = require("./middleware/errorMiddleware");
const { requestTimingMiddleware } = require("./middleware/requestTimingMiddleware");
const { applySecurityHeaders } = require("./middleware/securityHeaders");
const { createApiGeneralLimiter } = require("./middleware/apiRateLimiter");
const { originGuardMiddleware } = require("./middleware/originGuardMiddleware");
const { isProduction } = require("./config/env");
const { parseAllowedClientOrigins } = require("./config/clientUrl");

const app = express();

function parseAllowedOrigins() {
  return parseAllowedClientOrigins();
}

/** Non-prod: allow any localhost / 127.0.0.1 origin so Vite port drift and OS-level CLIENT_URL do not break CORS. */
function isDevLocalOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

// Behind nginx/Render/Fly/Cloudflare/etc., trust proxy so req.ip uses X-Forwarded-For (rate limits + logs).
// Set TRUST_PROXY=0 only when the API is reached directly without a reverse proxy.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === "0" || trustProxy === "false") {
  /* direct connection — do not trust X-Forwarded-For */
} else if (trustProxy === "1" || trustProxy === "true") {
  app.set("trust proxy", 1);
} else if (trustProxy && /^\d+$/.test(String(trustProxy))) {
  app.set("trust proxy", Number(trustProxy));
} else if (isProduction()) {
  app.set("trust proxy", 1);
}

// Stripe webhooks require the raw body for signature verification (must run before express.json()).
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRoutes);

// FAZ3AT partner API: capture raw body for HMAC before the global JSON parser.
app.use(
  "/api/integrations/fazat",
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || "");
    },
  }),
  fazatIntegrationRoutes,
);

applySecurityHeaders(app);

// Core middleware setup for parsing, CORS boundaries, and request logging.
app.use(
  cors({
    origin(origin, callback) {
      const allowed = parseAllowedOrigins();
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      if (!isProduction() && isDevLocalOrigin(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));
app.use("/api", createApiGeneralLimiter());
app.use("/api", originGuardMiddleware);
app.use("/api", requestTimingMiddleware);

// Static assets (e.g., category images) served from backend/images
app.use("/images", express.static(path.join(__dirname, "..", "images")));
// Order uploads live under backend/uploads — never expose via public static; use authenticated download routes only.

// Versioned API mounting keeps future domains modular (auth/orders/users/etc.).
app.use("/api", healthRoutes);
app.use("/api", publicRoutes);
app.use("/api", translationRoutes);
// Optional: automation tick for external cron (see FAKE_ORDERS_AUTOMATION_CRON_SECRET).
app.use("/api/internal", internalAutomationRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api", categoriesRoutes);
app.use("/api", plansRoutes);
app.use("/api", planPagesRoutes);
app.use("/api", marketplaceMembershipPlansRoutes);
app.use("/api", defaultPlanCatalogRoutes);
app.use("/api/admin", adminPlansRoutes);
app.use("/api/admin", adminPlanPagesRoutes);
app.use("/api/admin", adminSubscriptionsRoutes);
app.use("/api/admin", adminOrdersRoutes);
app.use("/api/admin", adminCoursesRoutes);
app.use("/api/admin", adminFakeOrdersRoutes);
app.use("/api/admin", adminPantryRouter);
app.use("/api/admin", institutionalStorageRoutes);
app.use("/api/institution", institutionPoolRoutes);
app.use("/api/admin", adminAdsRoutes);
app.use("/api/freelancer", freelancerSubscriptionsRoutes);
app.use("/api/freelancer", freelancerMarketplaceMembershipRoutes);
app.use("/api/freelancer", freelancerWorkTokenWalletRoutes); // LEGACY_DEPRECATED_WORK_TOKEN_MODEL (read retained)
app.use("/api/freelancer", freelancerBidCreditsRoutes);
app.use("/api/freelancer", freelancerMarketplaceArticleApplicationsRoutes);
app.use("/api/freelancer", freelancerPriorityAuctionRoutes);
app.use("/api/freelancer", freelancerEliteDirectOrdersRoutes);
app.use("/api/freelancer", freelancerCoursesRoutes);
app.use("/api/freelancer", freelancerDashboardRoutes);
app.use("/api/freelancer", freelancerPantryRouter);
app.use("/api/portal", portalFinancialClaimsRoutes);
app.use("/api/superadmin/financial-center", superAdminFinancialCenterRoutes);
app.use("/api/financial-user", financialUserRoutes);
app.use("/api/super-admin", superAdminFinancialClaimsRoutes);
app.use("/api/super-admin", superAdminAdminsRoutes);
app.use("/api/super-admin", superAdminWebsiteRoutes);
app.use("/api/super-admin", rateLimitExemptionsRoutes);
app.use("/api/super-admin", superAdminFeedbackRoutes);
app.use("/api/super-admin", superAdminMarketplaceMembershipPlansRoutes);
app.use("/api/super-admin", superAdminDefaultPlanCatalogRoutes);
app.use("/api/super-admin", superAdminMarketplaceEconomySettingsRoutes);
app.use("/api/super-admin", superAdminMarketplaceArticlesRoutes);
app.use("/api/super-admin", superAdminMarketplaceArticleApplicationsRoutes);
app.use("/api", marketplaceArticlesRoutes);
app.use("/api/super-admin", superAdminMarketplaceMembershipsRoutes);
app.use("/api/super-admin", superAdminWorkTokenWalletRoutes); // LEGACY_DEPRECATED_WORK_TOKEN_MODEL
app.use("/api/super-admin", superAdminBidCreditsRoutes);
app.use("/api/super-admin", superAdminBidDistributionPoolsRoutes);
app.use("/api/super-admin", superAdminPriorityAuctionRoutes);
app.use("/api/super-admin", superAdminFairDistributionRoutes);
app.use("/api/super-admin", superAdminEliteDirectOrdersRoutes);
app.use("/api", feedbackRoutes);
app.use("/api/superadmin", superAdminAnalyticsRoutes);
app.use("/api", clientEliteDirectOrdersRoutes);
app.use("/api", ordersRoutes);
app.use("/api", notificationsRoutes);
app.use("/api", deviceTokensRoutes);

// Mobile Stripe return bridge (HTTPS → custom scheme). Not under /api — public GET for Stripe redirect.
app.use(mobilePaymentReturnRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
