"use client";
import * as React from "react";
import { FileText, Search, Users, User } from "lucide-react";
import { Button } from "./ui/button";
import { Input, Label, Select } from "./ui/input";

type Year = { id: string; name: string; isCurrent: boolean };
type Term = { id: string; name: string; yearId: string; isCurrent: boolean };
type Exam = { id: string; name: string; termId: string; typeCode: string; classIds: string[]; ready: boolean };
type Cls = { id: string; name: string; streams: { id: string; name: string }[] };
type Found = { id: string; name: string; admissionNo: string; cls: string; status: string };

/**
 * Report cards: Year → Term → Report (exam) → Class → Stream, then Generate (one PDF for the class/stream);
 * or search one student for the same report. PDFs open in a new tab.
 */
export function ReportCardPicker({ years, terms, exams, classes }: { years: Year[]; terms: Term[]; exams: Exam[]; classes: Cls[] }) {
  const firstYear = years.find((y) => y.isCurrent) ?? years[0];
  const [yearId, setYearId] = React.useState(firstYear?.id ?? "");
  const termsOf = (y: string) => terms.filter((t) => t.yearId === y);
  const pickTerm = (y: string) => (termsOf(y).find((t) => t.isCurrent) ?? termsOf(y).slice(-1)[0])?.id ?? "";
  const [termId, setTermId] = React.useState(pickTerm(firstYear?.id ?? ""));
  const examsOf = (t: string) => exams.filter((e) => e.termId === t);
  const pickExam = (t: string) => (examsOf(t).find((e) => e.typeCode === "EOT") ?? examsOf(t)[0])?.id ?? "";
  const [examId, setExamId] = React.useState(pickExam(termId));
  const exam = exams.find((e) => e.id === examId);
  const classOpts = classes.filter((c) => exam?.classIds.includes(c.id));
  const [classId, setClassId] = React.useState(classOpts[0]?.id ?? "");
  const cls = classOpts.find((c) => c.id === classId);
  const [streamId, setStreamId] = React.useState("");

  // One student
  const [q, setQ] = React.useState("");
  const [found, setFound] = React.useState<Found[]>([]);
  const [student, setStudent] = React.useState<Found | null>(null);
  const [searching, setSearching] = React.useState(false);

  // Keep later choices valid when an earlier one changes.
  const onYear = (v: string) => { setYearId(v); const t = pickTerm(v); setTermId(t); onTerm(t); };
  function onTerm(v: string) { setTermId(v); const e = pickExam(v); setExamId(e); onExam(e); }
  function onExam(v: string) {
    setExamId(v);
    const ids = exams.find((e) => e.id === v)?.classIds ?? [];
    if (!ids.includes(classId)) { setClassId(classes.find((c) => ids.includes(c.id))?.id ?? ""); setStreamId(""); }
    setStudent(null); setFound([]); setQ("");
  }

  React.useEffect(() => {
    if (q.trim().length < 2 || student) { setFound([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/students/lookup?q=${encodeURIComponent(q.trim())}${examId ? `&examId=${examId}` : ""}`);
        setFound(r.ok ? await r.json() : []);
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, examId, student]);

  const classHref = examId && classId ? `/api/pdf/report-card?examId=${examId}&${streamId ? `streamId=${streamId}` : `classId=${classId}`}` : null;
  const studentHref = examId && student ? `/api/pdf/report-card?examId=${examId}&studentId=${student.id}` : null;
  const field = (id: string, label: string, el: React.ReactNode) => <div className="space-y-1"><Label htmlFor={id}>{label}</Label>{el}</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {field("rc-year", "1. Year", <Select id="rc-year" value={yearId} onChange={(e) => onYear(e.target.value)} className="w-full">{years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? " (current)" : ""}</option>)}</Select>)}
          {field("rc-term", "2. Term", <Select id="rc-term" value={termId} onChange={(e) => onTerm(e.target.value)} className="w-full">{termsOf(yearId).map((t) => <option key={t.id} value={t.id}>{t.name}{t.isCurrent ? " (current)" : ""}</option>)}</Select>)}
          {field("rc-exam", "3. Report", (
            <Select id="rc-exam" value={examId} onChange={(e) => onExam(e.target.value)} className="w-full" disabled={!examsOf(termId).length}>
              {!examsOf(termId).length && <option value="">No examinations this term</option>}
              {examsOf(termId).map((e) => <option key={e.id} value={e.id}>{e.name}{e.ready ? "" : " (no marks yet)"}</option>)}
            </Select>
          ))}
        </div>
        {!examsOf(termId).length && <p className="mt-2 text-sm text-amber-700">There are no examinations in this term. The Director of Studies creates them under Examinations.</p>}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-brand-700" />Class or stream</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("rc-class", "4. Class", <Select id="rc-class" value={classId} onChange={(e) => { setClassId(e.target.value); setStreamId(""); }} className="w-full" disabled={!exam}>{classes.map((c) => <option key={c.id} value={c.id} disabled={!exam?.classIds.includes(c.id)}>{c.name}{exam && !exam.classIds.includes(c.id) ? " — not in this exam" : ""}</option>)}</Select>)}
            {field("rc-stream", "5. Stream", <Select id="rc-stream" value={streamId} onChange={(e) => setStreamId(e.target.value)} className="w-full" disabled={!cls}><option value="">All streams</option>{cls?.streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>)}
          </div>
          {exam && classOpts.length < classes.length && (
            <p className="mt-2 text-xs text-amber-700">{exam.name} includes only {classOpts.map((c) => c.name).join(", ") || "no classes"}. To add other classes, open <a className="underline" href={`/exams/${exam.id}`}>the examination</a> and choose <i>Edit</i>.</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {classHref ? <Button asChild><a href={classHref} target="_blank" rel="noopener"><FileText />Generate report cards</a></Button> : <Button disabled><FileText />Generate report cards</Button>}
            {exam && classId && <a className="text-sm text-brand-700 hover:underline" href={`/exams/${exam.id}/comments?streamId=${streamId || cls?.streams[0]?.id || ""}`}>Comments</a>}
            {exam && classId && <a className="text-sm text-brand-700 hover:underline" href={`/exams/${exam.id}/analysis?classId=${classId}`}>Analysis</a>}
            {exam && classId && <a className="text-sm text-brand-700 hover:underline" href={`/exams/${exam.id}/readiness?classId=${classId}`}>Readiness</a>}
          </div>
          <p className="mt-2 text-xs text-slate-500">One PDF with a card for every student {streamId ? "in the stream" : "in the class"}, opened in a new tab to print or save. Latest saved marks are included automatically.</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><User className="h-4 w-4 text-brand-700" />One student</h2>
          {student ? (
            <div className="flex items-center justify-between gap-2 rounded border border-brand-200 bg-brand-50 p-2 text-sm">
              <span><span className="font-medium">{student.name}</span><span className="block font-mono text-xs text-slate-500">{student.admissionNo} · {student.cls}{student.status !== "ACTIVE" ? ` · ${student.status.toLowerCase()}` : ""}</span></span>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setStudent(null); setQ(""); }}>Change</Button>
            </div>
          ) : (
            <div className="relative">
              {field("rc-student", "Student name or admission no.", (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input id="rc-student" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Achieng Moses or 0021" className="pl-8" autoComplete="off" disabled={!examId} />
                </div>
              ))}
              {q.trim().length >= 2 && (
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg" role="listbox" aria-label="Matching students">
                  {searching && !found.length && <li className="p-2 text-sm text-slate-500">Searching…</li>}
                  {!searching && !found.length && <li className="p-2 text-sm text-slate-500">No student in this report&apos;s classes matches.</li>}
                  {found.map((f) => (
                    <li key={f.id}>
                      <button type="button" role="option" aria-selected="false" onClick={() => { setStudent(f); setFound([]); }} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-brand-50">
                        {f.name} <span className="font-mono text-xs text-slate-500">{f.admissionNo} · {f.cls}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-4">
            {studentHref ? <Button asChild><a href={studentHref} target="_blank" rel="noopener"><FileText />Generate report card</a></Button> : <Button disabled><FileText />Generate report card</Button>}
          </div>
          <p className="mt-2 text-xs text-slate-500">Uses the year, term and report chosen above.</p>
        </div>
      </div>
    </div>
  );
}
