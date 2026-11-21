import "server-only";
// Function-calling loop: Gemini proposes tool calls, the server executes them
// against deterministic code, results go back to Gemini, repeat until it answers.
import type { Content, Part } from "@google/genai";
import { ACTIVE_RULES } from "../data";
import { describeCampusTime } from "../time";
import { gemini, GEMINI_MODEL, MAPS_GROUNDING_ENABLED } from "./client";
import { buildSystemPrompt } from "./systemPrompt";
import { FUNCTION_DECLARATIONS, runTool, type ToolContext } from "./tools";
import type { MapsPlace } from "./mapsGrounding";

const MAX_TOOL_ROUNDS = 6;

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export interface ChatProfile {
  permitId?: string | null;
  classes?: string | null;
  commuteMin?: number | null;
}

export interface ToolTrace {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
}

export interface ChatResult {
  reply: string;
  tools: ToolTrace[];
  places: MapsPlace[];
  parkAndRideShown: boolean;
}

export async function runChat(history: ChatTurn[], profile: ChatProfile, now = new Date()): Promise<ChatResult> {
  const systemInstruction = buildSystemPrompt({
    campusNow: describeCampusTime(now),
    rulesVersion: ACTIVE_RULES.version,
    rulesVerified: ACTIVE_RULES.verified,
    profile,
    mapsEnabled: MAPS_GROUNDING_ENABLED,
  });
  const contents: Content[] = history.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
  const ctx: ToolContext = { now, places: [], parkAndRideShown: false };
  const traces: ToolTrace[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await gemini().models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      },
    });
    const calls = res.functionCalls ?? [];
    if (!calls.length || round === MAX_TOOL_ROUNDS) {
      return {
        reply: res.text?.trim() || "Sorry, I couldn't put an answer together. Try rephrasing, or check rudots.rutgers.edu.",
        tools: traces,
        places: ctx.places,
        parkAndRideShown: ctx.parkAndRideShown,
      };
    }
    // Echo the model turn back unchanged (keeps thought signatures intact).
    const modelContent = res.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    const responses: Part[] = [];
    for (const call of calls) {
      const name = call.name ?? "";
      const args = (call.args ?? {}) as Record<string, unknown>;
      let result: unknown;
      try {
        result = await runTool(name, args, ctx);
      } catch (e) {
        result = { error: (e as Error).message };
      }
      const ok = !(result && typeof result === "object" && "error" in result);
      traces.push({ name, args, ok });
      responses.push({ functionResponse: { id: call.id, name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  throw new Error("unreachable");
}
