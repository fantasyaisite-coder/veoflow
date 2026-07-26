# Puppeteer TLS Proxy Service

A Node.js proxy service that uses a **real Chrome binary (BoringSSL)** to bypass Google's TLS fingerprinting detection. Hosted on Render.com Free Tier using Docker.

## Why This Works

Google detects TLS fingerprinting by analyzing the TLS handshake. Node.js uses OpenSSL, which has a different TLS signature than Chrome's BoringSSL. By using Puppeteer with the **real Chrome binary** (not Chromium), the TLS handshake matches what Google expects from a legitimate Chrome browser.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Your Client   │────▶│   Express Server     │────▶│  Google Labs    │
│                 │     │   (Node.js)          │     │  (Flow Tool)    │
└─────────────────┘     │                      │     └─────────────────┘
                        │  ┌────────────────┐  │
                        │  │   Puppeteer    │  │
                        │  │  ┌──────────┐  │  │
                        │  │  │  Chrome   │  │  │
                        │  │  │ (BoringSSL│  │  │
                        │  │  │  Binary)  │  │  │
                        │  │  └──────────┘  │  │
                        │  └────────────────┘  │
                        │                      │
                        │  ┌────────────────┐  │
                        │  │   Firebase     │  │
                        │  │   Firestore    │  │
                        │  │   (Cookie Pool)│  │
                        │  └────────────────┘  │
                        └──────────────────────┘
```

## Prerequisites

1. **Firebase Project** with Firestore enabled
2. **Firebase Service Account** credentials (JSON)
3. **Render.com** account (free tier works)
4. **Google Session Cookies** stored in Firestore

## Firestore Data Structure

Your `cookies` collection should have documents with this structure:

```json
{
  "value": "next-auth.session-token=<your_token_value>",
  "domain": ".google.com",
  "active": true,
  "lastUsed": null,
  "notes": "Optional description"
}
```

## API Endpoints

### `GET /health`
Health check endpoint for Render.com.

**Response:**
```json
{
  "status": "ok",
  "service": "puppeteer-tls-proxy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "chromePath": "/usr/bin/google-chrome"
}
```

### `POST /proxy/verify`
Main endpoint: Fetches cookie from Firebase, launches Chrome, injects cookie, navigates to Google Flow tool, returns screenshot.

**Response:**
```json
{
  "success": true,
  "cookieId": "abc123",
  "loginStatus": "authenticated",
  "pageTitle": "Google Flow",
  "finalUrl": "https://labs.google/fx/tools/flow",
  "navigationStatus": 200,
  "screenshot": "<base64_png>",
  "tlsInfo": {
    "engine": "BoringSSL (Chrome)",
    "note": "Request originated from real Chrome binary, not Node.js OpenSSL"
  }
}
```

### `POST /proxy/screenshot`
Lighter endpoint to screenshot any URL with injected cookies.

**Request:**
```json
{
  "url": "https://labs.google/fx/tools/flow",
  "cookieId": "optional_specific_cookie_id"
}
```

### `GET /cookies`
List available cookies in the pool (for debugging).

## Deployment to Render.com

### Step 1: Prepare Firebase Service Account

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Save the JSON file securely

### Step 2: Deploy to Render

**Option A: Using render.yaml (Recommended)**

1. Push this repository to GitHub/GitLab
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click "New" → "Blueprint"
4. Connect your repository
5. Render will detect `render.yaml` and create the service
6. Add `FIREBASE_SERVICE_ACCOUNT` environment variable in the dashboard

**Option B: Manual Setup**

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Web Service"
3. Connect your repository
4. Configure:
   - **Name:** puppeteer-tls-proxy
   - **Runtime:** Docker
   - **Instance Type:** Free
5. Add Environment Variables:
   - `FIREBASE_SERVICE_ACCOUNT`: Paste your entire service account JSON as a string
6. Click "Create Web Service"

### Step 3: Set Environment Variable

In Render dashboard, go to your service → Environment:

```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"..."}
```

**Important:** The entire JSON must be on a single line as a string.

### Step 4: Verify Deployment

```bash
# Health check
curl https://your-service.onrender.com/health

# Full verification
curl -X POST https://your-service.onrender.com/proxy/verify

# List cookies
curl https://your-service.onrender.com/cookies
```

## Local Development

```bash
# Install dependencies
npm install

# Set environment variable
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'

# Run locally (requires Chrome installed)
node server.js

# Test
curl http://localhost:3000/health
```

## Important Notes

### Free Tier Limitations

- **Spin down:** Render free tier spins down after 15 minutes of inactivity
- **Cold start:** First request after spin-down takes ~30-60 seconds
- **Memory:** 512MB RAM limit - the `--single-process` flag helps reduce Chrome's memory usage
- **Build time:** Initial Docker build takes 5-10 minutes

### Security Considerations

1. **Never commit** your Firebase service account to version control
2. **Rotate cookies** regularly in your Firestore database
3. **Monitor usage** to detect any abuse
4. Consider adding **authentication** to your API endpoints for production use

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Browser fails to launch | Ensure Docker image is built correctly; check `/usr/bin/google-chrome` exists |
| "No active cookies" | Add documents to your `cookies` collection in Firestore |
| Login fails | Verify cookie value is correct and not expired |
| Timeout errors | Increase timeout values; Render free tier can be slow |
| Memory errors | Add more `--disable-*` flags to BROWSER_ARGS |

## How the TLS Bypass Works

1. **Node.js default:** Uses OpenSSL → Different TLS fingerprint
2. **This service:** Uses `/usr/bin/google-chrome` → Uses BoringSSL → Same TLS fingerprint as Chrome browser

When Puppeteer launches with `executablePath: '/usr/bin/google-chrome'`, all network requests from that Chrome instance use Chrome's native BoringSSL library for TLS, producing the exact same ClientHello message that Google expects from a real browser.

## License

MIT
