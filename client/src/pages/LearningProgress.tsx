import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { ContentCard, EmptyState, MetricCard, PageHeading, StatusPill } from "@/components/MisUi";
import { encodeFileForUpload, SUPPORTED_UPLOAD_ACCEPT, type EncodedFileUpload } from "@/components/lms/fileUploadHelper";
import { QuizRunnerModal, type QuizQuestionView } from "@/components/lms/QuizRunnerModal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { localAuthEnabled } from "@/lib/localAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Award,
  Bell,
  BookOpen,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Flag,
  FolderKanban,
  GraduationCap,
  HelpCircle,
  Lock,
  Mail,
  MessageSquare,
  Pin,
  PlayCircle,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const teachingRoles = ["admin", "registrar", "faculty"];
type CourseTab = "modules" | "assignments" | "quizzes" | "gradebook" | "communications" | "admin";

function LearningProgressContent() {
  const { user } = useAuth();
  const isStaff = teachingRoles.includes(user?.role || "");
  const isAdmin = user?.role === "admin";
  const isLearner = user?.role === "student" || user?.role === "user";

  const accessibleOfferings = trpc.lms.accessibleOfferings.useQuery(undefined, {
    enabled: Boolean(user && (isStaff || isLearner)),
  });
  const myDashboard = trpc.lms.myDashboard.useQuery(undefined, {
    enabled: Boolean(user && (isStaff || isLearner)),
  });

  // Preserve legacy MIS student/teaching progress queries for attendance & legacy activities
  const studentProgress = trpc.students.myLearningProgress.useQuery(undefined, { enabled: isLearner });
  const [offeringId, setOfferingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<CourseTab>("modules");
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (offeringId === null && accessibleOfferings.data?.[0]) {
      setOfferingId(accessibleOfferings.data[0].id);
    }
  }, [accessibleOfferings.data, offeringId]);

  const courseSpace = trpc.lms.courseSpace.useQuery(
    { courseOfferingId: offeringId ?? 1 },
    { enabled: offeringId !== null },
  );
  const legacyProgress = trpc.teaching.learningProgress.useQuery(
    { courseOfferingId: offeringId ?? 1 },
    { enabled: isStaff && offeringId !== null },
  );
  const adminReport = trpc.lms.adminOperationalReport.useQuery(undefined, {
    enabled: isAdmin && activeTab === "admin",
  });

  // Module & Item Creation States
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [moduleWeek, setModuleWeek] = useState("1");
  const [moduleStatus, setModuleStatus] = useState<"draft" | "published" | "scheduled" | "archived">("published");

  const [selectedModuleIdForItem, setSelectedModuleIdForItem] = useState<number | null>(null);
  const [itemType, setItemType] = useState<"page" | "file" | "link" | "video">("page");
  const [itemTitle, setItemTitle] = useState("");
  const [itemSummary, setItemSummary] = useState("");
  const [itemBodyHtml, setItemBodyHtml] = useState("");
  const [itemExternalUrl, setItemExternalUrl] = useState("");
  const [itemCaptionsUrl, setItemCaptionsUrl] = useState("");
  const [itemTranscript, setItemTranscript] = useState("");
  const [itemStatus, setItemStatus] = useState<"draft" | "published" | "scheduled" | "archived">("published");
  const [itemUpload, setItemUpload] = useState<EncodedFileUpload | undefined>(undefined);

  // Assignment Builder & Submission States
  const [assignTitle, setAssignTitle] = useState("");
  const [assignDesc, setAssignDesc] = useState("");
  const [assignDueAt, setAssignDueAt] = useState("");
  const [assignMaxScore, setAssignMaxScore] = useState("100");
  const [assignLatePolicy, setAssignLatePolicy] = useState<"accept_with_penalty" | "reject_after_due" | "accept_no_penalty">(
    "accept_with_penalty",
  );
  const [assignPenaltyPercent, setAssignPenaltyPercent] = useState("10");
  const [assignMaxAttempts, setAssignMaxAttempts] = useState("3");
  const [assignMode, setAssignMode] = useState<"individual" | "group">("individual");
  const [assignStatus, setAssignStatus] = useState<"draft" | "published" | "scheduled" | "archived">("published");
  const [assignRubricCriterion, setAssignRubricCriterion] = useState("Technical Rigor & Completeness");
  const [assignRubricPoints, setAssignRubricPoints] = useState("100");
  const [assignUpload, setAssignUpload] = useState<EncodedFileUpload | undefined>(undefined);

  const [submissionTexts, setSubmissionTexts] = useState<Record<number, string>>({});
  const [submissionGroups, setSubmissionGroups] = useState<Record<number, string>>({});
  const [submissionUploads, setSubmissionUploads] = useState<Record<number, EncodedFileUpload | undefined>>({});

  // Faculty Grading & Extension States
  const [gradingScores, setGradingScores] = useState<Record<string, string>>({});
  const [gradingFeedbacks, setGradingFeedbacks] = useState<Record<string, string>>({});
  const [gradingReleaseFlags, setGradingReleaseFlags] = useState<Record<string, boolean>>({});
  const [extEnrollmentId, setExtEnrollmentId] = useState<string>("");
  const [extActivityId, setExtActivityId] = useState<string>("");
  const [extDate, setExtDate] = useState("");
  const [extReason, setExtReason] = useState("");

  // Question Bank & Quiz States
  const [qTopic, setQTopic] = useState("Core Concepts");
  const [qType, setQType] = useState<"multiple_choice" | "multiple_select" | "true_false" | "short_answer" | "essay">(
    "multiple_choice",
  );
  const [qPrompt, setQPrompt] = useState("");
  const [qOptionsText, setQOptionsText] = useState("Option A\nOption B\nOption C\nOption D");
  const [qCorrectAnswer, setQCorrectAnswer] = useState("Option A");
  const [qExplanation, setQExplanation] = useState("");
  const [qPoints, setQPoints] = useState("10");

  const [quizTitle, setQuizTitle] = useState("");
  const [quizInstructions, setQuizInstructions] = useState("");
  const [quizTimeLimit, setQuizTimeLimit] = useState("25");
  const [quizMaxAttempts, setQuizMaxAttempts] = useState("2");
  const [quizPassMark, setQuizPassMark] = useState("60");
  const [quizReviewPolicy, setQuizReviewPolicy] = useState<"immediate" | "after_due" | "after_release" | "never">(
    "immediate",
  );
  const [selectedBankIds, setSelectedBankIds] = useState<number[]>([]);

  const [activeQuizRunner, setActiveQuizRunner] = useState<{
    quizId: number;
    quizTitle: string;
    instructions: string | null;
    timeLimitMinutes: number;
    passMarkPercent: number;
    questions: QuizQuestionView[];
    attemptId: number;
    startedAt: Date | string;
    initialAnswers: Record<string, string | string[]>;
  } | null>(null);

  const [quizAttemptManualScores, setQuizAttemptManualScores] = useState<Record<number, string>>({});
  const [quizAttemptFeedbacks, setQuizAttemptFeedbacks] = useState<Record<number, string>>({});

  // Manual Gradebook States
  const [gbEnrollmentId, setGbEnrollmentId] = useState("");
  const [gbCategoryId, setGbCategoryId] = useState("");
  const [gbTitle, setGbTitle] = useState("");
  const [gbScore, setGbScore] = useState("85");
  const [gbMaxScore, setGbMaxScore] = useState("100");
  const [gbStatus, setGbStatus] = useState<"released" | "draft_grade" | "missing" | "exempt">("released");
  const [gbFeedback, setGbFeedback] = useState("");
  const [gbChangeReason, setGbChangeReason] = useState("");

  // Communications States
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annPinned, setAnnPinned] = useState(true);

  const [discTitle, setDiscTitle] = useState("");
  const [discBody, setDiscBody] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<number, string>>({});

  const [msgRecipientId, setMsgRecipientId] = useState("");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");

  // Course Settings & Course Copy States
  const [settingsOverview, setSettingsOverview] = useState("");
  const [settingsOutcomes, setSettingsOutcomes] = useState("");
  const [settingsOfficeHours, setSettingsOfficeHours] = useState("");
  const [settingsLatePenalty, setSettingsLatePenalty] = useState("10");
  const [copySourceOfferingId, setCopySourceOfferingId] = useState<string>("");

  useEffect(() => {
    if (courseSpace.data?.space) {
      setSettingsOverview(courseSpace.data.space.overview || "");
      setSettingsOutcomes(courseSpace.data.space.learningOutcomes || "");
      setSettingsOfficeHours(courseSpace.data.space.officeHours || "");
      setSettingsLatePenalty(String(courseSpace.data.space.latePenaltyPercentPerDay ?? 10));
    }
    if (courseSpace.data?.modules?.[0] && selectedModuleIdForItem === null) {
      setSelectedModuleIdForItem(courseSpace.data.modules[0].id);
    }
  }, [courseSpace.data, selectedModuleIdForItem]);

  const refreshAll = async () => {
    await Promise.all([
      accessibleOfferings.refetch(),
      myDashboard.refetch(),
      courseSpace.refetch(),
      isLearner ? studentProgress.refetch() : legacyProgress.refetch(),
    ]);
  };

  // Mutations
  const seedDemo = trpc.lms.seedDemoCourse.useMutation({
    onSuccess: async data => {
      toast.success(`Provisioned ${data.courseCode} sample course space with modules, assignment, and quiz.`);
      setOfferingId(data.offeringId);
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const createModuleMut = trpc.lms.createModule.useMutation({
    onSuccess: async res => {
      toast.success("Module created.");
      setModuleTitle("");
      setModuleDescription("");
      setSelectedModuleIdForItem(res.id);
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const reorderModuleMut = trpc.lms.reorderModule.useMutation({
    onSuccess: () => courseSpace.refetch(),
    onError: err => toast.error(err.message),
  });

  const createModuleItemMut = trpc.lms.createModuleItem.useMutation({
    onSuccess: async () => {
      toast.success("Learning material added to module.");
      setItemTitle("");
      setItemSummary("");
      setItemBodyHtml("");
      setItemExternalUrl("");
      setItemUpload(undefined);
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const updatePubMut = trpc.lms.updateContentPublication.useMutation({
    onSuccess: async () => {
      toast.success("Publication visibility updated.");
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const toggleCompletionMut = trpc.lms.toggleItemCompletion.useMutation({
    onSuccess: async () => {
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const createAssignmentMut = trpc.lms.createAssignment.useMutation({
    onSuccess: async () => {
      toast.success("Configured assignment published.");
      setAssignTitle("");
      setAssignDesc("");
      setAssignDueAt("");
      setAssignUpload(undefined);
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const submitAssignmentMut = trpc.lms.submitAssignment.useMutation({
    onSuccess: async res => {
      toast.success(`Submission recorded · Receipt ${res.receiptCode} (Attempt #${res.attemptNumber})`);
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const gradeAssignmentMut = trpc.lms.gradeAssignment.useMutation({
    onSuccess: async res => {
      toast.success(
        `Saved grade (${res.finalScore} pts after ${res.penaltyPoints} late penalty · status: ${res.gradeStatus}).`,
      );
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const grantExtensionMut = trpc.lms.grantAssignmentExtension.useMutation({
    onSuccess: async () => {
      toast.success("Deadline extension granted and logged to audit trail.");
      setExtReason("");
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const createQuestionMut = trpc.lms.createQuestion.useMutation({
    onSuccess: async res => {
      toast.success("Question added to course question bank.");
      setQPrompt("");
      setQExplanation("");
      setSelectedBankIds(prev => [...prev, res.id]);
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const createQuizMut = trpc.lms.createQuiz.useMutation({
    onSuccess: async () => {
      toast.success("Online quiz created.");
      setQuizTitle("");
      setQuizInstructions("");
      setSelectedBankIds([]);
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const startQuizMut = trpc.lms.startQuizAttempt.useMutation({
    onError: err => toast.error(err.message),
  });

  const autosaveQuizMut = trpc.lms.autosaveQuizAttempt.useMutation({
    onSuccess: () => toast.success("Quiz answers autosaved."),
    onError: err => toast.error(err.message),
  });

  const submitQuizMut = trpc.lms.submitQuizAttempt.useMutation({
    onSuccess: async res => {
      toast.success(
        res.autoScore !== null
          ? `Quiz submitted! Score: ${res.autoScore}/${res.maxScore} (${res.passed ? "Passed" : "Below pass mark"})`
          : "Quiz submitted and queued for instructor grading.",
      );
      setActiveQuizRunner(null);
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const gradeQuizAttemptMut = trpc.lms.gradeQuizAttempt.useMutation({
    onSuccess: async () => {
      toast.success("Quiz attempt graded and updated in gradebook.");
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const upsertManualGradeMut = trpc.lms.upsertManualGradebookItem.useMutation({
    onSuccess: async () => {
      toast.success("Gradebook item saved.");
      setGbTitle("");
      setGbFeedback("");
      setGbChangeReason("");
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const publishOfficialGradeMut = trpc.lms.publishOfficialCourseGrade.useMutation({
    onSuccess: async res => {
      toast.success(
        `Published official MIS result: ${res.score}% (${res.letterGrade}) to student's academic transcript.`,
      );
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const createAnnouncementMut = trpc.lms.createAnnouncement.useMutation({
    onSuccess: async () => {
      toast.success("Course announcement posted.");
      setAnnTitle("");
      setAnnBody("");
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const createTopicMut = trpc.lms.createDiscussionTopic.useMutation({
    onSuccess: async () => {
      toast.success("Discussion topic posted.");
      setDiscTitle("");
      setDiscBody("");
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const createReplyMut = trpc.lms.createDiscussionReply.useMutation({
    onSuccess: async (_, vars) => {
      toast.success("Reply posted.");
      setReplyBodies(prev => ({ ...prev, [vars.topicId]: "" }));
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const flagDiscussionMut = trpc.lms.flagDiscussionItem.useMutation({
    onSuccess: async () => {
      toast.success("Post flagged for instructor moderation.");
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const moderateDiscussionMut = trpc.lms.moderateDiscussionItem.useMutation({
    onSuccess: async () => {
      toast.success("Moderation status updated.");
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const sendMessageMut = trpc.lms.sendCourseMessage.useMutation({
    onSuccess: async () => {
      toast.success("Private course message sent.");
      setMsgSubject("");
      setMsgBody("");
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const updateSettingsMut = trpc.lms.updateCourseSpaceSettings.useMutation({
    onSuccess: async () => {
      toast.success("Course space settings and policies updated.");
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const executeCopyMut = trpc.lms.executeCourseCopy.useMutation({
    onSuccess: async res => {
      toast.success(
        `Copied ${res.modulesCount} modules and ${res.quizzesCount} quizzes (student private records excluded).`,
      );
      await refreshAll();
    },
    onError: err => toast.error(err.message),
  });

  const exportCsvMut = trpc.lms.exportAdminReportCsv.useMutation({
    onSuccess: data => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Audited CSV report downloaded.");
    },
    onError: err => toast.error(err.message),
  });

  const markNotifReadMut = trpc.lms.markNotificationRead.useMutation({
    onSuccess: () => myDashboard.refetch(),
  });

  const updateNotifPrefsMut = trpc.lms.updateNotificationPreferences.useMutation({
    onSuccess: () => {
      toast.success("Notification preferences saved.");
      myDashboard.refetch();
    },
  });

  if (!isStaff && !isLearner) {
    return (
      <>
        <PageHeading
          eyebrow="Controlled access"
          title="Learning & E-Learning Workspace"
          description="Course spaces, learning modules, online quizzes, and gradebooks are available to enrolled students and academic staff."
        />
        <EmptyState
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="Learning workspace access is restricted"
          detail="Sign in with a student or academic staff account to access course spaces and assessments."
        />
      </>
    );
  }

  const spaceData = courseSpace.data;
  const unreadCount = myDashboard.data?.unreadNotificationCount ?? 0;

  return (
    <>
      <PageHeading
        eyebrow={isLearner ? "Learner E-Learning Portal" : "Faculty & Academic LMS Studio"}
        title="Learning & Course Spaces"
        description={
          isLearner
            ? "Access structured weekly modules, submit assignments with receipt tracking, complete timed online quizzes, and monitor your weighted course grade."
            : "Author structured modules, configure assignments and question banks, grade learner submissions, and publish official MIS course results."
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {isLearner ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowNotifications(prev => !prev)}
              aria-expanded={showNotifications}
            >
              <Bell className="mr-1.5 h-3.5 w-3.5 text-[#98764a]" aria-hidden="true" />
              Notifications
              {unreadCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-[#132b45] px-2 py-0.5 text-[10px] font-bold text-white tabular-nums">
                  {unreadCount}
                </span>
              ) : null}
            </Button>
          ) : null}
          <StatusPill tone="navy">{isLearner ? "Enrolled Learner" : `${user?.role?.toUpperCase()} LMS Access`}</StatusPill>
        </div>
      </PageHeading>

      {/* Notification & Preferences Drawer for Learners */}
      {showNotifications && myDashboard.data ? (
        <ContentCard className="mb-6 border-[#c8d5e1] bg-[#f7fafc]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dde5ec] pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#294e6b]">
                Course Alerts & Notification Preferences
              </p>
              <h2 className="mt-0.5 font-serif text-lg text-[#132b45]">Recent Learning Notifications</h2>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowNotifications(false)}>
              Close
            </Button>
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {myDashboard.data.notifications.length ? (
                myDashboard.data.notifications.map(n => (
                  <div
                    key={n.id}
                    className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-xs ${
                      n.readAt ? "border-[#e6e0d6] bg-white text-[#687582]" : "border-[#b8c7d4] bg-[#eef4f8] text-[#132b45]"
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{n.title}</p>
                      <p className="mt-0.5 leading-5">{n.body}</p>
                    </div>
                    {!n.readAt ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 text-[11px]"
                        onClick={() => markNotifReadMut.mutate({ notificationId: n.id })}
                      >
                        Mark read
                      </Button>
                    ) : (
                      <span className="text-[10px] text-[#827e77]">Read</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="rounded-xl bg-white p-4 text-xs text-[#687582]">No course notifications yet.</p>
              )}
            </div>

            <div className="rounded-xl border border-[#e6e0d6] bg-white p-4">
              <p className="text-xs font-semibold text-[#132b45]">Delivery Preferences</p>
              <p className="mt-0.5 text-[11px] text-[#687582]">Choose which course events generate alerts:</p>
              <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
                {(
                  [
                    ["announcements", "Announcements"],
                    ["dueDates", "Due Dates"],
                    ["submissions", "Submissions"],
                    ["grades", "Released Grades"],
                    ["discussions", "Discussions"],
                    ["messages", "Direct Messages"],
                  ] as const
                ).map(([key, label]) => {
                  const prefs = myDashboard.data.preferences;
                  const checked = Boolean(prefs[key]);
                  return (
                    <label key={key} className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={val =>
                          updateNotifPrefsMut.mutate({
                            ...prefs,
                            [key]: Boolean(val),
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </ContentCard>
      ) : null}

      {/* Learner Dashboard Overview Cards */}
      {isLearner && myDashboard.data?.courses.length ? (
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {myDashboard.data.courses.map(course => (
            <ContentCard
              key={course.offeringId}
              className={`cursor-pointer transition-all ${
                offeringId === course.offeringId ? "border-[#132b45] ring-1 ring-[#132b45]" : "hover:border-[#b8c7d4]"
              }`}
              onClick={() => setOfferingId(course.offeringId)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#98764a]">
                  {course.courseCode} · Sec {course.section}
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  <StatusPill tone={course.overdueCount > 0 ? "risk" : "good"}>
                    {course.completionPercent}% Complete
                  </StatusPill>
                </span>
              </div>
              <h2 className="mt-1.5 font-serif text-lg text-[#132b45]">{course.courseTitle}</h2>

              {/* Progress bar */}
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#eae4d8]" role="progressbar" aria-valuenow={course.completionPercent} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="h-full bg-[#167363] transition-all"
                  style={{ width: `${course.completionPercent}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#586b7b]">
                <span className="tabular-nums">
                  {course.completedItems}/{course.totalItems} items done
                </span>
                {course.currentOverallPercent !== null ? (
                  <span className="font-semibold text-[#132b45] tabular-nums">
                    Standing: {course.currentOverallPercent}% ({course.currentLetterGrade})
                  </span>
                ) : null}
              </div>

              {course.nextResumeItem ? (
                <p className="mt-2.5 truncate rounded-lg bg-[#f4f1ea] px-2.5 py-1.5 text-[11px] font-medium text-[#203950]">
                  Resume: {course.nextResumeItem.title}
                </p>
              ) : null}
            </ContentCard>
          ))}
        </div>
      ) : null}

      {/* Offering Selector Bar */}
      <ContentCard className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[260px] flex-1">
            <Label htmlFor="offering-select" className="text-xs font-semibold text-[#48596a]">
              Active Course Offering Space
            </Label>
            <Select
              value={offeringId ? String(offeringId) : ""}
              onValueChange={val => setOfferingId(Number(val))}
            >
              <SelectTrigger id="offering-select" className="mt-1.5 max-w-xl">
                <SelectValue placeholder="Select an enrolled or assigned course offering" />
              </SelectTrigger>
              <SelectContent>
                {accessibleOfferings.data?.map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.courseCode} · Section {item.section} — {item.courseTitle} ({item.termName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {localAuthEnabled && (!accessibleOfferings.data || accessibleOfferings.data.length === 0) ? (
            <Button
              type="button"
              onClick={() => seedDemo.mutate()}
              disabled={seedDemo.isPending}
              className="bg-[#132b45] text-white hover:bg-[#1c3b5c]"
            >
              <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {seedDemo.isPending ? "Provisioning Sample Course..." : "Provision Sample Course (CS204)"}
            </Button>
          ) : null}
        </div>
      </ContentCard>

      {!offeringId || !spaceData ? (
        <EmptyState
          icon={<GraduationCap className="h-5 w-5" />}
          title="No active course space selected"
          detail={
            isLearner
              ? "Your enrolled courses and structured learning modules will appear here once course registration is complete."
              : "Select an assigned course offering above or provision a sample course offering in local development."
          }
          action={
            localAuthEnabled ? (
              <Button
                type="button"
                onClick={() => seedDemo.mutate()}
                disabled={seedDemo.isPending}
                className="bg-[#132b45] text-white hover:bg-[#1c3b5c]"
              >
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Provision Sample Course (CS204)
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Course Header Banner */}
          <ContentCard className="bg-linear-to-r from-[#132b45] to-[#1f4266] text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e3c48e]">
                  {spaceData.offering.termName} · Section {spaceData.offering.section} ·{" "}
                  {spaceData.offering.modality.toUpperCase()}
                </p>
                <h2 className="mt-1.5 font-serif text-2xl sm:text-3xl">
                  {spaceData.offering.courseCode}: {spaceData.offering.courseTitle}
                </h2>
                <p className="mt-2 text-xs leading-6 text-[#d5e0eb]">{spaceData.space.overview}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#c7d6e5]">
                  <span>
                    <strong>Learning Outcomes:</strong> {spaceData.space.learningOutcomes}
                  </span>
                  {spaceData.space.officeHours ? (
                    <span>
                      <strong>Office Hours:</strong> {spaceData.space.officeHours}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-white/15 bg-white/10 p-3.5 text-xs backdrop-blur-xs">
                <p className="font-semibold text-[#e3c48e]">Teaching Team</p>
                {spaceData.instructors.length ? (
                  spaceData.instructors.map(inst => (
                    <p key={inst.id} className="mt-1 text-white">
                      {inst.name} <span className="text-[#c7d6e5]">({inst.email})</span>
                    </p>
                  ))
                ) : (
                  <p className="mt-1 text-[#c7d6e5]">Assigned Department Faculty</p>
                )}
                <p className="mt-2 text-[11px] text-[#c7d6e5]">
                  Late Policy: -{spaceData.space.latePenaltyPercentPerDay}% / day · Retention:{" "}
                  {spaceData.space.retentionDays} days
                </p>
              </div>
            </div>

            {/* Accessible Course Space Navigation Tabs */}
            <nav
              className="mt-6 flex flex-wrap gap-2 border-t border-white/15 pt-4"
              role="tablist"
              aria-label="Course space sections"
            >
              {(
                [
                  ["modules", "Modules & Content", BookOpen],
                  ["assignments", `Assignments (${spaceData.assignments.length})`, FileCheck2],
                  ["quizzes", `Quizzes & Tests (${spaceData.quizzes.length})`, HelpCircle],
                  ["gradebook", "Gradebook & Progress", Award],
                  ["communications", `Discussions & Messages (${spaceData.discussions.length})`, MessageSquare],
                  ...(isStaff ? ([["admin", "Course Settings, Copy & Reports", Settings]] as const) : []),
                ] as const
              ).map(([tabKey, label, Icon]) => {
                const selected = activeTab === tabKey;
                return (
                  <button
                    key={tabKey}
                    role="tab"
                    aria-selected={selected}
                    type="button"
                    onClick={() => setActiveTab(tabKey as CourseTab)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c48e] ${
                      selected
                        ? "bg-[#e3c48e] text-[#132b45]"
                        : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </ContentCard>

          {/* TAB 1: MODULES & CONTENT */}
          {activeTab === "modules" ? (
            <div className="space-y-6">
              {/* Pinned Announcements Strip */}
              {spaceData.announcements.length > 0 ? (
                <ContentCard className="border-[#ead49a] bg-[#fffaf0]">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#8a6217]">
                    <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Latest Course Announcements</span>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {spaceData.announcements.slice(0, 2).map(ann => (
                      <div key={ann.id} className="rounded-xl border border-[#efe2be] bg-white p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-[#132b45]">{ann.title}</h3>
                          <span className="text-[11px] text-[#827e77]">
                            {ann.authorName} · {new Date(ann.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[#48596a]">{ann.body}</p>
                      </div>
                    ))}
                  </div>
                </ContentCard>
              ) : null}

              {/* Faculty Module & Learning Material Authoring */}
              {isStaff ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  <ContentCard>
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-[#98764a]" aria-hidden="true" />
                      <h3 className="font-serif text-lg text-[#132b45]">Create Ordered Module / Week</h3>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label htmlFor="mod-title" className="text-xs font-semibold">
                          Module Title
                        </Label>
                        <Input
                          id="mod-title"
                          className="mt-1"
                          value={moduleTitle}
                          onChange={e => setModuleTitle(e.target.value)}
                          placeholder="e.g. Week 2: Distributed Transactions & Two-Phase Commit"
                        />
                      </div>
                      <div>
                        <Label htmlFor="mod-week" className="text-xs font-semibold">
                          Week Number
                        </Label>
                        <Input
                          id="mod-week"
                          type="number"
                          min="1"
                          className="mt-1"
                          value={moduleWeek}
                          onChange={e => setModuleWeek(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="mod-status" className="text-xs font-semibold">
                          Publication State
                        </Label>
                        <Select
                          value={moduleStatus}
                          onValueChange={v => setModuleStatus(v as typeof moduleStatus)}
                        >
                          <SelectTrigger id="mod-status" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="published">Published (Visible to students)</SelectItem>
                            <SelectItem value="draft">Draft (Instructor only)</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="archived">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="mod-desc" className="text-xs font-semibold">
                          Overview & Learning Objectives
                        </Label>
                        <Textarea
                          id="mod-desc"
                          className="mt-1 min-h-20"
                          value={moduleDescription}
                          onChange={e => setModuleDescription(e.target.value)}
                          placeholder="Summarize what learners will study and complete in this module"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="mt-4 bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                      disabled={!moduleTitle.trim() || createModuleMut.isPending}
                      onClick={() =>
                        createModuleMut.mutate({
                          courseOfferingId: offeringId,
                          title: moduleTitle.trim(),
                          description: moduleDescription.trim() || undefined,
                          weekNumber: Number(moduleWeek) || 1,
                          status: moduleStatus,
                        })
                      }
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Module
                    </Button>
                  </ContentCard>

                  <ContentCard>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[#98764a]" aria-hidden="true" />
                      <h3 className="font-serif text-lg text-[#132b45]">Add Learning Material to Module</h3>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="item-mod-select" className="text-xs font-semibold">
                          Target Module
                        </Label>
                        <Select
                          value={selectedModuleIdForItem ? String(selectedModuleIdForItem) : ""}
                          onValueChange={v => setSelectedModuleIdForItem(Number(v))}
                        >
                          <SelectTrigger id="item-mod-select" className="mt-1">
                            <SelectValue placeholder="Select module" />
                          </SelectTrigger>
                          <SelectContent>
                            {spaceData.modules.map(m => (
                              <SelectItem key={m.id} value={String(m.id)}>
                                {m.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="item-type-select" className="text-xs font-semibold">
                          Material Type
                        </Label>
                        <Select value={itemType} onValueChange={v => setItemType(v as typeof itemType)}>
                          <SelectTrigger id="item-type-select" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="page">Rich Text Page</SelectItem>
                            <SelectItem value="file">File Resource (Upload)</SelectItem>
                            <SelectItem value="video">Embedded Video + Transcript</SelectItem>
                            <SelectItem value="link">External Resource Link</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="item-title" className="text-xs font-semibold">
                          Item Title
                        </Label>
                        <Input
                          id="item-title"
                          className="mt-1"
                          value={itemTitle}
                          onChange={e => setItemTitle(e.target.value)}
                          placeholder="e.g. Lecture Slides: Consensus Safety Proof"
                        />
                      </div>
                      <div>
                        <Label htmlFor="item-status-select" className="text-xs font-semibold">
                          Visibility State
                        </Label>
                        <Select value={itemStatus} onValueChange={v => setItemStatus(v as typeof itemStatus)}>
                          <SelectTrigger id="item-status-select" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="published">Published</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="archived">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="item-summary" className="text-xs font-semibold">
                          Brief Summary
                        </Label>
                        <Input
                          id="item-summary"
                          className="mt-1"
                          value={itemSummary}
                          onChange={e => setItemSummary(e.target.value)}
                          placeholder="Key takeaway or reading instructions"
                        />
                      </div>

                      {itemType === "page" ? (
                        <div className="sm:col-span-2">
                          <Label htmlFor="item-body" className="text-xs font-semibold">
                            Structured Page Content (HTML or Text)
                          </Label>
                          <Textarea
                            id="item-body"
                            className="mt-1 min-h-24"
                            value={itemBodyHtml}
                            onChange={e => setItemBodyHtml(e.target.value)}
                            placeholder="Write accessible lecture content, headings, and reading notes..."
                          />
                        </div>
                      ) : null}

                      {itemType === "file" ? (
                        <div className="sm:col-span-2">
                          <Label htmlFor="item-file-input" className="text-xs font-semibold">
                            Upload Persistent File Resource (PDF, Images, CSV, ZIP, DOCX ≤ 12 MB)
                          </Label>
                          <Input
                            id="item-file-input"
                            type="file"
                            accept={SUPPORTED_UPLOAD_ACCEPT}
                            className="mt-1"
                            onChange={async e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const encoded = await encodeFileForUpload(file);
                                setItemUpload(encoded);
                                toast.success(`Attached ${file.name}`);
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Could not attach file.");
                              }
                            }}
                          />
                        </div>
                      ) : null}

                      {(itemType === "link" || itemType === "video") ? (
                        <div className="sm:col-span-2">
                          <Label htmlFor="item-url" className="text-xs font-semibold">
                            {itemType === "video" ? "Video Stream / Resource URL" : "External Reference URL"}
                          </Label>
                          <Input
                            id="item-url"
                            type="url"
                            className="mt-1"
                            value={itemExternalUrl}
                            onChange={e => setItemExternalUrl(e.target.value)}
                            placeholder="https://..."
                          />
                        </div>
                      ) : null}

                      {itemType === "video" ? (
                        <>
                          <div>
                            <Label htmlFor="item-captions" className="text-xs font-semibold">
                              Closed Captions (.vtt) Path
                            </Label>
                            <Input
                              id="item-captions"
                              className="mt-1"
                              value={itemCaptionsUrl}
                              onChange={e => setItemCaptionsUrl(e.target.value)}
                              placeholder="/captions/lecture.vtt"
                            />
                          </div>
                          <div>
                            <Label htmlFor="item-transcript" className="text-xs font-semibold">
                              Accessible Transcript Text
                            </Label>
                            <Input
                              id="item-transcript"
                              className="mt-1"
                              value={itemTranscript}
                              onChange={e => setItemTranscript(e.target.value)}
                              placeholder="Full accessible text transcript..."
                            />
                          </div>
                        </>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      className="mt-4 bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                      disabled={!selectedModuleIdForItem || !itemTitle.trim() || createModuleItemMut.isPending}
                      onClick={() =>
                        selectedModuleIdForItem &&
                        createModuleItemMut.mutate({
                          courseOfferingId: offeringId,
                          moduleId: selectedModuleIdForItem,
                          itemType,
                          title: itemTitle.trim(),
                          summary: itemSummary.trim() || undefined,
                          bodyHtml: itemBodyHtml.trim() || undefined,
                          externalUrl: itemExternalUrl.trim() || undefined,
                          captionsUrl: itemCaptionsUrl.trim() || undefined,
                          transcriptText: itemTranscript.trim() || undefined,
                          status: itemStatus,
                          upload: itemUpload,
                        })
                      }
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Publish Material to Module
                    </Button>
                  </ContentCard>
                </div>
              ) : null}

              {/* Ordered Modules List */}
              {spaceData.modules.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="h-5 w-5" />}
                  title="No course modules published yet"
                  detail={
                    isStaff
                      ? "Create your first ordered week or module above to organize readings, files, videos, assignments, and quizzes."
                      : "Your instructor has not published modules for this course offering yet."
                  }
                />
              ) : (
                spaceData.modules.map((mod, modIdx) => (
                  <ContentCard key={mod.id} className="p-0 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e0d6] bg-[#faf8f3] px-5 py-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#98764a]">
                          Week {mod.weekNumber ?? modIdx + 1} · {mod.items.length} Learning Items
                        </p>
                        <h3 className="mt-0.5 font-serif text-xl text-[#132b45]">{mod.title}</h3>
                        {mod.description ? (
                          <p className="mt-1 text-xs text-[#586b7b]">{mod.description}</p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <StatusPill
                          tone={
                            mod.status === "published"
                              ? "good"
                              : mod.status === "draft"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {mod.status}
                        </StatusPill>

                        {isStaff ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              aria-label={`Move ${mod.title} up`}
                              disabled={modIdx === 0}
                              onClick={() =>
                                reorderModuleMut.mutate({
                                  courseOfferingId: offeringId,
                                  moduleId: mod.id,
                                  direction: "up",
                                })
                              }
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              aria-label={`Move ${mod.title} down`}
                              disabled={modIdx === spaceData.modules.length - 1}
                              onClick={() =>
                                reorderModuleMut.mutate({
                                  courseOfferingId: offeringId,
                                  moduleId: mod.id,
                                  direction: "down",
                                })
                              }
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() =>
                                updatePubMut.mutate({
                                  courseOfferingId: offeringId,
                                  targetType: "module",
                                  targetId: mod.id,
                                  status: mod.status === "published" ? "draft" : "published",
                                })
                              }
                            >
                              {mod.status === "published" ? "Set Draft" : "Publish"}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="divide-y divide-[#eee9e0] p-5">
                      {mod.items.length === 0 ? (
                        <p className="text-xs text-[#827e77]">No learning items in this module yet.</p>
                      ) : (
                        mod.items.map(item => (
                          <article key={item.id} className="py-4 first:pt-0 last:pb-0">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                {isLearner ? (
                                  <div className="pt-0.5">
                                    <Checkbox
                                      id={`complete-item-${item.id}`}
                                      checked={item.completed}
                                      aria-label={`Mark ${item.title} as completed`}
                                      onCheckedChange={val =>
                                        toggleCompletionMut.mutate({
                                          courseOfferingId: offeringId,
                                          moduleItemId: item.id,
                                          completed: Boolean(val),
                                        })
                                      }
                                    />
                                  </div>
                                ) : null}

                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#98764a]">
                                      {item.itemType} · ~{item.estimatedMinutes} mins
                                    </span>
                                    {item.completed ? (
                                      <StatusPill tone="good">
                                        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                                        Completed
                                      </StatusPill>
                                    ) : null}
                                    {isStaff ? (
                                      <StatusPill tone={item.status === "published" ? "good" : "warning"}>
                                        {item.status}
                                      </StatusPill>
                                    ) : null}
                                  </div>

                                  <h4 className="mt-1 text-sm font-semibold text-[#132b45]">{item.title}</h4>
                                  {item.summary ? (
                                    <p className="mt-1 text-xs leading-5 text-[#586b7b]">{item.summary}</p>
                                  ) : null}

                                  {item.bodyHtml ? (
                                    <div
                                      className="mt-3 rounded-xl border border-[#ece7de] bg-[#faf8f3] p-4 text-xs leading-6 text-[#203950]"
                                      dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
                                    />
                                  ) : null}

                                  {item.fileUrl ? (
                                    <div className="mt-3 flex items-center gap-3">
                                      <a
                                        href={item.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#c8d5e1] bg-[#eef4f8] px-3 py-1.5 text-xs font-semibold text-[#193a56] hover:bg-[#e1ecf4]"
                                      >
                                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                        Download / Preview {item.fileName || "Resource"}
                                      </a>
                                    </div>
                                  ) : null}

                                  {item.externalUrl ? (
                                    <div className="mt-3">
                                      <a
                                        href={item.externalUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#294e6b] underline hover:text-[#132b45]"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                        Open External Learning Resource ({item.externalUrl})
                                      </a>
                                    </div>
                                  ) : null}

                                  {item.transcriptText ? (
                                    <details className="mt-3 rounded-xl border border-[#e6e0d6] bg-[#f7f5f0] p-3 text-xs">
                                      <summary className="cursor-pointer font-semibold text-[#203950]">
                                        Accessible Media Transcript & Captions ({item.captionsUrl || "Embedded VTT"})
                                      </summary>
                                      <p className="mt-2 whitespace-pre-wrap leading-5 text-[#48596a]">
                                        {item.transcriptText}
                                      </p>
                                    </details>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {item.itemType === "assignment" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setActiveTab("assignments")}
                                  >
                                    Go to Assignment
                                  </Button>
                                ) : null}
                                {item.itemType === "quiz" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setActiveTab("quizzes")}
                                  >
                                    Go to Quiz
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </ContentCard>
                ))
              )}
            </div>
          ) : null}

          {/* TAB 2: ASSIGNMENTS & SUBMISSIONS */}
          {activeTab === "assignments" ? (
            <div className="space-y-6">
              {isStaff ? (
                <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <ContentCard>
                    <h3 className="font-serif text-lg text-[#132b45]">Configure Course Assignment</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label htmlFor="assign-title" className="text-xs font-semibold">
                          Assignment Title
                        </Label>
                        <Input
                          id="assign-title"
                          className="mt-1"
                          value={assignTitle}
                          onChange={e => setAssignTitle(e.target.value)}
                          placeholder="e.g. Lab 2: Consensus Log Compaction"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="assign-desc" className="text-xs font-semibold">
                          Detailed Instructions & Submission Criteria
                        </Label>
                        <Textarea
                          id="assign-desc"
                          className="mt-1 min-h-20"
                          value={assignDesc}
                          onChange={e => setAssignDesc(e.target.value)}
                          placeholder="Provide clear deliverables, formatting expectations, and evaluation criteria..."
                        />
                      </div>
                      <div>
                        <Label htmlFor="assign-due" className="text-xs font-semibold">
                          Due Date & Time
                        </Label>
                        <Input
                          id="assign-due"
                          type="datetime-local"
                          className="mt-1"
                          value={assignDueAt}
                          onChange={e => setAssignDueAt(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="assign-max" className="text-xs font-semibold">
                          Maximum Score
                        </Label>
                        <Input
                          id="assign-max"
                          type="number"
                          min="1"
                          className="mt-1"
                          value={assignMaxScore}
                          onChange={e => setAssignMaxScore(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="assign-policy" className="text-xs font-semibold">
                          Late Submission Policy
                        </Label>
                        <Select
                          value={assignLatePolicy}
                          onValueChange={v => setAssignLatePolicy(v as typeof assignLatePolicy)}
                        >
                          <SelectTrigger id="assign-policy" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="accept_with_penalty">Accept Late with Daily Penalty</SelectItem>
                            <SelectItem value="accept_without_penalty">Accept Late without Penalty</SelectItem>
                            <SelectItem value="no_late">Reject After Deadline (Unless Extended)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="assign-penalty" className="text-xs font-semibold">
                          Daily Late Penalty (%)
                        </Label>
                        <Input
                          id="assign-penalty"
                          type="number"
                          min="0"
                          max="100"
                          className="mt-1"
                          value={assignPenaltyPercent}
                          onChange={e => setAssignPenaltyPercent(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="assign-attempts" className="text-xs font-semibold">
                          Max Submissions Allowed
                        </Label>
                        <Input
                          id="assign-attempts"
                          type="number"
                          min="1"
                          max="20"
                          className="mt-1"
                          value={assignMaxAttempts}
                          onChange={e => setAssignMaxAttempts(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="assign-mode" className="text-xs font-semibold">
                          Submission Mode
                        </Label>
                        <Select value={assignMode} onValueChange={v => setAssignMode(v as typeof assignMode)}>
                          <SelectTrigger id="assign-mode" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="individual">Individual Learner Submission</SelectItem>
                            <SelectItem value="group">Group / Team Submission</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="rubric-crit" className="text-xs font-semibold">
                          Primary Rubric Criterion
                        </Label>
                        <Input
                          id="rubric-crit"
                          className="mt-1"
                          value={assignRubricCriterion}
                          onChange={e => setAssignRubricCriterion(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="assign-file" className="text-xs font-semibold">
                          Specification Attachment (Optional)
                        </Label>
                        <Input
                          id="assign-file"
                          type="file"
                          accept={SUPPORTED_UPLOAD_ACCEPT}
                          className="mt-1"
                          onChange={async e => {
                            const f = e.target.files?.[0];
                            if (f) setAssignUpload(await encodeFileForUpload(f));
                          }}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="mt-4 bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                      disabled={!assignTitle.trim() || createAssignmentMut.isPending}
                      onClick={() =>
                        createAssignmentMut.mutate({
                          courseOfferingId: offeringId,
                          moduleId: spaceData.modules[0]?.id,
                          categoryId: spaceData.categories.find(c => c.name.includes("Coursework"))?.id,
                          title: assignTitle.trim(),
                          description: assignDesc.trim() || undefined,
                          dueAt: assignDueAt ? new Date(assignDueAt) : undefined,
                          maxScore: Number(assignMaxScore) || 100,
                          latePolicy: assignLatePolicy,
                          latePenaltyPercentPerDay: Number(assignPenaltyPercent) || 10,
                          maxAttempts: Number(assignMaxAttempts) || 3,
                          allowResubmission: true,
                          submissionMode: assignMode,
                          allowTextResponse: true,
                          allowFileUpload: true,
                          rubric: assignRubricCriterion.trim()
                            ? [{ criterion: assignRubricCriterion.trim(), maxPoints: Number(assignRubricPoints) || 100 }]
                            : [],
                          status: assignStatus,
                          upload: assignUpload,
                        })
                      }
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Publish Assignment
                    </Button>
                  </ContentCard>

                  {/* Accommodation & Extension Panel */}
                  <ContentCard>
                    <h3 className="font-serif text-lg text-[#132b45]">Grant Deadline Accommodation / Extension</h3>
                    <p className="mt-1 text-xs text-[#687582]">
                      Record an approved individual deadline extension with an institutional audit trail.
                    </p>
                    <div className="mt-4 space-y-3">
                      <div>
                        <Label htmlFor="ext-assign" className="text-xs font-semibold">
                          Assignment
                        </Label>
                        <Select value={extActivityId} onValueChange={setExtActivityId}>
                          <SelectTrigger id="ext-assign" className="mt-1">
                            <SelectValue placeholder="Choose assignment" />
                          </SelectTrigger>
                          <SelectContent>
                            {spaceData.assignments.map(a => (
                              <SelectItem key={a.id} value={String(a.id)}>
                                {a.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="ext-student" className="text-xs font-semibold">
                          Enrolled Learner
                        </Label>
                        <Select value={extEnrollmentId} onValueChange={setExtEnrollmentId}>
                          <SelectTrigger id="ext-student" className="mt-1">
                            <SelectValue placeholder="Choose learner" />
                          </SelectTrigger>
                          <SelectContent>
                            {spaceData.gradebook.map(g => (
                              <SelectItem key={g.enrollmentId} value={String(g.enrollmentId)}>
                                {g.legalFirstName} {g.legalLastName} ({g.studentNumber})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="ext-date" className="text-xs font-semibold">
                          Extended Due Date
                        </Label>
                        <Input
                          id="ext-date"
                          type="datetime-local"
                          className="mt-1"
                          value={extDate}
                          onChange={e => setExtDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="ext-reason" className="text-xs font-semibold">
                          Approved Accommodation Reason
                        </Label>
                        <Input
                          id="ext-reason"
                          className="mt-1"
                          value={extReason}
                          onChange={e => setExtReason(e.target.value)}
                          placeholder="e.g. Medical documentation verified by Student Services"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          !extActivityId ||
                          !extEnrollmentId ||
                          !extDate ||
                          extReason.trim().length < 3 ||
                          grantExtensionMut.isPending
                        }
                        onClick={() =>
                          grantExtensionMut.mutate({
                            courseOfferingId: offeringId,
                            activityId: Number(extActivityId),
                            enrollmentId: Number(extEnrollmentId),
                            extendedDueAt: new Date(extDate),
                            reason: extReason.trim(),
                          })
                        }
                      >
                        <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                        Grant Audited Extension
                      </Button>
                    </div>
                  </ContentCard>
                </div>
              ) : null}

              {/* Assignments List */}
              {spaceData.assignments.length === 0 ? (
                <EmptyState
                  icon={<FileCheck2 className="h-5 w-5" />}
                  title="No assignments configured"
                  detail="Assignments with rubrics, submission receipts, and grading controls will appear here."
                />
              ) : (
                spaceData.assignments.map(assign => {
                  const latestSub = assign.submissions[0] ?? null;
                  const isOverdue =
                    assign.dueAt && new Date(assign.dueAt).getTime() < Date.now() && (!latestSub || latestSub.isDraft);

                  return (
                    <ContentCard key={assign.id} className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e6e0d6] pb-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#98764a]">
                              {assign.config?.submissionMode ?? "individual"} assignment · Max {assign.maxScore} pts
                            </span>
                            {assign.dueAt ? (
                              <StatusPill tone={isOverdue ? "risk" : "navy"}>
                                <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
                                Due {new Date(assign.dueAt).toLocaleString()}
                              </StatusPill>
                            ) : null}
                            {assign.extensions.length > 0 ? (
                              <StatusPill tone="good">
                                Extension until {new Date(assign.extensions[0].extendedDueAt).toLocaleDateString()}
                              </StatusPill>
                            ) : null}
                          </div>
                          <h3 className="mt-1 font-serif text-xl text-[#132b45]">{assign.title}</h3>
                        </div>

                        {isLearner ? (
                          <StatusPill
                            tone={
                              latestSub?.gradeStatus === "released"
                                ? "good"
                                : latestSub && !latestSub.isDraft
                                  ? "warning"
                                  : isOverdue
                                    ? "risk"
                                    : "neutral"
                            }
                          >
                            {latestSub?.gradeStatus === "released"
                              ? `Released Grade: ${latestSub.finalScore}/${assign.maxScore}`
                              : latestSub && !latestSub.isDraft
                                ? `Submitted (${latestSub.receiptCode})`
                                : latestSub?.isDraft
                                  ? "Draft Saved"
                                  : isOverdue
                                    ? "Overdue — Not Submitted"
                                    : "Upcoming"}
                          </StatusPill>
                        ) : null}
                      </div>

                      {assign.description ? (
                        <p className="whitespace-pre-wrap text-xs leading-6 text-[#48596a]">{assign.description}</p>
                      ) : null}

                      {/* Rubric Display */}
                      {Array.isArray(assign.config?.rubricJson) && assign.config.rubricJson.length > 0 ? (
                        <div className="rounded-xl border border-[#e6e0d6] bg-[#faf8f3] p-3.5">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#98764a]">
                            Grading Rubric Criteria
                          </p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            {(
                              assign.config.rubricJson as Array<{
                                criterion: string;
                                maxPoints: number;
                                description?: string;
                              }>
                            ).map((r, idx) => (
                              <div key={idx} className="rounded-lg border border-[#e2dcd0] bg-white p-2.5 text-xs">
                                <div className="flex items-center justify-between font-semibold text-[#132b45]">
                                  <span>{r.criterion}</span>
                                  <span className="tabular-nums">{r.maxPoints} pts</span>
                                </div>
                                {r.description ? (
                                  <p className="mt-1 text-[11px] text-[#687582]">{r.description}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Learner Submission Box & Receipt History */}
                      {isLearner ? (
                        <div className="grid gap-5 pt-2 lg:grid-cols-[1.2fr_0.8fr]">
                          <div className="space-y-3 rounded-xl border border-[#e6e0d6] bg-white p-4">
                            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#203950]">
                              Prepare or Update Your Submission
                            </h4>

                            {assign.config?.submissionMode === "group" ? (
                              <div>
                                <Label htmlFor={`group-${assign.id}`} className="text-xs">
                                  Group / Team Identifier
                                </Label>
                                <Input
                                  id={`group-${assign.id}`}
                                  className="mt-1"
                                  value={submissionGroups[assign.id] || ""}
                                  onChange={e =>
                                    setSubmissionGroups(prev => ({ ...prev, [assign.id]: e.target.value }))
                                  }
                                  placeholder="e.g. Team Alpha"
                                />
                              </div>
                            ) : null}

                            <div>
                              <Label htmlFor={`sub-text-${assign.id}`} className="text-xs">
                                Written Response / Technical Summary
                              </Label>
                              <Textarea
                                id={`sub-text-${assign.id}`}
                                className="mt-1 min-h-24"
                                value={submissionTexts[assign.id] ?? latestSub?.responseText ?? ""}
                                onChange={e =>
                                  setSubmissionTexts(prev => ({ ...prev, [assign.id]: e.target.value }))
                                }
                                placeholder="Write your response or paste your technical solution notes..."
                              />
                            </div>

                            <div>
                              <Label htmlFor={`sub-file-${assign.id}`} className="text-xs">
                                Attach File Deliverable (PDF, ZIP, DOCX, Images, CSV ≤ 12 MB)
                              </Label>
                              <Input
                                id={`sub-file-${assign.id}`}
                                type="file"
                                accept={SUPPORTED_UPLOAD_ACCEPT}
                                className="mt-1"
                                onChange={async e => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  try {
                                    const enc = await encodeFileForUpload(f);
                                    setSubmissionUploads(prev => ({ ...prev, [assign.id]: enc }));
                                    toast.success(`Ready to submit ${f.name}`);
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : "Invalid file");
                                  }
                                }}
                              />
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 pt-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={submitAssignmentMut.isPending}
                                onClick={() =>
                                  submitAssignmentMut.mutate({
                                    courseOfferingId: offeringId,
                                    activityId: assign.id,
                                    isDraft: true,
                                    groupName: submissionGroups[assign.id],
                                    responseText:
                                      submissionTexts[assign.id] ?? latestSub?.responseText ?? "Draft saved",
                                    upload: submissionUploads[assign.id],
                                  })
                                }
                              >
                                Save Draft
                              </Button>

                              <Button
                                type="button"
                                size="sm"
                                className="bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                                disabled={!assign.windowEvaluation.allowed || submitAssignmentMut.isPending}
                                onClick={() =>
                                  submitAssignmentMut.mutate({
                                    courseOfferingId: offeringId,
                                    activityId: assign.id,
                                    isDraft: false,
                                    groupName: submissionGroups[assign.id],
                                    responseText: submissionTexts[assign.id] ?? latestSub?.responseText ?? undefined,
                                    upload: submissionUploads[assign.id],
                                  })
                                }
                              >
                                <Upload className="mr-1.5 h-3.5 w-3.5" />
                                Confirm & Submit Work
                              </Button>
                            </div>

                            {!assign.windowEvaluation.allowed ? (
                              <p className="text-xs font-medium text-[#af3f38]">{assign.windowEvaluation.reason}</p>
                            ) : null}
                          </div>

                          {/* Submission History & Released Feedback */}
                          <div className="space-y-3 rounded-xl border border-[#e6e0d6] bg-[#faf8f3] p-4">
                            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#203950]">
                              Submission Receipts & Released Feedback
                            </h4>
                            {assign.submissions.length === 0 ? (
                              <p className="text-xs text-[#687582]">No submissions or drafts recorded yet.</p>
                            ) : (
                              assign.submissions.map(sub => (
                                <div key={sub.id} className="rounded-lg border border-[#e2dcd0] bg-white p-3 text-xs">
                                  <div className="flex items-center justify-between font-semibold text-[#132b45]">
                                    <span>
                                      {sub.isDraft ? "Draft" : `Attempt #${sub.attemptNumber}`} · {sub.receiptCode}
                                    </span>
                                    <span className="text-[11px] text-[#687582]">
                                      {new Date(sub.submittedAt).toLocaleString()}
                                    </span>
                                  </div>
                                  {sub.isLate ? (
                                    <p className="mt-1 text-[11px] font-medium text-[#8a6217]">
                                      Submitted {sub.daysLate} day(s) after deadline
                                    </p>
                                  ) : null}
                                  {sub.attachmentUrl ? (
                                    <a
                                      href={sub.attachmentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#294e6b] underline"
                                    >
                                      <FileText className="h-3 w-3" /> {sub.attachmentName || "Submitted File"}
                                    </a>
                                  ) : null}
                                  {sub.gradeStatus === "released" ? (
                                    <div className="mt-2.5 border-t border-[#eee9e0] pt-2">
                                      <p className="font-semibold text-[#167363]">
                                        Released Score: {sub.finalScore} / {assign.maxScore} pts
                                        {sub.latePenaltyPoints > 0
                                          ? ` (Raw ${sub.rawScore}, -${sub.latePenaltyPoints} late penalty)`
                                          : ""}
                                      </p>
                                      {sub.feedback ? (
                                        <p className="mt-1 text-[#344a60]">Instructor Feedback: {sub.feedback}</p>
                                      ) : null}
                                    </div>
                                  ) : !sub.isDraft ? (
                                    <p className="mt-2 text-[11px] italic text-[#687582]">
                                      Awaiting instructor grading & grade release.
                                    </p>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Faculty Submission & Grading Workbench */
                        <div className="rounded-xl border border-[#e6e0d6] bg-[#faf8f3] p-4">
                          <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-[#203950]">
                            Instructor Grading Workbench ({assign.submissions.length} Submissions)
                          </h4>
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full min-w-[680px] text-left text-xs">
                              <thead className="border-b border-[#e2dcd0] text-[10px] uppercase tracking-[0.12em] text-[#687582]">
                                <tr>
                                  <th className="py-2 pr-3">Learner</th>
                                  <th className="py-2 pr-3">Latest Submission & Receipt</th>
                                  <th className="py-2 pr-3">Raw Score (/{assign.maxScore})</th>
                                  <th className="py-2 pr-3">Feedback</th>
                                  <th className="py-2 pr-3">Release Control</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#ece7de]">
                                {spaceData.gradebook.map(student => {
                                  const sub = assign.submissions.find(
                                    s => s.enrollmentId === student.enrollmentId && !s.isDraft,
                                  );
                                  const key = `${assign.id}-${student.enrollmentId}`;
                                  const releaseChecked =
                                    gradingReleaseFlags[key] ?? (sub?.gradeStatus === "released");

                                  return (
                                    <tr key={student.enrollmentId}>
                                      <td className="py-3 pr-3 font-medium text-[#132b45]">
                                        {student.legalFirstName} {student.legalLastName}
                                        <span className="block text-[10px] text-[#687582]">
                                          {student.studentNumber}
                                        </span>
                                      </td>
                                      <td className="py-3 pr-3">
                                        {sub ? (
                                          <div>
                                            <span className="font-mono text-[11px] font-semibold text-[#294e6b]">
                                              {sub.receiptCode}
                                            </span>
                                            {sub.isLate ? (
                                              <span className="ml-1.5 text-[10px] text-[#af3f38]">
                                                ({sub.daysLate}d late)
                                              </span>
                                            ) : null}
                                            {sub.responseText ? (
                                              <p className="mt-1 line-clamp-2 max-w-xs text-[11px] text-[#48596a]">
                                                {sub.responseText}
                                              </p>
                                            ) : null}
                                            {sub.attachmentUrl ? (
                                              <a
                                                href={sub.attachmentUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-1 inline-block text-[11px] font-semibold text-[#294e6b] underline"
                                              >
                                                Download {sub.attachmentName}
                                              </a>
                                            ) : null}
                                          </div>
                                        ) : (
                                          <span className="text-[#827e77]">No submission yet</span>
                                        )}
                                      </td>
                                      <td className="py-3 pr-3">
                                        <Input
                                          type="number"
                                          min="0"
                                          max={assign.maxScore}
                                          aria-label={`Raw score for ${student.legalFirstName} ${student.legalLastName}`}
                                          className="h-8 w-20 tabular-nums"
                                          value={gradingScores[key] ?? (sub?.rawScore !== null && sub?.rawScore !== undefined ? String(sub.rawScore) : "")}
                                          onChange={e =>
                                            setGradingScores(prev => ({ ...prev, [key]: e.target.value }))
                                          }
                                        />
                                      </td>
                                      <td className="py-3 pr-3">
                                        <Input
                                          aria-label={`Feedback for ${student.legalFirstName} ${student.legalLastName}`}
                                          className="h-8 min-w-44"
                                          value={gradingFeedbacks[key] ?? sub?.feedback ?? ""}
                                          onChange={e =>
                                            setGradingFeedbacks(prev => ({ ...prev, [key]: e.target.value }))
                                          }
                                          placeholder="Rubric & constructive notes..."
                                        />
                                      </td>
                                      <td className="py-3 pr-3">
                                        <div className="flex items-center gap-2">
                                          <label className="flex items-center gap-1.5 text-[11px]">
                                            <Checkbox
                                              checked={releaseChecked}
                                              onCheckedChange={val =>
                                                setGradingReleaseFlags(prev => ({
                                                  ...prev,
                                                  [key]: Boolean(val),
                                                }))
                                              }
                                            />
                                            <span>Release</span>
                                          </label>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2.5 text-[11px]"
                                            disabled={gradeAssignmentMut.isPending}
                                            onClick={() => {
                                              const scoreVal = Number(
                                                gradingScores[key] ?? sub?.rawScore ?? 0,
                                              );
                                              gradeAssignmentMut.mutate({
                                                courseOfferingId: offeringId,
                                                activityId: assign.id,
                                                enrollmentId: student.enrollmentId,
                                                rawScore: scoreVal,
                                                feedback: gradingFeedbacks[key] ?? sub?.feedback ?? undefined,
                                                releaseGrade: releaseChecked,
                                              });
                                            }}
                                          >
                                            Save
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </ContentCard>
                  );
                })
              )}
            </div>
          ) : null}

          {/* TAB 3: QUIZZES & ONLINE TESTS */}
          {activeTab === "quizzes" ? (
            <div className="space-y-6">
              {isStaff ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  {/* Question Bank Creator */}
                  <ContentCard>
                    <h3 className="font-serif text-lg text-[#132b45]">
                      Course Question Bank ({spaceData.questionBank.length} Questions)
                    </h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="q-topic" className="text-xs font-semibold">
                          Topic / Competency Tag
                        </Label>
                        <Input
                          id="q-topic"
                          className="mt-1"
                          value={qTopic}
                          onChange={e => setQTopic(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="q-type" className="text-xs font-semibold">
                          Question Format
                        </Label>
                        <Select value={qType} onValueChange={v => setQType(v as typeof qType)}>
                          <SelectTrigger id="q-type" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                            <SelectItem value="multiple_select">Multiple Select</SelectItem>
                            <SelectItem value="true_false">True / False</SelectItem>
                            <SelectItem value="short_answer">Short Answer (Auto-graded)</SelectItem>
                            <SelectItem value="essay">Essay (Manual Instructor Grading)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="q-prompt" className="text-xs font-semibold">
                          Question Prompt
                        </Label>
                        <Textarea
                          id="q-prompt"
                          className="mt-1 min-h-16"
                          value={qPrompt}
                          onChange={e => setQPrompt(e.target.value)}
                          placeholder="State the question clearly..."
                        />
                      </div>
                      {(qType === "multiple_choice" || qType === "multiple_select") ? (
                        <div className="sm:col-span-2">
                          <Label htmlFor="q-opts" className="text-xs font-semibold">
                            Answer Options (One per line)
                          </Label>
                          <Textarea
                            id="q-opts"
                            className="mt-1 min-h-20"
                            value={qOptionsText}
                            onChange={e => setQOptionsText(e.target.value)}
                          />
                        </div>
                      ) : null}
                      <div>
                        <Label htmlFor="q-correct" className="text-xs font-semibold">
                          Correct Answer(s) {qType === "multiple_select" ? "(Comma-separated)" : ""}
                        </Label>
                        <Input
                          id="q-correct"
                          className="mt-1"
                          value={qCorrectAnswer}
                          onChange={e => setQCorrectAnswer(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="q-pts" className="text-xs font-semibold">
                          Default Points
                        </Label>
                        <Input
                          id="q-pts"
                          type="number"
                          min="1"
                          className="mt-1"
                          value={qPoints}
                          onChange={e => setQPoints(e.target.value)}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="mt-4 bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                      disabled={!qPrompt.trim() || createQuestionMut.isPending}
                      onClick={() => {
                        const options =
                          qType === "true_false"
                            ? ["True", "False"]
                            : qType === "multiple_choice" || qType === "multiple_select"
                              ? qOptionsText
                                  .split("\n")
                                  .map(s => s.trim())
                                  .filter(Boolean)
                              : [];
                        const correct =
                          qType === "multiple_select"
                            ? qCorrectAnswer
                                .split(",")
                                .map(s => s.trim())
                                .filter(Boolean)
                            : qCorrectAnswer.trim();
                        createQuestionMut.mutate({
                          courseOfferingId: offeringId,
                          topic: qTopic.trim() || "General",
                          questionType: qType,
                          prompt: qPrompt.trim(),
                          options,
                          correctAnswer: correct,
                          explanation: qExplanation.trim() || undefined,
                          defaultPoints: Number(qPoints) || 10,
                        });
                      }}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add to Question Bank
                    </Button>
                  </ContentCard>

                  {/* Quiz Assembler */}
                  <ContentCard>
                    <h3 className="font-serif text-lg text-[#132b45]">Assemble Timed Online Quiz</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label htmlFor="quiz-title" className="text-xs font-semibold">
                          Quiz Title
                        </Label>
                        <Input
                          id="quiz-title"
                          className="mt-1"
                          value={quizTitle}
                          onChange={e => setQuizTitle(e.target.value)}
                          placeholder="e.g. Week 2 Online Assessment"
                        />
                      </div>
                      <div>
                        <Label htmlFor="quiz-timer" className="text-xs font-semibold">
                          Time Limit (Minutes)
                        </Label>
                        <Input
                          id="quiz-timer"
                          type="number"
                          min="1"
                          className="mt-1"
                          value={quizTimeLimit}
                          onChange={e => setQuizTimeLimit(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="quiz-attempts" className="text-xs font-semibold">
                          Attempt Limit
                        </Label>
                        <Input
                          id="quiz-attempts"
                          type="number"
                          min="1"
                          className="mt-1"
                          value={quizMaxAttempts}
                          onChange={e => setQuizMaxAttempts(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="quiz-pass" className="text-xs font-semibold">
                          Pass Mark (%)
                        </Label>
                        <Input
                          id="quiz-pass"
                          type="number"
                          min="0"
                          max="100"
                          className="mt-1"
                          value={quizPassMark}
                          onChange={e => setQuizPassMark(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="quiz-review" className="text-xs font-semibold">
                          Review Visibility Policy
                        </Label>
                        <Select
                          value={quizReviewPolicy}
                          onValueChange={v => setQuizReviewPolicy(v as typeof quizReviewPolicy)}
                        >
                          <SelectTrigger id="quiz-review" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="immediate">Immediate Score & Review After Submit</SelectItem>
                            <SelectItem value="after_release">After Instructor Releases Grades</SelectItem>
                            <SelectItem value="after_due">After Quiz Due Date</SelectItem>
                            <SelectItem value="never">Summary Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-[#132b45]">
                          Select Questions from Bank ({selectedBankIds.length} chosen)
                        </p>
                        <div className="mt-1.5 max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-[#e6e0d6] bg-[#faf8f3] p-2.5">
                          {spaceData.questionBank.map(qb => {
                            const checked = selectedBankIds.includes(qb.id);
                            return (
                              <label key={qb.id} className="flex cursor-pointer items-center gap-2 text-xs">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={val =>
                                    setSelectedBankIds(prev =>
                                      val ? [...prev, qb.id] : prev.filter(id => id !== qb.id),
                                    )
                                  }
                                />
                                <span className="truncate">
                                  [{qb.topic}] {qb.prompt} ({qb.defaultPoints} pts)
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="mt-4 bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                      disabled={!quizTitle.trim() || selectedBankIds.length === 0 || createQuizMut.isPending}
                      onClick={() =>
                        createQuizMut.mutate({
                          courseOfferingId: offeringId,
                          moduleId: spaceData.modules[0]?.id,
                          categoryId: spaceData.categories.find(c => c.name.includes("Quizzes"))?.id,
                          title: quizTitle.trim(),
                          instructions: quizInstructions.trim() || undefined,
                          status: "published",
                          timeLimitMinutes: Number(quizTimeLimit) || 25,
                          maxAttempts: Number(quizMaxAttempts) || 2,
                          passMarkPercent: Number(quizPassMark) || 60,
                          randomizeQuestions: false,
                          randomizeOptions: false,
                          reviewPolicy: quizReviewPolicy,
                          questionBankIds: selectedBankIds,
                        })
                      }
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Publish Quiz
                    </Button>
                  </ContentCard>
                </div>
              ) : null}

              {/* Quizzes List */}
              {spaceData.quizzes.length === 0 ? (
                <EmptyState
                  icon={<HelpCircle className="h-5 w-5" />}
                  title="No online quizzes published"
                  detail="Timed online tests and self-check quizzes will appear here."
                />
              ) : (
                spaceData.quizzes.map(quiz => {
                  const completedAttempts = quiz.attempts.filter(a => a.status !== "in_progress").length;
                  const inProgressAttempt = quiz.attempts.find(a => a.status === "in_progress");

                  return (
                    <ContentCard key={quiz.id} className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e6e0d6] pb-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#98764a]">
                            Time Limit: {quiz.timeLimitMinutes} mins · Max Attempts: {quiz.maxAttempts} · Pass Mark:{" "}
                            {quiz.passMarkPercent}%
                          </p>
                          <h3 className="mt-1 font-serif text-xl text-[#132b45]">{quiz.title}</h3>
                          {quiz.instructions ? (
                            <p className="mt-1 text-xs text-[#586b7b]">{quiz.instructions}</p>
                          ) : null}
                        </div>

                        {isLearner ? (
                          <div className="flex items-center gap-2.5">
                            <StatusPill tone="navy">
                              {completedAttempts} / {quiz.maxAttempts} attempts used
                            </StatusPill>
                            <Button
                              type="button"
                              size="sm"
                              className="bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                              disabled={
                                (!inProgressAttempt && completedAttempts >= quiz.maxAttempts) ||
                                startQuizMut.isPending
                              }
                              onClick={async () => {
                                const started = await startQuizMut.mutateAsync({
                                  courseOfferingId: offeringId,
                                  quizId: quiz.id,
                                });
                                setActiveQuizRunner({
                                  quizId: quiz.id,
                                  quizTitle: quiz.title,
                                  instructions: quiz.instructions,
                                  timeLimitMinutes: quiz.timeLimitMinutes,
                                  passMarkPercent: quiz.passMarkPercent,
                                  questions: quiz.questions as QuizQuestionView[],
                                  attemptId: started.id,
                                  startedAt: started.startedAt,
                                  initialAnswers:
                                    (started.answersJson as Record<string, string | string[]>) || {},
                                });
                              }}
                            >
                              <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                              {inProgressAttempt ? "Resume In-Progress Attempt" : "Start Timed Quiz"}
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {/* Attempts & Results Table */}
                      {quiz.attempts.length > 0 ? (
                        <div className="rounded-xl border border-[#e6e0d6] bg-[#faf8f3] p-4">
                          <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-[#203950]">
                            Recorded Quiz Attempts
                          </h4>
                          <div className="mt-2.5 space-y-2">
                            {quiz.attempts.map(att => (
                              <div
                                key={att.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e2dcd0] bg-white px-3.5 py-2.5 text-xs"
                              >
                                <div>
                                  <span className="font-semibold text-[#132b45]">
                                    {isStaff ? `${att.studentName} · ` : ""}Attempt #{att.attemptNumber} (
                                    {att.status})
                                  </span>
                                  <span className="ml-2 text-[#687582]">
                                    Started {new Date(att.startedAt).toLocaleString()}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5">
                                  {att.totalScore !== null ? (
                                    <StatusPill tone={att.passed ? "good" : "warning"}>
                                      Score: {att.totalScore} / {att.maxScore}{" "}
                                      {att.passed ? "(Passed)" : "(Below pass mark)"}
                                    </StatusPill>
                                  ) : (
                                    <StatusPill tone="neutral">Pending Grade Release</StatusPill>
                                  )}

                                  {isStaff && att.status !== "in_progress" ? (
                                    <div className="flex items-center gap-1.5">
                                      <Input
                                        type="number"
                                        min="0"
                                        placeholder="Manual pts"
                                        aria-label={`Manual points for attempt ${att.id}`}
                                        className="h-7 w-24 text-xs"
                                        value={quizAttemptManualScores[att.id] ?? ""}
                                        onChange={e =>
                                          setQuizAttemptManualScores(prev => ({
                                            ...prev,
                                            [att.id]: e.target.value,
                                          }))
                                        }
                                      />
                                      <Input
                                        placeholder="Feedback"
                                        aria-label={`Instructor feedback for attempt ${att.id}`}
                                        className="h-7 w-36 text-xs"
                                        value={quizAttemptFeedbacks[att.id] ?? att.instructorFeedback ?? ""}
                                        onChange={e =>
                                          setQuizAttemptFeedbacks(prev => ({
                                            ...prev,
                                            [att.id]: e.target.value,
                                          }))
                                        }
                                      />
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-[11px]"
                                        onClick={() =>
                                          gradeQuizAttemptMut.mutate({
                                            courseOfferingId: offeringId,
                                            attemptId: att.id,
                                            manualScore: Number(quizAttemptManualScores[att.id] || 0),
                                            instructorFeedback: quizAttemptFeedbacks[att.id],
                                            releaseGrade: true,
                                          })
                                        }
                                      >
                                        Release Grade
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </ContentCard>
                  );
                })
              )}
            </div>
          ) : null}

          {/* TAB 4: GRADEBOOK & MIS SYNC */}
          {activeTab === "gradebook" ? (
            <div className="space-y-6">
              {/* Weighted Categories Banner */}
              <ContentCard>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#98764a]">
                      Transparent Grade Calculation Policy
                    </p>
                    <h3 className="mt-1 font-serif text-xl text-[#132b45]">
                      Weighted Assessment Categories & Institutional Rounding
                    </h3>
                  </div>
                  <StatusPill tone="navy">Half-Up Rounding to Nearest Integer for MIS Transcript</StatusPill>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {spaceData.categories.map(cat => (
                    <div key={cat.id} className="rounded-xl border border-[#e6e0d6] bg-[#faf8f3] p-3.5">
                      <p className="text-xs font-semibold text-[#132b45]">{cat.name}</p>
                      <p className="mt-1 font-serif text-2xl text-[#98764a] tabular-nums">
                        {cat.weightPercent}% Weight
                      </p>
                    </div>
                  ))}
                </div>
              </ContentCard>

              {/* Faculty Manual Gradebook Item & Amendment Control */}
              {isStaff ? (
                <ContentCard>
                  <h3 className="font-serif text-lg text-[#132b45]">
                    Record or Amend Gradebook Entry (Supports Missing, Exempt & Audited Amendments)
                  </h3>
                  <p className="mt-1 text-xs text-[#687582]">
                    Amending a previously released grade requires an explicit audit reason and automatically notifies the
                    affected learner.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="gb-student" className="text-xs font-semibold">
                        Enrolled Learner
                      </Label>
                      <Select value={gbEnrollmentId} onValueChange={setGbEnrollmentId}>
                        <SelectTrigger id="gb-student" className="mt-1">
                          <SelectValue placeholder="Choose learner" />
                        </SelectTrigger>
                        <SelectContent>
                          {spaceData.gradebook.map(g => (
                            <SelectItem key={g.enrollmentId} value={String(g.enrollmentId)}>
                              {g.legalFirstName} {g.legalLastName} ({g.studentNumber})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="gb-cat" className="text-xs font-semibold">
                        Assessment Category
                      </Label>
                      <Select value={gbCategoryId} onValueChange={setGbCategoryId}>
                        <SelectTrigger id="gb-cat" className="mt-1">
                          <SelectValue placeholder="Choose category" />
                        </SelectTrigger>
                        <SelectContent>
                          {spaceData.categories.map(c => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name} ({c.weightPercent}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="gb-title" className="text-xs font-semibold">
                        Assessment Item Title
                      </Label>
                      <Input
                        id="gb-title"
                        className="mt-1"
                        value={gbTitle}
                        onChange={e => setGbTitle(e.target.value)}
                        placeholder="e.g. Oral Viva / Practical Lab"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gb-score" className="text-xs font-semibold">
                        Score
                      </Label>
                      <Input
                        id="gb-score"
                        type="number"
                        min="0"
                        className="mt-1"
                        value={gbScore}
                        onChange={e => setGbScore(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="gb-max" className="text-xs font-semibold">
                        Max Score
                      </Label>
                      <Input
                        id="gb-max"
                        type="number"
                        min="1"
                        className="mt-1"
                        value={gbMaxScore}
                        onChange={e => setGbMaxScore(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="gb-status" className="text-xs font-semibold">
                        Grade Status
                      </Label>
                      <Select value={gbStatus} onValueChange={v => setGbStatus(v as typeof gbStatus)}>
                        <SelectTrigger id="gb-status" className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="released">Released (Visible to Student)</SelectItem>
                          <SelectItem value="draft_grade">Draft Grade (Instructor Only)</SelectItem>
                          <SelectItem value="missing">Missing (Counts as 0)</SelectItem>
                          <SelectItem value="exempt">Exempt (Excluded from Denominator)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="gb-reason" className="text-xs font-semibold">
                        Audit Reason (Required if changing an already-released grade)
                      </Label>
                      <Input
                        id="gb-reason"
                        className="mt-1"
                        value={gbChangeReason}
                        onChange={e => setGbChangeReason(e.target.value)}
                        placeholder="e.g. Remarked Question 3 following rubric review"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        className="w-full bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                        disabled={!gbEnrollmentId || !gbTitle.trim() || upsertManualGradeMut.isPending}
                        onClick={() =>
                          upsertManualGradeMut.mutate({
                            courseOfferingId: offeringId,
                            enrollmentId: Number(gbEnrollmentId),
                            categoryId: gbCategoryId ? Number(gbCategoryId) : undefined,
                            title: gbTitle.trim(),
                            score: gbStatus === "exempt" ? null : Number(gbScore),
                            maxScore: Number(gbMaxScore) || 100,
                            status: gbStatus,
                            feedback: gbFeedback.trim() || undefined,
                            changeReason: gbChangeReason.trim() || undefined,
                          })
                        }
                      >
                        Save Gradebook Item
                      </Button>
                    </div>
                  </div>
                </ContentCard>
              ) : null}

              {/* Gradebook Rows */}
              {spaceData.gradebook.map(row => (
                <ContentCard key={row.enrollmentId} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e0d6] pb-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#98764a]">
                        {row.studentNumber} · Enrolment #{row.enrollmentId}
                      </p>
                      <h3 className="mt-0.5 font-serif text-xl text-[#132b45]">
                        {row.legalFirstName} {row.legalLastName}
                      </h3>
                      <p className="mt-1 text-xs text-[#586b7b]">{row.calculation.explanation}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="rounded-xl border border-[#c8d5e1] bg-[#eef4f8] px-4 py-2 text-right">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#294e6b]">
                          Calculated LMS Standing
                        </span>
                        <span className="font-serif text-xl font-bold text-[#132b45] tabular-nums">
                          {row.calculation.overallPercent !== null
                            ? `${row.calculation.overallPercent}% (${row.calculation.letterGrade})`
                            : "No Released Grades"}
                        </span>
                      </div>

                      <div className="rounded-xl border border-[#ded8cc] bg-[#faf8f3] px-4 py-2 text-right">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#98764a]">
                          Official MIS Transcript Record
                        </span>
                        <span className="font-serif text-xl font-bold text-[#203950] tabular-nums">
                          {row.gradeStatus === "published" && row.letterGrade
                            ? `${row.score}% (${row.letterGrade})`
                            : "Not Yet Published"}
                        </span>
                      </div>

                      {isStaff && row.calculation.roundedInstitutionalScore !== null ? (
                        <Button
                          type="button"
                          size="sm"
                          className="bg-[#167363] text-white hover:bg-[#125c4f]"
                          disabled={publishOfficialGradeMut.isPending}
                          onClick={() =>
                            publishOfficialGradeMut.mutate({
                              courseOfferingId: offeringId,
                              enrollmentId: row.enrollmentId,
                            })
                          }
                        >
                          <ShieldCheck className="mr-1.5 h-4 w-4" />
                          Publish to Official MIS Record
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Category Breakdown */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {row.calculation.categories.map(cat => (
                      <div key={cat.categoryId} className="rounded-xl border border-[#ece7de] bg-[#faf8f3] p-3 text-xs">
                        <div className="flex items-center justify-between font-semibold text-[#132b45]">
                          <span>{cat.name}</span>
                          <span className="tabular-nums">{cat.configuredWeightPercent}%</span>
                        </div>
                        <p className="mt-1 text-[#586b7b] tabular-nums">
                          Earned: {cat.earnedPoints} / {cat.possiblePoints} pts (
                          {cat.averagePercent !== null ? `${cat.averagePercent}%` : "N/A"})
                        </p>
                      </div>
                    ))}
                  </div>
                </ContentCard>
              ))}
            </div>
          ) : null}

          {/* TAB 5: DISCUSSIONS, ANNOUNCEMENTS & PRIVATE MESSAGES */}
          {activeTab === "communications" ? (
            <div className="space-y-6">
              {isStaff ? (
                <ContentCard>
                  <h3 className="font-serif text-lg text-[#132b45]">Post Course Announcement</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="ann-title" className="text-xs font-semibold">
                        Headline
                      </Label>
                      <Input
                        id="ann-title"
                        className="mt-1"
                        value={annTitle}
                        onChange={e => setAnnTitle(e.target.value)}
                        placeholder="e.g. Midterm Review Session & Lab 1 Office Hours"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="ann-body" className="text-xs font-semibold">
                        Announcement Message
                      </Label>
                      <Textarea
                        id="ann-body"
                        className="mt-1 min-h-20"
                        value={annBody}
                        onChange={e => setAnnBody(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={annPinned} onCheckedChange={v => setAnnPinned(Boolean(v))} />
                      <span>Pin to top of course space</span>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                      disabled={!annTitle.trim() || !annBody.trim() || createAnnouncementMut.isPending}
                      onClick={() =>
                        createAnnouncementMut.mutate({
                          courseOfferingId: offeringId,
                          title: annTitle.trim(),
                          body: annBody.trim(),
                          status: "published",
                          pinned: annPinned,
                        })
                      }
                    >
                      Post Announcement
                    </Button>
                  </div>
                </ContentCard>
              ) : null}

              <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                {/* Discussion Forum */}
                <ContentCard className="space-y-4">
                  <h3 className="font-serif text-xl text-[#132b45]">Course Discussion Forum</h3>
                  <div className="rounded-xl border border-[#e6e0d6] bg-[#faf8f3] p-4">
                    <Label htmlFor="disc-title" className="text-xs font-semibold">
                      Start a New Discussion Topic
                    </Label>
                    <Input
                      id="disc-title"
                      className="mt-1 bg-white"
                      value={discTitle}
                      onChange={e => setDiscTitle(e.target.value)}
                      placeholder="Topic title or question..."
                    />
                    <Label htmlFor="disc-body" className="mt-2 block text-xs font-semibold">
                      Discussion Prompt / Details
                    </Label>
                    <Textarea
                      id="disc-body"
                      className="mt-1 min-h-16 bg-white"
                      value={discBody}
                      onChange={e => setDiscBody(e.target.value)}
                      placeholder="Write your question or seminar reflection..."
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                      disabled={!discTitle.trim() || !discBody.trim() || createTopicMut.isPending}
                      onClick={() =>
                        createTopicMut.mutate({
                          courseOfferingId: offeringId,
                          title: discTitle.trim(),
                          body: discBody.trim(),
                        })
                      }
                    >
                      Post Discussion Thread
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {spaceData.discussions.map(topic => (
                      <article key={topic.id} className="rounded-xl border border-[#e2dcd0] bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              {topic.pinned ? <StatusPill tone="navy">Pinned</StatusPill> : null}
                              {topic.locked ? (
                                <StatusPill tone="warning">
                                  <Lock className="mr-1 h-3 w-3" /> Locked
                                </StatusPill>
                              ) : null}
                              {topic.moderationStatus !== "active" ? (
                                <StatusPill tone="risk">{topic.moderationStatus}</StatusPill>
                              ) : null}
                              <span className="text-[11px] text-[#687582]">
                                {topic.authorName} ({topic.authorRole})
                              </span>
                            </div>
                            <h4 className="mt-1 text-sm font-semibold text-[#132b45]">{topic.title}</h4>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() =>
                                flagDiscussionMut.mutate({
                                  courseOfferingId: offeringId,
                                  targetType: "topic",
                                  targetId: topic.id,
                                  reason: "Reported for instructor review",
                                })
                              }
                            >
                              <Flag className="mr-1 h-3 w-3" /> Flag
                            </Button>

                            {isStaff ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() =>
                                    moderateDiscussionMut.mutate({
                                      courseOfferingId: offeringId,
                                      targetType: "topic",
                                      targetId: topic.id,
                                      moderationStatus: "active",
                                      locked: !topic.locked,
                                    })
                                  }
                                >
                                  {topic.locked ? "Unlock" : "Lock"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() =>
                                    moderateDiscussionMut.mutate({
                                      courseOfferingId: offeringId,
                                      targetType: "topic",
                                      targetId: topic.id,
                                      moderationStatus: topic.moderationStatus === "hidden" ? "active" : "hidden",
                                    })
                                  }
                                >
                                  {topic.moderationStatus === "hidden" ? "Restore" : "Hide"}
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <p className="mt-2 text-xs leading-5 text-[#48596a]">{topic.body}</p>

                        {/* Replies */}
                        <div className="mt-3 space-y-2 border-l-2 border-[#e6e0d6] pl-3">
                          {topic.replies.map(reply => (
                            <div key={reply.id} className="rounded-lg bg-[#faf8f3] p-2.5 text-xs">
                              <div className="flex items-center justify-between text-[11px] text-[#687582]">
                                <span className="font-semibold text-[#203950]">
                                  {reply.authorName} ({reply.authorRole})
                                </span>
                                <span>{new Date(reply.createdAt).toLocaleDateString()}</span>
                              </div>
                              <p className="mt-1 text-[#48596a]">{reply.body}</p>
                            </div>
                          ))}

                          {!topic.locked ? (
                            <div className="flex gap-2 pt-1">
                              <Input
                                aria-label={`Reply to ${topic.title}`}
                                className="h-8 text-xs"
                                value={replyBodies[topic.id] || ""}
                                onChange={e =>
                                  setReplyBodies(prev => ({ ...prev, [topic.id]: e.target.value }))
                                }
                                placeholder="Write a reply..."
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={!replyBodies[topic.id]?.trim() || createReplyMut.isPending}
                                onClick={() =>
                                  createReplyMut.mutate({
                                    courseOfferingId: offeringId,
                                    topicId: topic.id,
                                    body: replyBodies[topic.id].trim(),
                                  })
                                }
                              >
                                Reply
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </ContentCard>

                {/* Private Course Messages */}
                <ContentCard className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-[#98764a]" aria-hidden="true" />
                    <h3 className="font-serif text-xl text-[#132b45]">Private Course Messages</h3>
                  </div>
                  <p className="text-xs text-[#687582]">
                    Send confidential 1-to-1 course messages between learners and assigned instructors.
                  </p>

                  <div className="space-y-3 rounded-xl border border-[#e6e0d6] bg-[#faf8f3] p-3.5">
                    <div>
                      <Label htmlFor="msg-recipient" className="text-xs font-semibold">
                        Recipient
                      </Label>
                      <Select value={msgRecipientId} onValueChange={setMsgRecipientId}>
                        <SelectTrigger id="msg-recipient" className="mt-1 bg-white">
                          <SelectValue placeholder="Choose recipient" />
                        </SelectTrigger>
                        <SelectContent>
                          {spaceData.messageRecipients.map(r => (
                            <SelectItem key={r.userId} value={String(r.userId)}>
                              {r.name} ({r.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="msg-subj" className="text-xs font-semibold">
                        Subject
                      </Label>
                      <Input
                        id="msg-subj"
                        className="mt-1 bg-white"
                        value={msgSubject}
                        onChange={e => setMsgSubject(e.target.value)}
                        placeholder="e.g. Question regarding Lab 1 rubric"
                      />
                    </div>
                    <div>
                      <Label htmlFor="msg-body" className="text-xs font-semibold">
                        Message
                      </Label>
                      <Textarea
                        id="msg-body"
                        className="mt-1 min-h-20 bg-white"
                        value={msgBody}
                        onChange={e => setMsgBody(e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                      disabled={
                        !msgRecipientId || !msgSubject.trim() || !msgBody.trim() || sendMessageMut.isPending
                      }
                      onClick={() =>
                        sendMessageMut.mutate({
                          courseOfferingId: offeringId,
                          recipientUserId: Number(msgRecipientId),
                          subject: msgSubject.trim(),
                          body: msgBody.trim(),
                        })
                      }
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" /> Send Private Message
                    </Button>
                  </div>

                  <div className="space-y-2.5">
                    {spaceData.messages.map(m => (
                      <div key={m.id} className="rounded-xl border border-[#e2dcd0] bg-white p-3 text-xs">
                        <div className="flex items-center justify-between text-[11px] text-[#687582]">
                          <span className="font-semibold text-[#132b45]">
                            {m.senderName} → {m.recipientName}
                          </span>
                          <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="mt-1 font-semibold text-[#203950]">{m.subject}</p>
                        <p className="mt-0.5 text-[#48596a]">{m.body}</p>
                      </div>
                    ))}
                  </div>
                </ContentCard>
              </div>
            </div>
          ) : null}

          {/* TAB 6: COURSE SETTINGS, COPY & ADMIN OPERATIONAL REPORTS */}
          {activeTab === "admin" && isStaff ? (
            <div className="space-y-6">
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Course Space Settings */}
                <ContentCard>
                  <h3 className="font-serif text-lg text-[#132b45]">Course Space Settings & Policies</h3>
                  <div className="mt-4 space-y-3">
                    <div>
                      <Label htmlFor="set-overview" className="text-xs font-semibold">
                        Course Overview
                      </Label>
                      <Textarea
                        id="set-overview"
                        className="mt-1 min-h-20"
                        value={settingsOverview}
                        onChange={e => setSettingsOverview(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="set-outcomes" className="text-xs font-semibold">
                        Learning Outcomes
                      </Label>
                      <Textarea
                        id="set-outcomes"
                        className="mt-1 min-h-20"
                        value={settingsOutcomes}
                        onChange={e => setSettingsOutcomes(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="set-hours" className="text-xs font-semibold">
                          Instructor Office Hours
                        </Label>
                        <Input
                          id="set-hours"
                          className="mt-1"
                          value={settingsOfficeHours}
                          onChange={e => setSettingsOfficeHours(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="set-penalty" className="text-xs font-semibold">
                          Default Late Penalty (% / day)
                        </Label>
                        <Input
                          id="set-penalty"
                          type="number"
                          min="0"
                          max="100"
                          className="mt-1"
                          value={settingsLatePenalty}
                          onChange={e => setSettingsLatePenalty(e.target.value)}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                      disabled={updateSettingsMut.isPending}
                      onClick={() =>
                        updateSettingsMut.mutate({
                          courseOfferingId: offeringId,
                          overview: settingsOverview.trim() || "Course overview",
                          learningOutcomes: settingsOutcomes.trim() || "Course learning outcomes",
                          officeHours: settingsOfficeHours.trim() || undefined,
                          latePenaltyPercentPerDay: Number(settingsLatePenalty) || 10,
                          allowDiscussions: true,
                          allowPrivateMessages: true,
                          retentionDays: 365,
                        })
                      }
                    >
                      Save Course Policies
                    </Button>
                  </div>
                </ContentCard>

                {/* Course Copy / Import from Another Offering */}
                <ContentCard>
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4 text-[#98764a]" aria-hidden="true" />
                    <h3 className="font-serif text-lg text-[#132b45]">
                      Copy / Import Structure from Another Offering
                    </h3>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#687582]">
                    Copies modules, rich pages, file links, question bank items, and quiz definitions into the active
                    course offering as drafts. Strictly excludes student enrolments, submissions, grades, and private
                    messages.
                  </p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <Label htmlFor="copy-source" className="text-xs font-semibold">
                        Source Course Offering
                      </Label>
                      <Select value={copySourceOfferingId} onValueChange={setCopySourceOfferingId}>
                        <SelectTrigger id="copy-source" className="mt-1">
                          <SelectValue placeholder="Choose source offering to copy from" />
                        </SelectTrigger>
                        <SelectContent>
                          {accessibleOfferings.data
                            ?.filter(o => o.id !== offeringId)
                            .map(o => (
                              <SelectItem key={o.id} value={String(o.id)}>
                                {o.courseCode} · Section {o.section} ({o.termName})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!copySourceOfferingId || executeCopyMut.isPending}
                      onClick={() =>
                        executeCopyMut.mutate({
                          sourceOfferingId: Number(copySourceOfferingId),
                          targetOfferingId: offeringId,
                        })
                      }
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy Course Structure into Active Offering
                    </Button>
                  </div>
                </ContentCard>
              </div>

              {/* Admin Operational Report & Audited CSV Export */}
              {isAdmin ? (
                <ContentCard>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#98764a]">
                        Institutional Governance & Analytics
                      </p>
                      <h3 className="mt-0.5 font-serif text-xl text-[#132b45]">
                        LMS Operational Participation, Completion & Assessment Report
                      </h3>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-[#132b45] text-white hover:bg-[#1c3b5c]"
                      disabled={exportCsvMut.isPending}
                      onClick={() => exportCsvMut.mutate({})}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Export Audited CSV Report
                    </Button>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[740px] text-left text-xs">
                      <thead className="border-b border-[#e2dcd0] text-[10px] uppercase tracking-[0.12em] text-[#687582]">
                        <tr>
                          <th className="py-2 pr-3">Offering</th>
                          <th className="py-2 pr-3">Modality</th>
                          <th className="py-2 pr-3">Enrolled Learners</th>
                          <th className="py-2 pr-3">Modules / Items</th>
                          <th className="py-2 pr-3">Submissions</th>
                          <th className="py-2 pr-3">Quiz Attempts</th>
                          <th className="py-2 pr-3">Avg Standing</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ece7de]">
                        {adminReport.data?.map(row => (
                          <tr key={row.offeringId}>
                            <td className="py-3 pr-3 font-semibold text-[#132b45]">
                              {row.courseCode} · Sec {row.section}
                              <span className="block text-[10px] font-normal text-[#687582]">
                                {row.courseTitle} ({row.termName})
                              </span>
                            </td>
                            <td className="py-3 pr-3 uppercase">{row.modality}</td>
                            <td className="py-3 pr-3 tabular-nums">{row.enrolledStudents}</td>
                            <td className="py-3 pr-3 tabular-nums">
                              {row.publishedModules} modules / {row.learningItemsCount} items
                            </td>
                            <td className="py-3 pr-3 tabular-nums">{row.submissionsCount}</td>
                            <td className="py-3 pr-3 tabular-nums">{row.quizAttemptsCount}</td>
                            <td className="py-3 pr-3 font-semibold tabular-nums">
                              {row.averageCourseGradePercent !== null ? `${row.averageCourseGradePercent}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ContentCard>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Active Timed Quiz Modal */}
      {activeQuizRunner && offeringId ? (
        <QuizRunnerModal
          quizTitle={activeQuizRunner.quizTitle}
          instructions={activeQuizRunner.instructions}
          timeLimitMinutes={activeQuizRunner.timeLimitMinutes}
          passMarkPercent={activeQuizRunner.passMarkPercent}
          questions={activeQuizRunner.questions}
          attemptId={activeQuizRunner.attemptId}
          startedAt={activeQuizRunner.startedAt}
          initialAnswers={activeQuizRunner.initialAnswers}
          isAutosaving={autosaveQuizMut.isPending}
          isSubmitting={submitQuizMut.isPending}
          onAutosave={answers =>
            autosaveQuizMut.mutate({
              courseOfferingId: offeringId,
              attemptId: activeQuizRunner.attemptId,
              answers,
            })
          }
          onSubmit={answers =>
            submitQuizMut.mutate({
              courseOfferingId: offeringId,
              attemptId: activeQuizRunner.attemptId,
              answers,
            })
          }
          onClose={() => setActiveQuizRunner(null)}
        />
      ) : null}
    </>
  );
}

export default function LearningProgress() {
  return (
    <DashboardLayout>
      <LearningProgressContent />
    </DashboardLayout>
  );
}
