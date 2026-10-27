import { useAuth } from "@/_core/hooks/useAuth";
import { ActionTile, ContentCard, EmptyState, MetricCard, PageHeading, StatusPill } from "@/components/MisUi";
import DashboardLayout from "@/components/DashboardLayout";
import { RoleOnboardingChecklist } from "@/components/RoleOnboardingChecklist";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileBarChart2,
  GraduationCap,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { useLocation } from "wouter";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

type StaffOverview = {
  activeStudents: number;
  completedEnrollments: number;
  attendanceExceptions: number;
  pendingGrades: number;
  atRiskStudents: number;
  outstandingInvoices: number;
  applicationsInReview: number;
  recentActivity: Array<{ id: number; action: string; entityType: string; summary: string; occurredAt: Date }>;
};

type StudentOverview = {
  recordReady: boolean;
  gpa: number | null;
  publishedResults: number;
  outstandingBalanceCents: number;
};

type FinanceOverview = { settledCents: number; pendingCount: number; reconciledCount: number; exceptionCount: number };

function CommandCentre() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const overview = trpc.dashboard.overview.useQuery();
  const name = user?.name?.split(" ")[0] || "colleague";

  return (
    <>
      <PageHeading
        eyebrow="Operational overview"
        title={`Good morning, ${name}.`}
        description="A composed view of the academic and administrative work that needs attention today."
      >
        <StatusPill tone="good"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />Secure session active</StatusPill>
      </PageHeading>

      {overview.isLoading ? <DashboardSkeleton /> : null}
      {overview.data?.scope === "staff" ? <StaffDashboard data={overview.data} navigate={navigate} /> : null}
      {overview.data?.scope === "faculty" ? <FacultyDashboard assignedOfferings={overview.data.assignedOfferings} navigate={navigate} /> : null}
      {overview.data?.scope === "student" ? <StudentDashboard data={overview.data} navigate={navigate} /> : null}
      {overview.data?.scope === "applicant" ? <ApplicantDashboard navigate={navigate} /> : null}
      {overview.data?.scope === "finance" ? <FinanceDashboard data={overview.data} navigate={navigate} /> : null}
      {overview.data?.scope === "student_services" ? <StudentServicesDashboard navigate={navigate} /> : null}
      {overview.data ? <RoleOnboardingChecklist role={user?.role || "student"} navigate={navigate} /> : null}
      {overview.isError ? (
        <EmptyState icon={<AlertTriangle className="h-5 w-5" />} title="The command centre is temporarily unavailable" detail="Please refresh the page. If the issue remains, contact the system administrator." />
      ) : null}
    </>
  );
}

function DashboardSkeleton() {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-40 rounded-2xl bg-[#e7e2d8]" />)}</div>;
}

function StaffDashboard({ data, navigate }: { data: StaffOverview; navigate: (path: string) => void }) {
  const needsSetup = data.activeStudents + data.applicationsInReview + data.pendingGrades + data.recentActivity.length === 0;
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Active students" value={data.activeStudents} detail="Current enrolled learner records" icon={<UsersRound className="h-4 w-4" />} />
        <MetricCard label="Course completions" value={data.completedEnrollments} detail="Completed enrolments in the record set" tone="navy" icon={<GraduationCap className="h-4 w-4" />} />
        <MetricCard label="Attendance exceptions" value={data.attendanceExceptions} detail="Absences requiring follow-up" tone={data.attendanceExceptions ? "warning" : "good"} icon={<CalendarClock className="h-4 w-4" />} />
        <MetricCard label="Grades pending" value={data.pendingGrades} detail="Draft results awaiting review" tone={data.pendingGrades ? "warning" : "good"} icon={<BookOpenCheck className="h-4 w-4" />} />
        <MetricCard label="At-risk students" value={data.atRiskStudents} detail="Flagged by absences or final results" tone={data.atRiskStudents ? "risk" : "good"} icon={<AlertTriangle className="h-4 w-4" />} />
      </section>

      {needsSetup ? (
        <ContentCard>
          <EmptyState
            icon={<GraduationCap className="h-5 w-5" />}
            title="Begin with your academic foundation"
            detail="The secure MIS is ready for institutional records. Create a department, term, programme, and course catalogue before registering students."
            action={<button onClick={() => navigate("/academics")} className="rounded-xl bg-[#132b45] px-4 py-2.5 text-sm font-semibold text-white transition-transform duration-150 hover:bg-[#1c3b5c] active:scale-[0.97]">Open academic catalogue</button>}
          />
        </ContentCard>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.85fr]">
        <ContentCard>
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Priority queue</p><h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-[#18324b]">Direct the next action.</h2></div>
            <button onClick={() => navigate("/students")} className="inline-flex items-center gap-1 text-xs font-semibold text-[#315875] hover:text-[#142b43]">Open registry <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-5 grid gap-3">
            <ActionTile title="Review student records" detail={`${data.activeStudents} active records are in the institutional registry.`} icon={<UserRoundCheck className="h-4 w-4" />} onClick={() => navigate("/students")} />
            <ActionTile title="Complete academic setup" detail="Maintain terms, curriculum, course offerings, and registrations in one place." icon={<BookOpenCheck className="h-4 w-4" />} onClick={() => navigate("/academics")} />
            <ActionTile title="Review teaching work" detail={`${data.pendingGrades} grade records are currently saved as drafts.`} icon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate("/teaching")} emphasis={data.pendingGrades > 0} />
          </div>
        </ContentCard>

        <ContentCard className="bg-[#132b45] text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Institutional health</p>
          <h2 className="mt-2 font-serif text-2xl tracking-[-0.03em]">Reporting readiness</h2>
          <p className="mt-3 text-sm leading-6 text-[#bdcbd7]">The dashboard only surfaces data entered through the institutional workflow. There are no simulated academic records.</p>
          <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-xs text-[#dbe3ea]">
            <div className="flex justify-between"><span>Applications in review</span><strong>{data.applicationsInReview}</strong></div>
            <div className="flex justify-between"><span>Outstanding invoices</span><strong>{data.outstandingInvoices}</strong></div>
            <div className="flex justify-between"><span>Audit activity available</span><strong>{data.recentActivity.length}</strong></div>
          </div>
          <button onClick={() => navigate("/governance")} className="mt-6 inline-flex items-center gap-1 text-xs font-semibold text-[#f0d889] hover:text-white">Review governance <ArrowRight className="h-3.5 w-3.5" /></button>
        </ContentCard>
      </section>

      <ContentCard>
        <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Protected audit stream</p><h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-[#18324b]">Recent institutional activity</h2></div><ShieldCheck className="h-5 w-5 text-[#567b8d]" /></div>
        {data.recentActivity.length ? (
          <div className="mt-5 divide-y divide-[#e6e0d6]">{data.recentActivity.map(event => <div className="flex items-center justify-between gap-4 py-3" key={event.id}><div><p className="text-sm font-medium text-[#32475c]">{event.summary}</p><p className="mt-1 text-xs text-[#80818a]">{event.entityType} · {event.action}</p></div><time className="shrink-0 text-xs text-[#8c877d]">{format(new Date(event.occurredAt), "MMM d, HH:mm")}</time></div>)}</div>
        ) : <p className="mt-5 text-sm leading-6 text-[#747682]">This secure log will document record and permission changes as users begin working in the system.</p>}
      </ContentCard>
    </div>
  );
}

function FacultyDashboard({ assignedOfferings, navigate }: { assignedOfferings: number; navigate: (path: string) => void }) {
  return <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><ContentCard className="bg-[#132b45] text-white"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Teaching workbench</p><h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">Your courses, clearly arranged.</h2><p className="mt-4 max-w-md text-sm leading-6 text-[#c2d0dc]">Review your faculty assignments, open class rosters, capture attendance, and enter assessment results in the teaching workspace.</p><button onClick={() => navigate("/teaching")} className="mt-7 rounded-xl bg-[#d9c27b] px-4 py-2.5 text-sm font-semibold text-[#132b45] transition-transform duration-150 hover:bg-[#ead890] active:scale-[0.97]">Open teaching operations</button></ContentCard><MetricCard label="Assigned offerings" value={assignedOfferings} detail="Courses currently connected to your faculty account" tone="navy" icon={<BookOpenCheck className="h-4 w-4" />} /><ContentCard className="xl:col-span-2"><EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title={assignedOfferings ? "Your teaching workspace is ready" : "No teaching assignments yet"} detail={assignedOfferings ? "Select a course offering to view the roster and record attendance or results." : "A registrar or administrator must assign you to a course offering before teaching actions are available."} /></ContentCard></div>;
}

function StudentDashboard({ data, navigate }: { data: StudentOverview; navigate: (path: string) => void }) {
  return <div className="space-y-6"><section className="grid gap-4 sm:grid-cols-3"><MetricCard label="Current GPA" value={data.gpa ?? "—"} detail="Calculated from published completed results" tone="navy" icon={<GraduationCap className="h-4 w-4" />} /><MetricCard label="Published results" value={data.publishedResults} detail="Results released to your student record" tone="good" icon={<FileBarChart2 className="h-4 w-4" />} /><MetricCard label="Outstanding balance" value={formatMoney(data.outstandingBalanceCents)} detail="Your invoice balance, where applicable" tone={data.outstandingBalanceCents ? "warning" : "good"} icon={<CircleDollarSign className="h-4 w-4" />} /></section><ContentCard className="bg-[#132b45] text-white"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Student services</p><h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">Your record, with clear next steps.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-[#c2d0dc]">Access is limited to your own published academic and financial information. Contact the registry if your record is not yet connected to your sign-in account.</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={() => navigate("/my-record")} className="rounded-xl bg-[#d9c27b] px-4 py-2.5 text-sm font-semibold text-[#132b45] transition-transform duration-150 hover:bg-[#ead890] active:scale-[0.97]">View academic record</button><button onClick={() => navigate("/finance")} className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10">View finance hub</button></div></ContentCard>{!data.recordReady && <EmptyState icon={<UserRoundCheck className="h-5 w-5" />} title="Your student profile has not been linked" detail="The registry must link your institutional account to a student record before results, registrations, and invoices can be displayed." />}</div>;
}

function ApplicantDashboard({ navigate }: { navigate: (path: string) => void }) {
  return <ContentCard className="bg-[#132b45] text-white"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Prospective student journey</p><h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">Your application starts here.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-[#c2d0dc]">Complete your application and simulated application-fee step. An administrator separately verifies your submitted details and confirms the fee condition before student access is activated.</p><button onClick={() => navigate("/apply")} className="mt-7 rounded-xl bg-[#d9c27b] px-4 py-2.5 text-sm font-semibold text-[#132b45] transition-transform duration-150 hover:bg-[#ead890] active:scale-[0.97]">Open my application</button></ContentCard>;
}

function FinanceDashboard({ data, navigate }: { data: FinanceOverview; navigate: (path: string) => void }) {
  return <div className="space-y-6"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Settled simulations" value={formatMoney(data.settledCents)} detail="Confirmed simulated fee collections" tone="good" icon={<CircleDollarSign className="h-4 w-4" />} /><MetricCard label="Pending review" value={data.pendingCount} detail="Settlements awaiting reconciliation" tone="warning" icon={<ClipboardList className="h-4 w-4" />} /><MetricCard label="Reconciled" value={data.reconciledCount} detail="Payment records confirmed" tone="navy" icon={<CheckCircle2 className="h-4 w-4" />} /><MetricCard label="Exceptions" value={data.exceptionCount} detail="Items requiring financial review" tone={data.exceptionCount ? "risk" : "good"} icon={<AlertTriangle className="h-4 w-4" />} /></section><ContentCard className="bg-[#132b45] text-white"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Finance operations</p><h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">Reconcile student-fee records.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-[#c2d0dc]">Review payment simulations, investigate exceptions, reconcile records, and export the filtered ledger. Registry and governance controls are intentionally excluded from this role.</p><button onClick={() => navigate("/finance")} className="mt-7 rounded-xl bg-[#d9c27b] px-4 py-2.5 text-sm font-semibold text-[#132b45] transition-transform duration-150 hover:bg-[#ead890] active:scale-[0.97]">Open finance hub</button></ContentCard></div>;
}

function StudentServicesDashboard({ navigate }: { navigate: (path: string) => void }) {
  return <ContentCard className="bg-[#132b45] text-white"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Student services</p><h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">Manage requests with care.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-[#c2d0dc]">Technical and non-teaching staff can review and update student service requests in their operational workflow. Academic records, finance controls, registry data, and governance actions are intentionally excluded.</p><button onClick={() => navigate("/requests")} className="mt-7 rounded-xl bg-[#d9c27b] px-4 py-2.5 text-sm font-semibold text-[#132b45] transition-transform duration-150 hover:bg-[#ead890] active:scale-[0.97]">Open requests & records</button></ContentCard>;
}

export default function Home() {
  return <DashboardLayout><CommandCentre /></DashboardLayout>;
}
