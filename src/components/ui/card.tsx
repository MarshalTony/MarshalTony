import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-slate-200 bg-white shadow-sm", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold text-slate-900", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

const badgeColors = {
  default: "bg-slate-100 text-slate-700",
  blue: "bg-brand-100 text-brand-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
  purple: "bg-violet-100 text-violet-800",
};
export function Badge({ color = "default", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { color?: keyof typeof badgeColors }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", badgeColors[color], className)} {...props} />;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, keyof typeof badgeColors> = {
    ACTIVE: "green", APPROVED: "green", PAID: "green", PUBLISHED: "green", SENT: "green", PRESENT: "green", REGISTERED: "green", RESOLVED: "green", CONFIRMED: "green", RECEIVED: "green", COMMITTED: "green", COMPLETE: "green", IN_PROGRESS: "amber", MARKS_SAVED: "blue",
    PENDING: "amber", SUBMITTED: "amber", OPEN: "blue", DRAFT: "default", LATE: "amber", QUEUED: "amber", ON_LEAVE: "amber", SUSPENDED: "amber", PREVIEW: "amber",
    REJECTED: "red", VOIDED: "red", REVERSED: "red", FAILED: "red", ABSENT: "red", WITHDRAWN: "red", EXPELLED: "red", CANCELLED: "red", EXITED: "red", NOT_CONFIGURED: "red",
    CLOSED: "purple", GRADUATED: "purple", TRANSFERRED: "purple", EXCUSED: "blue",
  };
  return <Badge color={map[status] ?? "default"}>{status.replaceAll("_", " ")}</Badge>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {icon && <div className="rounded-md bg-brand-50 p-2 text-brand-700">{icon}</div>}
      </div>
    </Card>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "warn" | "error" | "success"; children: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return <div className={cn("rounded-md border px-3 py-2 text-sm", tones[tone], className)}>{children}</div>;
}

export function DL({ items, cols = 2 }: { items: [string, React.ReactNode][]; cols?: 2 | 3 }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 text-sm", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
