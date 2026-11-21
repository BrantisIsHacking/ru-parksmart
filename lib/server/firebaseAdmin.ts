import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app: App | null | undefined;

/** Firebase Admin app, or null when FIREBASE_SERVICE_ACCOUNT is not configured. */
export function adminApp(): App | null {
  if (app !== undefined) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    app = null;
    return app;
  }
  const creds = JSON.parse(raw);
  app = getApps()[0] ?? initializeApp({ credential: cert(creds), projectId: creds.project_id });
  return app;
}

export const adminDb = () => {
  const a = adminApp();
  return a ? getFirestore(a) : null;
};

export const adminAuth = () => {
  const a = adminApp();
  return a ? getAuth(a) : null;
};
