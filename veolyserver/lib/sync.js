const { db } = require("./firebase");
const puppeteer = require("puppeteer");

async function getSettings() {
  const snap = await db.collection("admin_settings").doc("config").get();
  if (!snap.exists) return {};
  return snap.data();
}

async function syncUncodee() {
  const settings = await getSettings();
  const email = settings.uncodee_email;
  const password = settings.uncodee_password;
  if (!email || !password) {
    return { ok: false, error: "Uncodee credentials not configured" };
  }

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_CHROME_PATH || puppeteer.executablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    const targetUrl = settings.target_url || "https://labs.google/fx/tools/flow";

    // Log into Google
    await page.goto("https://accounts.google.com/signin", { waitUntil: "networkidle2", timeout: 30000 });
    await page.type('input[type="email"]', email, { delay: 30 });
    await page.click("#identifierNext");
    await page.waitForTimeout(2000);
    await page.type('input[type="password"]', password, { delay: 30 });
    await page.click("#passwordNext");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});

    if (page.url().includes("challenge") || page.url().includes("captcha")) {
      return { ok: false, error: "Login blocked by captcha/2FA" };
    }

    // Navigate to target
    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Collect cookies
    const cookies = await page.cookies();
    await browser.close();

    // Clear old pool cookies for this source
    const existing = await db.collection("pool_cookies").where("source", "==", "uncodee").get();
    const batch = db.batch();
    existing.docs.forEach((d) => batch.delete(d.ref));

    // Store new cookies
    const now = new Date().toISOString();
    cookies.forEach((c) => {
      const doc = db.collection("pool_cookies").doc();
      batch.set(doc, {
        cookie_name: c.name,
        cookie_value: c.value,
        cookie_domain: c.domain || "labs.google",
        cookie_path: c.path || "/",
        secure: c.secure || true,
        http_only: c.httpOnly || false,
        same_site: c.sameSite || "Lax",
        host_only: !c.domain,
        expiration_date: c.expires || null,
        source: "uncodee",
        is_active: true,
        synced_at: now,
      });
    });

    await batch.commit();

    return { ok: true, count: cookies.length, at: now };
  } catch (err) {
    await browser.close().catch(() => {});
    return { ok: false, error: err.message };
  }
}

async function syncFlowbunny() {
  const settings = await getSettings();
  const email = settings.flowbunny_email;
  const password = settings.flowbunny_password;
  if (!email || !password) {
    return { ok: false, error: "Flowbunny credentials not configured" };
  }

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_CHROME_PATH || puppeteer.executablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    const targetUrl = settings.target_url || "https://labs.google/fx/tools/flow";

    await page.goto("https://accounts.google.com/signin", { waitUntil: "networkidle2", timeout: 30000 });
    await page.type('input[type="email"]', email, { delay: 30 });
    await page.click("#identifierNext");
    await page.waitForTimeout(2000);
    await page.type('input[type="password"]', password, { delay: 30 });
    await page.click("#passwordNext");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});

    if (page.url().includes("challenge") || page.url().includes("captcha")) {
      return { ok: false, error: "Login blocked by captcha/2FA" };
    }

    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 60000 });
    const cookies = await page.cookies();
    await browser.close();

    const existing = await db.collection("pool_cookies").where("source", "==", "flowbunny").get();
    const batch = db.batch();
    existing.docs.forEach((d) => batch.delete(d.ref));

    const now = new Date().toISOString();
    cookies.forEach((c) => {
      const doc = db.collection("pool_cookies").doc();
      batch.set(doc, {
        cookie_name: c.name,
        cookie_value: c.value,
        cookie_domain: c.domain || "labs.google",
        cookie_path: c.path || "/",
        secure: c.secure || true,
        http_only: c.httpOnly || false,
        same_site: c.sameSite || "Lax",
        host_only: !c.domain,
        expiration_date: c.expires || null,
        source: "flowbunny",
        is_active: true,
        synced_at: now,
      });
    });

    await batch.commit();
    return { ok: true, count: cookies.length, at: now };
  } catch (err) {
    await browser.close().catch(() => {});
    return { ok: false, error: err.message };
  }
}

async function syncAll() {
  const results = await Promise.allSettled([syncUncodee(), syncFlowbunny()]);
  const sources = results.map((r, i) => {
    const name = i === 0 ? "uncodee" : "flowbunny";
    if (r.status === "fulfilled") {
      return { source: name, ...r.value };
    }
    return { source: name, ok: false, error: r.reason.message };
  });

  // Log sync
  const log = {
    at: new Date().toISOString(),
    sources,
    total: sources.reduce((s, r) => s + (r.count || 0), 0),
  };
  await db.collection("sync_logs").add(log);

  return log;
}

module.exports = { syncUncodee, syncFlowbunny, syncAll, getSettings };
