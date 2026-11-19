"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";

const ROLES = ["CLASS_TEACHER", "HEADTEACHER", "DOS"] as [string, ...string[]];
const EDITORS = ["settings.manage", "reports.comment.head", "reports.comment.dos"] as const;

export const saveCommentTemplate = action(
  {
    permission: [...EDITORS], revalidate: "/comment-bank",
    schema: z.object({ id: zs.optId(), role: z.enum(ROLES), minScore: z.coerce.number().min(0).max(100), maxScore: z.coerce.number().min(0).max(100), text: zs.str(500), isActive: zs.bool() }),
  },
  async ({ id, ...d }, user) => {
    if (d.minScore > d.maxScore) throw new UserError("The lowest score must not be above the highest score.");
    const t = id ? await prisma.commentTemplate.update({ where: { id }, data: d }) : await prisma.commentTemplate.create({ data: d });
    await audit(user.id, id ? "UPDATE" : "CREATE", "CommentTemplate", t.id, d);
    return { ok: true, message: id ? "Comment updated." : "Comment added." };
  },
);

export const deleteCommentTemplate = action(
  { permission: [...EDITORS], revalidate: "/comment-bank", schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    const t = await prisma.commentTemplate.delete({ where: { id } });
    await audit(user.id, "DELETE", "CommentTemplate", id, { role: t.role, text: t.text });
    return { ok: true, message: "Comment removed." };
  },
);
