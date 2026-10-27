import { TRPCError } from "@trpc/server";
import type { UserRole } from "../drizzle/schema";
import { protectedProcedure } from "./_core/trpc";

export const institutionalRoles = {
  administrator: "admin",
  registrar: "registrar",
  teachingStaff: "faculty",
  nonTeachingStaff: "non_teaching",
  student: "student",
  finance: "finance",
} as const;

export const staffRoles: UserRole[] = ["admin", "registrar", "faculty", "finance", "non_teaching"];
export const academicStaffRoles: UserRole[] = ["admin", "registrar", "faculty"];
export const studentRoles: UserRole[] = ["student", "user"];

export function requireRoles(...roles: UserRole[]) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your institutional role does not permit this action.",
      });
    }

    return next({ ctx });
  });
}

export const administratorProcedure = requireRoles("admin");
export const registrarProcedure = requireRoles("admin", "registrar");
export const financeProcedure = requireRoles("admin", "finance");
export const academicProcedure = requireRoles("admin", "registrar", "faculty");
export const studentServicesProcedure = requireRoles("admin", "registrar", "non_teaching");
