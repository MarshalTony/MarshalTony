import { requirePage } from "@/server/auth";
import { getSchool } from "@/server/school";
import { saveSchoolProfile, saveReportTemplate, saveNotificationPrefs } from "@/server/actions/settings";
import { ActionForm, CheckboxField, Grid, TextField, TextAreaField } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SchoolLogo } from "@/components/logo";
import { channelConfigured } from "@/server/messaging";

export default async function SchoolSettings() {
  await requirePage("settings.manage");
  const s = await getSchool();
  const t = (s.reportTemplate ?? {}) as Record<string, any>;
  const n = (s.notificationPrefs ?? {}) as Record<string, any>;
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>School profile</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveSchoolProfile}>
            <div className="flex items-center gap-4">
              <SchoolLogo fileId={s.logoFileId} size={64} />
              <TextField label="Logo (PNG/JPG, max 2 MB)" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
            </div>
            <Grid>
              <TextField label="School name" name="name" defaultValue={s.name} required />
              <TextField label="Motto" name="motto" defaultValue={s.motto ?? ""} />
              <TextField label="Telephone" name="phone" defaultValue={s.phone ?? ""} />
              <TextField label="Alternative telephone" name="altPhone" defaultValue={s.altPhone ?? ""} />
              <TextField label="Email" name="email" type="email" defaultValue={s.email ?? ""} />
              <TextField label="Website" name="website" defaultValue={s.website ?? ""} />
              <TextField label="Physical address" name="address" defaultValue={s.address ?? ""} />
              <TextField label="P.O. Box" name="poBox" defaultValue={s.poBox ?? ""} />
              <TextField label="UNEB centre no. (UCE)" name="centreNumberUce" defaultValue={s.centreNumberUce ?? ""} />
              <TextField label="UNEB centre no. (UACE)" name="centreNumberUace" defaultValue={s.centreNumberUace ?? ""} />
              <TextField label="Headteacher's name" name="headteacherName" defaultValue={s.headteacherName ?? ""} />
            </Grid>
            <TextAreaField label="Report card footer" name="reportFooter" defaultValue={s.reportFooter ?? ""} rows={2} />
          </ActionForm>
        </CardContent>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Report card template</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={saveReportTemplate}>
              <CheckboxField name="showPhoto" label="Show student photo" defaultChecked={t.showPhoto !== false} />
              <CheckboxField name="showSubjectPositions" label="Show subject positions" defaultChecked={t.showSubjectPositions !== false} />
              <CheckboxField name="showClassPosition" label="Show class position" defaultChecked={t.showClassPosition !== false} />
              <CheckboxField name="showStreamPosition" label="Show stream position" defaultChecked={t.showStreamPosition !== false} />
              <CheckboxField name="showAttendance" label="Show attendance summary" defaultChecked={t.showAttendance !== false} />
              <CheckboxField name="showGradingKey" label="Show grading key" defaultChecked={t.showGradingKey !== false} />
              <TextField label="Class teacher label" name="classTeacherLabel" defaultValue={t.classTeacherLabel ?? "Class Teacher"} required />
              <TextField label="DOS label" name="dosLabel" defaultValue={t.dosLabel ?? "Director of Studies"} required />
              <TextField label="Head label" name="headLabel" defaultValue={t.headLabel ?? "Headteacher"} required />
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Automatic notifications</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-slate-500">
              SMS provider: {channelConfigured("SMS") ? "configured" : "not configured"} · Email: {channelConfigured("EMAIL") ? "configured" : "not configured"} · WhatsApp: {channelConfigured("WHATSAPP") ? "configured" : "not configured"}
            </p>
            <ActionForm action={saveNotificationPrefs}>
              <CheckboxField name="smsOnPayment" label="SMS the primary guardian when a payment is recorded" defaultChecked={!!n.smsOnPayment} />
              <CheckboxField name="smsOnAbsence" label="SMS the primary guardian when a student is marked absent" defaultChecked={!!n.smsOnAbsence} />
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
