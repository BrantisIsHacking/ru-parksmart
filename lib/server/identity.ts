import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { adminAuth } from "./firebaseAdmin";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** One-way hash so stored data never contains the raw Firebase uid. */
export function hashId(raw: string): string {
  const salt = process.env.ID_HASH_SALT ?? "dev-salt";
  return createHash("sha256").update(`${salt}:${raw}`).digest("hex").slice(0, 20);
}

/**
 * Resolve the caller to an anonymous, hashed reporter id.
 * Production: Firebase anonymous-auth ID token in `Authorization: Bearer`.
 * Dev (no Firebase Admin configured): a random id from the browser in `x-anon-id`.
 */
export async function reporterFrom(req: Request): Promise<string> {
  const auth = adminAuth();
  if (auth) {
    const header = req.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw new HttpError(401, "Sign-in required");
    try {
      const decoded = await auth.verifyIdToken(token);
      return hashId(decoded.uid);
    } catch {
      throw new HttpError(401, "Invalid session");
    }
  }
  const anon = req.headers.get("x-anon-id") ?? "";
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(anon)) throw new HttpError(401, "Missing anonymous id");
  return hashId(anon);
}

/** Team-only pilot endpoints require the PILOT_ADMIN_TOKEN passcode. */
export function requirePilotToken(req: Request) {
  const expected = process.env.PILOT_ADMIN_TOKEN;
  const given = req.headers.get("x-pilot-token") ?? "";
  if (!expected) throw new HttpError(503, "PILOT_ADMIN_TOKEN is not configured");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(403, "Wrong pilot passcode");
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  // Errors from the Gemini SDK carry an HTTP status (quota, overload, bad key).
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") {
    const msg = status === 429 ? "The assistant is busy right now. Try again in a minute." : "The assistant is unavailable right now. Try again shortly.";
    return Response.json({ error: msg }, { status: 502 });
  }
  return Response.json({ error: "Server error" }, { status: 500 });
}
