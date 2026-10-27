export type InvitationDeliveryState = "not_sent" | "drafted" | "sent" | "failed";

export function preparedInvitationState() {
  return { invitationDeliveryStatus: "drafted" as const, invitationFailureReason: null, invitationSentAt: null };
}

export function simulatedInvitationDeliveryState(outcome: "sent" | "failed") {
  return outcome === "sent" ? { invitationDeliveryStatus: "sent" as const, invitationSentAt: new Date(), invitationFailureReason: null } : { invitationDeliveryStatus: "failed" as const, invitationSentAt: null, invitationFailureReason: "Simulated email delivery failure" };
}
