export function buildStaffInvitationMailto(input: { email: string; fullName: string; roleLabel: string; invitationToken: string; appOrigin: string }) {
  const subject = "Your College MIS staff invitation";
  const body = `Hello ${input.fullName},\n\nYou have been provisioned for the College MIS as ${input.roleLabel}. Use your institutional email address to sign in and access your assigned workspace.\n\nInvitation reference: ${input.invitationToken}\nAccess the MIS: ${input.appOrigin}\n\nCollege Administration`;
  return `mailto:${encodeURIComponent(input.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
