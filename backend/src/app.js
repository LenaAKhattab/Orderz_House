const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const healthRoutes = require("./routes/healthRoutes");
const authRoutes = require("./routes/authRoutes");
const { notFoundMiddleware, errorMiddleware } = require("./middleware/errorMiddleware");

const app = express();

// Core middleware setup for parsing, CORS boundaries, and request logging.
app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(morgan("dev"));

// Versioned API mounting keeps future domains modular (auth/orders/users/etc.).
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
