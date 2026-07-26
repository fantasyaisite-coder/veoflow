"use strict";

/**
 * services/browser.js
 *
 * Manages the Puppeteer browser lifecycle and exposes a single high-level
 * function that:
 *
 *   1. Launches Chrome using the system binary (executablePath) for pixel-
 *      perfect rendering parity with the production environment.
 *   2. Applies Firestore-sourced session cookies to authenticate the page.
 *   3. Navigates to ADMIN_DEFINED_URL and waits for network idle.
 *   4. Returns a structured status report for the caller.
 *
 * A single shared browser instance is reused across requests to save startup
 * time.  A new Page is opened and closed for each test initialisation.
 */

const puppeteer = require("puppeteer-core");
const config = require("../config");

// ─── Browser singleton ────────────────────────────────────────────────────────

/** @type {import('puppeteer-core').Browser | null} */
let _browser = null;

/**
 * Launch (or reuse) the shared Chrome browser instance.
 *
 * Chrome flags:
 *  --no-sandbox           — Required because the container runs as root.
 *                           In a properly isolated Docker environment this is
 *                           acceptable; do NOT use in production user-facing
 *                           contexts without additional isolation layers.
 *  --disable-setuid-sandbox — Companion flag for the above.
 *  --disable-dev-shm-usage  — Prevents crashes when /dev/shm is small.
 *  --disable-gpu           — No GPU in headless containers.
 *
 * @returns {Promise<import('puppeteer-core').Browser>}
 */
async function getBrowser() {
  if (_browser && _browser.connected) {
    return _browser;
  }

  console.info(
    `[Browser] Launching Chrome from: ${config.chromeExecutable}`
  );

  _browser = await puppeteer.launch({
    // ── Use the system binary installed by the Docker base image ────────────
    executablePath: config.chromeExecutable,

    headless: "new", // use the new headless mode (Chrome ≥ 112)

    args: [
      "--no-sandbox", // Required when running as root inside Docker
      "--disable-setuid-sandbox", // Companion to --no-sandbox
      "--disable-dev-shm-usage", // Use /tmp instead of /dev/shm (avoids OOM crashes)
      "--disable-gpu", // No hardware GPU in headless containers
      "--disable-extensions", // Faster start, deterministic rendering
      "--disable-background-networking",
      "--disable-default-apps",
      "--no-first-run",
      "--mute-audio",
    ],
  });

  // Auto-recover if the browser crashes: clear the reference so the next
  // request re-launches it.
  _browser.on("disconnected", () => {
    console.warn("[Browser] Browser disconnected — will re-launch on next request.");
    _browser = null;
  });

  console.info("[Browser] Chrome launched successfully.");
  return _browser;
}

/**
 * Gracefully close the shared browser instance.
 * Call this during process shutdown.
 */
async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
    console.info("[Browser] Browser closed.");
  }
}

// ─── Core test initialisation logic ──────────────────────────────────────────

/**
 * Run a full UI test-session initialisation:
 *
 *   1. Open a new browser Page.
 *   2. Apply the provided session cookies (retrieved from Firestore).
 *   3. Navigate to ADMIN_DEFINED_URL and wait for networkidle0.
 *   4. Collect and return a structured status report.
 *
 * @param {{
 *   sessionId: string,
 *   label: string,
 *   cookies: import('puppeteer-core').CookieParam[]
 * }} sessionData — Session metadata returned by fetchSessionTokens()
 *
 * @returns {Promise<{
 *   success: boolean,
 *   sessionId: string,
 *   sessionLabel: string,
 *   targetUrl: string,
 *   finalUrl: string,
 *   pageTitle: string,
 *   cookiesApplied: number,
 *   httpStatus: number | null,
 *   durationMs: number
 * }>}
 */
async function initializeTestSession(sessionData) {
  const { sessionId, label, cookies } = sessionData;
  const targetUrl = config.adminDefinedUrl;

  const browser = await getBrowser();
  const page = await browser.newPage();

  const startTime = Date.now();

  try {
    // ── Step 1: Set a realistic viewport ─────────────────────────────────────
    await page.setViewport({ width: 1440, height: 900 });

    // ── Step 2: Apply a generic User-Agent to avoid bot-detection heuristics ─
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/125.0.0.0 Safari/537.36"
    );

    // ── Step 3: Inject session cookies ───────────────────────────────────────
    // Puppeteer requires that the domain of each cookie matches the page's
    // origin.  We navigate to the target origin first (blank), set cookies,
    // then perform the real navigation.
    const targetOrigin = new URL(targetUrl).origin;
    await page.goto(targetOrigin, { waitUntil: "domcontentloaded" });

    await page.setCookie(...cookies);

    console.info(
      `[Browser] Applied ${cookies.length} cookie(s) for session "${label}".`
    );

    // ── Step 4: Navigate to the target URL and wait for network idle ─────────
    let httpStatus = null;

    page.on("response", (response) => {
      // Capture the HTTP status of the main document response
      if (response.url() === targetUrl || response.url().startsWith(targetOrigin)) {
        httpStatus = response.status();
      }
    });

    await page.goto(targetUrl, {
      waitUntil: "networkidle0", // wait until no more than 0 network connections for 500 ms
      timeout: 60_000,           // 60-second hard timeout
    });

    // ── Step 5: Collect page state for the status report ─────────────────────
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
    // Always close the page — the shared browser stays alive for reuse
    await page.close().catch(() => {});
  }
}

module.exports = { initializeTestSession, getBrowser, closeBrowser };
