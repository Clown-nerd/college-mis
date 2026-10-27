import { describe, expect, it } from "vitest";
import { completedOnboardingCount, onboardingStorageKey, toggleOnboardingItem } from "./onboarding";

describe("role onboarding completion", () => {
  it("namespaces retained checklist state by role", () => {
    expect(onboardingStorageKey("student")).toBe("college-mis-onboarding-student");
    expect(onboardingStorageKey("admin")).not.toBe(onboardingStorageKey("student"));
  });

  it("adds and removes a completed task without duplicating state", () => {
    expect(toggleOnboardingItem([], "record")).toEqual(["record"]);
    expect(toggleOnboardingItem(["record"], "record")).toEqual([]);
  });

  it("counts only visible checklist items", () => {
    expect(completedOnboardingCount(["record", "schedule"], ["record", "hidden"])).toBe(1);
  });
});
