"use client";

export function CheckinOptIn({ onChoose }: { onChoose: (on: boolean) => void }) {
  return (
    <section className="panel panel-pad space-y-3">
      <p className="font-bold">Want a quick check-in when you arrive? It helps everyone&apos;s predictions.</p>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-primary" onClick={() => onChoose(true)}>
          Turn on
        </button>
        <button className="btn btn-quiet" onClick={() => onChoose(false)}>
          No thanks
        </button>
      </div>
    </section>
  );
}
