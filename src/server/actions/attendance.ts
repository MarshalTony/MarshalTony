"use server";
import { z } from "zod";
import type { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { can } from "../auth";
import { sendMessage, renderTemplate } from "../messaging";
import { fmtDate } from "@/lib/utils";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

export const saveStudentAttendance = action(
  { permission: "attendance.take", schema: z.object({ streamId: zs.id(), date: zs.date() }) },
  async ({ streamId, date }, user, fd) => {
    const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date()) + "T00:00:00Z");
    if (date > today) throw new UserError("Attendance cannot be taken for a future date.");
    const stream = await prisma.stream.findUniqueOrThrow({ where: { id: streamId } });
    // Subject teachers may only register streams they teach or are class teacher of.
    const elevated = can(user, "attendance.view", "students.manage");
    if (!elevated) {
      const teaches = user.staffId && (stream.classTeacherId === user.staffId || (await prisma.teacherAllocation.findFirst({ where: { staffId: user.staffId, streamId, academicYear: { isCurrent: true } } })));
      if (!teaches) throw new UserError("You can only take attendance for streams you teach.");
    }
    const students = await prisma.student.findMany({ where: { streamId, status: "ACTIVE" }, select: { id: true } });
    const newlyAbsent: string[] = [];
    let n = 0;
    await prisma.$transaction(async (tx) => {
      for (const s of students) {
        const status = fd.get(`s_${s.id}`) as AttendanceStatus | null;
        if (!status || !STATUSES.includes(status as any)) continue;
        const remark = String(fd.get(`r_${s.id}`) ?? "").trim().slice(0, 200) || null;
        const prev = await tx.studentAttendance.findUnique({ where: { studentId_date: { studentId: s.id, date } } });
        await tx.studentAttendance.upsert({
          where: { studentId_date: { studentId: s.id, date } },
          update: { status, remark, streamId, recordedById: user.id },
          create: { studentId: s.id, date, status, remark, streamId, recordedById: user.id },
        });
        if (status === "ABSENT" && prev?.status !== "ABSENT") newlyAbsent.push(s.id);
        n++;
      }
      await audit(user.id, "TAKE_ATTENDANCE", "Stream", streamId, { date, count: n }, tx);
    });
    let sms = "";
    const prefs = ((await prisma.schoolSetting.findUnique({ where: { id: 1 } }))?.notificationPrefs ?? {}) as Record<string, boolean>;
    if (prefs.smsOnAbsence && newlyAbsent.length) {
      const tpl = await prisma.messageTemplate.findUnique({ where: { code: "ABSENCE_ALERT" } });
      const list = await prisma.student.findMany({ where: { id: { in: newlyAbsent } }, include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } } });
      let sent = 0;
      for (const s of list) {
        const g = s.guardians[0]?.guardian;
        if (!g || !tpl) continue;
        const m = await sendMessage({ channel: "SMS", to: g.phone, toName: g.fullName, category: "ATTENDANCE", userId: user.id, body: renderTemplate(tpl.body, { guardian: g.fullName, student: `${s.firstName} ${s.lastName}`, status: "absent", date: fmtDate(date) }) });
        if (m.status === "SENT") sent++;
      }
      sms = ` ${sent} absence SMS sent.`;
    }
    return { ok: true, message: `Attendance saved for ${n} students.${sms}` };
  },
);

export const saveStaffAttendance = action(
  { permission: "attendance.staff", schema: z.object({ date: zs.date() }) },
  async ({ date }, user, fd) => {
    const staff = await prisma.staff.findMany({ where: { status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { id: true } });
    let n = 0;
    await prisma.$transaction(async (tx) => {
      for (const s of staff) {
        const status = fd.get(`s_${s.id}`) as AttendanceStatus | null;
        if (!status || !STATUSES.includes(status as any)) continue;
        const timeIn = String(fd.get(`in_${s.id}`) ?? "").slice(0, 5) || null;
        const remark = String(fd.get(`r_${s.id}`) ?? "").trim().slice(0, 200) || null;
        await tx.staffAttendance.upsert({
          where: { staffId_date: { staffId: s.id, date } },
          update: { status, timeIn, remark, recordedById: user.id },
          create: { staffId: s.id, date, status, timeIn, remark, recordedById: user.id },
        });
        n++;
      }
      await audit(user.id, "STAFF_ATTENDANCE", "StaffAttendance", null, { date, count: n }, tx);
    });
    return { ok: true, message: `Staff attendance saved (${n}).` };
  },
);
