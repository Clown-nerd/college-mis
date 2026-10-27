import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, staffProfiles, students, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { localAuthEnabled } from "./localAuth";
import { shouldProvisionLocalStudentRecord } from "../shared/developmentAuth";

let _db: ReturnType<typeof drizzle> | null = null;

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
    console.warn("[Database] Cannot upsert user: database not available");
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
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
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
  db: DatabaseConnection,
  user: NonNullable<Awaited<ReturnType<typeof getUserByOpenId>>>
) {
  const [existingStudent] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
  if (existingStudent) return;
  await db.insert(students).values({ userId: user.id, studentNumber: "LOCAL-STUDENT-001", legalFirstName: "Sam", legalLastName: "Student", institutionalEmail: user.email || "sam.student@local.college.test", status: "active" });
}

export async function getOrCreateLocalUser(role: LocalIdentityRole, databaseOverride?: DatabaseConnection) {
  if (!localAuthEnabled()) {
    throw new Error("Local authentication is disabled in production.");
  }
  const db = databaseOverride ?? await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const openId = `local-demo-${role}`;
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
