import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { router } from "./_core/trpc";
import { requireRoles, studentServicesProcedure } from "./authorization";

function contextFor(role: "admin" | "registrar" | "faculty" | "student" | "non_teaching"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "institutional-test-user",
      name: "Test user",
      email: "test@example.edu",
      loginMethod: "test",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const protectedTestRouter = router({
  registrarAction: requireRoles("admin", "registrar").query(() => ({ success: true })),
  studentServiceAction: studentServicesProcedure.query(() => ({ success: true })),
});

describe("MIS role guard", () => {
  it("allows a registrar to execute a registrar-scoped procedure", async () => {
    const caller = protectedTestRouter.createCaller(contextFor("registrar"));
    await expect(caller.registrarAction()).resolves.toEqual({ success: true });
  });

  it("blocks a student from a registrar-scoped procedure at the server boundary", async () => {
    const caller = protectedTestRouter.createCaller(contextFor("student"));
    await expect(caller.registrarAction()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows non-teaching staff into the designated student-service workflow only", async () => {
    const caller = protectedTestRouter.createCaller(contextFor("non_teaching"));
    await expect(caller.studentServiceAction()).resolves.toEqual({ success: true });
    await expect(caller.registrarAction()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
