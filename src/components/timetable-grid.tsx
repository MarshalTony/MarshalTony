import * as React from "react";

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TimetableGrid({ title, slots }: { title: string; slots: { id: string; day: number; start: string; end: string; title: string; sub?: string; actions?: React.ReactNode }[] }) {
  const times = [...new Set(slots.map((s) => `${s.start}-${s.end}`))].sort();
  const days = [1, 2, 3, 4, 5, ...(slots.some((s) => s.day === 6) ? [6] : [])];
  if (!slots.length) return <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No periods set for {title} yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr><th className="p-2 text-left">Time</th>{days.map((d) => <th key={d} className="p-2 text-left">{DAYS[d]}</th>)}</tr>
        </thead>
        <tbody>
          {times.map((t) => (
            <tr key={t} className="border-t border-slate-100 align-top">
              <td className="whitespace-nowrap p-2 text-xs text-slate-500">{t.replace("-", " – ")}</td>
              {days.map((d) => {
                const s = slots.find((x) => x.day === d && `${x.start}-${x.end}` === t);
                return (
                  <td key={d} className="p-1.5">
                    {s && (
                      <div className="rounded bg-brand-50 p-1.5">
                        <p className="font-medium text-brand-900">{s.title}</p>
                        {s.sub && <p className="text-xs text-slate-500">{s.sub}</p>}
                        {s.actions}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
