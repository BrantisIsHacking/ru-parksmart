"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/identity";
import { describeClasses, useProfile } from "@/lib/client/profile";
import type { ChatResult, ChatTurn, ToolTrace } from "@/lib/gemini/chat";

interface Message extends ChatTurn {
  tools?: ToolTrace[];
  places?: ChatResult["places"];
}

const TOOL_LABEL: Record<string, string> = {
  check_permit: "Checked the permit rules",
  plan_park_or_ride: "Planned lots and buses",
  get_lot_status: "Estimated how full lots are",
  list_lots: "Looked up pilot lots",
  ask_maps: "Asked Google Maps",
};

const SUGGESTIONS = [
  "I have class in Tillett at 11. Where should I park?",
  "Can I park in the Green Lot at 5:30 PM?",
  "How full will the Yellow Lot be at 10:15?",
];

export default function Chat() {
  const [profile] = useProfile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  // Braces matter: newer Chrome returns a Promise from scrollIntoView, and an
  // effect must return nothing or a cleanup function.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...messages, { role: "user" as const, text: t }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await api<ChatResult>("/api/chat", {
        messages: next.map(({ role, text }) => ({ role, text })),
        profile: {
          permitId: profile?.permitId,
          commuteMin: profile?.commuteMin,
          classes: profile?.classes.length ? describeClasses(profile.classes) : null,
        },
      });
      setMessages([...next, { role: "model", text: res.reply, tools: res.tools, places: res.places }]);
    } catch (e) {
      setMessages([...next, { role: "model", text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col">
      <div className="flex-1 space-y-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h1 className="text-[27px] font-extrabold leading-tight">Ask about parking</h1>
              <p className="max-w-prose text-muted">
                Ask in your own words. Gemini explains the answer, but whether your permit allows a lot always comes from the official rules, not the AI.
              </p>
            </div>
            <ul className="panel">
              {SUGGESTIONS.map((s) => (
                <li key={s} className="border-t border-line first:border-t-0">
                  <button className="w-full px-4 py-3.5 text-left font-semibold" onClick={() => send(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-[14px] rounded-br-[4px] bg-asphalt px-4 py-2.5 text-on-sign">{m.text}</p>
            </div>
          ) : (
            <div key={i} className="max-w-[95%] space-y-2 border-l-[3px] border-curb pl-3.5">
              <p className="whitespace-pre-wrap text-[17px] leading-relaxed">{m.text}</p>
              {!!m.tools?.length && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold text-muted">
                  {[...new Set(m.tools.map((t) => t.name))].map((name) => (
                    <li key={name} className="flex items-center gap-1">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-go" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
                        <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {TOOL_LABEL[name] ?? name}
                    </li>
                  ))}
                </ul>
              )}
              {!!m.places?.length && (
                <ul className="space-y-0.5 text-[15px]">
                  {m.places.map((p) => (
                    <li key={p.uri}>
                      <a href={p.uri} target="_blank" rel="noreferrer" className="link">{p.title}</a>
                      <span className="text-[13px] text-muted"> on Google Maps</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
        {busy && <p className="border-l-[3px] border-line pl-3.5 text-muted">Checking the rules and lots…</p>}
        <div ref={bottom} />
      </div>

      <form
        className="sticky bottom-[4.75rem] mt-6 flex gap-2 bg-concrete py-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="field flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Where should I park for my 11:00?"
          maxLength={2000}
          aria-label="Your question"
        />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>
          Ask
        </button>
      </form>
      {!profile?.permitId && (
        <p className="text-[13px] text-muted">
          <a href="/onboarding" className="link">Save your permit</a> so you don&apos;t have to mention it every time.
        </p>
      )}
    </div>
  );
}
