"use client";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Plan", icon: "M4 20V5a1 1 0 011-1h7a5 5 0 010 10H8" },
  { href: "/chat", label: "Ask", icon: "M4 5h16v11H9l-5 4z" },
  { href: "/report", label: "Report", icon: "M6 21V4h11l-2 4 2 4H6" },
  { href: "/onboarding", label: "Profile", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" },
];

export function Nav() {
  const path = usePathname();
  if (path?.startsWith("/pilot")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-slab pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {ITEMS.map((it) => {
          const active = it.href === "/" ? path === "/" : path?.startsWith(it.href);
          return (
            <li key={it.href}>
              <a
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 pt-3 pb-2.5 text-[13px] ${active ? "font-bold text-ink" : "font-medium text-muted"}`}
              >
                {active && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b bg-curb" aria-hidden />}
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                  <path d={it.icon} />
                </svg>
                {it.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
