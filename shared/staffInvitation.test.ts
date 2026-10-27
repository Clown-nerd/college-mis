import { describe, expect, it } from "vitest";
import { preparedInvitationState, simulatedInvitationDeliveryState } from "./staffInvitation";

describe("staff invitation delivery state", () => {
  it("sets a draft state without claiming email dispatch", () => {
    expect(preparedInvitationState()).toMatchObject({ invitationDeliveryStatus: "drafted", invitationFailureReason: null, invitationSentAt: null });
  });
  it("records distinct successful and failed simulated outcomes", () => {
    expect(simulatedInvitationDeliveryState("sent")).toMatchObject({ invitationDeliveryStatus: "sent", invitationFailureReason: null });
    expect(simulatedInvitationDeliveryState("failed")).toMatchObject({ invitationDeliveryStatus: "failed", invitationFailureReason: "Simulated email delivery failure", invitationSentAt: null });
  });
});
