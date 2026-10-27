import { useAuth } from "@/_core/hooks/useAuth";
import { ContentCard, EmptyState, PageHeading, StatusPill } from "@/components/MisUi";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { BookOpenCheck, CalendarCheck2, ClipboardCheck, GraduationCap, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const academicRoles = ["admin", "registrar", "faculty"];

function TeachingOperationsContent() {
  const { user } = useAuth();
  const allowed = academicRoles.includes(user?.role || "");
  const canAssign = user?.role === "admin" || user?.role === "registrar";
  const utils = trpc.useUtils();
  const offerings = trpc.teaching.offerings.useQuery(undefined, { enabled: allowed });
  const faculty = trpc.teaching.faculty.useQuery(undefined, { enabled: canAssign });
  const [selectedOfferingId, setSelectedOfferingId] = useState<number | null>(null);
  const [classDate, setClassDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [facultyUserId, setFacultyUserId] = useState("");
  const roster = trpc.teaching.roster.useQuery({ courseOfferingId: selectedOfferingId || 0 }, { enabled: allowed && selectedOfferingId !== null });
  const attendance = trpc.teaching.upsertAttendance.useMutation({
    onSuccess: async () => { toast.success("Attendance saved and audited."); await utils.dashboard.overview.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const grade = trpc.teaching.upsertGrade.useMutation({
    onSuccess: async (_, variables) => { toast.success(variables.status === "published" ? "Result published and audited." : "Draft grade saved and audited."); await utils.teaching.roster.invalidate(); await utils.dashboard.overview.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const assign = trpc.teaching.assignFaculty.useMutation({
    onSuccess: async () => { toast.success("Faculty assignment saved and audited."); setFacultyUserId(""); await utils.teaching.offerings.invalidate(); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (selectedOfferingId === null && offerings.data?.[0]) setSelectedOfferingId(offerings.data[0].id);
  }, [offerings.data, selectedOfferingId]);

  if (!allowed) return <><PageHeading eyebrow="Controlled access" title="Teaching operations access is restricted" description="Your role cannot view institutional rosters, attendance, or grade entry work." /><EmptyState icon={<ClipboardCheck className="h-5 w-5" />} title="Use the workspace assigned to your role" detail="Teaching actions are reserved for assigned faculty, registry staff, and administrators." /></>;

  const selectedOffering = offerings.data?.find(item => item.id === selectedOfferingId);
  return <>
    <PageHeading eyebrow="Teaching and assessment" title="Teaching operations" description="Coordinate course assignments, class rosters, attendance capture, and results with controlled, auditable academic workflows."><StatusPill tone="navy">{user?.role === "faculty" ? "Assigned teaching view" : "Academic operations view"}</StatusPill></PageHeading>
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <ContentCard className="h-fit p-3"><div className="px-3 pb-3 pt-2"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Course offerings</p><h2 className="mt-1 font-serif text-xl tracking-[-0.03em] text-[#203950]">Teaching register</h2></div>{offerings.isLoading ? <div className="space-y-2 p-2">{[1, 2, 3].map(item => <Skeleton className="h-16 rounded-xl bg-[#e9e4da]" key={item} />)}</div> : null}{!offerings.isLoading && !offerings.data?.length ? <EmptyState icon={<BookOpenCheck className="h-5 w-5" />} title="No offerings available" detail={user?.role === "faculty" ? "You have not been assigned to a course offering yet." : "Create a term and course offering in the academic catalogue."} /> : null}<div className="space-y-1">{offerings.data?.map(item => <button onClick={() => setSelectedOfferingId(item.id)} key={item.id} className={`w-full rounded-xl px-3 py-3 text-left transition-[transform,background] duration-150 active:scale-[0.99] ${selectedOfferingId === item.id ? "bg-[#e7f0f5]" : "hover:bg-[#f8f6f1]"}`}><p className="text-sm font-semibold text-[#314a60]">{item.courseCode} · {item.section}</p><p className="mt-1 line-clamp-1 text-xs text-[#7b7e84]">{item.courseTitle}</p><p className="mt-1.5 text-[11px] text-[#8a8277]">{item.meetingPattern || "Timetable pending"}</p></button>)}</div></ContentCard>
      <div className="space-y-6">{selectedOffering ? <><ContentCard className="overflow-hidden bg-[#132b45] text-white"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Selected offering</p><h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">{selectedOffering.courseCode} · {selectedOffering.section}</h2><p className="mt-2 text-sm text-[#c5d1dc]">{selectedOffering.courseTitle} · {selectedOffering.termName}</p><p className="mt-4 text-xs text-[#9fb4c4]">{selectedOffering.meetingPattern || "Timetable to be confirmed"} {selectedOffering.room ? `· ${selectedOffering.room}` : ""}</p></div><StatusPill tone="good">{selectedOffering.status}</StatusPill></div></ContentCard>{canAssign ? <ContentCard><div className="flex flex-col gap-4 sm:flex-row sm:items-end"><div className="flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Faculty assignment</p><Label className="mt-3 block text-xs font-semibold text-[#48596a]">Assign instructor</Label><Select value={facultyUserId} onValueChange={setFacultyUserId}><SelectTrigger className="mt-2"><SelectValue placeholder="Select a faculty account" /></SelectTrigger><SelectContent>{faculty.data?.map(item => <SelectItem value={String(item.id)} key={item.id}>{item.name || item.email || `Faculty user ${item.id}`}</SelectItem>)}</SelectContent></Select></div><Button disabled={!facultyUserId || assign.isPending} onClick={() => assign.mutate({ courseOfferingId: selectedOffering.id, facultyUserId: Number(facultyUserId) })} className="rounded-xl bg-[#132b45] hover:bg-[#1c3b5c]">Assign faculty</Button></div>{!faculty.data?.length && !faculty.isLoading ? <p className="mt-3 text-xs leading-5 text-[#867c6e]">No user is currently assigned the faculty role. An administrator can grant this role in Governance.</p> : null}</ContentCard> : null}<ContentCard><div className="flex flex-col gap-3 border-b border-[#e6e0d6] pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Class roster</p><h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-[#203950]">Attendance & gradebook</h2></div><div className="w-full sm:w-48"><Label className="text-xs font-semibold text-[#48596a]">Attendance date</Label><Input className="mt-2 h-9" type="date" value={classDate} onChange={event => setClassDate(event.target.value)} /></div></div>{roster.isLoading ? <div className="space-y-3 pt-5">{[1, 2, 3].map(item => <Skeleton className="h-20 rounded-xl bg-[#e9e4da]" key={item} />)}</div> : null}{!roster.isLoading && !roster.data?.length ? <div className="pt-5"><EmptyState icon={<UsersRound className="h-5 w-5" />} title="No students are enrolled" detail="Registry staff can add student course registrations once the student and offering records exist." /></div> : null}{roster.data?.length ? <div className="divide-y divide-[#ece7de]">{roster.data.map(item => <RosterRow key={item.enrollmentId} item={item} courseOfferingId={selectedOffering.id} classDate={classDate} attendancePending={attendance.isPending} gradePending={grade.isPending} onAttendance={(status) => attendance.mutate({ courseOfferingId: selectedOffering.id, enrollmentId: item.enrollmentId, classDate, status })} onGrade={(score, status) => grade.mutate({ courseOfferingId: selectedOffering.id, enrollmentId: item.enrollmentId, score, status })} />)}</div> : null}</ContentCard></> : <ContentCard><EmptyState icon={<CalendarCheck2 className="h-5 w-5" />} title="Select a course offering" detail="Choose an offering from the teaching register to review its roster and record academic activity." /></ContentCard>}</div>
    </div>
  </>;
}

function RosterRow({ item, courseOfferingId, classDate, attendancePending, gradePending, onAttendance, onGrade }: { item: { enrollmentId: number; studentNumber: string; legalFirstName: string; legalLastName: string; letterGrade: string | null; score: number | null; gradeStatus: "draft" | "published" | null }; courseOfferingId: number; classDate: string; attendancePending: boolean; gradePending: boolean; onAttendance: (status: "present" | "late" | "absent" | "excused") => void; onGrade: (score: number, status: "draft" | "published") => void }) {
  const [score, setScore] = useState(item.score?.toString() || "");
  return <div className="grid gap-3 py-4 lg:grid-cols-[1.15fr_1fr_0.75fr]"><div><p className="text-sm font-semibold text-[#344a60]">{item.legalFirstName} {item.legalLastName}</p><p className="mt-1 text-xs text-[#858077]">{item.studentNumber}</p></div><div className="flex flex-wrap gap-1.5"><Button type="button" variant="outline" size="sm" onClick={() => onAttendance("present")} disabled={attendancePending} className="h-8 rounded-lg text-[11px]">Present</Button><Button type="button" variant="outline" size="sm" onClick={() => onAttendance("late")} disabled={attendancePending} className="h-8 rounded-lg text-[11px]">Late</Button><Button type="button" variant="outline" size="sm" onClick={() => onAttendance("absent")} disabled={attendancePending} className="h-8 rounded-lg text-[11px] text-[#a64a40]">Absent</Button></div><div className="flex items-center gap-2"><Input aria-label={`Score for ${item.legalFirstName} ${item.legalLastName}`} className="h-8 w-16" type="number" min="0" max="100" value={score} onChange={event => setScore(event.target.value)} placeholder="Score" /><Button type="button" size="sm" variant="outline" disabled={!score || gradePending} onClick={() => onGrade(Number(score), "draft")} className="h-8 rounded-lg text-[11px]">Save</Button><Button type="button" size="sm" disabled={!score || gradePending} onClick={() => onGrade(Number(score), "published")} className="h-8 rounded-lg bg-[#132b45] px-2 text-[11px] hover:bg-[#1c3b5c]">Publish</Button>{item.letterGrade ? <StatusPill tone={item.gradeStatus === "published" ? "good" : "warning"}>{item.letterGrade}</StatusPill> : null}</div></div>;
}

export default function TeachingOperations() { return <DashboardLayout><TeachingOperationsContent /></DashboardLayout>; }
