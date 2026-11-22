import { describe, expect, it } from "vitest";
import { allocateHouses } from "@/lib/houses";

describe("sharing students among houses", () => {
  it("balances every class and sex across the houses", () => {
    const students = Array.from({ length: 24 }, (_, i) => ({ id: `s${i}`, classId: i < 12 ? "S1" : "S2", gender: i % 2 ? "F" : "M" }));
    const out = allocateHouses(students, ["red", "blue", "green"]);
    expect(out.size).toBe(24);
    for (const c of ["S1", "S2"]) for (const g of ["M", "F"]) for (const h of ["red", "blue", "green"]) {
      expect(students.filter((s) => s.classId === c && s.gender === g && out.get(s.id) === h).length).toBe(2);
    }
  });
  it("counts students already in a house and fills the smaller houses first", () => {
    const existing = [{ houseId: "red", classId: "S1", gender: "M" }, { houseId: "red", classId: "S1", gender: "M" }];
    const out = allocateHouses([{ id: "a", classId: "S1", gender: "M" }, { id: "b", classId: "S1", gender: "M" }], ["red", "blue"], existing);
    expect([...out.values()]).toEqual(["blue", "blue"]);
  });
  it("does nothing without houses", () => expect(allocateHouses([{ id: "a", classId: "S1", gender: "M" }], []).size).toBe(0));
});
