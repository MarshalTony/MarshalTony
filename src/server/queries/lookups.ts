import { prisma } from "@/lib/db";

export async function classTree() {
  return prisma.schoolClass.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
    select: { id: true, code: true, name: true, level: true, streams: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } } },
  });
}
export type ClassTree = Awaited<ReturnType<typeof classTree>>;

export function streamOptions(tree: ClassTree) {
  return tree.flatMap((c) => c.streams.map((s) => ({ value: s.id, label: `${c.code} ${s.name}` })));
}
export function classOptions(tree: ClassTree) {
  return tree.map((c) => ({ value: c.id, label: c.name }));
}
