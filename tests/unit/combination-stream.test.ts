import { describe, expect, it } from "vitest";
import { pickStream, streamCategory } from "@/lib/combination-stream";

const S5 = [{ id: "a", name: "ARTS" }, { id: "s", name: "SCIENCE" }];
describe("A-Level stream by combination category", () => {
  it("reads the category from the setting, else the stream's name", () => {
    expect(streamCategory({ name: "ARTS" })).toBe("ARTS");
    expect(streamCategory({ name: "Sciences" })).toBe("SCIENCES");
    expect(streamCategory({ name: "A" })).toBeNull();
    expect(streamCategory({ name: "A", combinationCategory: "SCIENCES" })).toBe("SCIENCES");
  });
  it("picks the matching stream, keeps a matching current one, ignores inactive streams", () => {
    expect(pickStream(S5, "SCIENCES", "a")).toBe("s");
    expect(pickStream(S5, "ARTS", "s")).toBe("a");
    const two = [{ id: "x", name: "A", combinationCategory: "SCIENCES" }, { id: "y", name: "B", combinationCategory: "SCIENCES" }, { id: "z", name: "C", combinationCategory: "ARTS", isActive: false }];
    expect(pickStream(two, "SCIENCES", "y")).toBe("y");
    expect(pickStream(two, "SCIENCES", null)).toBe("x");
    expect(pickStream(two, "ARTS", "x")).toBeNull();
    expect(pickStream(S5, null, "a")).toBeNull();
  });
});
