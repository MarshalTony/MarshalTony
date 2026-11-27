import { redirect } from "next/navigation";
import { requirePage, can } from "@/server/auth";
import { getSchool } from "@/server/school";
import { saveSchoolProfile, saveReportTemplate, saveNotificationPrefs, saveHeadSignature, removeHeadSignature, saveThemeColor } from "@/server/actions/settings";
import { ActionForm, CheckboxField, Grid, TextField, TextAreaField, ConfirmAction } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageField } from "@/components/image-field";
import { SignatureField } from "@/components/signature-field";
import { ThemeColorField } from "@/components/theme-color-field";
import { channelConfigured } from "@/server/messaging";

export default async function SchoolSettings() {
  // The Settings menu also shows for people who only manage users, roles or the audit log: send them to their tab.
  const user = await requirePage("settings.manage", "users.manage", "roles.manage", "audit.view", "backup.manage");
  if (!can(user, "settings.manage")) redirect(can(user, "users.manage") ? "/settings/users" : can(user, "roles.manage") ? "/settings/roles" : can(user, "audit.view") ? "/settings/audit" : "/settings/backup");
  const s = await getSchool();
  const t = (s.reportTemplate ?? {}) as Record<string, any>;
  const n = (s.notificationPrefs ?? {}) as Record<string, any>;
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>School profile</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveSchoolProfile}>
            <ImageField label="School logo (PNG with transparent background is best)" name="logo" maxSize={512} keepPng currentUrl={s.logoFileId ? `/api/files/${s.logoFileId}` : null} hint="Shown on the sign-in page, sidebar, report cards, receipts and ID cards" />
            <Grid>
              <TextField label="School name" name="name" defaultValue={s.name} required />
              <TextField label="Motto" name="motto" defaultValue={s.motto ?? ""} />
              <TextField label="Telephone" name="phone" defaultValue={s.phone ?? ""} />
              <TextField label="Alternative telephone" name="altPhone" defaultValue={s.altPhone ?? ""} />
              <TextField label="Email" name="email" type="email" defaultValue={s.email ?? ""} />
              <TextField label="Second email" name="altEmail" type="email" defaultValue={s.altEmail ?? ""} />
              <TextField label="Website" name="website" defaultValue={s.website ?? ""} />
              <TextField label="Physical address" name="address" defaultValue={s.address ?? ""} />
              <TextField label="P.O. Box" name="poBox" defaultValue={s.poBox ?? ""} />
              <TextField label="UNEB centre no. (UCE)" name="centreNumberUce" defaultValue={s.centreNumberUce ?? ""} />
              <TextField label="UNEB centre no. (UACE)" name="centreNumberUace" defaultValue={s.centreNumberUace ?? ""} />
              <TextField label="Headteacher's name" name="headteacherName" defaultValue={s.headteacherName ?? ""} />
              <TextField label="Support contact name (sign-in page)" name="supportName" defaultValue={s.supportName ?? ""} placeholder="e.g. System administrator" hint="Shown on the sign-in page for anyone who needs help" />
              <TextField label="Support phone (sign-in page)" name="supportPhone" defaultValue={s.supportPhone ?? ""} placeholder="e.g. 0772 123 456" />
            </Grid>
            <TextAreaField label="Report card footer" name="reportFooter" defaultValue={s.reportFooter ?? ""} rows={2} />
          </ActionForm>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Theme colour<span className="block text-xs font-normal text-slate-500">The colour of the menu bar, buttons and links for everyone, and of the sign-in page.</span></CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveThemeColor} submitLabel="Save theme colour">
            <ThemeColorField name="themeColor" current={s.themeColor} logoUrl={s.logoFileId ? `/api/files/${s.logoFileId}` : null} />
          </ActionForm>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Headteacher&apos;s signature{s.headteacherName ? <span className="block text-xs font-normal text-slate-500">{s.headteacherName}</span> : null}</CardTitle>
          {s.headSignatureFileId && <ConfirmAction action={removeHeadSignature} fields={{}} label="Remove signature" variant="ghost" confirm="Remove the headteacher's signature? Documents will print an empty signature line." />}
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-slate-600">
            Printed above the headteacher&apos;s signature line on <b>report cards</b> (S1–S4 and S5–S6) and on <b>leaving documents</b> (leaving certificate, testimonial, transfer and recommendation letters).
            The image is private: it is only used inside printed documents and only administrators can see it here. Replace it when the headteacher changes.
            {t.printHeadSignature === false && <b className="text-amber-700"> Printing is switched off in the Report card template below.</b>}
          </p>
          <ActionForm action={saveHeadSignature} submitLabel="Save signature">
            <SignatureField name="signature" currentUrl={s.headSignatureFileId ? `/api/files/${s.headSignatureFileId}` : null} />
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
              <CheckboxField name="cbcOLevel" label="S1–S4 reports use the competency-based format for every exam (activities of integration out of 3 → out of 20, + the exam out of 80)" defaultChecked={t.cbcOLevel !== false} />
              <CheckboxField name="printHeadSignature" label="Print the headteacher's signature on report cards and leaving documents (when one is saved above)" defaultChecked={t.printHeadSignature !== false} />
              <CheckboxField name="aLevelPapers" label="S5–S6 reports use the school's A-Level format (each paper P/1, P/2 with BOT, EOT and average, paper grade D1–F9, subject grade A–F and total points)" defaultChecked={t.aLevelPapers !== false} />
              <CheckboxField name="requireMarksApproval" label="Marks need DOS approval before they count (teachers submit, DOS approves). Off: saved marks count straight away; close the exam to stop entry." defaultChecked={t.requireMarksApproval === true} />
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
