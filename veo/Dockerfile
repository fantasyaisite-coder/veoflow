# ──────────────────────────────────────────────
#  Stage 1: ui-test-runner
#  Base: ghcr.io/puppeteer/puppeteer:latest
#  Provides: Chromium system binary + all font/
#            rendering dependencies pre-installed
# ──────────────────────────────────────────────

FROM ghcr.io/puppeteer/puppeteer:latest

# ─── Security Notice ────────────────────────────────────────────────────────
# USER root is required here ONLY because the Chrome sandbox mechanism needs
# elevated kernel capabilities that are not available inside unprivileged
# Docker containers.  This image must ONLY be used in isolated, ephemeral
# CI/test environments — never as a long-lived, network-exposed service.
# ────────────────────────────────────────────────────────────────────────────
USER root

# Set a consistent working directory
WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/

# ── Runtime environment variables (overridable at container start) ──────────
# FIREBASE_CREDENTIALS_PATH : absolute path inside the container to the
#                             Firebase Admin SDK service-account JSON file
#                             (mount it as a secret volume — see docker-compose)
# ADMIN_DEFINED_URL          : the target URL that every test session navigates to
# PORT                       : HTTP port the Express server listens on (default 3000)
ENV PORT=3000 \
    NODE_ENV=production \
    CHROME_EXECUTABLE=/usr/bin/google-chrome

# Expose the service port
EXPOSE 3000

# Health-check: lightweight ping to the /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
