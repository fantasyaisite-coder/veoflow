"use strict";

/**
 * services/browser.js
 *
 * Shared Chrome browser lifecycle manager for UI test sessions.
 */

let puppeteer;
try {
  puppeteer = require("puppeteer");
} catch (_e) {
  puppeteer = require("puppeteer-core");
}

const { resolveChromeExecutable } = require("./chrome");
const config = require("../config");

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.connected) {
    return _browser;
  }

  const executablePath = resolveChromeExecutable();
  console.info(`[Browser] Launching Chrome executable: ${executablePath || "(bundled default)"}`);

  const launchOptions = {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--no-first-run",
      "--mute-audio",
      "--single-process",
      "--js-flags=--max-old-space-size=144",
    ],
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  _browser = await puppeteer.launch(launchOptions);

  _browser.on("disconnected", () => {
    console.warn("[Browser] Browser disconnected — will re-launch on next request.");
    _browser = null;
  });

  console.info("[Browser] Chrome launched successfully.");
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
    console.info("[Browser] Browser closed.");
  }
}

async function initializeTestSession(sessionData) {
  const { sessionId, label, cookies } = sessionData;
  const targetUrl = config.adminDefinedUrl;

  const browser = await getBrowser();
  const page = await browser.newPage();

  const startTime = Date.now();

  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/125.0.0.0 Safari/537.36"
    );

    const targetOrigin = new URL(targetUrl).origin;
    await page.goto(targetOrigin, { waitUntil: "domcontentloaded" });

    await page.setCookie(...cookies);

    console.info(
      `[Browser] Applied ${cookies.length} cookie(s) for session "${label}".`
    );

    let httpStatus = null;
    page.on("response", (response) => {
      if (response.url() === targetUrl || response.url().startsWith(targetOrigin)) {
        httpStatus = response.status();
      }
    });

    await page.goto(targetUrl, {
      waitUntil: "networkidle0",
      timeout: 60_000,
    });

    const pageTitle = await page.title();
    const finalUrl = page.url();
    const durationMs = Date.now() - startTime;

    console.info(
      `[Browser] Session "${label}" initialised in ${durationMs}ms. ` +
        `Title: "${pageTitle}" | Final URL: ${finalUrl}`
    );

    return {
      success: true,
      sessionId,
      sessionLabel: label,
      targetUrl,
      finalUrl,
      pageTitle,
      cookiesApplied: cookies.length,
      httpStatus,
      durationMs,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { initializeTestSession, getBrowser, closeBrowser };
