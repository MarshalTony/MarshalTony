"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";
import { cn } from "@/lib/utils";

export type MenuItem = { href: string; label: string; hint?: string; icon?: React.ReactNode; external?: boolean };

/** A button that opens a short list of links (closes on choice, Escape or a click outside). Used to group page actions. */
export function MenuButton({ label, icon, items, variant = "outline", align = "right" }: { label: string; icon?: React.ReactNode; items: MenuItem[]; variant?: ButtonProps["variant"]; align?: "left" | "right" }) {
  const [open, setOpen] = React.useState(false);
  const [side, setSide] = React.useState<"left" | "right">(align);
  const ref = React.useRef<HTMLDivElement>(null);
  /** Open towards the side with room, so the menu never runs off a phone screen. */
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setSide(r.left + 256 > window.innerWidth - 8 ? "right" : r.right - 256 < 8 ? "left" : align);
    setOpen((o) => !o);
  };
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative">
      <Button type="button" variant={variant} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        {icon}{label}<ChevronDown className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <div role="menu" className={cn("absolute z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-lg", side === "right" ? "right-0" : "left-0")}>
          {items.map((i) => {
            const body = (
              <span className="flex items-start gap-2">
                <span className="mt-0.5 text-slate-500 [&_svg]:h-4 [&_svg]:w-4">{i.icon}</span>
                <span><span className="block text-sm font-medium text-slate-800">{i.label}</span>{i.hint && <span className="block text-xs text-slate-500">{i.hint}</span>}</span>
              </span>
            );
            const cls = "block rounded-md px-2.5 py-2 hover:bg-brand-50";
            return i.external
              ? <a key={i.href} role="menuitem" href={i.href} className={cls} onClick={() => setOpen(false)}>{body}</a>
              : <Link key={i.href} role="menuitem" href={i.href} className={cls} onClick={() => setOpen(false)}>{body}</Link>;
          })}
        </div>
      )}
    </div>
  );
}
