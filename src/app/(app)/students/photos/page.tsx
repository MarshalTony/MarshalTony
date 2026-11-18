import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { removeStudentPhoto, setStudentPhoto } from "@/server/actions/students";
import { PhotoGrid } from "@/components/photo-grid";
import { ScorePicker } from "@/components/score-picker";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";
import { studentName } from "@/lib/utils";

export const metadata = { title: "Student photos" };

export default async function StudentPhotosPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("students.manage");
  const q = await searchParams;
  const classes = await prisma.schoolClass.findMany({ where: { isActive: true }, include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { order: "asc" } });
  const cls = classes.find((c) => c.id === sp(q, "classId"));
  const stream = cls?.streams.find((s) => s.id === sp(q, "streamId"));
  const missingOnly = sp(q, "show") === "missing";

  const header = (
    <PageHeader
      title="Student photos"
      description="Click a student to add or change their passport photo (on a phone you can take it with the camera). Photos are resized before upload and saved immediately."
      actions={<Button asChild variant="outline"><Link href="/students">Back to students</Link></Button>}
    />
  );
  const picker = (
    <ScorePicker fields={[
      { name: "classId", label: "Class", placeholder: "Select class", value: cls?.id, resets: ["streamId"], options: classes.map((c) => ({ value: c.id, label: c.name })) },
      { name: "streamId", label: "Stream (optional)", placeholder: "All streams", value: stream?.id, options: (cls?.streams ?? []).map((s) => ({ value: s.id, label: s.name })) },
      { name: "show", label: "Show", placeholder: "All students", value: missingOnly ? "missing" : undefined, options: [{ value: "missing", label: "Missing photos only" }] },
    ]} />
  );
  if (!cls) return <>{header}{picker}<Alert>Select a class to see its students.</Alert></>;

  const students = await prisma.student.findMany({
    where: { classId: cls.id, status: "ACTIVE", ...(stream ? { streamId: stream.id } : {}), ...(missingOnly ? { photoFileId: null } : {}) },
    include: { stream: true },
    orderBy: [{ stream: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
  });
  return (
    <>
      {header}
      {picker}
      {students.length === 0 ? (
        <Alert tone={missingOnly ? "success" : "info"}>{missingOnly ? `Every active student in ${cls.name}${stream ? ` ${stream.name}` : ""} has a photo.` : `No active students in ${cls.name}${stream ? ` ${stream.name}` : ""}.`}</Alert>
      ) : (
        <PhotoGrid
          setPhoto={setStudentPhoto}
          removePhoto={removeStudentPhoto}
          students={students.map((s) => ({ id: s.id, admissionNo: s.admissionNo, name: studentName(s), stream: `${cls.code} ${s.stream.name}`, photoFileId: s.photoFileId }))}
        />
      )}
    </>
  );
}
