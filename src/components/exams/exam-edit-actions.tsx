import { updateExam, deleteExam } from "@/server/actions/exams";
import { Alert } from "@/components/ui/card";
import { FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { isoDate } from "@/lib/utils";

type ExamLike = {
  id: string; name: string; examTypeId: string; termId: string; startDate: Date | null; endDate: Date | null; isComposite: boolean;
  classIds: string[]; marks: number; results: number;
};
type Opt = { value: string; label: string };

/** "Edit" and "Delete" dialogs for an examination (exam page header and the examinations list). */
export function ExamEditActions({ exam, examTypes, terms, classes, size = "default" }: { exam: ExamLike; examTypes: Opt[]; terms: Opt[]; classes: Opt[]; size?: "default" | "sm" }) {
  return (
    <>
      <FormDialog trigger="Edit" title={`Edit — ${exam.name}`} action={updateExam} triggerVariant="outline" triggerSize={size} wide>
        <input type="hidden" name="examId" value={exam.id} />
        <TextField label="Name" name="name" required defaultValue={exam.name} />
        <Grid>
          <SelectField label="Type" name="examTypeId" required defaultValue={exam.examTypeId} options={examTypes} />
          <SelectField label="Term" name="termId" required defaultValue={exam.termId} options={terms} />
          <TextField label="Start date" name="startDate" type="date" defaultValue={exam.startDate ? isoDate(exam.startDate) : ""} />
          <TextField label="End date" name="endDate" type="date" defaultValue={exam.endDate ? isoDate(exam.endDate) : ""} />
        </Grid>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Classes sitting this exam</legend>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
            {classes.map((c) => (
              <label key={c.value} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="classIds[]" value={c.value} defaultChecked={exam.classIds.includes(c.value)} />{c.label}</label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">New classes get every subject their students take this year, with the same maximum mark as this exam. A class that already has marks cannot be removed.</p>
        </fieldset>
      </FormDialog>
      <FormDialog trigger="Delete" title={`Delete — ${exam.name}`} action={deleteExam} triggerVariant="destructive" triggerSize={size}>
        <input type="hidden" name="examId" value={exam.id} />
        {exam.marks > 0 ? (
          <>
            <Alert tone="error">This exam has <b>{exam.marks}</b> marks{exam.results ? ` and ${exam.results} results` : ""}. Deleting it removes them permanently. This cannot be undone.</Alert>
            <TextField label={`Type the exam name to confirm: ${exam.name}`} name="confirmName" required autoComplete="off" />
          </>
        ) : <p className="text-sm text-slate-600">Delete this examination? It has no marks yet.</p>}
      </FormDialog>
    </>
  );
}
