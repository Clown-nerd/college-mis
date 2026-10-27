import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, staffProfiles, students, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { localAuthEnabled } from "./localAuth";
import { shouldProvisionLocalStudentRecord } from "../shared/developmentAuth";

let _db: ReturnType<typeof drizzle> | null = null;

// In-memory store when DATABASE_URL is not configured
export const memoryDb = {
  users: [] as Array<typeof users.$inferSelect>,
  departments: [
    { id: 1, code: "CS", name: "Department of Computer Science", active: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, code: "BUS", name: "Department of Business & Governance", active: true, createdAt: new Date(), updatedAt: new Date() },
  ] as Array<{ id: number; code: string; name: string; active: boolean; createdAt: Date; updatedAt: Date }>,
  programmes: [
    { id: 1, departmentId: 1, code: "BSC-CS", name: "BSc (Hons) Computer Science", awardType: "degree" as "certificate" | "diploma" | "degree" | "postgraduate", durationTerms: 6, active: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, departmentId: 2, code: "DIP-BA", name: "Diploma in Business Administration", awardType: "diploma" as "certificate" | "diploma" | "degree" | "postgraduate", durationTerms: 4, active: true, createdAt: new Date(), updatedAt: new Date() },
  ],
  terms: [
    { id: 1, code: "2026-AUT", name: "Autumn Term 2026", startsAt: new Date("2026-09-01"), endsAt: new Date("2026-12-18"), status: "active" as "planned" | "active" | "closed", createdAt: new Date(), updatedAt: new Date() },
  ],
  courses: [
    { id: 1, departmentId: 1, code: "CS101", title: "Foundations of Software Engineering", description: "Core software systems, architecture, and verification.", credits: 15, level: 4, active: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, departmentId: 1, code: "CS204", title: "Relational Databases & Distributed Ledger Systems", description: "Data modelling, relational integrity, and transaction processing.", credits: 15, level: 5, active: true, createdAt: new Date(), updatedAt: new Date() },
  ],
  coursePrerequisites: [] as Array<{ id: number; courseId: number; prerequisiteCourseId: number }>,
  offerings: [
    { id: 1, courseId: 1, termId: 1, section: "A", modality: "in_person" as "in_person" | "online" | "hybrid", meetingPattern: "Mon/Wed 09:00–10:30", room: "Lecture Hall 201", capacity: 45, status: "open" as "draft" | "open" | "closed" | "cancelled", createdAt: new Date(), updatedAt: new Date() },
    { id: 2, courseId: 2, termId: 1, section: "A", modality: "hybrid" as "in_person" | "online" | "hybrid", meetingPattern: "Tue/Thu 14:00–15:30", room: "Lab 104", capacity: 35, status: "open" as "draft" | "open" | "closed" | "cancelled", createdAt: new Date(), updatedAt: new Date() },
  ],
  classMeetings: [
    { id: 1, courseOfferingId: 1, weekday: "monday" as "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday", startsAt: "09:00", endsAt: "10:30", room: "Lecture Hall 201", createdAt: new Date() },
    { id: 2, courseOfferingId: 1, weekday: "wednesday" as "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday", startsAt: "09:00", endsAt: "10:30", room: "Lecture Hall 201", createdAt: new Date() },
  ],
  students: [] as Array<typeof students.$inferSelect>,
  enrollments: [] as Array<typeof import("../drizzle/schema").enrollments.$inferSelect>,
  facultyAssignments: [] as Array<typeof import("../drizzle/schema").facultyAssignments.$inferSelect>,
  attendanceRecords: [] as Array<typeof import("../drizzle/schema").attendanceRecords.$inferSelect>,
  gradeRecords: [] as Array<typeof import("../drizzle/schema").gradeRecords.$inferSelect>,
  courseActivities: [] as Array<typeof import("../drizzle/schema").courseActivities.$inferSelect>,
  activitySubmissions: [] as Array<typeof import("../drizzle/schema").activitySubmissions.$inferSelect>,
  invoices: [] as Array<typeof import("../drizzle/schema").invoices.$inferSelect>,
  scholarships: [] as Array<typeof import("../drizzle/schema").scholarships.$inferSelect>,
  paymentTransactions: [] as Array<typeof import("../drizzle/schema").paymentTransactions.$inferSelect>,
  applicants: [] as Array<typeof import("../drizzle/schema").applicants.$inferSelect>,
  applicantPayments: [] as Array<typeof import("../drizzle/schema").applicantPayments.$inferSelect>,
  staffProfiles: [] as Array<typeof staffProfiles.$inferSelect>,
  studentRequests: [] as Array<typeof import("../drizzle/schema").studentRequests.$inferSelect>,
  documents: [] as Array<typeof import("../drizzle/schema").documents.$inferSelect>,
  auditEvents: [] as Array<typeof import("../drizzle/schema").auditEvents.$inferSelect>,
};

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    const existing = memoryDb.users.find(u => u.openId === user.openId);
    const now = new Date();
    const resolvedRole = user.role ?? (user.email?.trim().toLowerCase() && user.email.trim().toLowerCase() === ENV.ownerEmail ? "admin" : existing?.role ?? "applicant");
    if (existing) {
      if (user.name !== undefined) existing.name = user.name ?? null;
      if (user.email !== undefined) existing.email = user.email ?? null;
      if (user.loginMethod !== undefined) existing.loginMethod = user.loginMethod ?? null;
      existing.role = resolvedRole;
      existing.lastSignedIn = user.lastSignedIn ?? now;
      existing.updatedAt = now;
    } else {
      memoryDb.users.push({
        id: memoryDb.users.length + 1,
        openId: user.openId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        role: resolvedRole,
        createdAt: now,
        updatedAt: now,
        lastSignedIn: user.lastSignedIn ?? now,
      });
    }
    const storedUser = memoryDb.users.find(u => u.openId === user.openId);
    if (storedUser && user.email) {
      const staffProfile = memoryDb.staffProfiles.find(p => p.email === user.email);
      if (staffProfile && !staffProfile.userId && staffProfile.status === "invited") {
        staffProfile.userId = storedUser.id;
        staffProfile.status = "active";
        storedUser.role = staffProfile.accessRole;
      }
    }
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.email?.trim().toLowerCase() && user.email.trim().toLowerCase() === ENV.ownerEmail) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });

    if (user.email) {
      const [storedUser] = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
      const [staffProfile] = await db.select().from(staffProfiles).where(eq(staffProfiles.email, user.email)).limit(1);
      if (storedUser && staffProfile && !staffProfile.userId && staffProfile.status === "invited") {
        await db.transaction(async tx => {
          await tx.update(staffProfiles).set({ userId: storedUser.id, status: "active" }).where(eq(staffProfiles.id, staffProfile.id));
          await tx.update(users).set({ role: staffProfile.accessRole }).where(eq(users.id, storedUser.id));
        });
      }
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    return memoryDb.users.find(u => u.openId === openId);
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

const localIdentityDetails = {
  applicant: { name: "Avery Applicant", email: "avery.applicant@local.college.test" },
  student: { name: "Sam Student", email: "sam.student@local.college.test" },
  faculty: { name: "Taylor Teaching", email: "taylor.teaching@local.college.test" },
  non_teaching: { name: "Casey Technical", email: "casey.technical@local.college.test" },
  finance: { name: "Jordan Finance", email: "jordan.finance@local.college.test" },
  registrar: { name: "Riley Registrar", email: "riley.registrar@local.college.test" },
  admin: { name: "Alex Administrator", email: "alex.administrator@local.college.test" },
} as const;

export type LocalIdentityRole = keyof typeof localIdentityDetails;
type DatabaseConnection = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function ensureLocalStudentRecord(
  db: DatabaseConnection | null,
  user: NonNullable<Awaited<ReturnType<typeof getUserByOpenId>>>
) {
  if (!db) {
    const existing = memoryDb.students.find(s => s.userId === user.id);
    if (existing) return;
    const now = new Date();
    const studentId = memoryDb.students.length + 1;
    memoryDb.students.push({
      id: studentId,
      userId: user.id,
      studentNumber: "LOCAL-STUDENT-001",
      legalFirstName: "Sam",
      legalLastName: "Student",
      preferredName: "Sam",
      institutionalEmail: user.email || "sam.student@local.college.test",
      phone: "+44 20 7946 0192",
      emergencyContactName: "Pat Student",
      emergencyContactPhone: "+44 20 7946 0199",
      programmeId: 1,
      admissionTermId: 1,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    if (memoryDb.enrollments.length === 0) {
      memoryDb.enrollments.push({
        id: 1,
        studentId,
        courseOfferingId: 1,
        status: "registered",
        registeredAt: now,
        updatedAt: now,
      });
    }
    return;
  }
  const [existingStudent] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
  if (existingStudent) return;
  await db.insert(students).values({ userId: user.id, studentNumber: "LOCAL-STUDENT-001", legalFirstName: "Sam", legalLastName: "Student", institutionalEmail: user.email || "sam.student@local.college.test", status: "active" });
}

export async function getOrCreateLocalUser(role: LocalIdentityRole, databaseOverride?: DatabaseConnection) {
  if (!localAuthEnabled()) {
    throw new Error("Local authentication is disabled in production.");
  }
  const db = databaseOverride ?? await getDb();
  const openId = `local-demo-${role}`;
  if (!db) {
    let localUser = memoryDb.users.find(u => u.openId === openId);
    if (!localUser) {
      const detail = localIdentityDetails[role];
      const now = new Date();
      localUser = {
        id: memoryDb.users.length + 1,
        openId,
        name: detail.name,
        email: detail.email,
        loginMethod: "local-development",
        role,
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      };
      memoryDb.users.push(localUser);
    }
    if (shouldProvisionLocalStudentRecord(role)) await ensureLocalStudentRecord(null, localUser);
    if (role === "faculty" && !memoryDb.facultyAssignments.some(a => a.facultyUserId === localUser.id)) {
      memoryDb.facultyAssignments.push({
        id: memoryDb.facultyAssignments.length + 1,
        courseOfferingId: 1,
        facultyUserId: localUser.id,
        assignmentRole: "instructor",
        assignedAt: new Date(),
      });
    }
    return localUser;
  }
  const [existing] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  let localUser = existing;
  if (!localUser) {
    const detail = localIdentityDetails[role];
    await db.insert(users).values({ openId, name: detail.name, email: detail.email, loginMethod: "local-development", role });
    const [created] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    if (!created) throw new Error("The local development identity could not be created.");
    localUser = created;
  }
  if (shouldProvisionLocalStudentRecord(role)) await ensureLocalStudentRecord(db, localUser);
  return localUser;
}
