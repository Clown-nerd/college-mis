import { describe, expect, it, vi } from "vitest";
import { prepareStaffInvitation, recordStaffInvitationDelivery } from "./db/mis";

function createInvitationDatabase() {
  const profile = {
    id: 41,
    fullName: "Development Teaching Invitee",
    email: "dev.teacher.invitee@local.college.test",
    invitationToken: "test-token",
    staffCategory: "teaching" as const,
    accessRole: "faculty" as const,
  };
  const updates: Array<Record<string, unknown>> = [];
  const database = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => [profile]) })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updates.push(values);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    })),
  };

  return { database: database as never, updates };
}

describe("staff invitation persistence", () => {
  it("persists a drafted state with accountable preparation metadata", async () => {
    const { database, updates } = createInvitationDatabase();

    await prepareStaffInvitation({ staffProfileId: 41, preparedByUserId: 7 }, database);

    expect(updates.at(-1)).toEqual(
      expect.objectContaining({
        invitationDeliveryStatus: "drafted",
        invitationPreparedByUserId: 7,
        invitationPreparedAt: expect.any(Date),
        invitationFailureReason: null,
        invitationSentAt: null,
      }),
    );
  });

  it("persists distinct successful and failed simulated delivery outcomes", async () => {
    const { database, updates } = createInvitationDatabase();

    await recordStaffInvitationDelivery({ staffProfileId: 41, deliveryStatus: "sent", actorUserId: 7 }, database);
    expect(updates.at(-1)).toEqual(
      expect.objectContaining({ invitationDeliveryStatus: "sent", invitationPreparedByUserId: 7, invitationSentAt: expect.any(Date), invitationFailureReason: null }),
    );

    await recordStaffInvitationDelivery({ staffProfileId: 41, deliveryStatus: "failed", actorUserId: 7, failureReason: "Controlled failure test" }, database);
    expect(updates.at(-1)).toEqual(
      expect.objectContaining({ invitationDeliveryStatus: "failed", invitationPreparedByUserId: 7, invitationSentAt: null, invitationFailureReason: "Controlled failure test" }),
    );
  });
});
