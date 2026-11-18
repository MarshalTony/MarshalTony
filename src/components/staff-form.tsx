import type { Staff } from "@prisma/client";
import { ActionForm, CheckboxField, Grid, SelectField, TextField } from "./forms";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ImageField } from "./image-field";
import type { ActionResult } from "@/server/action";
import { isoDate } from "@/lib/utils";

export function StaffForm({
  action, staff, departments, subjects, selectedSubjects = [], sensitive,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>; staff?: Staff;
  departments: { id: string; name: string }[]; subjects: { id: string; name: string; level: string }[]; selectedSubjects?: string[]; sensitive: boolean;
}) {
  const s = staff;
  return (
    <ActionForm action={action} submitLabel={s ? "Save changes" : "Register staff"}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <Card>
        <CardHeader><CardTitle>Bio-data</CardTitle></CardHeader>
        <CardContent>
          <Grid cols={3}>
            <TextField label="Staff number" name="staffNo" defaultValue={s?.staffNo} required />
            <TextField label="Surname" name="lastName" defaultValue={s?.lastName} required />
            <TextField label="First name" name="firstName" defaultValue={s?.firstName} required />
            <TextField label="Other names" name="otherNames" defaultValue={s?.otherNames ?? ""} />
            <SelectField label="Gender" name="gender" defaultValue={s?.gender} required placeholder="Select" options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }]} />
            <TextField label="Date of birth" name="dateOfBirth" type="date" defaultValue={isoDate(s?.dateOfBirth)} />
            <TextField label="Phone" name="phone" defaultValue={s?.phone ?? ""} />
            <TextField label="Email" name="email" type="email" defaultValue={s?.email ?? ""} />
            <TextField label="National ID (NIN)" name="nationalId" defaultValue={s?.nationalId ?? ""} />
            <TextField label="Address" name="address" defaultValue={s?.address ?? ""} />
            <ImageField label="Photo" name="photo" hint="Resized automatically before upload" currentUrl={s?.photoFileId ? `/api/files/${s.photoFileId}` : null} />
          </Grid>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Employment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Grid cols={3}>
            <TextField label="Designation" name="designation" defaultValue={s?.designation} required placeholder="Teacher, Bursar, Cook…" />
            <SelectField label="Department" name="departmentId" defaultValue={s?.departmentId ?? ""} placeholder="—" options={departments.map((d) => ({ value: d.id, label: d.name }))} />
            <SelectField label="Employment type" name="employmentType" defaultValue={s?.employmentType ?? "PERMANENT"} options={["PERMANENT", "CONTRACT", "PART_TIME", "VOLUNTEER"].map((x) => ({ value: x, label: x.replace("_", " ") }))} />
            <TextField label="Date joined" name="dateJoined" type="date" defaultValue={isoDate(s?.dateJoined)} />
            <SelectField label="Status" name="status" defaultValue={s?.status ?? "ACTIVE"} options={["ACTIVE", "ON_LEAVE", "SUSPENDED", "EXITED"].map((x) => ({ value: x, label: x.replace("_", " ") }))} />
            <TextField label="Teacher registration no." name="registrationNo" defaultValue={s?.registrationNo ?? ""} />
          </Grid>
          <CheckboxField name="isTeaching" label="Teaching staff" defaultChecked={s?.isTeaching ?? true} />
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Teaching subjects</legend>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {subjects.map((x) => (
                <label key={x.id} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" name="subjectIds[]" value={x.id} defaultChecked={selectedSubjects.includes(x.id)} />
                  {x.name} <span className="text-slate-400">{x.level === "O_LEVEL" ? "O" : "A"}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>
      {sensitive && (
        <Card>
          <CardHeader><CardTitle>Payroll & statutory (confidential)</CardTitle></CardHeader>
          <CardContent>
            <Grid cols={3}>
              <TextField label="Basic salary (UGX/month)" name="basicSalary" type="number" min="0" defaultValue={s?.basicSalary?.toString() ?? ""} />
              <TextField label="Bank" name="bankName" defaultValue={s?.bankName ?? ""} />
              <TextField label="Account number" name="bankAccount" defaultValue={s?.bankAccount ?? ""} />
              <TextField label="TIN" name="tinNumber" defaultValue={s?.tinNumber ?? ""} />
              <TextField label="NSSF number" name="nssfNumber" defaultValue={s?.nssfNumber ?? ""} />
            </Grid>
          </CardContent>
        </Card>
      )}
    </ActionForm>
  );
}
