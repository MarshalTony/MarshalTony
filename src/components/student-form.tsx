import type { Student } from "@prisma/client";
import { ActionForm, Grid, SelectField, TextAreaField, TextField } from "./forms";
import { ClassStreamSelect } from "./class-stream-select";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import type { ActionResult } from "@/server/action";
import type { ClassTree } from "@/server/queries/lookups";
import { isoDate } from "@/lib/utils";

export function StudentForm({
  action, tree, combinations, student,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  tree: ClassTree; combinations: { id: string; code: string; name: string }[]; student?: Student;
}) {
  const s = student;
  return (
    <ActionForm action={action} submitLabel={s ? "Save changes" : "Register student"}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <Card>
        <CardHeader><CardTitle>Personal details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Grid cols={3}>
            <TextField label="Surname" name="lastName" defaultValue={s?.lastName} required />
            <TextField label="First name" name="firstName" defaultValue={s?.firstName} required />
            <TextField label="Other names" name="otherNames" defaultValue={s?.otherNames ?? ""} />
            <SelectField label="Gender" name="gender" defaultValue={s?.gender} required placeholder="Select" options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }]} />
            <TextField label="Date of birth" name="dateOfBirth" type="date" defaultValue={isoDate(s?.dateOfBirth)} />
            <TextField label="Nationality" name="nationality" defaultValue={s?.nationality ?? "Ugandan"} />
            <TextField label="Religion" name="religion" defaultValue={s?.religion ?? ""} />
            <TextField label="Home address" name="homeAddress" defaultValue={s?.homeAddress ?? ""} />
            <TextField label="Passport photo (JPG/PNG, max 2 MB)" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
          </Grid>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Admission</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Grid cols={3}>
            <TextField label="Admission number" name="admissionNo" defaultValue={s?.admissionNo} hint={s ? undefined : "Leave blank to generate automatically"} />
            <TextField label="Admission date" name="admissionDate" type="date" defaultValue={isoDate(s?.admissionDate ?? new Date())} required />
            <SelectField label="Day / boarding" name="residence" defaultValue={s?.residence ?? "DAY"} required options={[{ value: "DAY", label: "Day scholar" }, { value: "BOARDING", label: "Boarder" }]} />
            <ClassStreamSelect tree={tree} defaultClassId={s?.classId} defaultStreamId={s?.streamId} combinations={combinations} defaultCombinationId={s?.combinationId} disabled={!!s} />
            <TextField label="Previous school" name="previousSchool" defaultValue={s?.previousSchool ?? ""} />
            <TextField label="UNEB index no." name="unebIndexNo" defaultValue={s?.unebIndexNo ?? ""} />
            <TextField label="Learner ID (LIN)" name="linNumber" defaultValue={s?.linNumber ?? ""} />
          </Grid>
          {s && <p className="text-xs text-slate-500">Class and stream are changed from the student profile (Transfer stream) or through promotion, so the history is kept.</p>}
        </CardContent>
      </Card>
      {!s && (
        <Card>
          <CardHeader><CardTitle>Parent / guardian</CardTitle></CardHeader>
          <CardContent>
            <Grid cols={3}>
              <TextField label="Full name" name="gName" />
              <TextField label="Telephone" name="gPhone" placeholder="07XX XXX XXX" />
              <TextField label="Email" name="gEmail" type="email" />
              <SelectField label="Relationship" name="gRelationship" options={["Father", "Mother", "Guardian", "Sponsor", "Other"].map((r) => ({ value: r, label: r }))} />
              <TextField label="Occupation" name="gOccupation" />
            </Grid>
            <p className="mt-2 text-xs text-slate-500">If a parent with the same name and phone exists, the student is linked to them (siblings share one parent account).</p>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Health & emergency</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Grid>
            <TextField label="Emergency contact name" name="emergencyContactName" defaultValue={s?.emergencyContactName ?? ""} />
            <TextField label="Emergency contact phone" name="emergencyContactPhone" defaultValue={s?.emergencyContactPhone ?? ""} />
          </Grid>
          <TextAreaField label="Medical information (allergies, conditions, medication)" name="medicalInfo" defaultValue={s?.medicalInfo ?? ""} rows={3} />
        </CardContent>
      </Card>
    </ActionForm>
  );
}
