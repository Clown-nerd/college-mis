import { ContentCard, EmptyState, StatusPill } from "@/components/MisUi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  BadgeDollarSign,
  BookOpenCheck,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  FileCheck2,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export type AuditLogEntry = {
  id: number;
  actorUserId?: number | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: unknown;
  occurredAt: Date | string;
};

type ActivityCategory = "all" | "students" | "admissions" | "academics" | "finance" | "governance";

const categoryConfig: Array<{ id: ActivityCategory; label: string }> = [
  { id: "all", label: "All activity" },
  { id: "students", label: "Student records" },
  { id: "admissions", label: "Admissions" },
  { id: "academics", label: "Academic & teaching" },
  { id: "finance", label: "Finance" },
  { id: "governance", label: "Governance & staff" },
];

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  registrar: "Registry staff",
  faculty: "Teaching staff",
  student: "Student",
  finance: "Finance staff",
  non_teaching: "Technical staff",
  applicant: "Applicant",
  user: "Student",
};

export function classifyActivityCategory(event: Pick<AuditLogEntry, "action" | "entityType">): Exclude<ActivityCategory, "all"> {
  const action = event.action.toLowerCase();
  const entity = event.entityType.toLowerCase();

  if (
    entity === "applicant" ||
    entity === "applicantpayment" ||
    action.startsWith("applicant.") ||
    action.startsWith("application.") ||
    action.startsWith("application_fee.")
  ) {
    return "admissions";
  }

  if (
    entity === "student" ||
    entity === "enrollment" ||
    entity === "studentrequest" ||
    entity === "document" ||
    action.startsWith("student.") ||
    action.startsWith("enrollment.") ||
    action.startsWith("studentrequest.") ||
    action.startsWith("document.")
  ) {
    return "students";
  }

  if (
    entity === "invoice" ||
    entity === "scholarship" ||
    entity === "paymenttransaction" ||
    action.startsWith("invoice.") ||
    action.startsWith("scholarship.") ||
    action.startsWith("payment.")
  ) {
    return "finance";
  }

  if (
    entity === "user" ||
    entity === "staffprofile" ||
    action.startsWith("role.") ||
    action.startsWith("staff.")
  ) {
    return "governance";
  }

  return "academics";
}

function getCategoryMeta(category: Exclude<ActivityCategory, "all">, action: string) {
  const normalizedAction = action.toLowerCase();
  if (category === "admissions") {
    const isDeclined = normalizedAction.includes("declined");
    return {
      label: normalizedAction.includes("admitted")
        ? "Admissions approval"
        : normalizedAction.includes("verified") || normalizedAction.includes("activated")
          ? "Admissions confirmation"
          : "Admissions update",
      tone: isDeclined ? ("risk" as const) : ("good" as const),
      icon: <UserCheck className="h-4 w-4" />,
    };
  }
  if (category === "students") {
    return {
      label: normalizedAction.includes("updated")
        ? "Student record update"
        : normalizedAction.includes("enrollment")
          ? "Course registration"
          : "Student lifecycle",
      tone: "navy" as const,
      icon: <UsersRound className="h-4 w-4" />,
    };
  }
  if (category === "finance") {
    return {
      label: normalizedAction.includes("scholarship")
        ? "Scholarship control"
        : normalizedAction.includes("waived")
          ? "Invoice waiver"
          : "Financial ledger",
      tone: normalizedAction.includes("exception") ? ("risk" as const) : ("warning" as const),
      icon: <BadgeDollarSign className="h-4 w-4" />,
    };
  }
  if (category === "governance") {
    return {
      label: normalizedAction.includes("role") ? "Role & permission" : "Staff provisioning",
      tone: "risk" as const,
      icon: <ShieldCheck className="h-4 w-4" />,
    };
  }
  return {
    label: normalizedAction.includes("grade")
      ? "Academic grading"
      : normalizedAction.includes("attendance")
        ? "Attendance log"
        : "Academic catalogue",
    tone: "neutral" as const,
    icon: <BookOpenCheck className="h-4 w-4" />,
  };
}

function normalizeMetadata(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>);
    return entries.length > 0 ? (raw as Record<string, unknown>) : null;
  }
  return null;
}

function formatMetadataValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key.toLowerCase().endsWith("cents") && typeof value === "number") {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value / 100);
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function SystemActivityLog({
  events,
  isLoading = false,
  compact = false,
  onRefresh,
  isRefreshing = false,
  onViewAll,
}: {
  events: AuditLogEntry[];
  isLoading?: boolean;
  compact?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onViewAll?: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});

  const categoryCounts = useMemo(() => {
    const counts: Record<ActivityCategory, number> = {
      all: events.length,
      students: 0,
      admissions: 0,
      academics: 0,
      finance: 0,
      governance: 0,
    };
    for (const ev of events) {
      const cat = classifyActivityCategory(ev);
      counts[cat] += 1;
    }
    return counts;
  }, [events]);

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return events.filter(ev => {
      const cat = classifyActivityCategory(ev);
      if (selectedCategory !== "all" && cat !== selectedCategory) return false;
      if (!query) return true;
      const meta = normalizeMetadata(ev.metadata);
      const metaString = meta ? Object.entries(meta).map(([k, v]) => `${k}:${String(v)}`).join(" ") : "";
      return [
        ev.summary,
        ev.action,
        ev.entityType,
        ev.entityId,
        ev.actorName,
        ev.actorEmail,
        ev.actorRole,
        metaString,
      ]
        .filter(Boolean)
        .some(field => String(field).toLowerCase().includes(query));
    });
  }, [events, selectedCategory, searchQuery]);

  const displayedEvents = compact ? filteredEvents.slice(0, 6) : filteredEvents;

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const exportCsv = () => {
    const rows = [
      ["Event ID", "Category", "Action", "Entity Type", "Entity ID", "Actor", "Actor Role", "Summary", "Metadata", "Occurred At"],
      ...filteredEvents.map(ev => {
        const cat = classifyActivityCategory(ev);
        const meta = normalizeMetadata(ev.metadata);
        return [
          String(ev.id),
          cat,
          ev.action,
          ev.entityType,
          ev.entityId || "",
          ev.actorName || ev.actorEmail || "Institutional system",
          ev.actorRole ? roleLabels[ev.actorRole] || ev.actorRole : "System",
          ev.summary,
          meta ? JSON.stringify(meta) : "",
          new Date(ev.occurredAt).toISOString(),
        ];
      }),
    ];
    const csv = rows.map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `college-mis-activity-log-${selectedCategory}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredEvents.length} activity log record(s) as CSV.`);
  };

  return (
    <div className="space-y-4">
      {!compact ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#ded8cc] bg-[#fdfcf9] p-4">
            <div className="flex items-center justify-between text-[#315875]">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d7957]">Student updates</span>
              <UsersRound className="h-4 w-4" />
            </div>
            <p className="mt-2 font-serif text-2xl text-[#142b43]">{categoryCounts.students}</p>
            <p className="mt-0.5 text-xs text-[#767984]">Profile & registration changes</p>
          </div>
          <div className="rounded-2xl border border-[#ded8cc] bg-[#fdfcf9] p-4">
            <div className="flex items-center justify-between text-[#176657]">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d7957]">Admissions decisions</span>
              <FileCheck2 className="h-4 w-4" />
            </div>
            <p className="mt-2 font-serif text-2xl text-[#142b43]">{categoryCounts.admissions}</p>
            <p className="mt-0.5 text-xs text-[#767984]">Approvals, verifications & activations</p>
          </div>
          <div className="rounded-2xl border border-[#ded8cc] bg-[#fdfcf9] p-4">
            <div className="flex items-center justify-between text-[#294e6b]">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d7957]">Academic & grades</span>
              <GraduationCap className="h-4 w-4" />
            </div>
            <p className="mt-2 font-serif text-2xl text-[#142b43]">{categoryCounts.academics}</p>
            <p className="mt-0.5 text-xs text-[#767984]">Catalogue, attendance & grading</p>
          </div>
          <div className="rounded-2xl border border-[#ded8cc] bg-[#fdfcf9] p-4">
            <div className="flex items-center justify-between text-[#a33c37]">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d7957]">Governance & finance</span>
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="mt-2 font-serif text-2xl text-[#142b43]">{categoryCounts.governance + categoryCounts.finance}</p>
            <p className="mt-0.5 text-xs text-[#767984]">Roles, staff & financial controls</p>
          </div>
        </div>
      ) : null}

      <ContentCard className="p-0">
        <div className="flex flex-col gap-4 border-b border-[#e6e0d6] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eaf1f5] text-[#315875]">
                <ClipboardCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Protected system activity log</p>
                <h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-[#203950]">
                  {compact ? "Recent institutional activity" : "System-wide audit trail"}
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onRefresh ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="h-9 rounded-xl text-xs font-semibold"
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={!filteredEvents.length}
                className="h-9 rounded-xl text-xs font-semibold"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export CSV ({filteredEvents.length})
              </Button>
              {compact && onViewAll ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={onViewAll}
                  className="h-9 rounded-xl bg-[#132b45] text-xs font-semibold text-white hover:bg-[#1c3b5c]"
                >
                  Full activity log
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {categoryConfig.map(cat => {
                const active = selectedCategory === cat.id;
                const count = categoryCounts[cat.id];
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "border-[#132b45] bg-[#132b45] text-white"
                        : "border-[#ded8cc] bg-[#faf8f3] text-[#495a6b] hover:border-[#b8c7d4] hover:bg-white"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-white/15 text-[#f0d889]" : "bg-[#ede8de] text-[#6d6960]"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8e938f]" />
              <Input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search action, student, applicant, actor…"
                className="h-9 rounded-xl border-[#dcd5c9] bg-[#faf8f3] pl-8 text-xs"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4].map(item => (
              <Skeleton className="h-20 rounded-xl bg-[#e8e2d8]" key={item} />
            ))}
          </div>
        ) : null}

        {!isLoading && displayedEvents.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<ClipboardCheck className="h-5 w-5" />}
              title={searchQuery || selectedCategory !== "all" ? "No matching activity events" : "No audit events recorded yet"}
              detail={
                searchQuery || selectedCategory !== "all"
                  ? "Adjust the category filter or search query to inspect other system-wide changes."
                  : "Student record updates, admissions approvals, grade entries, and governance changes are automatically logged here."
              }
            />
          </div>
        ) : null}

        {!isLoading && displayedEvents.length > 0 ? (
          <div className="divide-y divide-[#eee9e0]">
            {displayedEvents.map(event => {
              const cat = classifyActivityCategory(event);
              const metaInfo = getCategoryMeta(cat, event.action);
              const metadata = normalizeMetadata(event.metadata);
              const isExpanded = Boolean(expandedIds[event.id]);
              const occurredDate = new Date(event.occurredAt);
              const actorDisplay = event.actorName || event.actorEmail || "Institutional system";
              const actorRoleDisplay = event.actorRole ? roleLabels[event.actorRole] || event.actorRole : "Automated / System";

              return (
                <article className="p-5 transition-colors hover:bg-[#fffcf6]" key={event.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3.5">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#eef3f7] text-[#294e6b]">
                        {metaInfo.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill tone={metaInfo.tone}>{metaInfo.label}</StatusPill>
                          <span className="font-mono text-[11px] font-medium text-[#6f7782]">
                            {event.action}
                            {event.entityId ? ` · ${event.entityType} #${event.entityId}` : ` · ${event.entityType}`}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold leading-snug text-[#253b50]">{event.summary}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7d7b74]">
                          <span>
                            Actor: <strong className="font-medium text-[#435668]">{actorDisplay}</strong> ({actorRoleDisplay})
                          </span>
                          {metadata ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(event.id)}
                              className="inline-flex items-center gap-1 font-semibold text-[#315875] hover:text-[#132b45]"
                            >
                              {isExpanded ? (
                                <>
                                  Hide change details <ChevronUp className="h-3.5 w-3.5" />
                                </>
                              ) : (
                                <>
                                  Inspect change details <ChevronDown className="h-3.5 w-3.5" />
                                </>
                              )}
                            </button>
                          ) : null}
                        </div>
                        {metadata && isExpanded ? (
                          <div className="mt-3 grid gap-2 rounded-xl border border-[#e3ddd1] bg-[#faf8f3] p-3 sm:grid-cols-2 lg:grid-cols-3">
                            {Object.entries(metadata).map(([key, value]) => (
                              <div key={key} className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8d7957]">
                                  {key.replace(/([A-Z])/g, " $1").trim()}
                                </p>
                                <p className="mt-0.5 truncate text-xs font-medium text-[#283f55]">
                                  {formatMetadataValue(key, value)}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <time className="block text-xs font-medium text-[#5c6570]" dateTime={occurredDate.toISOString()}>
                        {format(occurredDate, "MMM d, yyyy · HH:mm")}
                      </time>
                      <span className="mt-0.5 block text-[11px] text-[#948f85]">
                        {formatDistanceToNow(occurredDate, { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </ContentCard>
    </div>
  );
}
