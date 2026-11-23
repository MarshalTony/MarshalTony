import { describe, expect, it } from "vitest";
import { effectiveStatus, subjectFixes, type SubjectStatus } from "@/lib/class-subjects";

describe("subjects per class", () => {
  it("uses the class setting, else the subject's category", () => {
    expect(effectiveStatus("COMPULSORY", null)).toBe("COMPULSORY");
    expect(effectiveStatus("ELECTIVE", undefined)).toBe("OPTIONAL");
    expect(effectiveStatus("COMPULSORY", "OPTIONAL")).toBe("OPTIONAL"); // e.g. Kiswahili in S3
    expect(effectiveStatus("ELECTIVE", "NOT_OFFERED")).toBe("NOT_OFFERED");
  });
  it("adds missing compulsory subjects, drops not-offered ones without marks, leaves choices alone", () => {
    const status = new Map<string, SubjectStatus>([["eng", "COMPULSORY"], ["mtc", "COMPULSORY"], ["kis", "OPTIONAL"], ["lug", "NOT_OFFERED"], ["art", "NOT_OFFERED"]]);
    expect(subjectFixes(["eng", "kis", "lug", "art"], status, new Set(["art"]))).toEqual({ add: ["mtc"], remove: ["lug"], keptWithMarks: ["art"] });
    expect(subjectFixes(["eng", "mtc"], status)).toEqual({ add: [], remove: [], keptWithMarks: [] });
  });
});
