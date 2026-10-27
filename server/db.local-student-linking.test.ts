import { describe, expect, it, vi } from "vitest";
import { students, users } from "../drizzle/schema";
import { getOrCreateLocalUser } from "./db";

function createLocalIdentityDatabase(selectResults: unknown[][]) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const database = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectResults.shift() ?? []),
        })),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: unknown) => {
        inserts.push({ table, values });
        return [{ insertId: inserts.length }];
      }),
    })),
  };

  return { database: database as never, inserts };
}

describe("getOrCreateLocalUser student profile linking", () => {
  it("creates a stable student record for a newly created local student identity", async () => {
    const localStudentUser = {
      id: 17,
      openId: "local-demo-student",
      name: "Sam Student",
      email: "sam.student@local.college.test",
      role: "student",
    };
    const { database, inserts } = createLocalIdentityDatabase([[], [localStudentUser], []]);

    await expect(getOrCreateLocalUser("student", database)).resolves.toMatchObject({ id: 17, role: "student" });

    expect(inserts).toEqual([
      expect.objectContaining({ table: users, values: expect.objectContaining({ openId: "local-demo-student", role: "student" }) }),
      expect.objectContaining({ table: students, values: expect.objectContaining({ userId: 17, studentNumber: "LOCAL-STUDENT-001", status: "active" }) }),
    ]);
  });

  it("retains an existing student profile rather than creating a duplicate during a later local sign-in", async () => {
    const localStudentUser = { id: 17, openId: "local-demo-student", name: "Sam Student", email: "sam.student@local.college.test", role: "student" };
    const existingStudent = { id: 9, userId: 17, studentNumber: "LOCAL-STUDENT-001", status: "active" };
    const { database, inserts } = createLocalIdentityDatabase([[localStudentUser], [existingStudent]]);

    await getOrCreateLocalUser("student", database);

    expect(inserts).toEqual([]);
  });
});
