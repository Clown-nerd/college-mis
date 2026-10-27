export function staffProvisioningState(hasMatchingAccount: boolean) {
  return hasMatchingAccount ? "active" as const : "invited" as const;
}
