import Link from "next/link";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { ConfirmAction } from "./forms";
import type { ActionResult } from "@/server/action";

const btn = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-brand-700";

/** View / Edit / Delete buttons for a table row. Edit and Delete only render when allowed. */
export function RowActions({
  viewHref, editHref, deleteAction, deleteFields, deleteConfirm, label,
}: {
  viewHref: string; editHref?: string; label: string;
  deleteAction?: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  deleteFields?: Record<string, string>; deleteConfirm?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Link href={viewHref} className={btn} title={`View ${label}`} aria-label={`View ${label}`}><Eye className="h-4 w-4" /></Link>
      {editHref && <Link href={editHref} className={btn} title={`Edit ${label}`} aria-label={`Edit ${label}`}><Pencil className="h-4 w-4" /></Link>}
      {deleteAction && deleteFields && (
        <ConfirmAction
          action={deleteAction}
          fields={deleteFields}
          label=""
          icon={<Trash2 className="h-4 w-4" aria-hidden />}
          variant="outline"
          size="icon"
          ariaLabel={`Delete ${label}`}
          confirm={deleteConfirm ?? `Permanently delete ${label}? This cannot be undone.`}
        />
      )}
    </div>
  );
}
