const express = require("express");
const { db } = require("./lib/firebase");
const { syncAll } = require("./lib/sync");

const app = express();
const PORT = process.env.PORT || 3000;

app.post("/sync", async (req, res) => {
  try {
    const result = await syncAll();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/cookies", async (req, res) => {
  try {
    const snap = await db.collection("pool_cookies").where("is_active", "==", true).get();
    const cookies = snap.docs.map((d) => {
      const c = d.data();
      return {
        name: c.cookie_name,
        value: c.cookie_value,
        domain: c.cookie_domain || "",
        path: c.cookie_path || "/",
        secure: c.secure,
        httpOnly: c.http_only,
        sameSite: c.same_site || "Lax",
        source: c.source || "?",
      };
    });
    res.set("Content-Type", "text/plain");
    res.json(cookies);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// HTML page to view & copy cookies
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>Cookie Pool</title>
<meta charset="utf-8"/>
<style>
body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e0e0e0;padding:20px;max-width:900px;margin:0 auto}
pre{background:#111;border:1px solid #222;border-radius:8px;padding:14px;overflow:auto;font-size:12px;max-height:500px;white-space:pre-wrap;word-break:break-all}
.btn{padding:10px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin:10px 0}
.btn-blue{background:#2563eb;color:#fff}
.btn-green{background:#16a34a;color:#fff}
.count{color:#4ade80;font-size:18px;font-weight:bold}
</style></head><body>
<h1>Cookie Pool</h1>
<p>Total: <span class="count" id="count">0</span> active cookies</p>
<button class="btn btn-blue" onclick="load()">Refresh</button>
<button class="btn btn-green" onclick="copyAll()">Copy All (JSON)</button>
<p style="color:#555;font-size:12px;margin:6px 0">Paste into Chrome DevTools > Application > Cookies > right-click > paste</p>
<pre id="out">Loading...</pre>
<script>
async function load() {
  const r = await fetch('/cookies');
  const d = await r.json();
  document.getElementById('count').textContent = d.length;
  document.getElementById('out').textContent = JSON.stringify(d, null, 2);
}
async function copyAll() {
  const r = await fetch('/cookies');
  const d = await r.json();
  await navigator.clipboard.writeText(JSON.stringify(d, null, 2));
  alert('Copied ' + d.length + ' cookies!');
}
load();
</script></body></html>`);
});

app.get("/health", (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.listen(PORT, () => {
  console.log(`Sync server running on port ${PORT}`);
});
