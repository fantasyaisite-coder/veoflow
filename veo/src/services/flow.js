"use strict";

/**
 * services/flow.js
 *
 * Sequence:
 * 1. Navigate to target URL normally first.
 * 2. Wait 2.5s for site assets/framework to load.
 * 3. Clear default cookies via CDP.
 * 4. Inject Firestore pool cookies via CDP.
 * 5. Reload page to apply authenticated session cookies.
 * 6. Capture full HTML & return to client with History patch & base tag.
 */

const { db } = require("./firestore");
const config = require("../config");
const fs = require("fs");

let puppeteer;
try {
  puppeteer = require("puppeteer");
} catch (_e) {
  puppeteer = require("puppeteer-core");
}

let browser = null;

function resolveChromeExecutable() {
  if (config.chromeExecutable && fs.existsSync(config.chromeExecutable)) {
    return config.chromeExecutable;
  }

  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  try {
    const pPath = puppeteer.executablePath ? puppeteer.executablePath() : null;
    if (pPath && fs.existsSync(pPath)) return pPath;
  } catch (_e) {}

  return undefined;
}

async function getBrowserInstance() {
  if (browser && browser.isConnected()) return browser;
  
  const executablePath = resolveChromeExecutable();
  console.info(`[Flow] Launching Chrome instance: ${executablePath || "(bundled default)"}`);

  const launchOptions = {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-sync",
      "--disable-default-apps",
      "--disable-extensions",
    ],
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  browser = await puppeteer.launch(launchOptions);
  return browser;
}

async function launchFlow() {
  const b = await getBrowserInstance();
  const page = await b.newPage();

  await page.setViewport({ width: 1440, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  );

  const cdp = await page.target().createCDPSession();
  const targetUrl = config.adminDefinedUrl || "https://labs.google/fx/tools/flow";

  // Step 1: Load the whole site normally first
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    console.warn(`[Flow] Initial navigation notice: ${err.message}`);
  }

  // Step 2: Wait 2.5 seconds for framework assets & initial site load
  await new Promise((r) => setTimeout(r, 2500));

  // Step 3: Clear default cookies
  await cdp.send("Network.clearBrowserCookies").catch(() => {});

  // Step 4: Inject pool cookies from Firestore
  const snap = await db.collection("pool_cookies").where("is_active", "==", true).get();
  if (snap.empty) throw new Error("No active pool cookies found in Firestore");

  for (const d of snap.docs) {
    const c = d.data();
    const params = {
      name: c.cookie_name,
      value: c.cookie_value,
      secure: c.secure !== false,
      httpOnly: c.http_only !== false,
      sameSite: (c.same_site || "Lax").toUpperCase(),
      path: c.cookie_path || "/",
    };
    if (c.cookie_domain && !c.cookie_name.startsWith("__Host-")) params.domain = c.cookie_domain;
    if (c.expiration_date) params.expires = c.expiration_date;
    if (c.cookie_name.startsWith("__Host-")) params.url = "https://labs.google/";
    await cdp.send("Network.setCookie", params).catch((e) => console.warn("[cookie]", c.cookie_name, e.message));
  }

  // Step 5: Reload page so injected authenticated cookies take effect
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (_reloadErr) {}

  await new Promise((r) => setTimeout(r, 2000));

  // Step 6: Capture final HTML content
  let html = await page.content();

  // Inject History API patch script & <base href> tag
  const patchScript = `
<script>
(function() {
  var _r = window.history.replaceState;
  var _p = window.history.pushState;
  window.history.replaceState = function(state, title, url) {
    try {
      if (url && typeof url === 'string' && (url.indexOf('labs.google') !== -1)) {
        try { url = new URL(url).pathname + new URL(url).search; } catch(e) { url = '/'; }
      }
      return _r.call(this, state, title, url);
    } catch(e) {}
  };
  window.history.pushState = function(state, title, url) {
    try {
      if (url && typeof url === 'string' && (url.indexOf('labs.google') !== -1)) {
        try { url = new URL(url).pathname + new URL(url).search; } catch(e) { url = '/'; }
      }
      return _p.call(this, state, title, url);
    } catch(e) {}
  };
})();
</script>
`;

  html = html.replace("<head>", `<head><base href="https://labs.google/">${patchScript}`);
  await page.close();
  return { ok: true, html, count: snap.size };
}

async function closeFlowBrowser() {
  if (browser && browser.isConnected()) await browser.close().catch(() => {});
}

module.exports = { launchFlow, closeFlowBrowser };
