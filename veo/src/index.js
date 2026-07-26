"use strict";

/**
 * src/index.js
 *
 * Application entry point.
 */

require("express-async-errors");

const express = require("express");
const path = require("path");
const morgan = require("morgan");
const helmet = require("helmet");
const config = require("./config");
const testRunnerRouter = require("./routes/testRunner");
const adminRouter = require("./routes/admin");
const errorHandler = require("./middleware/errorHandler");
const { closeBrowser } = require("./services/browser");
const { closeFlowBrowser } = require("./services/flow");

const app = express();

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── HTTP request logging ─────────────────────────────────────────────────────
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

// ── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Static admin UI ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /health
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ui-test-runner",
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
  });
});

/**
 * Admin Panel & Sync API routes (/flow, /api/*)
 */
app.use("/", adminRouter);

/**
 * Automated UI Test Runner route (POST /initialize-test)
 */
app.use("/", testRunnerRouter);

// ── Catch-all static index fallback for SPA routes ────────────────────────────
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ─── Server startup ───────────────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  console.info("─────────────────────────────────────────────────────");
  console.info(" UI Test Runner & Admin Control Panel | Started");
  console.info(`  Port     : ${config.port}`);
  console.info(`  Env      : ${config.nodeEnv}`);
  console.info(`  Chrome   : ${config.chromeExecutable}`);
  console.info(`  Target   : ${config.adminDefinedUrl}`);
  console.info(`  Firebase : ${config.firebaseWebConfig.projectId}`);
  console.info("─────────────────────────────────────────────────────");
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.info(`\n[Shutdown] Received ${signal} — shutting down gracefully…`);

  server.close(async () => {
    console.info("[Shutdown] HTTP server closed.");
    await closeBrowser();
    await closeFlowBrowser();
    console.info("[Shutdown] Done. Exiting.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[Shutdown] Graceful shutdown timed out — forcing exit.");
    process.exit(1);
  }, 15_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled promise rejection:", reason);
});

module.exports = app;
