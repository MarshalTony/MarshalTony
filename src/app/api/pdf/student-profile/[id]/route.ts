import { getCurrentUser, can } from "@/server/auth";
import { audit } from "@/server/audit";
import { renderStudentProfile } from "@/server/reports/student-profile";
import { pdfResponse } from "@/server/http";

/** Full student profile PDF (sections follow the user's permissions). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.view")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const out = await renderStudentProfile(id, user);
  if (!out) return new Response("Not found", { status: 404 });
  await audit(user.id, "PRINT_PROFILE", "Student", id, {});
  return pdfResponse(out.buffer, `profile-${out.student.admissionNo.replace(/\W/g, "-")}.pdf`);
}
