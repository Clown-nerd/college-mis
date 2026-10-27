import { useAuth } from "@/_core/hooks/useAuth";
import { ContentCard, EmptyState, PageHeading, StatusPill } from "@/components/MisUi";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CalendarRange, Clock3, Download, MapPin } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { buildIcalendar } from "../../../shared/calendar";

const weekdayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
type ScheduleMeeting = { meetingId: number; weekday: string; startsAt: string; endsAt: string; room: string | null; courseOfferingId: number; section: string; courseCode: string; courseTitle: string; termName: string; termStartsAt: Date; termEndsAt: Date };

function MyScheduleContent() {
  const { user } = useAuth();
  const allowed = user?.role === "student" || user?.role === "user";
  const schedule = trpc.students.mySchedule.useQuery(undefined, { enabled: allowed });
  const grouped = useMemo(() => weekdayOrder.map(weekday => ({ weekday, meetings: (schedule.data || []).filter(meeting => meeting.weekday === weekday) })), [schedule.data]);
  const downloadCalendar = () => { const events = schedule.data || []; if (!events.length) { toast.error("No structured class meetings are available to export."); return; } const blob = new Blob([buildIcalendar(events)], { type: "text/calendar;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "college-mis-schedule.ics"; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); toast.success("Calendar file downloaded. Import it into your preferred calendar app."); };
  if (!allowed) return <><PageHeading eyebrow="Controlled access" title="My schedule" description="Personal calendar export is available only for the linked student account." /><EmptyState icon={<CalendarRange className="h-5 w-5" />} title="Schedule access is restricted" detail="Students may review and export only their own enrolled class schedule." /></>;
  return <><PageHeading eyebrow="Student self-service" title="My schedule" description="Review your registered structured class meetings and download an iCalendar file for use in your calendar app."><Button onClick={downloadCalendar} disabled={!schedule.data?.length} className="h-10 rounded-xl bg-[#132b45] px-4 text-sm font-semibold hover:bg-[#1c3b5c]"><Download className="mr-2 h-4 w-4" />Download calendar</Button></PageHeading><ContentCard className="bg-[#132b45] text-white"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Calendar export</p><h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">Your classes, ready to import.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-[#c5d1dc]">The download creates a standard `.ics` calendar file from your private registered schedule. Each recurring event runs within its academic term; confirm the displayed time zone after importing.</p></ContentCard><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{grouped.map(day => <ContentCard key={day.weekday} className="p-0"><div className="border-b border-[#e6e0d6] bg-[#faf8f3] px-5 py-4"><p className="font-serif text-xl tracking-[-0.03em] text-[#203950]">{day.weekday.charAt(0).toUpperCase() + day.weekday.slice(1)}</p><p className="mt-1 text-xs text-[#837b6e]">{day.meetings.length} registered class meeting{day.meetings.length === 1 ? "" : "s"}</p></div>{day.meetings.length ? <div className="divide-y divide-[#ece7de]">{day.meetings.map(meeting => <div className="p-5" key={meeting.meetingId}><div className="flex items-center gap-2 text-xs font-semibold text-[#315875]"><Clock3 className="h-3.5 w-3.5" />{meeting.startsAt}–{meeting.endsAt}</div><p className="mt-3 text-sm font-semibold text-[#344a60]">{meeting.courseCode} · {meeting.section}</p><p className="mt-1 text-xs text-[#747984]">{meeting.courseTitle}</p><div className="mt-3 flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-xs text-[#877e72]"><MapPin className="h-3.5 w-3.5" />{meeting.room || "Room pending"}</span><StatusPill tone="navy">{meeting.termName}</StatusPill></div></div>)}</div> : <div className="p-5 text-sm leading-6 text-[#82817d]">No structured class meetings are scheduled.</div>}</ContentCard>)}</div></>;
}
export default function MySchedule() { return <DashboardLayout><MyScheduleContent /></DashboardLayout>; }
