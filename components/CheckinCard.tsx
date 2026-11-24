"use client";
import { useState } from "react";
import { clearPending, type PendingTrip } from "@/lib/client/checkin";
import { clock } from "@/lib/client/format";
import { ApiError, api } from "@/lib/client/identity";

type Value = "easy" | "circled" | "full";
const ANSWERS: { value: Value; label: string }[] = [
  { value: "easy", label: "Found one easily" },
  { value: "circled", label: "Had to circle" },
  { value: "full", label: "Lot was full" },
];

export function CheckinCard({ trip, onDone }: { trip: PendingTrip; onDone: () => void }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const answer = async (value: Value) => {
    setBusy(true);
    try {
      await api("/api/outcomes", { tripId: trip.tripId, value });
      setSent(true);
      clearPending(trip.tripId);
      setTimeout(onDone, 3000); // let the thanks show briefly
    } catch (e) {
      const s = e instanceof ApiError ? e.status : 0;
      if (s === 403 || s === 404 || s === 409 || s === 410) {
        // Not ours, unknown, already answered or too late: never ask again.
        clearPending(trip.tripId);
        onDone();
      } else {
        setBusy(false); // network error: leave the card so they can retry
      }
    }
  };

  if (sent) {
    return (
      <section className="panel panel-pad">
        <p className="font-semibold">Thanks! That helps everyone&apos;s predictions.</p>
      </section>
    );
  }
  return (
    <section className="panel panel-pad space-y-3">
      <p className="font-bold">
        Did you find a spot at {trip.lotName.replace(/\s*\(placeholder\)/, "")} around {clock(trip.parkBy)}?
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ANSWERS.map((a) => (
          <button key={a.value} className="btn btn-quiet" disabled={busy} onClick={() => answer(a.value)}>
            {a.label}
          </button>
        ))}
      </div>
      <button
        className="link text-[15px]"
        onClick={() => {
          clearPending(trip.tripId);
          onDone();
        }}
      >
        Didn&apos;t go
      </button>
    </section>
  );
}
