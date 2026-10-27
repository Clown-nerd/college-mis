export function onboardingStorageKey(role: string) {
  return `college-mis-onboarding-${role}`;
}

export function toggleOnboardingItem(completed: string[], itemId: string) {
  return completed.includes(itemId) ? completed.filter(item => item !== itemId) : [...completed, itemId];
}

export function completedOnboardingCount(itemIds: string[], completed: string[]) {
  return itemIds.filter(itemId => completed.includes(itemId)).length;
}
