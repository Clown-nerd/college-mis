/**
 * Development-only local access may be disabled explicitly with LOCAL_AUTH_ENABLED=false.
 * Production always disables the local identity path regardless of this setting.
 */
export function localAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.LOCAL_AUTH_ENABLED !== "false";
}
