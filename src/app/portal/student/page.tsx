import { prisma } from "@/lib/db";
import { requirePortal } from "@/server/portal";
import { PortalStudentView } from "@/components/portal-student-view";
import { PortalNotices } from "@/components/portal-notices";

export const metadata = { title: "Student portal" };

export default async function StudentHome() {
  const user = await requirePortal("student");
  const s = await prisma.student.findUniqueOrThrow({ where: { id: user.studentId! }, select: { classId: true } });
  return (
    <div className="space-y-5">
      <PortalStudentView studentId={user.studentId!} showLearning />
      <PortalNotices user={user} classIds={[s.classId]} />
    </div>
  );
}
