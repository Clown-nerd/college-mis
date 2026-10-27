/**
 * Development-only local access may be hidden explicitly with VITE_LOCAL_AUTH_ENABLED=false.
 * Vite omits this access path from production mode by requiring import.meta.env.DEV.
 */
export const localAuthEnabled = import.meta.env.DEV && import.meta.env.VITE_LOCAL_AUTH_ENABLED !== "false";
