import { afterEach, describe, expect, it } from "vitest";
import { localAuthEnabled } from "./localAuth";

const originalNodeEnv = process.env.NODE_ENV;
const originalToggle = process.env.LOCAL_AUTH_ENABLED;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalToggle === undefined) delete process.env.LOCAL_AUTH_ENABLED;
  else process.env.LOCAL_AUTH_ENABLED = originalToggle;
});

describe("local authentication gate", () => {
  it("allows the temporary selector only in enabled non-production environments", () => {
    process.env.NODE_ENV = "development";
    delete process.env.LOCAL_AUTH_ENABLED;
    expect(localAuthEnabled()).toBe(true);
    process.env.LOCAL_AUTH_ENABLED = "false";
    expect(localAuthEnabled()).toBe(false);
  });

  it("always rejects local authentication in production", () => {
    process.env.NODE_ENV = "production";
    process.env.LOCAL_AUTH_ENABLED = "true";
    expect(localAuthEnabled()).toBe(false);
  });
});
