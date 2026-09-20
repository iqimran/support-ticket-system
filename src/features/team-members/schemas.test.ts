import { describe, expect, it } from "vitest";
import { createTeamMemberSchema, teamMemberSearchSchema, updateTeamMemberSchema } from "./schemas";

describe("createTeamMemberSchema", () => {
  it("accepts a valid name and phone", () => {
    const result = createTeamMemberSchema.safeParse({ name: "Rahim Uddin", phone: "01712345678" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+8801712345678");
  });

  it("rejects an empty name", () => {
    const result = createTeamMemberSchema.safeParse({ name: "", phone: "01712345678" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid phone", () => {
    const result = createTeamMemberSchema.safeParse({ name: "Rahim Uddin", phone: "12345" });
    expect(result.success).toBe(false);
  });

  it("has no password field at all — the service always generates one", () => {
    const shape = Object.keys(createTeamMemberSchema.shape);
    expect(shape).toEqual(["name", "phone"]);
  });
});

describe("updateTeamMemberSchema", () => {
  it("accepts a valid name and phone", () => {
    const result = updateTeamMemberSchema.safeParse({ name: "New Name", phone: "01812345678" });
    expect(result.success).toBe(true);
  });
});

describe("teamMemberSearchSchema", () => {
  it("defaults to all statuses, sorted by name ascending", () => {
    const result = teamMemberSearchSchema.parse({});
    expect(result.status).toBe("all");
    expect(result.sortBy).toBe("name");
    expect(result.sortDir).toBe("asc");
  });

  it("rejects an invalid status filter", () => {
    const result = teamMemberSearchSchema.safeParse({ status: "suspended" });
    expect(result.success).toBe(false);
  });
});
