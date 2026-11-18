import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { readStoredFile } from "@/server/storage";

/** Files are never public URLs; every read is permission-checked. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) return new Response("Not found", { status: 404 });

  if (file.category !== "PUBLIC") {
    const user = await getCurrentUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
    let allowed = false;
    if (file.category === "STUDENT_PHOTO") {
      allowed = can(user, "students.view");
      if (!allowed) {
        const student = await prisma.student.findFirst({ where: { photoFileId: id }, select: { id: true, guardians: { select: { guardianId: true } } } });
        allowed = !!student && (student.id === user.studentId || student.guardians.some((g) => g.guardianId === user.guardianId));
      }
    } else if (file.category === "STAFF_PHOTO") {
      allowed = can(user, "staff.view");
    } else if (file.category === "MATERIAL") {
      allowed = true; // learning materials: any signed-in user
    } else {
      allowed = can(user, "settings.manage", "students.manage", "staff.manage");
    }
    if (!allowed) return new Response("Forbidden", { status: 403 });
  }

  const body = await readStoredFile(file.key, file.data);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(body.length),
      "Cache-Control": file.category === "PUBLIC" ? "public, max-age=86400" : "private, max-age=3600",
      "Content-Disposition": `inline; filename="${file.originalName.replace(/[^\w.-]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
