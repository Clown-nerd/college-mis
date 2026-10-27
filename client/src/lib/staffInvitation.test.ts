import { describe, expect, it } from "vitest";
import { buildStaffInvitationMailto } from "./staffInvitation";

describe("staff invitation email", () => {
  it("creates an encoded mail draft with role, token, and institutional access link", () => {
    const invitation = buildStaffInvitationMailto({ email: "teaching.staff@college.test", fullName: "Taylor Teaching", roleLabel: "Teaching staff", invitationToken: "invite-123", appOrigin: "https://mis.college.test" });
    expect(invitation).toContain("mailto:teaching.staff%40college.test");
    expect(decodeURIComponent(invitation)).toContain("Teaching staff");
    expect(decodeURIComponent(invitation)).toContain("invite-123");
    expect(decodeURIComponent(invitation)).toContain("https://mis.college.test");
  });
});
