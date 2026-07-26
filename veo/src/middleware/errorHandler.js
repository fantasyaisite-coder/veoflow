"use strict";

/**
 * middleware/errorHandler.js
 *
 * Central Express error-handling middleware.
 * Catches any error passed via next(err) or thrown inside an async route
 * (enabled by the "express-async-errors" package bootstrapped in index.js).
 */

/**
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
function errorHandler(err, req, res, _next) {
  console.error("[ErrorHandler]", err.stack || err.message);

  const statusCode = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred. Please check the server logs."
      : err.message;

  res.status(statusCode).json({
    status: "error",
    message,
  });
}

module.exports = errorHandler;
