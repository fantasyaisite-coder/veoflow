"use strict";

/**
 * routes/testRunner.js
 *
 * Express router that exposes the POST /initialize-test endpoint.
 *
 * Request body (JSON):
 *   {
 *     "sessionId": "abc123"   // optional — omit to auto-select first active session
 *   }
 *
 * Success response (200):
 *   {
 *     "status": "success",
 *     "report": {
 *       "sessionId": "abc123",
 *       "sessionLabel": "qa-session-1",
 *       "targetUrl": "https://app.example.com/dashboard",
 *       "finalUrl": "https://app.example.com/dashboard",
 *       "pageTitle": "Dashboard — My App",
 *       "cookiesApplied": 3,
 *       "httpStatus": 200,
 *       "durationMs": 2847
 *     }
 *   }
 *
 * Error response (4xx / 5xx):
 *   {
 *     "status": "error",
 *     "message": "<human-readable description>"
 *   }
 */

const { Router } = require("express");
const { fetchSessionTokens } = require("../services/firestore");
const { initializeTestSession } = require("../services/browser");

const router = Router();

// ─── POST /initialize-test ────────────────────────────────────────────────────

router.post("/initialize-test", async (req, res) => {
  const requestedSessionId = req.body?.sessionId ?? null;

  console.info(
    `[Route] POST /initialize-test — sessionId: ${requestedSessionId ?? "(auto-select)"}`
  );

  // ── Step 1: Retrieve session tokens from Firestore ────────────────────────
  let sessionData;
  try {
    sessionData = await fetchSessionTokens(requestedSessionId);
  } catch (err) {
    console.error("[Route] Firestore session retrieval failed:", err.message);
    return res.status(502).json({
      status: "error",
      message: `Failed to retrieve session from Firestore: ${err.message}`,
    });
  }

  // ── Steps 2–5: Launch browser, apply cookies, navigate, collect report ────
  let report;
  try {
    report = await initializeTestSession(sessionData);
  } catch (err) {
    console.error("[Route] Browser test initialisation failed:", err.message);
    return res.status(500).json({
      status: "error",
      message: `Browser initialisation failed: ${err.message}`,
    });
  }

  return res.status(200).json({
    status: "success",
    report,
  });
});

module.exports = router;
