const express = require('express');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// ============================================================
// 1. Firebase Admin Initialization
// ============================================================

function initializeFirebase() {
  // Option A: Use FIREBASE_SERVICE_ACCOUNT env var (JSON string)
  // Option B: Use default credentials (e.g., on GCP)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[Firebase] Initialized with service account from env var');
  } else {
    // Fallback to Application Default Credentials (ADC)
    admin.initializeApp();
    console.log('[Firebase] Initialized with Application Default Credentials');
  }
}

initializeFirebase();

const db = admin.firestore();

// ============================================================
// 2. Cookie Pool Management
// ============================================================

/**
 * Fetches the next available session cookie from Firestore.
 * Expected document structure in 'cookies' collection:
 * {
 *   value: "next-auth.session-token=<token_value>",
 *   domain: ".google.com",
 *   active: true,
 *   lastUsed: Timestamp
 * }
 */
async function getNextSessionCookie() {
  const cookiesRef = db.collection('cookies');
  const snapshot = await cookiesRef
    .where('active', '==', true)
    .orderBy('lastUsed', 'asc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new Error('No active session cookies found in Firestore');
  }

  const doc = snapshot.docs[0];
  const cookieData = doc.data();

  // Update lastUsed timestamp
  await doc.ref.update({
    lastUsed: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    id: doc.id,
    ...cookieData,
  };
}

// ============================================================
// 3. Puppeteer Browser Launch Configuration
// ============================================================

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--single-process', // Reduce memory usage for free tier
];

async function launchBrowser() {
  console.log('[Puppeteer] Launching Chrome with BoringSSL...');
  
  const browser = await puppeteer.launch({
    headless: 'new', // Use new headless mode
    executablePath: '/usr/bin/google-chrome', // CRITICAL: Use real Chrome binary (BoringSSL), not Chromium
    args: BROWSER_ARGS,
    defaultViewport: { width: 1280, height: 800 },
    timeout: 60000,
  });

  console.log('[Puppeteer] Chrome launched successfully');
  return browser;
}

// ============================================================
// 4. Cookie Injection & Navigation
// ============================================================

async function injectCookiesAndNavigate(page, cookieData) {
  // Extract cookie value - support both raw value and structured format
  let cookieValue = cookieData.value;
  let domain = cookieData.domain || '.google.com';

  // Parse cookie if it's in "name=value" format
  let cookieName = 'next-auth.session-token';
  if (cookieValue.includes('=')) {
    const parts = cookieValue.split('=');
    cookieName = parts[0];
    cookieValue = parts.slice(1).join('=');
  }

  console.log(`[Cookies] Injecting ${cookieName} for domain ${domain}`);

  // Set the cookie for Google domain
  await page.setCookie({
    name: cookieName,
    value: cookieValue,
    domain: domain,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  });

  // Optional: Set additional cookies if provided
  if (cookieData.additionalCookies && Array.isArray(cookieData.additionalCookies)) {
    for (const cookie of cookieData.additionalCookies) {
      await page.setCookie({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || domain,
        path: cookie.path || '/',
        httpOnly: cookie.httpOnly !== false,
        secure: cookie.secure !== false,
        sameSite: cookie.sameSite || 'Lax',
      });
    }
  }

  console.log('[Navigation] Navigating to Google Flow tool...');
  
  // Navigate to the target URL
  const response = await page.goto('https://labs.google/fx/tools/flow', {
    waitUntil: 'networkidle2', // Wait for network to be idle
    timeout: 60000,
  });

  const status = response ? response.status() : 'unknown';
  console.log(`[Navigation] Page loaded with status: ${status}`);

  // Wait a bit for any client-side redirects
  await page.waitForTimeout(3000);

  return { status, url: page.url() };
}

// ============================================================
// 5. API Endpoints
// ============================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'puppeteer-tls-proxy',
    timestamp: new Date().toISOString(),
    chromePath: '/usr/bin/google-chrome',
  });
});

/**
 * POST /proxy/verify
 * 
 * Main endpoint: Fetches cookie from Firebase, launches Chrome,
 * injects cookie, navigates to Google Flow, returns screenshot.
 * 
 * Optional body: { cookieId?: string }
 */
app.post('/proxy/verify', async (req, res) => {
  let browser = null;
  
  try {
    // Step 1: Get session cookie from Firebase
    console.log('[Request] Fetching session cookie from Firebase...');
    const cookieData = await getNextSessionCookie();
    console.log(`[Request] Retrieved cookie ID: ${cookieData.id}`);

    // Step 2: Launch real Chrome (BoringSSL)
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Set user agent to match the Chrome binary
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Step 3: Inject cookies and navigate
    const navResult = await injectCookiesAndNavigate(page, cookieData);

    // Step 4: Take screenshot to confirm login status
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    });

    // Get page title and URL for verification
    const pageTitle = await page.title();
    const currentUrl = page.url();

    // Check if we're on the expected page (not redirected to login)
    const isLoggedIn = !currentUrl.includes('accounts.google.com/signin');

    console.log(`[Result] Page: ${pageTitle}, URL: ${currentUrl}, Logged in: ${isLoggedIn}`);

    // Return results
    res.json({
      success: true,
      cookieId: cookieData.id,
      loginStatus: isLoggedIn ? 'authenticated' : 'not_authenticated',
      pageTitle,
      finalUrl: currentUrl,
      navigationStatus: navResult.status,
      screenshot: screenshot.toString('base64'),
      tlsInfo: {
        engine: 'BoringSSL (Chrome)',
        note: 'Request originated from real Chrome binary, not Node.js OpenSSL',
      },
    });

  } catch (error) {
    console.error('[Error]', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  } finally {
    // Always close the browser
    if (browser) {
      await browser.close();
      console.log('[Puppeteer] Browser closed');
    }
  }
});

/**
 * POST /proxy/screenshot
 * 
 * Lighter endpoint: Just get a screenshot of any URL with injected cookies.
 * Body: { url: string, cookieId?: string }
 */
app.post('/proxy/screenshot', async (req, res) => {
  let browser = null;
  
  try {
    const { url, cookieId } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    // Get cookie
    const cookiesRef = db.collection('cookies');
    let query = cookiesRef.where('active', '==', true);
    
    if (cookieId) {
      query = cookiesRef.where(admin.firestore.FieldPath.documentId(), '==', cookieId);
    }
    
    const snapshot = await query.limit(1).get();
    if (snapshot.empty) {
      throw new Error('No active cookie found');
    }

    const cookieData = snapshot.docs[0].data();

    // Launch browser
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Inject cookie
    await page.setCookie({
      name: 'next-auth.session-token',
      value: cookieData.value.includes('=') 
        ? cookieData.value.split('=').slice(1).join('=') 
        : cookieData.value,
      domain: cookieData.domain || '.google.com',
      path: '/',
      httpOnly: true,
      secure: true,
    });

    // Navigate
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Screenshot
    const screenshot = await page.screenshot({ type: 'png' });

    res.json({
      success: true,
      finalUrl: page.url(),
      title: await page.title(),
      screenshot: screenshot.toString('base64'),
    });

  } catch (error) {
    console.error('[Error]', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

/**
 * GET /cookies
 * 
 * List available cookies in the pool (for debugging).
 */
app.get('/cookies', async (req, res) => {
  try {
    const snapshot = await db.collection('cookies')
      .where('active', '==', true)
      .get();

    const cookies = snapshot.docs.map(doc => ({
      id: doc.id,
      domain: doc.data().domain,
      lastUsed: doc.data().lastUsed,
      active: doc.data().active,
    }));

    res.json({ count: cookies.length, cookies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// 6. Server Startup
// ============================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Puppeteer TLS Proxy running on port ${PORT}`);
  console.log(`   Chrome binary: /usr/bin/google-chrome`);
  console.log(`   TLS Engine: BoringSSL (matches Google's expectations)`);
  console.log(`\n   Endpoints:`);
  console.log(`   GET  /health          - Health check`);
  console.log(`   POST /proxy/verify    - Full cookie injection & screenshot`);
  console.log(`   POST /proxy/screenshot - Screenshot any URL with cookies`);
  console.log(`   GET  /cookies         - List cookie pool\n`);
});
