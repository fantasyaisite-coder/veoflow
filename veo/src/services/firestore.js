"use strict";

/**
 * services/firestore.js
 *
 * Initialises Firebase / Firestore using either service-account credentials
 * or the default Firebase web credentials (vnmediasolution-tk) retrieved from server/lib/firebase.js.
 */

const fs = require("fs");
const path = require("path");
const config = require("../config");

let _db = null;

function getFirestore() {
  if (_db) return _db;

  // Try service-account file first if configured and present
  if (config.firebaseCredentialsPath) {
    const credPath = path.resolve(config.firebaseCredentialsPath);
    if (fs.existsSync(credPath)) {
      const admin = require("firebase-admin");
      const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf8"));
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
      _db = admin.firestore();
      console.info(`[Firestore] Connected via service account to project: ${serviceAccount.project_id}`);
      return _db;
    }
  }

  // Fallback to Firebase Web SDK (vnmediasolution-tk credentials)
  const firebase = require("firebase/compat/app");
  require("firebase/compat/firestore");

  if (!firebase.apps.length) {
    firebase.initializeApp(config.firebaseWebConfig);
  }

  _db = firebase.firestore();
  console.info(`[Firestore] Connected via Web SDK to project: ${config.firebaseWebConfig.projectId}`);
  return _db;
}

// Lazy getter for exported db proxy object
const dbProxy = new Proxy({}, {
  get(_target, prop) {
    const firestore = getFirestore();
    const value = firestore[prop];
    return typeof value === "function" ? value.bind(firestore) : value;
  }
});

/**
 * Retrieve active session tokens from Firestore (supports pool_cookies and SessionPool).
 *
 * @param {string} [sessionId] Optional session or document ID
 * @returns {Promise<{ sessionId: string, label: string, cookies: object[] }>}
 */
async function fetchSessionTokens(sessionId) {
  const db = getFirestore();
  const collectionName = config.firestoreSessionCollection;

  // First try pool_cookies style collection (individual active cookies)
  if (collectionName === "pool_cookies" || !sessionId) {
    const poolSnap = await db.collection("pool_cookies").where("is_active", "==", true).get();
    if (!poolSnap.empty) {
      const cookies = poolSnap.docs.map((doc) => {
        const c = doc.data();
        return {
          name: c.cookie_name || c.name,
          value: c.cookie_value || c.value,
          domain: c.cookie_domain || c.domain || "labs.google",
          path: c.cookie_path || c.path || "/",
          secure: c.secure !== false,
          httpOnly: c.http_only !== false,
          sameSite: (c.same_site || c.sameSite || "Lax"),
          expires: c.expiration_date || c.expires || undefined,
        };
      });

      return {
        sessionId: sessionId || "pool_active",
        label: "Firestore Active Cookie Pool",
        cookies,
      };
    }
  }

  // Fallback to SessionPool style collection (doc containing a cookies array)
  let snapshot;
  if (sessionId) {
    const docSnap = await db.collection(collectionName).doc(sessionId).get();
    if (!docSnap.exists) {
      throw new Error(`[Firestore] Session document "${sessionId}" not found in collection "${collectionName}".`);
    }
    snapshot = { docs: [docSnap] };
  } else {
    snapshot = await db.collection(collectionName).where("active", "==", true).limit(1).get();
  }

  if (!snapshot || snapshot.docs.length === 0) {
    throw new Error(`[Firestore] No active session documents found in collection "${collectionName}".`);
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    sessionId: doc.id,
    label: data.label || doc.id,
    cookies: data.cookies || [],
  };
}

module.exports = {
  db: dbProxy,
  getFirestore,
  fetchSessionTokens,
};
