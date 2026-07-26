"use strict";

/**
 * config/index.js
 *
 * Centralised, validated configuration loaded from environment variables.
 */

require("dotenv").config();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Read a required environment variable. Throws if it is absent or empty.
 * @param {string} name
 * @returns {string}
 */
function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `[Config] Required environment variable "${name}" is missing or empty. ` +
        `Please set it before starting the service.`
    );
  }
  return value.trim();
}

/**
 * Read an optional environment variable with a fallback default.
 * @param {string} name
 * @param {string} defaultValue
 * @returns {string}
 */
function optional(name, defaultValue) {
  return (process.env[name] || defaultValue).trim();
}

// ─── Config object ────────────────────────────────────────────────────────────

const config = {
  // HTTP server
  port: parseInt(optional("PORT", "3000"), 10),
  nodeEnv: optional("NODE_ENV", "development"),

  // Firebase Credentials (migrated from server/lib/firebase.js)
  firebaseCredentialsPath: optional("FIREBASE_CREDENTIALS_PATH", ""),
  firebaseWebConfig: {
    apiKey: optional("FIREBASE_API_KEY", "AIzaSyBdTH24q_cU1TdyLpd1Du4G196zEcB9kbQ"),
    authDomain: optional("FIREBASE_AUTH_DOMAIN", "vnmediasolution-tk.firebaseapp.com"),
    databaseURL: optional("FIREBASE_DATABASE_URL", "https://vnmediasolution-tk-default-rtdb.firebaseio.com"),
    projectId: optional("FIREBASE_PROJECT_ID", "vnmediasolution-tk"),
    storageBucket: optional("FIREBASE_STORAGE_BUCKET", "vnmediasolution-tk.firebasestorage.app"),
    messagingSenderId: optional("FIREBASE_MESSAGING_SENDER_ID", "615383281154"),
    appId: optional("FIREBASE_APP_ID", "1:615383281154:web:0030c2652d67c13352011b"),
    measurementId: optional("FIREBASE_MEASUREMENT_ID", "G-BQPQZQQ9FR"),
  },
  firestoreSessionCollection: optional(
    "FIRESTORE_SESSION_POOL_COLLECTION",
    "pool_cookies"
  ),

  // Browser / Puppeteer
  chromeExecutable: optional("CHROME_EXECUTABLE", process.env.PUPPETEER_CHROME_PATH || "/usr/bin/google-chrome"),
  adminDefinedUrl: optional("ADMIN_DEFINED_URL", "https://labs.google/fx/tools/flow"),

  // Logging
  logLevel: optional("LOG_LEVEL", "info"),
};

module.exports = config;
