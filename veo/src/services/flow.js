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
 * 6. Capture full HTML & inject universal proxy patch script.
 */

const { db } = require("./firestore");
const { resolveChromeExecutable } = require("./chrome");
const config = require("../config");

let puppeteer;
try {
  puppeteer = require("puppeteer");
} catch (_e) {
  puppeteer = require("puppeteer-core");
}

let browser = null;

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
      "--single-process",
      "--js-flags=--max-old-space-size=144",
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

  // Step 1: Load the site normally first
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

  // Inject History API patch and Universal /proxy URL rewriter script
  const patchScript = `
<script>
(function() {
  function rewrite(u) {
    if (!u) return u;
    var s = typeof u === 'string' ? u : (u.href || u.url || u.toString());
    if (!s || s.indexOf('/proxy') === 0) return u;
    if (s.indexOf('labs.google') !== -1 || s.indexOf('googleapis.com') !== -1) {
      return '/proxy?url=' + encodeURIComponent(s.startsWith('/') ? 'https://labs.google' + s : s);
    }
    if (s.indexOf('/fx/') === 0 || s.indexOf('/api/') === 0) {
      return '/proxy?url=' + encodeURIComponent('https://labs.google' + s);
    }
    return u;
  }

  // 1. History patch
  var _r = window.history.replaceState;
  var _p = window.history.pushState;
  window.history.replaceState = function(state, title, url) {
    try {
      if (url && typeof url === 'string' && (url.indexOf('labs.google') !== -1)) {
        try { url = new URL(url).pathname + new URL(url).search; } catch(e) { url = '/flow'; }
      }
      return _r.call(this, state, title, url);
    } catch(e) {}
  };
  window.history.pushState = function(state, title, url) {
    try {
      if (url && typeof url === 'string' && (url.indexOf('labs.google') !== -1)) {
        try { url = new URL(url).pathname + new URL(url).search; } catch(e) { url = '/flow'; }
      }
      return _p.call(this, state, title, url);
    } catch(e) {}
  };

  // 2. Universal fetch proxy rewriter
  var _origFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      input = rewrite(input);
    } else if (input && input.url) {
      var newUrl = rewrite(input.url);
      input = new Request(newUrl, input);
    }
    return _origFetch.call(this, input, init);
  };

  // 3. Universal XMLHttpRequest proxy rewriter
  var _origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, pass) {
    return _origOpen.call(this, method, rewrite(url), async, user, pass);
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
