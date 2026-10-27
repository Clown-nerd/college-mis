import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localAuthEnabled } from "@/lib/localAuth";
import { trpc } from "@/lib/trpc";
import { ShieldAlert, UsersRound } from "lucide-react";
import { useEffect } from "react";

const localRoles = [
  ["applicant", "Applicant"],
  ["student", "Student"],
  ["faculty", "Teaching staff"],
  ["non_teaching", "Technical staff"],
  ["finance", "Finance staff"],
  ["registrar", "Registrar"],
  ["admin", "Administrator"],
] as const;

function useLocalLogin() {
  const utils = trpc.useUtils();
  return trpc.auth.localLogin.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.assign("/");
    },
  });
}

export function LocalAccessSelector() {
  const login = useLocalLogin();
  if (!localAuthEnabled) return null;
  return <div className="mt-8 border-t border-[#ded8cd] pt-6"><div className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 text-[#a36f2e]" /><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#98764a]">Development access only</p><p className="mt-1 text-xs leading-5 text-[#78756e]">Select a temporary identity to validate role-specific workflows. This control is omitted from production builds.</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="col-span-2 flex items-center gap-2 text-xs font-semibold text-[#435668]"><UsersRound className="h-3.5 w-3.5" />Choose a test workspace</div>{localRoles.map(([role, label]) => <Button key={role} variant="outline" size="sm" disabled={login.isPending} onClick={() => login.mutate(role)} className="justify-start rounded-lg bg-white text-xs">{login.isPending ? "Opening…" : label}</Button>)}</div>{login.error ? <p className="mt-3 text-xs text-[#ad4b42]">{login.error.message}</p> : null}</div>;
}

export function LocalRoleSwitcher() {
  const login = useLocalLogin();
  if (!localAuthEnabled) return null;
  return <div className="mb-3 rounded-xl border border-[#d9c27b]/20 bg-[#d9c27b]/10 p-2.5 group-data-[collapsible=icon]:hidden"><p className="mb-2 text-[9px] font-bold uppercase tracking-[0.15em] text-[#e5d28f]">Development role switcher</p><Select onValueChange={role => login.mutate(role as (typeof localRoles)[number][0])}><SelectTrigger className="h-8 border-white/15 bg-[#19334d] text-[11px] text-white"><SelectValue placeholder={login.isPending ? "Opening…" : "Switch test identity"} /></SelectTrigger><SelectContent>{localRoles.map(([role, label]) => <SelectItem value={role} key={role}>{label}</SelectItem>)}</SelectContent></Select></div>;
}

export function LocalRoleUrlBootstrap() {
  const login = useLocalLogin();
  useEffect(() => {
    if (!localAuthEnabled || login.isPending) return;
    const role = new URLSearchParams(window.location.search).get("localRole");
    if (localRoles.some(([value]) => value === role)) login.mutate(role as (typeof localRoles)[number][0]);
  }, [login]);
  return null;
}
