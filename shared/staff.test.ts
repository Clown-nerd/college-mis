import { describe, expect, it } from "vitest";
import { staffProvisioningState } from "./staff";

describe("staff provisioning policy", () => {
  it("activates a provisioned staff record only when a matching institutional account exists", () => {
    expect(staffProvisioningState(true)).toBe("active");
    expect(staffProvisioningState(false)).toBe("invited");
  });
});
