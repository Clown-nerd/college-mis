import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import type { ComponentType } from "react";
import { Redirect } from "wouter";

export function RoleProtectedRoute({
  component: Component,
  roles,
}: {
  component: ComponentType;
  roles: string[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f5f2ea] text-[#315875]"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading secure workspace" /></div>;
  }

  if (user && !roles.includes(user.role)) return <Redirect to="/" />;
  return <Component />;
}
