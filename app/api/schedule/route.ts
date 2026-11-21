import { extractSchedule } from "@/lib/gemini/schedule";
import { errorResponse, HttpError, reporterFrom } from "@/lib/server/identity";
import { logEvent } from "@/lib/server/metrics";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BASE64 = 6 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const reporter = await reporterFrom(req);
    rateLimit(`schedule:${reporter}`, 5, 60_000);
    const { imageBase64, mimeType } = (await req.json()) as { imageBase64?: string; mimeType?: string };
    if (!imageBase64 || !mimeType || !ALLOWED.has(mimeType)) throw new HttpError(400, "Send a PNG, JPEG or WebP screenshot");
    if (imageBase64.length > MAX_BASE64) throw new HttpError(413, "Image too large");
    const result = await extractSchedule(imageBase64, mimeType);
    await logEvent("schedule_import", reporter, { classes: result.classes.length, unreadable: result.unreadable });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
