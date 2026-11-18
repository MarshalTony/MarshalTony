"use client";
import * as React from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// Validated reference palette (dataviz skill): categorical slots 1–2, recessive ink for axes/grid.
const SERIES = ["#2a78d6", "#eb6834"];
const INK = { axis: "#52514e", grid: "#e7e5e4" };
const tick = { fill: INK.axis, fontSize: 11 };

type Datum = Record<string, string | number>;
const fmtNum = (v: unknown) => (typeof v === "number" ? new Intl.NumberFormat("en-UG", { maximumFractionDigits: 1 }).format(v) : String(v));

function Frame({ title, children, height = 240 }: { title: string; children: React.ReactElement; height?: number }) {
  return (
    <figure className="w-full">
      <figcaption className="mb-2 text-sm font-medium text-slate-700">{title}</figcaption>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </figure>
  );
}

/** One measure per category (magnitude) — one hue, no legend; the title names the series. */
export function SimpleBarChart({ title, data, x, y, unit = "", height, domainMax }: { title: string; data: Datum[]; x: string; y: string; unit?: string; height?: number; domainMax?: number }) {
  return (
    <Frame title={title} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap="25%">
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey={x} tick={tick} tickLine={false} axisLine={{ stroke: INK.grid }} interval={0} angle={data.length > 8 ? -35 : 0} textAnchor={data.length > 8 ? "end" : "middle"} height={data.length > 8 ? 60 : 30} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={48} domain={[0, domainMax ?? "auto"]} tickFormatter={(v) => fmtNum(v)} />
        <Tooltip cursor={{ fill: "rgba(42,120,214,0.08)" }} formatter={(v) => [`${fmtNum(v)}${unit}`, title]} />
        <Bar dataKey={y} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </Frame>
  );
}

/** Two series per category (e.g. boys/girls) — slots 1–2 with legend. */
export function PairedBarChart({ title, data, x, series, height }: { title: string; data: Datum[]; x: string; series: { key: string; label: string }[]; height?: number }) {
  return (
    <Frame title={title} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey={x} tick={tick} tickLine={false} axisLine={{ stroke: INK.grid }} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(42,120,214,0.08)" }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: INK.axis }} />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={28} />)}
      </BarChart>
    </Frame>
  );
}

/** Change over time — single line, crosshair tooltip. */
export function TrendLineChart({ title, data, x, y, money, height }: { title: string; data: Datum[]; x: string; y: string; money?: boolean; height?: number }) {
  const f = (v: unknown) => (money && typeof v === "number" ? `UGX ${new Intl.NumberFormat("en-UG", { notation: "compact" }).format(v)}` : fmtNum(v));
  return (
    <Frame title={title} height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey={x} tick={tick} tickLine={false} axisLine={{ stroke: INK.grid }} minTickGap={16} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={64} tickFormatter={f} />
        <Tooltip cursor={{ stroke: INK.axis, strokeDasharray: "3 3" }} formatter={(v) => [money && typeof v === "number" ? `UGX ${new Intl.NumberFormat("en-UG").format(v)}` : fmtNum(v), title]} />
        <Line type="monotone" dataKey={y} stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: SERIES[0] }} activeDot={{ r: 5 }} />
      </LineChart>
    </Frame>
  );
}
