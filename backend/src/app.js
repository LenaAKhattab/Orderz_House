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
const adminPlansRoutes = require("./routes/adminPlansRoutes");
const adminSubscriptionsRoutes = require("./routes/adminSubscriptionsRoutes");
const adminOrdersRoutes = require("./routes/adminOrdersRoutes");
const adminCoursesRoutes = require("./routes/adminCoursesRoutes");
const adminFakeOrdersRoutes = require("./routes/adminFakeOrdersRoutes");
const freelancerSubscriptionsRoutes = require("./routes/freelancerSubscriptionsRoutes");
const freelancerCoursesRoutes = require("./routes/freelancerCoursesRoutes");
const ordersRoutes = require("./routes/ordersRoutes");
const notificationsRoutes = require("./routes/notificationsRoutes");
const profileRoutes = require("./routes/profileRoutes");
const portalFinancialClaimsRoutes = require("./routes/portalFinancialClaimsRoutes");
const superAdminFinancialClaimsRoutes = require("./routes/superAdminFinancialClaimsRoutes");
const internalAutomationRoutes = require("./routes/internalAutomationRoutes");
const { notFoundMiddleware, errorMiddleware } = require("./middleware/errorMiddleware");
const { isProduction } = require("./config/env");

const app = express();

function parseAllowedOrigins() {
  const raw = process.env.CLIENT_URL || "http://localhost:5173";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

// Behind nginx/Render/Fly/etc., set TRUST_PROXY=1 so req.ip uses X-Forwarded-For (rate limits + logs).
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === "1" || trustProxy === "true") {
  app.set("trust proxy", 1);
} else if (trustProxy && /^\d+$/.test(String(trustProxy))) {
  app.set("trust proxy", Number(trustProxy));
}

// Stripe webhooks require the raw body for signature verification (must run before express.json()).
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRoutes);

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

// Static assets (e.g., category images) served from backend/images
app.use("/images", express.static(path.join(__dirname, "..", "images")));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Versioned API mounting keeps future domains modular (auth/orders/users/etc.).
app.use("/api", healthRoutes);
// Optional: automation tick for external cron (see FAKE_ORDERS_AUTOMATION_CRON_SECRET).
app.use("/api/internal", internalAutomationRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api", categoriesRoutes);
app.use("/api", plansRoutes);
app.use("/api/admin", adminPlansRoutes);
app.use("/api/admin", adminSubscriptionsRoutes);
app.use("/api/admin", adminOrdersRoutes);
app.use("/api/admin", adminCoursesRoutes);
app.use("/api/admin", adminFakeOrdersRoutes);
app.use("/api/freelancer", freelancerSubscriptionsRoutes);
app.use("/api/freelancer", freelancerCoursesRoutes);
app.use("/api/portal", portalFinancialClaimsRoutes);
app.use("/api/super-admin", superAdminFinancialClaimsRoutes);
app.use("/api", ordersRoutes);
app.use("/api", notificationsRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
