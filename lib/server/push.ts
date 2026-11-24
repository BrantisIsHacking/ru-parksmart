import * as webpush from "web-push";
import { isAllowedPushEndpoint } from "./pushEndpoint";

let configured = false;

/**
 * Configure web-push from the VAPID env. Throws if the keys are missing or invalid,
 * so the cron can refuse to run (503) before touching any trip.
 */
export function configurePush(): void {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys are not configured");
  // setVapidDetails validates the subject and key formats and throws on bad values.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://ru-parksmart.vercel.app", pub, priv);
  configured = true;
}

/**
 * Send the "Did you find a spot?" notification.
 * - "sent": delivered to the push service.
 * - "gone": the subscription is dead (404/410).
 * - "retry": possibly transient (429, 5xx, network error); worth trying again.
 * - "failed": permanent (any other 4xx, or a malformed subscription).
 */
export async function sendCheckin(
  sub: PushSubscriptionJSON,
  payload: { tripId: string; lotName: string },
): Promise<"sent" | "gone" | "retry" | "failed"> {
  // Defense in depth: never send to a host outside the push-service allowlist.
  if (!isAllowedPushEndpoint(sub.endpoint) || !sub.keys?.p256dh || !sub.keys.auth) return "failed";
  configurePush();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      JSON.stringify({
        title: "Did you find a spot?",
        body: `At ${payload.lotName}. Tap to answer.`,
        url: `/?checkin=${payload.tripId}`,
      }),
      { TTL: 3600 },
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    if (typeof status !== "number" || status === 429 || status >= 500) return "retry";
    return "failed";
  }
}
