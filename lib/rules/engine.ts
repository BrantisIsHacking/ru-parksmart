// Deterministic permit-rules engine. This is the ONLY component that decides
// whether a permit may park in a lot. Gemini calls it and explains the answer.
import type { PermitCheck, PermitRule, RulesFile } from "../types";
import { campusParts, describeCampusTime, parseHHMM } from "../time";

function permitMatches(rule: PermitRule, permitId: string): boolean {
  if (rule.permits.includes(permitId)) return true;
  return rule.permits.includes("*") && permitId !== "none";
}

/** True when campus-local (weekday, minutes) falls inside the rule's window. */
export function inWindow(rule: PermitRule, weekday: number, minutes: number): boolean {
  const start = parseHHMM(rule.start);
  const end = parseHHMM(rule.end);
  if (end > start) {
    return rule.days.includes(weekday) && minutes >= start && minutes < end;
  }
  // Overnight window: the evening part belongs to `days`, the early-morning
  // part belongs to the following day.
  const prevDay = (weekday + 6) % 7;
  return (
    (rule.days.includes(weekday) && minutes >= start) ||
    (rule.days.includes(prevDay) && minutes < end)
  );
}

export function checkPermit(
  rules: RulesFile,
  lotId: string,
  permitId: string,
  when: Date,
): PermitCheck {
  const { weekday, minutes } = campusParts(when);
  const at = describeCampusTime(when);
  const base = { lotId, permitId, at, rulesVersion: rules.version };

  if (!rules.permits.some((p) => p.id === permitId)) {
    return {
      ...base,
      allowed: false,
      matchedRuleId: null,
      reason: `Unknown permit type "${permitId}". Known types: ${rules.permits.map((p) => p.id).join(", ")}.`,
      verified: rules.verified,
    };
  }
  if (!rules.rules.some((r) => r.lots.includes(lotId))) {
    return {
      ...base,
      allowed: false,
      matchedRuleId: null,
      reason: `Lot "${lotId}" is not covered by rules version ${rules.version}. Check rudots.rutgers.edu.`,
      verified: false,
    };
  }

  const match = rules.rules.find(
    (r) => r.lots.includes(lotId) && permitMatches(r, permitId) && inWindow(r, weekday, minutes),
  );
  if (match) {
    return {
      ...base,
      allowed: true,
      matchedRuleId: match.id,
      reason: match.note,
      verified: rules.verified && match.verified,
    };
  }
  return {
    ...base,
    allowed: false,
    matchedRuleId: null,
    reason: `No rule allows permit "${permitId}" in ${lotId} at ${at}.`,
    verified: rules.verified,
  };
}

/** All lots the permit may use at `when`, in rules-file order. */
export function eligibleLots(rules: RulesFile, permitId: string, when: Date): PermitCheck[] {
  const lotIds = [...new Set(rules.rules.flatMap((r) => r.lots))];
  return lotIds.map((id) => checkPermit(rules, id, permitId, when)).filter((c) => c.allowed);
}

/** Structural checks run in tests so a bad rules file fails loudly. */
export function validateRules(rules: RulesFile): string[] {
  const errors: string[] = [];
  const permitIds = new Set(rules.permits.map((p) => p.id));
  const ruleIds = new Set<string>();
  for (const r of rules.rules) {
    if (ruleIds.has(r.id)) errors.push(`Duplicate rule id ${r.id}`);
    ruleIds.add(r.id);
    for (const p of r.permits) {
      if (p !== "*" && !permitIds.has(p)) errors.push(`Rule ${r.id}: unknown permit ${p}`);
    }
    if (!r.lots.length) errors.push(`Rule ${r.id}: no lots`);
    if (!r.days.length || r.days.some((d) => d < 0 || d > 6)) errors.push(`Rule ${r.id}: bad days`);
    try {
      parseHHMM(r.start);
      parseHHMM(r.end);
    } catch (e) {
      errors.push(`Rule ${r.id}: ${(e as Error).message}`);
    }
  }
  return errors;
}
