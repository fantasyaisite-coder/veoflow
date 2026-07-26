"use strict";

/**
 * services/flow.js
 *
 * Launches Google Flow page with CDP raw cookie injection using active pool cookies.
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

function getChromePath() {
  if (config.chromeExecutable && fs.existsSync(config.chromeExecutable)) {
    return config.chromeExecutable;
  }
  if (process.env.PUPPETEER_CHROME_PATH && fs.existsSync(process.env.PUPPETEER_CHROME_PATH)) {
    return process.env.PUPPETEER_CHROME_PATH;
  }
  if (typeof puppeteer.executablePath === "function") {
    try { return puppeteer.executablePath(); } catch (_e) {}
  }
  return "/usr/bin/google-chrome";
}

async function getBrowserInstance() {
  if (browser && browser.isConnected()) return browser;
  const chromePath = getChromePath();
  browser = await puppeteer.launch({
    headless: "new",
    executablePath: chromePath,
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
  });
  return browser;
}

async function launchFlow() {
  const b = await getBrowserInstance();
  const page = await b.newPage();
  const cdp = await page.target().createCDPSession();

  // Inject cookies via raw CDP
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

  const targetUrl = config.adminDefinedUrl || "https://labs.google/fx/tools/flow";
  await page.goto(targetUrl, { waitUntil: "load", timeout: 90000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 3000)));
  let html = await page.content();
  
  // Inject <base> so relative URLs load from labs.google
  html = html.replace("<head>", '<head><base href="https://labs.google/">');
  await page.close();
  return { ok: true, html, count: snap.size };
}

async function closeFlowBrowser() {
  if (browser && browser.isConnected()) await browser.close().catch(() => {});
}

module.exports = { launchFlow, closeFlowBrowser };
