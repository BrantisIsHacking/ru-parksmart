"use client";
import { useState } from "react";
import { track } from "@/lib/client/identity";

export function SatisfactionPrompt({ onDone }: { onDone: () => void }) {
  const [sent, setSent] = useState(false);
  return (
    <section className="panel panel-pad space-y-3">
      {sent ? (
        <p className="font-semibold">Thanks. This helps us judge the pilot.</p>
      ) : (
        <>
          <p className="font-bold">How useful has ParkSmart been so far?</p>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className="btn btn-quiet px-0 tabular-nums"
                aria-label={`${n} out of 5`}
                onClick={() => {
                  track("satisfaction", { rating: n });
                  setSent(true);
                  onDone();
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[13px] text-muted">
            <span>Not useful</span>
            <span>Very useful</span>
          </div>
        </>
      )}
    </section>
  );
}
