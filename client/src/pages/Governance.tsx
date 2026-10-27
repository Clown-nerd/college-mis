import { useAuth } from "@/_core/hooks/useAuth";
import { ContentCard, EmptyState, PageHeading, StatusPill } from "@/components/MisUi";
import DashboardLayout from "@/components/DashboardLayout";
import { SystemActivityLog } from "@/components/SystemActivityLog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { toast } from "sonner";

const roleLabels: Record<string, string> = { admin: "Administrator", registrar: "Registry staff", faculty: "Teaching staff", student: "Student", finance: "Finance staff", non_teaching: "Technical / non-teaching", applicant: "Applicant", user: "Unassigned student" };
function roleTone(role: string) { if (role === "admin") return "risk" as const; if (role === "registrar" || role === "finance") return "warning" as const; if (role === "faculty") return "navy" as const; return "good" as const; }

function GovernanceContent() {
  const { user } = useAuth();
  const allowed = user?.role === "admin";
  const utils = trpc.useUtils();
  const users = trpc.governance.users.useQuery(undefined, { enabled: allowed });
  const audit = trpc.governance.auditLog.useQuery(undefined, { enabled: allowed });
  const updateRole = trpc.governance.updateRole.useMutation({ onSuccess: async () => { toast.success("Role updated and audit event recorded."); await utils.governance.users.invalidate(); await utils.governance.auditLog.invalidate(); }, onError: error => toast.error(error.message) });

  if (!allowed) return <><PageHeading eyebrow="Controlled access" title="Governance" description="Role management and audit review are limited to administrators." /><EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="Governance access is restricted" detail="Institutional role changes affect access to sensitive records and are protected by a dedicated administrator permission." /></>;

  return (
    <>
      <PageHeading eyebrow="Governance & audit" title="Institutional controls & activity log" description="Assign roles deliberately and track system-wide changes—including student record updates, admissions approvals, academic grading, and financial controls.">
        <StatusPill tone="risk">Administrator only</StatusPill>
      </PageHeading>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <ContentCard className="bg-[#132b45] text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Access principle</p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">Least privilege, made visible.</h2>
          <p className="mt-4 text-sm leading-6 text-[#c5d1dc]">Role visibility in the interface complements—never replaces—server-side access control. Each institutional role is restricted to the work it needs to perform.</p>
        </ContentCard>
        <ContentCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Audit coverage</p>
          <h2 className="mt-2 font-serif text-2xl tracking-[-0.03em] text-[#203950]">Every institutional change remains traceable.</h2>
          <p className="mt-3 text-sm leading-6 text-[#72747f]">Student creation and record updates, admissions decisions and confirmations, academic catalogue changes, attendance and grade actions, invoice and scholarship controls, and role assignments are recorded with actor, entity, metadata, and timestamp.</p>
        </ContentCard>
      </section>

      <section className="mt-6">
        <SystemActivityLog
          events={audit.data || []}
          isLoading={audit.isLoading}
          onRefresh={() => void audit.refetch()}
          isRefreshing={audit.isFetching}
        />
      </section>

      <section className="mt-6">
        <ContentCard className="p-0">
          <div className="flex items-center gap-3 border-b border-[#e6e0d6] p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf1f5] text-[#315875]"><UserCog className="h-4 w-4" /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Role assignments</p>
              <h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-[#203950]">Institutional accounts</h2>
            </div>
          </div>
          {users.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3].map(item => <Skeleton className="h-16 rounded-xl bg-[#e8e2d8]" key={item} />)}</div> : null}
          {!users.isLoading && !users.data?.length ? <div className="p-5"><EmptyState icon={<UsersRound className="h-5 w-5" />} title="No signed-in accounts yet" detail="Users appear here after they sign in through the institution’s secure authentication flow." /></div> : null}
          <div className="divide-y divide-[#eee9e0]">
            {users.data?.map(account => (
              <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" key={account.id}>
                <div>
                  <p className="text-sm font-semibold text-[#344a60]">{account.name || "Unnamed institutional account"}</p>
                  <p className="mt-1 text-xs text-[#858077]">{account.email || "No email available"}</p>
                  <div className="mt-2"><StatusPill tone={roleTone(account.role)}>{roleLabels[account.role]}</StatusPill></div>
                </div>
                <Select value={account.role === "user" ? "student" : account.role} onValueChange={role => updateRole.mutate({ userId: account.id, role: role as "admin" | "registrar" | "faculty" | "student" | "finance" | "non_teaching" | "applicant" })}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["applicant", "student", "faculty", "non_teaching", "finance", "registrar", "admin"].map(role => (
                      <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </ContentCard>
      </section>
    </>
  );
}

export default function Governance() { return <DashboardLayout><GovernanceContent /></DashboardLayout>; }
