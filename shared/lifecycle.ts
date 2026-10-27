export function canActivateApplicant(applicationStatus: string, feeStatus: string, detailsVerified: boolean) {
  const applicationEligible = ["submitted", "under_review", "admitted"].includes(applicationStatus);
  const feeEligible = ["settled", "waived", "not_required"].includes(feeStatus);
  return applicationEligible && feeEligible && detailsVerified;
}
