"use strict";

/**
 * routes/admin.js
 *
 * Express routes for the Admin Control Panel & Cookie Sync functionality.
 */

const { Router } = require("express");
const { db } = require("../services/firestore");
const { launchFlow } = require("../services/flow");
const { syncAll, syncUncodee, syncFlowbunny } = require("../services/sync");
const config = require("../config");

const router = Router();

// ── GET /flow ──────────────────────────────────────────────
router.get("/flow", async (req, res) => {
  try {
    const result = await launchFlow();
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(result.html);
  } catch (err) {
    res.status(500).send(`<h2>Flow error</h2><pre>${err.message}</pre>`);
  }
});

// ── Admin API ──────────────────────────────────────────────
router.post("/api/login", async (req, res) => {
  const { password } = req.body;
  const snap = await db.collection("admin_settings").doc("config").get();
  const cfg = snap.data() || {};
  res.json({ ok: password === (cfg.server_password || "HNM@3322k") });
});

router.get("/api/settings", async (req, res) => {
  const snap = await db.collection("admin_settings").doc("config").get();
  const { server_password, ...safe } = snap.data() || {};
  res.json({ ok: true, settings: safe });
});

router.post("/api/settings", async (req, res) => {
  const allowed = [
    "server_password",
    "target_url",
    "uncodee_email",
    "uncodee_password",
    "flowbunny_email",
    "flowbunny_password",
    "flowbunny_device_id",
    "default_cookie_source",
  ];
  const update = {};
  for (const [k, v] of Object.entries(req.body)) {
    if (allowed.includes(k)) update[k] = v;
  }
  await db.collection("admin_settings").doc("config").set(update, { merge: true });
  res.json({ ok: true });
});

router.post("/api/sync", async (req, res) => {
  const source = req.body.source || "all";
  res.json(
    source === "uncodee"
      ? await syncUncodee()
      : source === "flowbunny"
      ? await syncFlowbunny()
      : await syncAll()
  );
});

router.get("/api/cookies", async (req, res) => {
  const snap = await db.collection("pool_cookies").where("is_active", "==", true).get();
  res.json({
    ok: true,
    count: snap.size,
    cookies: snap.docs.map((d) => ({
      id: d.id,
      name: d.data().cookie_name,
      domain: d.data().cookie_domain,
      source: d.data().source || "?",
      synced_at: d.data().synced_at,
    })),
  });
});

router.get("/api/logs", async (req, res) => {
  const snap = await db.collection("sync_logs").orderBy("at", "desc").limit(50).get();
  res.json({ ok: true, logs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.get("/api/status", async (req, res) => {
  const c = await db.collection("pool_cookies").where("is_active", "==", true).get();
  res.json({
    ok: true,
    pool_count: c.size,
    uptime: process.uptime(),
    chrome: config.chromeExecutable,
    pid: process.pid,
  });
});

module.exports = router;
