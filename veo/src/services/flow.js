"use strict";

/**
 * services/flow.js
 *
 * Fast Google Flow launcher with CDP cookie clearing, cookie injection, and instant commit navigation.
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
  console.info(`[Flow] Launching warm Chrome instance: ${executablePath || "(bundled default)"}`);

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

  // 1. Clear any default / leftover cookies
  await cdp.send("Network.clearBrowserCookies").catch(() => {});

  // 2. Retrieve active pool cookies from Firestore
  const snap = await db.collection("pool_cookies").where("is_active", "==", true).get();
  if (snap.empty) throw new Error("No active pool cookies found in Firestore");

  // 3. Inject pool cookies into CDP
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

  const targetUrl = config.adminDefinedUrl || "https://labs.google/fx/tools/flow";
  
  // 4. Instant navigation: "commit" phase (loads headers instantly without waiting)
  await page.goto(targetUrl, { waitUntil: "commit", timeout: 15000 }).catch((navErr) => {
    console.warn(`[Flow] Commit navigation info: ${navErr.message}`);
  });

  // 5. Get HTML content immediately (no artificial delay)
  let html = await page.content();
  
  // 6. Inject client-side History patch script & <base href> tag
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
