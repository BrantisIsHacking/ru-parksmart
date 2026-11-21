import { runChat, type ChatProfile, type ChatTurn } from "@/lib/gemini/chat";
import { errorResponse, HttpError, reporterFrom } from "@/lib/server/identity";
import { logEvent } from "@/lib/server/metrics";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const reporter = await reporterFrom(req);
    rateLimit(`chat:${reporter}`, 15, 60_000);
    const body = (await req.json()) as { messages?: ChatTurn[]; profile?: ChatProfile };
    const messages = (body.messages ?? [])
      .filter((m) => (m.role === "user" || m.role === "model") && typeof m.text === "string" && m.text.trim())
      .slice(-20)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 2000) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      throw new HttpError(400, "Last message must be from the user");
    }
    const profile: ChatProfile = {
      permitId: typeof body.profile?.permitId === "string" ? body.profile.permitId.slice(0, 64) : null,
      classes: typeof body.profile?.classes === "string" ? body.profile.classes.slice(0, 1000) : null,
      commuteMin: Number(body.profile?.commuteMin) || null,
    };
    const result = await runChat(messages, profile);
    await logEvent("chat_message", reporter, {
      toolCalls: result.tools.length,
      usedRulesEngine: result.tools.some((t) => t.name === "check_permit" || t.name === "plan_park_or_ride"),
    });
    if (result.parkAndRideShown) await logEvent("parkorride_shown", reporter, { via: "chat" });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
