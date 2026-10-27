import { beforeEach, describe, expect, it, vi } from "vitest";

const misDbMock = vi.hoisted(() => ({
  recordStaffInvitationDelivery: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock("./db/mis", () => misDbMock);

import { appRouter } from "./routers";

const invitationProfile = {
  id: 41,
  fullName: "Development Teaching Invitee",
  email: "dev.teacher.invitee@local.college.test",
  invitationToken: "test-token",
  staffCategory: "teaching" as const,
  accessRole: "faculty" as const,
};

describe("governance.simulateStaffInvitationSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    misDbMock.recordStaffInvitationDelivery.mockResolvedValue(invitationProfile);
  });

  it("is administrator-only and records a simulated sent result in the audit ledger", async () => {
    const administratorCaller = appRouter.createCaller({ user: { id: 7, role: "admin" } } as never);

    await expect(administratorCaller.governance.simulateStaffInvitationSend({ staffProfileId: 41, outcome: "sent" })).resolves.toEqual({ success: true });

    expect(misDbMock.recordStaffInvitationDelivery).toHaveBeenCalledWith({ staffProfileId: 41, deliveryStatus: "sent", actorUserId: 7, failureReason: undefined });
    expect(misDbMock.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 7, action: "staff.invitation_simulated_sent", entityType: "staffProfile", entityId: "41" }),
    );

    const nonAdministratorCaller = appRouter.createCaller({ user: { id: 8, role: "faculty" } } as never);
    await expect(nonAdministratorCaller.governance.simulateStaffInvitationSend({ staffProfileId: 41, outcome: "failed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(misDbMock.recordStaffInvitationDelivery).toHaveBeenCalledTimes(1);
  });
});
