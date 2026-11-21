import "server-only";
import { GoogleGenAI } from "@google/genai";
import { HttpError } from "../server/identity";

let client: GoogleGenAI | null = null;

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
export const MAPS_GROUNDING_ENABLED = process.env.ENABLE_MAPS_GROUNDING === "1";

export function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new HttpError(503, "The assistant isn't configured yet (GEMINI_API_KEY is missing).");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}
