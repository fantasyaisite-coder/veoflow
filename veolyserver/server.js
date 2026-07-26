const express = require("express");
const { db } = require("./lib/firebase");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

// List all active cookies
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
        synced_at: c.synced_at || null,
      };
    });
    res.json({ ok: true, count: cookies.length, cookies });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Upload/replace cookies (sync endpoint)
app.post("/cookies", async (req, res) => {
  try {
    const { cookies, source } = req.body;
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({ ok: false, error: "Send { cookies: [...], source: '...' }" });
    }

    // Clear old cookies for this source
    const src = source || "manual";
    const existing = await db.collection("pool_cookies").where("source", "==", src).get();
    const batch = db.batch();
    existing.docs.forEach((d) => batch.delete(d.ref));

    // Store new cookies
    const now = new Date().toISOString();
    for (const c of cookies) {
      const doc = db.collection("pool_cookies").doc();
      batch.set(doc, {
        cookie_name: c.name,
        cookie_value: c.value,
        cookie_domain: c.domain || (c.name.startsWith("__Host-") ? "" : "labs.google"),
        cookie_path: c.path || "/",
        secure: c.secure !== false,
        http_only: c.httpOnly || false,
        same_site: c.sameSite || "Lax",
        source: src,
        is_active: true,
        synced_at: now,
      });
    }
    await batch.commit();

    res.json({ ok: true, count: cookies.length, source: src, at: now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Simple HTML page to view & copy cookies
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>Cookie Pool</title>
<meta charset="utf-8"/>
<style>
body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e0e0e0;padding:20px;max-width:900px;margin:0 auto}
pre{background:#111;border:1px solid #222;border-radius:8px;padding:14px;overflow:auto;font-size:12px;max-height:500px;white-space:pre-wrap;word-break:break-all}
.btn{padding:10px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin:10px 5px 10px 0}
.btn-blue{background:#2563eb;color:#fff}
.btn-green{background:#16a34a;color:#fff}
.count{color:#4ade80;font-size:18px;font-weight:bold}
.box{background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin:16px 0}
label{color:#888;font-size:12px;display:block;margin-bottom:4px}
textarea{width:100%;height:120px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;color:#e0e0e0;padding:8px;font-size:11px;font-family:monospace;resize:vertical}
input{width:100%;padding:8px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;color:#e0e0e0;margin-bottom:8px;font-size:13px}
</style></head><body>
<h1>Cookie Pool</h1>
<p>Total: <span class="count" id="count">0</span> active cookies</p>
<button class="btn btn-blue" onclick="load()">Refresh</button>
<button class="btn btn-green" onclick="copyAll()">Copy All (JSON)</button>
<pre id="out">Loading...</pre>

<div class="box">
<h2 style="margin-bottom:10px;color:#fff;font-size:15px">Sync Cookies</h2>
<label>Source name (e.g. uncodee, flowbunny)</label>
<input type="text" id="sourceInput" value="manual" placeholder="source name"/>
<label>Paste cookies JSON array here:</label>
<textarea id="cookieInput" placeholder='[{"name":"session","value":"xyz","domain":"labs.google"},...]'></textarea>
<button class="btn btn-green" onclick="upload()">Upload Cookies</button>
<p id="uploadStatus" style="font-size:12px;color:#888;margin-top:6px"></p>
</div>

<script>
async function load() {
  const r = await fetch('/cookies');
  const d = await r.json();
  document.getElementById('count').textContent = d.count || 0;
  document.getElementById('out').textContent = JSON.stringify(d.cookies || [], null, 2);
}
async function copyAll() {
  const r = await fetch('/cookies');
  const d = await r.json();
  await navigator.clipboard.writeText(JSON.stringify(d.cookies || [], null, 2));
  alert('Copied ' + (d.count||0) + ' cookies!');
}
async function upload() {
  const source = document.getElementById('sourceInput').value.trim() || 'manual';
  let cookies;
  try {
    cookies = JSON.parse(document.getElementById('cookieInput').value);
  } catch(e) {
    document.getElementById('uploadStatus').textContent = 'Invalid JSON: ' + e.message;
    document.getElementById('uploadStatus').style.color = '#ef4444';
    return;
  }
  const r = await fetch('/cookies', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ cookies, source })
  });
  const d = await r.json();
  if (d.ok) {
    document.getElementById('uploadStatus').textContent = 'Uploaded ' + d.count + ' cookies!';
    document.getElementById('uploadStatus').style.color = '#4ade80';
    document.getElementById('cookieInput').value = '';
    load();
  } else {
    document.getElementById('uploadStatus').textContent = 'Error: ' + (d.error||'');
    document.getElementById('uploadStatus').style.color = '#ef4444';
  }
}
load();
</script></body></html>`);
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Cookie server running on port ${PORT}`);
  console.log(`  View:     http://localhost:${PORT}/`);
  console.log(`  API:      GET  /cookies`);
  console.log(`  Upload:   POST /cookies { cookies: [...], source: "name" }`);
});
