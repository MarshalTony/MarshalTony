import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { saveGradingScale, saveResultRule } from "@/server/actions/settings";
import { ActionForm, CheckboxField, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";

const levelOpts = [{ value: "O_LEVEL", label: "O-Level" }, { value: "A_LEVEL", label: "A-Level" }];
const appliesOpts = [{ value: "ALL", label: "All subjects" }, { value: "PRINCIPAL", label: "Principal subjects" }, { value: "SUBSIDIARY", label: "Subsidiary subjects" }, { value: "ACTIVITY", label: "Activities of Integration (scores out of 3)" }];

export default async function GradingSettings() {
  await requirePage("exams.manage");
  const [scales, rules] = await Promise.all([
    prisma.gradingScale.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], include: { bands: { orderBy: { minScore: "desc" } } } }),
    prisma.resultRule.findMany(),
  ]);
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        The <strong>default</strong> scale for each level and subject group is used when results are generated. A-Level principal and subsidiary subjects can use separate scales and points.
      </p>
      <FormDialog trigger="New grading scale" title="New grading scale" action={saveGradingScale} wide>
        <ScaleFields />
      </FormDialog>
      <div className="grid gap-5 lg:grid-cols-2">
        {scales.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{s.name} {s.isDefault && <Badge color="green">Default</Badge>}</CardTitle>
              <FormDialog trigger="Edit" title={`Edit ${s.name}`} action={saveGradingScale} wide triggerVariant="outline" triggerSize="sm">
                <input type="hidden" name="id" value={s.id} />
                <ScaleFields s={s} />
              </FormDialog>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-slate-500">{s.level === "O_LEVEL" ? "O-Level" : "A-Level"} · {appliesOpts.find((a) => a.value === s.appliesTo)?.label}</p>
              <Table>
                <THead><tr><TH>{s.appliesTo === "ACTIVITY" ? "Identifier" : "Grade"}</TH><TH>{s.appliesTo === "ACTIVITY" ? "Score range" : "Range (%)"}</TH><TH>Points</TH><TH>Remark</TH></tr></THead>
                <tbody>
                  {s.bands.map((b) => <TR key={b.id}><TD className="font-semibold">{b.grade}</TD><TD>{Number(b.minScore)} – {Number(b.maxScore)}</TD><TD>{Number(b.points)}</TD><TD>{b.remark}{b.description && <p className="text-xs text-slate-500">{b.description}</p>}</TD></TR>)}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {(["O_LEVEL", "A_LEVEL"] as const).map((level) => {
          const r = rules.find((x) => x.level === level);
          const div = Array.isArray(r?.divisions) ? (r!.divisions as { label: string; min: number; max: number }[]) : [];
          return (
            <Card key={level}>
              <CardHeader><CardTitle>{level === "O_LEVEL" ? "O-Level" : "A-Level"} ranking rules</CardTitle></CardHeader>
              <CardContent>
                <ActionForm action={saveResultRule}>
                  <input type="hidden" name="level" value={level} />
                  <Grid>
                    <SelectField label="Rank students by" name="rankingBasis" defaultValue={r?.rankingBasis ?? "AVERAGE"} options={[
                      { value: "AVERAGE", label: "Average percentage (higher is better)" }, { value: "TOTAL", label: "Total marks (higher is better)" },
                      { value: "POINTS", label: "Total points (higher is better)" }, { value: "AGGREGATE", label: "Best-N aggregate (lower is better)" },
                    ]} />
                    <TextField label="Best N subjects (aggregate)" name="bestOfSubjects" type="number" defaultValue={r?.bestOfSubjects?.toString() ?? ""} />
                    <SelectField label="Tied positions" name="tieMethod" defaultValue={r?.tieMethod ?? "COMPETITION"} options={[{ value: "COMPETITION", label: "Share position, skip next (1, 1, 3)" }, { value: "DENSE", label: "Share position, no gap (1, 1, 2)" }]} />
                    <SelectField label="Absent from a paper" name="absentPolicy" defaultValue={r?.absentPolicy ?? "EXCLUDE"} options={[{ value: "EXCLUDE", label: "Leave subject out of average" }, { value: "ZERO", label: "Count as zero" }]} />
                    <TextField label="Minimum subjects to be ranked" name="minSubjectsToRank" type="number" defaultValue={String(r?.minSubjectsToRank ?? 1)} required />
                    <TextField label="Best students per class" name="topClassCount" type="number" defaultValue={String(r?.topClassCount ?? 12)} required />
                    <TextField label="Best students per stream" name="topStreamCount" type="number" defaultValue={String(r?.topStreamCount ?? 3)} required />
                  </Grid>
                  <TextAreaField label="Divisions (one per line: LABEL, MIN, MAX — leave empty for none)" name="divisions" rows={4} defaultValue={div.map((d) => `${d.label}, ${d.min}, ${d.max}`).join("\n")} placeholder={"I, 8, 32\nII, 33, 45"} />
                </ActionForm>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ScaleFields({ s }: { s?: { name: string; level: string; appliesTo: string; isDefault: boolean; bands: { grade: string; minScore: unknown; maxScore: unknown; points: unknown; remark: string; description: string | null }[] } }) {
  return (
    <>
      <TextField label="Name" name="name" defaultValue={s?.name ?? ""} required />
      <Grid>
        <SelectField label="Level" name="level" options={levelOpts} defaultValue={s?.level} required />
        <SelectField label="Applies to" name="appliesTo" options={appliesOpts} defaultValue={s?.appliesTo ?? "ALL"} required />
      </Grid>
      <CheckboxField name="isDefault" label="Use as the default scale" defaultChecked={s?.isDefault} />
      <TextAreaField
        label="Bands — one per line: GRADE, MIN, MAX, POINTS, REMARK | optional long description"
        name="bands"
        rows={9}
        required
        className="font-mono"
        defaultValue={s?.bands.map((b) => `${b.grade}, ${Number(b.minScore)}, ${Number(b.maxScore)}, ${Number(b.points)}, ${b.remark}${b.description ? ` | ${b.description}` : ""}`).join("\n")}
        placeholder={"A, 80, 100, 6, Excellent\nB, 70, 79.99, 5, Very good"}
      />
    </>
  );
}
