import { useAuth } from "@/_core/hooks/useAuth";
import { ContentCard, EmptyState, PageHeading, StatusPill } from "@/components/MisUi";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { BookOpenCheck, ClipboardCheck, GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const teachingRoles = ["admin", "registrar", "faculty"];

function LearningProgressContent() {
  const { user } = useAuth();
  const staff = teachingRoles.includes(user?.role || "");
  const learner = user?.role === "student" || user?.role === "user";
  const utils = trpc.useUtils();
  const offerings = trpc.teaching.offerings.useQuery(undefined, { enabled: staff });
  const studentProgress = trpc.students.myLearningProgress.useQuery(undefined, { enabled: learner });
  const [offeringId, setOfferingId] = useState<number | null>(null);
  const progress = trpc.teaching.learningProgress.useQuery({ courseOfferingId: offeringId || 1 }, { enabled: staff && offeringId !== null });
  const [type, setType] = useState<"assessment" | "assignment" | "note">("assignment");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [grading, setGrading] = useState<Record<string, string>>({});

  useEffect(() => {
    if (offeringId === null && offerings.data?.[0]) setOfferingId(offerings.data[0].id);
  }, [offerings.data, offeringId]);

  const createActivity = trpc.teaching.createActivity.useMutation({
    onSuccess: async () => { toast.success("Learning item published."); setTitle(""); setDescription(""); setDueAt(""); await progress.refetch(); },
    onError: error => toast.error(error.message),
  });
  const submit = trpc.teaching.submitActivity.useMutation({
    onSuccess: async () => { toast.success("Your work was submitted."); await studentProgress.refetch(); },
    onError: error => toast.error(error.message),
  });
  const grade = trpc.teaching.gradeActivity.useMutation({
    onSuccess: async () => { toast.success("Submission graded."); setGrading({}); await progress.refetch(); },
    onError: error => toast.error(error.message),
  });

  if (!staff && !learner) return <><PageHeading eyebrow="Controlled access" title="Learning progress" description="Course learning records are available to enrolled students and academic staff." /><EmptyState icon={<ClipboardCheck className="h-5 w-5" />} title="Learning progress access is restricted" detail="Sign in with a student or academic staff account to view course progress." /></>;

  return <>
    <PageHeading eyebrow={learner ? "Student self-service" : "Teaching and assessment"} title="Learning progress" description={learner ? "Follow attendance, assessments, assignments, and class notes for every enrolled course." : "Publish course work and follow attendance and assessment progress across your classes."}>
      <StatusPill tone="navy">{learner ? "My courses" : "Academic workspace"}</StatusPill>
    </PageHeading>

    {learner ? <div className="space-y-5">{studentProgress.isLoading ? <ContentCard><p className="text-sm text-[#72747f]">Loading your course progress…</p></ContentCard> : null}
      {!studentProgress.isLoading && !studentProgress.data?.length ? <EmptyState icon={<GraduationCap className="h-5 w-5" />} title="No active course registrations" detail="Your enrolled classes and learning activities will appear here once course registration is complete." /> : null}
      {studentProgress.data?.map(course => <ContentCard key={course.enrollmentId} className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e0d6] bg-[#faf8f3] p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#98764a]">{course.termName} · Section {course.section}</p><h2 className="mt-1 font-serif text-2xl text-[#203950]">{course.courseCode} · {course.courseTitle}</h2></div><StatusPill tone={course.attendanceRate !== null && course.attendanceRate < 75 ? "risk" : "good"}>Attendance {course.attendanceRate === null ? "not recorded" : `${course.attendanceRate}%`}</StatusPill></div>
        <div className="grid gap-5 p-5 lg:grid-cols-[0.8fr_1.2fr]">
          <section><h3 className="text-sm font-semibold text-[#344a60]">Class attendance</h3><p className="mt-1 text-xs text-[#827e77]">{course.attendance.length} class sessions recorded</p><div className="mt-3 max-h-52 space-y-2 overflow-auto">{course.attendance.length ? course.attendance.map((item, index) => <div key={`${item.classDate}-${index}`} className="flex items-center justify-between rounded-lg bg-[#f7f5f0] px-3 py-2 text-xs"><span className="text-[#586b7b]">{item.classDate}</span><StatusPill tone={item.status === "present" || item.status === "late" ? "good" : item.status === "absent" ? "risk" : "warning"}>{item.status}</StatusPill></div>) : <p className="rounded-lg bg-[#f7f5f0] p-3 text-xs text-[#827e77]">No class attendance has been recorded yet.</p>}</div></section>
          <section><h3 className="text-sm font-semibold text-[#344a60]">Assessments, assignments & notes</h3><div className="mt-3 space-y-3">{course.activities.length ? course.activities.map(item => <div key={item.id} className="rounded-xl border border-[#ece7de] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#98764a]">{item.type}{item.dueAt ? ` · Due ${new Date(item.dueAt).toLocaleDateString()}` : ""}</p><h4 className="mt-1 text-sm font-semibold text-[#344a60]">{item.title}</h4></div>{item.type !== "note" ? <StatusPill tone={item.submissionStatus === "graded" ? "good" : item.submissionId ? "warning" : "neutral"}>{item.submissionStatus === "graded" ? `${item.score}/${item.maxScore}` : item.submissionId ? "Submitted" : "Not submitted"}</StatusPill> : <StatusPill tone="navy">Class note</StatusPill>}</div>{item.description ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#687582]">{item.description}</p> : null}{item.feedback ? <p className="mt-2 border-l-2 border-[#b7c9d1] pl-3 text-xs text-[#586b7b]">Feedback: {item.feedback}</p> : null}
            {item.type !== "note" && item.submissionStatus !== "graded" ? <div className="mt-3 space-y-2">{item.submissionId ? <p className="text-[11px] text-[#827e77]">Your response: {item.response}</p> : null}<Textarea aria-label={`Response for ${item.title}`} className="min-h-20" placeholder="Write your response or submission here" id={`response-${item.id}`} defaultValue={item.response || ""} /> <Button size="sm" disabled={submit.isPending} onClick={() => { const value = document.getElementById(`response-${item.id}`) as HTMLTextAreaElement | null; if (value?.value.trim()) submit.mutate({ activityId: item.id, response: value.value.trim() }); }}>Submit work</Button></div> : null}
          </div>) : <p className="rounded-lg bg-[#f7f5f0] p-3 text-xs text-[#827e77]">Your instructor has not shared learning activities or notes yet.</p>}</div></section>
        </div>
      </ContentCard>)}</div> : <div className="space-y-5">
      <ContentCard><Label className="text-xs font-semibold text-[#48596a]">Course class</Label><Select value={offeringId ? String(offeringId) : ""} onValueChange={value => setOfferingId(Number(value))}><SelectTrigger className="mt-2 max-w-xl"><SelectValue placeholder="Select a course offering" /></SelectTrigger><SelectContent>{offerings.data?.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.courseCode} · {item.section} — {item.courseTitle}</SelectItem>)}</SelectContent></Select></ContentCard>
      {offeringId ? <>
        <ContentCard><div className="grid gap-4 md:grid-cols-2"><div><Label className="text-xs font-semibold text-[#48596a]">Item type</Label><Select value={type} onValueChange={value => setType(value as typeof type)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="assignment">Assignment</SelectItem><SelectItem value="assessment">Assessment</SelectItem><SelectItem value="note">Class note</SelectItem></SelectContent></Select></div><div><Label className="text-xs font-semibold text-[#48596a]">Title</Label><Input className="mt-2" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Week 3 lab report" /></div><div className="md:col-span-2"><Label className="text-xs font-semibold text-[#48596a]">Instructions or class notes</Label><Textarea className="mt-2 min-h-24" value={description} onChange={event => setDescription(event.target.value)} placeholder="Share instructions, a reading summary, or learning notes" /></div>{type !== "note" ? <><div><Label className="text-xs font-semibold text-[#48596a]">Due date</Label><Input className="mt-2" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></div><div><Label className="text-xs font-semibold text-[#48596a]">Maximum score</Label><Input className="mt-2" type="number" min="1" value={maxScore} onChange={event => setMaxScore(event.target.value)} /></div></> : null}</div><Button className="mt-4 rounded-xl bg-[#132b45] hover:bg-[#1c3b5c]" disabled={!title.trim() || createActivity.isPending} onClick={() => createActivity.mutate({ courseOfferingId: offeringId, type, title: title.trim(), description: description.trim() || undefined, dueAt: dueAt ? new Date(dueAt) : undefined, maxScore: type === "note" ? undefined : Number(maxScore) })}>{type === "note" ? "Publish class notes" : `Publish ${type}`}</Button></ContentCard>
        <ContentCard><div className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-[#98764a]" /><h2 className="font-serif text-xl text-[#203950]">Class progress</h2></div>{progress.data?.students.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[660px] text-left text-xs"><thead className="text-[10px] uppercase tracking-[0.12em] text-[#837b6e]"><tr><th className="py-2 pr-3">Student</th><th className="py-2 pr-3">Attendance</th>{progress.data.activities.map(activity => <th className="py-2 pr-3" key={activity.id}>{activity.title}</th>)}</tr></thead><tbody className="divide-y divide-[#eee9e0]">{progress.data.students.map(student => <tr key={student.enrollmentId}><td className="py-3 pr-3 font-medium text-[#344a60]">{student.legalFirstName} {student.legalLastName}<span className="block text-[10px] text-[#827e77]">{student.studentNumber}</span></td><td className="py-3 pr-3">{student.attendanceRate === null ? "—" : `${student.attendanceRate}%`}<span className="block text-[10px] text-[#827e77]">{student.attendanceCount} sessions</span></td>{progress.data.activities.map(activity => { const submission = student.submissions.find(item => item.activityId === activity.id); const key = `${activity.id}-${student.enrollmentId}`; return <td className="py-3 pr-3" key={activity.id}>{activity.type === "note" ? <span className="text-[#827e77]">Shared</span> : submission?.status === "graded" ? <span className="font-semibold text-[#315875]">{submission.score}/{activity.maxScore}</span> : <div className="flex items-center gap-1"><Input aria-label={`Score for ${student.studentNumber}, ${activity.title}`} className="h-7 w-16" type="number" min="0" max={activity.maxScore || undefined} value={grading[key] || ""} onChange={event => setGrading(previous => ({ ...previous, [key]: event.target.value }))} placeholder={submission ? "Grade" : "Missing"} /><Button size="sm" variant="outline" className="h-7 px-2" disabled={!submission || !grading[key] || grade.isPending} onClick={() => grade.mutate({ courseOfferingId: offeringId, activityId: activity.id, enrollmentId: student.enrollmentId, score: Number(grading[key]) })}>Save</Button></div>}</td>; })}</tr>)}</tbody></table></div> : <EmptyState icon={<ClipboardCheck className="h-5 w-5" />} title="No students are registered" detail="Attendance and assessment progress will appear after students are enrolled in this course." />}</ContentCard>
      </> : <EmptyState icon={<BookOpenCheck className="h-5 w-5" />} title="Choose a course class" detail="Select a course offering to manage its learning activities and review learner progress." />}
    </div>}
  </>;
}

export default function LearningProgress() { return <DashboardLayout><LearningProgressContent /></DashboardLayout>; }
