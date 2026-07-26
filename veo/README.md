# UI Test Runner & Admin Control Panel

A Node.js/Express service that launches a headless Chrome browser inside Docker, retrieves authenticated session tokens from Firestore (`vnmediasolution-tk`), injects them as cookies, supports automated cookie syncing (Uncodee & Flowbunny), and navigates to Google Flow / target URLs with a full Admin Control Panel.

---

## Directory Structure (Inside `veo/` Folder)

If your GitHub repository contains the `veo/` folder at its root:

```
<your-git-repo>/
└── veo/
    ├── Dockerfile                        # Docker image built on ghcr.io/puppeteer/puppeteer:latest
    ├── docker-compose.yml
    ├── render.yaml                       # Render Blueprint specification (rootDir: veo)
    ├── .dockerignore
    ├── .env.example
    ├── package.json
    └── src/
        ├── index.js                      # Main entry point & static admin server
        ├── config/
        │   └── index.js                  # Validated configuration & default Firebase config
        ├── public/
        │   └── index.html                # Admin Control Panel UI
        ├── routes/
        │   ├── admin.js                  # Admin API & /flow routes
        │   └── testRunner.js             # POST /initialize-test route
        ├── services/
        │   ├── browser.js                # Shared Chrome Puppeteer browser
        │   ├── firestore.js              # Firestore connection (Web SDK / Admin SDK)
        │   ├── flow.js                   # Google Flow CDP cookie injector
        │   └── sync.js                   # Cookie sync automation (Uncodee & Flowbunny)
        └── middleware/
            └── errorHandler.js           # Global error handler
```

---

## Deploying on Render.com (With `veo/` Folder)

When uploading your GitHub repository with the `veo/` folder inside it:

### Option 1: Render Blueprint (Automatic `render.yaml`)

1. Push your repository (containing `veo/render.yaml` or root `render.yaml`) to GitHub.
2. Go to **[Render Dashboard](https://dashboard.render.com)** → Click **New +** → Select **Blueprint**.
3. Connect your Git repository.
4. Render automatically reads `render.yaml` (configured with `rootDir: veo`).
5. Click **Apply**.

---

### Option 2: Manual Setup on Render Web Service

If you create the Web Service manually on Render:

1. Go to **[Render Dashboard](https://dashboard.render.com)** → Click **New +** → Select **Web Service**.
2. Connect your Git repository.
3. Configure the settings:
   - **Name**: `ui-test-runner`
   - **Region**: Oregon (or any region)
   - **Branch**: `main`
   - **Root Directory**: `veo`  👈 *(IMPORTANT: set this to `veo`)*
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `Dockerfile` (or `veo/Dockerfile`)
   - **Instance Type**: **Starter** ($7/mo) or higher
4. Under **Environment Variables**, add:
   - `PORT`: `10000`
   - `NODE_ENV`: `production`
   - `ADMIN_DEFINED_URL`: `https://labs.google/fx/tools/flow`
   - `FIRESTORE_SESSION_POOL_COLLECTION`: `pool_cookies`
   - `CHROME_EXECUTABLE`: `/usr/bin/google-chrome`
5. Click **Create Web Service**.

Render will navigate into `veo/`, build the Docker container, and deploy your live URL: `https://<your-app>.onrender.com`.

---

## API Reference

### `GET /`
Serves the **Admin Control Panel UI** (Default password: `HNM@3322k`).

### `GET /flow`
Opens Google Flow with pool cookies automatically injected via Puppeteer CDP.

### `POST /initialize-test`
Runs full UI test session initialization:
```bash
curl -X POST https://<your-app>.onrender.com/initialize-test \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "qa-session-1"}'
```

### `POST /api/sync`
Triggers cookie sync for Uncodee or Flowbunny Google accounts:
```json
{ "source": "all" }
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_DEFINED_URL` | Target URL for test sessions | `https://labs.google/fx/tools/flow` |
| `PORT` | Web server port | `3000` (Render defaults to `10000`) |
| `CHROME_EXECUTABLE` | System Chrome binary path | `/usr/bin/google-chrome` |
| `FIRESTORE_SESSION_POOL_COLLECTION` | Collection name for cookies | `pool_cookies` |
