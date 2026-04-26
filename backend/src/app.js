const express = require("express");
const cors = require("cors");
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
const freelancerSubscriptionsRoutes = require("./routes/freelancerSubscriptionsRoutes");
const ordersRoutes = require("./routes/ordersRoutes");
const { notFoundMiddleware, errorMiddleware } = require("./middleware/errorMiddleware");

const app = express();

// Stripe webhooks require the raw body for signature verification (must run before express.json()).
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRoutes);

// Core middleware setup for parsing, CORS boundaries, and request logging.
app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(morgan("dev"));

// Static assets (e.g., category images) served from backend/images
app.use("/images", express.static(path.join(__dirname, "..", "images")));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Versioned API mounting keeps future domains modular (auth/orders/users/etc.).
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", categoriesRoutes);
app.use("/api", plansRoutes);
app.use("/api/admin", adminPlansRoutes);
app.use("/api/admin", adminSubscriptionsRoutes);
app.use("/api/admin", adminOrdersRoutes);
app.use("/api/freelancer", freelancerSubscriptionsRoutes);
app.use("/api", ordersRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
