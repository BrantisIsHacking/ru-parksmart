import "server-only";
// Grounding with Google Maps runs as a separate sub-call so the main assistant
// loop stays on function calling. The assistant reaches it through the
// ask_maps tool, and the cited places are shown under the answer.
import { gemini, GEMINI_MODEL } from "./client";

export interface MapsPlace {
  title: string;
  uri: string;
}

// Livingston Campus, the pilot area.
const PILOT_CENTER = { latitude: 40.5237, longitude: -74.4366 };

export async function askMaps(question: string): Promise<{ answer: string; places: MapsPlace[] }> {
  const res = await gemini().models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: question }] }],
    config: {
      systemInstruction:
        "Answer briefly about places on or near the Rutgers–New Brunswick Livingston campus. Do not discuss parking permits or lot availability.",
      tools: [{ googleMaps: {} }],
      toolConfig: { retrievalConfig: { latLng: PILOT_CENTER } },
    },
  });
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const places: MapsPlace[] = [];
  for (const c of chunks) {
    if (c.maps?.uri && c.maps.title && !places.some((p) => p.uri === c.maps!.uri)) {
      places.push({ title: c.maps.title, uri: c.maps.uri });
    }
  }
  return { answer: res.text ?? "", places };
}
