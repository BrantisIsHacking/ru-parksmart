import { STATUS_LABEL } from "@/lib/client/format";
import type { LotStatus } from "@/lib/types";

/** Stall-paint swatch plus label. The label is always shown, so color is never the only signal. */
export function StatusBadge({ status, size = "sm" }: { status: LotStatus; size?: "sm" | "lg" }) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap font-bold ${size === "lg" ? "text-[17px]" : "text-[15px]"}`}>
      <span className={`swatch swatch-${status}`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
