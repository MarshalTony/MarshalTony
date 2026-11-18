"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { can } from "../auth";
import { fileFrom, saveUpload } from "../storage";
import { sendMessage, renderTemplate, type Channel } from "../messaging";
import { optUrl } from "../schemas";

export const saveAnnouncement = action(
  {
    permission: "announcements.manage",
    revalidate: "/announcements",
    schema: z.object({
      id: zs.optId(), title: zs.str(150), body: zs.str(5000), audience: z.enum(["ALL", "STAFF", "PARENTS", "STUDENTS"]), classId: zs.optId(),
      isUrgent: zs.bool(), expiresAt: zs.optDate(),
    }),
  },
  async ({ id, ...data }, user) => {
    const a = id ? await prisma.announcement.update({ where: { id }, data }) : await prisma.announcement.create({ data: { ...data, createdById: user.id } });
    await audit(user.id, id ? "UPDATE" : "PUBLISH", "Announcement", a.id, { title: data.title, audience: data.audience });
    return { ok: true, message: "Announcement published." };
  },
);

export const deleteAnnouncement = action(
  { permission: "announcements.manage", revalidate: "/announcements", schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    await prisma.announcement.delete({ where: { id } });
    await audit(user.id, "DELETE", "Announcement", id);
    return { ok: true, message: "Announcement removed." };
  },
);

/**
 * Bulk message to guardians (primary contacts) or staff.
 * Recipients: ALL_GUARDIANS | CLASS_GUARDIANS | STREAM_GUARDIANS | STAFF
 */
export const sendBulkMessage = action(
  {
    permission: "communication.send",
    revalidate: "/messages",
    schema: z.object({
      channel: z.enum(["SMS", "EMAIL", "WHATSAPP"]), recipients: z.enum(["ALL_GUARDIANS", "CLASS_GUARDIANS", "STREAM_GUARDIANS", "STAFF"]),
      classId: zs.optId(), streamId: zs.optId(), category: z.enum(["GENERAL", "EMERGENCY", "EXAM", "FEES", "ATTENDANCE", "EVENT"]),
      subject: zs.optStr(150), body: zs.str(1600),
    }),
  },
  async ({ channel, recipients, classId, streamId, category, subject, body }, user) => {
    if (recipients === "CLASS_GUARDIANS" && !classId) throw new UserError("Choose the class.");
    if (recipients === "STREAM_GUARDIANS" && !streamId) throw new UserError("Choose the stream.");
    type R = { to: string; name: string; student?: string };
    let list: R[] = [];
    if (recipients === "STAFF") {
      const staff = await prisma.staff.findMany({ where: { status: "ACTIVE" } });
      list = staff.map((s) => ({ to: (channel === "EMAIL" ? s.email : s.phone) ?? "", name: `${s.firstName} ${s.lastName}` }));
    } else {
      const links = await prisma.studentGuardian.findMany({
        where: { isPrimary: true, student: { status: "ACTIVE", ...(recipients === "CLASS_GUARDIANS" ? { classId: classId! } : {}), ...(recipients === "STREAM_GUARDIANS" ? { streamId: streamId! } : {}) } },
        include: { guardian: true, student: true },
      });
      // One message per guardian, even with several children
      const seen = new Map<string, R>();
      for (const l of links) {
        const prev = seen.get(l.guardianId);
        const child = `${l.student.firstName} ${l.student.lastName}`;
        if (prev) prev.student = `${prev.student}, ${child}`;
        else seen.set(l.guardianId, { to: (channel === "EMAIL" ? l.guardian.email : l.guardian.phone) ?? "", name: l.guardian.fullName, student: child });
      }
      list = [...seen.values()];
    }
    const valid = list.filter((r) => r.to);
    if (!valid.length) throw new UserError(`No recipients have a ${channel === "EMAIL" ? "email address" : "phone number"}.`);
    if (valid.length > 2000) throw new UserError("More than 2,000 recipients: send per class instead.");
    const counts: Record<string, number> = {};
    for (const r of valid) {
      const m = await sendMessage({ channel: channel as Channel, to: r.to, toName: r.name, subject: subject ?? undefined, category, userId: user.id, body: renderTemplate(body, { guardian: r.name, student: r.student ?? "" }) });
      counts[m.status] = (counts[m.status] ?? 0) + 1;
    }
    await audit(user.id, "BULK_MESSAGE", "OutboundMessage", null, { channel, recipients, classId, streamId, category, ...counts });
    const skipped = list.length - valid.length;
    return { ok: true, message: `${valid.length} message(s): ${Object.entries(counts).map(([k, v]) => `${v} ${k.toLowerCase().replace("_", " ")}`).join(", ")}${skipped ? `; ${skipped} without contact skipped` : ""}.` };
  },
);

// ---------------- Learning ----------------
export const saveAssignment = action(
  { permission: "learning.manage", revalidate: "/learning", schema: z.object({ streamId: zs.id(), subjectId: zs.id(), title: zs.str(150), description: zs.str(5000), dueDate: zs.optDate() }) },
  async (data, user, fd) => {
    if (!can(user, "academics.manage") && user.staffId) {
      const alloc = await prisma.teacherAllocation.findFirst({ where: { staffId: user.staffId, streamId: data.streamId, subjectId: data.subjectId, academicYear: { isCurrent: true } } });
      if (!alloc) throw new UserError("You are not allocated to this subject in this stream.");
    }
    const f = fileFrom(fd, "file");
    const fileId = f ? (await saveUpload(f, "MATERIAL", user.id)).id : null;
    const a = await prisma.assignment.create({ data: { ...data, fileId, createdById: user.id } });
    await audit(user.id, "CREATE", "Assignment", a.id, { title: data.title });
    return { ok: true, message: "Assignment published to students." };
  },
);

export const saveMaterial = action(
  { permission: "learning.manage", revalidate: "/learning", schema: z.object({ classId: zs.id(), subjectId: zs.id(), title: zs.str(150), description: zs.optStr(2000), url: optUrl }) },
  async ({ url, ...data }, user, fd) => {
    const f = fileFrom(fd, "file");
    if (!f && !url) throw new UserError("Attach a file or give a link.");
    if (url && !/^https:\/\//.test(url)) throw new UserError("Links must start with https://");
    const fileId = f ? (await saveUpload(f, "MATERIAL", user.id)).id : null;
    const m = await prisma.learningMaterial.create({ data: { ...data, url: url ?? null, fileId, createdById: user.id } });
    await audit(user.id, "CREATE", "LearningMaterial", m.id, { title: data.title });
    return { ok: true, message: "Learning material published." };
  },
);

export const deleteLearningItem = action(
  { permission: "learning.manage", revalidate: "/learning", schema: z.object({ id: zs.id(), kind: z.enum(["assignment", "material"]) }) },
  async ({ id, kind }, user) => {
    const item = kind === "assignment" ? await prisma.assignment.findUniqueOrThrow({ where: { id } }) : await prisma.learningMaterial.findUniqueOrThrow({ where: { id } });
    if (item.createdById !== user.id && !can(user, "academics.manage")) throw new UserError("You can only remove items you published.");
    if (kind === "assignment") await prisma.assignment.delete({ where: { id } });
    else await prisma.learningMaterial.delete({ where: { id } });
    await audit(user.id, "DELETE", kind === "assignment" ? "Assignment" : "LearningMaterial", id);
    return { ok: true, message: "Removed." };
  },
);
