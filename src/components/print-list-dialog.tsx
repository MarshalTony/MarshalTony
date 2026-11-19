"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input, Label, Select } from "./ui/input";

const LAYOUTS = [
  { value: "nominal", label: "Nominal roll", hint: "Numbered list with the columns you choose, boys/girls totals and a signature line." },
  { value: "attendance", label: "Attendance / roll-call sheet", hint: "Names with empty boxes to tick for each day (landscape)." },
  { value: "marks", label: "Mark sheet", hint: "Admission no. and names with blank columns for marking on paper." },
  { value: "contacts", label: "Parents' contact list", hint: "Parent / guardian name and phone for each student." },
  { value: "photos", label: "Photo register", hint: "Grid of photos with names — for gates, exams and checking." },
] as const;

const COLS = [
  ["photo", "Photo"], ["adm", "Adm. No."], ["name", "Name"], ["sex", "Sex"], ["class", "Class"], ["residence", "Day/Boarding"],
  ["dob", "Date of birth"], ["lin", "LIN"], ["schoolpay", "SchoolPay"], ["parent", "Parent / guardian"], ["phone", "Parent phone"], ["subjects", "Subjects"],
] as const;
const DEFAULT_COLS = ["adm", "name", "sex", "class", "residence"];

/** "Print list" on Students: builds a PDF of exactly the filtered list, in one of the layouts. */
export function PrintListDialog({ total, canContacts }: { total: number; canContacts: boolean }) {
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [layout, setLayout] = React.useState<string>("nominal");
  const [cols, setCols] = React.useState<string[]>(DEFAULT_COLS);
  const [blank, setBlank] = React.useState("");
  const [labels, setLabels] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [sort, setSort] = React.useState("name");
  const [landscape, setLandscape] = React.useState(false);

  const href = React.useMemo(() => {
    const q = new URLSearchParams(params.toString());
    q.delete("page"); q.delete("sort"); q.delete("dir");
    q.set("layout", layout);
    if (layout === "nominal") q.set("cols", cols.join(","));
    if ((layout === "attendance" || layout === "marks") && blank) q.set("blank", blank);
    if (labels.trim() && layout !== "contacts" && layout !== "photos") q.set("labels", labels);
    if (title.trim()) q.set("title", title.trim());
    q.set("sort", sort);
    if (landscape) q.set("landscape", "1");
    return `/api/pdf/class-list?${q.toString()}`;
  }, [params, layout, cols, blank, labels, title, sort, landscape]);

  const needsContacts = layout === "contacts" || (layout === "nominal" && cols.some((c) => c === "parent" || c === "phone"));
  const toggle = (c: string) => setCols((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : COLS.map(([k]) => k).filter((k) => k === c || cs.includes(k))));

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      wide
      title="Print list"
      description={`A PDF of the ${total.toLocaleString()} student${total === 1 ? "" : "s"} in the current list (change the filters first to narrow it).`}
      trigger={<Button variant="outline" disabled={total === 0}><Printer />Print list</Button>}
    >
      <div className="space-y-4">
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Layout</legend>
          {LAYOUTS.map((l) => (
            <label key={l.value} className={`flex cursor-pointer gap-2 rounded-md border p-2 text-sm ${layout === l.value ? "border-brand-600 bg-brand-50" : "border-slate-200"}`}>
              <input type="radio" name="layout" value={l.value} checked={layout === l.value} onChange={() => setLayout(l.value)} className="mt-0.5" />
              <span><span className="font-medium">{l.label}</span><span className="block text-xs text-slate-500">{l.hint}</span></span>
            </label>
          ))}
        </fieldset>

        {layout === "nominal" && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Columns</legend>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {COLS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={cols.includes(k)} onChange={() => toggle(k)} />{label}</label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(layout === "attendance" || layout === "marks") && (
            <div className="space-y-1">
              <Label htmlFor="pl-blank">Number of blank columns</Label>
              <Input id="pl-blank" type="number" min={1} max={layout === "attendance" ? 20 : 10} placeholder={layout === "attendance" ? "12" : "5"} value={blank} onChange={(e) => setBlank(e.target.value)} />
            </div>
          )}
          {layout !== "contacts" && layout !== "photos" && (
            <div className="space-y-1">
              <Label htmlFor="pl-labels">{layout === "nominal" ? "Extra blank columns (optional)" : "Column headings (optional)"}</Label>
              <Input id="pl-labels" placeholder={layout === "attendance" ? "Mon, Tue, Wed…" : layout === "marks" ? "Test 1, Test 2, Project" : "e.g. Fees, Uniform, Signature"} value={labels} onChange={(e) => setLabels(e.target.value)} />
              <p className="text-xs text-slate-500">Separate with commas.</p>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="pl-title">Title (optional)</Label>
            <Input id="pl-title" placeholder="Made from the filters if left empty" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pl-sort">Order</Label>
            <Select id="pl-sort" value={sort} onChange={(e) => setSort(e.target.value)} className="w-full">
              <option value="name">By name</option><option value="stream">By class & stream, then name</option><option value="adm">By admission number</option>
            </Select>
          </div>
          {layout !== "attendance" && (
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} />Landscape page</label>
          )}
        </div>

        {needsContacts && !canContacts && (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Parents&apos; phone numbers can only be printed by the office, or by a class teacher for their own stream (choose your stream in the filters first).</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button asChild><a href={href} target="_blank" rel="noopener" onClick={() => setOpen(false)}><Printer />Open PDF</a></Button>
        </div>
      </div>
    </Dialog>
  );
}
