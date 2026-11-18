"use client";
import * as React from "react";
import { Field } from "./forms";
import { Select } from "./ui/input";

type Tree = { id: string; name: string; level: string; streams: { id: string; name: string }[] }[];

/** Class select that filters its stream select; optionally shows A-Level combination. */
export function ClassStreamSelect({
  tree, defaultClassId, defaultStreamId, combinations, defaultCombinationId, disabled,
}: {
  tree: Tree; defaultClassId?: string; defaultStreamId?: string; disabled?: boolean;
  combinations?: { id: string; code: string; name: string }[]; defaultCombinationId?: string | null;
}) {
  const [classId, setClassId] = React.useState(defaultClassId ?? "");
  const cls = tree.find((c) => c.id === classId);
  return (
    <>
      <Field label="Class" name="classId" required>
        <Select id="classId" name="classId" required value={classId} disabled={disabled} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Select class</option>
          {tree.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Stream" name="streamId" required>
        <Select id="streamId" name="streamId" required defaultValue={defaultStreamId} key={classId} disabled={disabled}>
          <option value="">Select stream</option>
          {cls?.streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      {disabled && (
        <>
          <input type="hidden" name="classId" value={classId} />
          <input type="hidden" name="streamId" value={defaultStreamId} />
        </>
      )}
      {combinations && cls?.level === "A_LEVEL" && (
        <Field label="Subject combination" name="combinationId" hint="Sets the student's A-Level subjects">
          <Select id="combinationId" name="combinationId" defaultValue={defaultCombinationId ?? ""}>
            <option value="">Select combination</option>
            {combinations.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </Select>
        </Field>
      )}
    </>
  );
}
