import { StatusPill } from "@/components/MisUi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, Clock, Save, Send, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

export type QuizQuestionView = {
  id: number;
  topic: string;
  questionType: "multiple_choice" | "multiple_select" | "true_false" | "short_answer" | "essay";
  prompt: string;
  options: string[];
  correctAnswer: string | string[] | null;
  explanation: string | null;
  points: number;
};

export function QuizRunnerModal({
  quizTitle,
  instructions,
  timeLimitMinutes,
  passMarkPercent,
  questions,
  attemptId,
  startedAt,
  initialAnswers,
  isSubmitting,
  isAutosaving,
  onAutosave,
  onSubmit,
  onClose,
}: {
  quizTitle: string;
  instructions: string | null;
  timeLimitMinutes: number;
  passMarkPercent: number;
  questions: QuizQuestionView[];
  attemptId: number;
  startedAt: Date | string;
  initialAnswers: Record<string, string | string[]>;
  isSubmitting: boolean;
  isAutosaving: boolean;
  onAutosave: (answers: Record<string, string | string[]>) => void;
  onSubmit: (answers: Record<string, string | string[]>) => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(initialAnswers || {});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    const startMs = new Date(startedAt).getTime();
    const endMs = startMs + timeLimitMinutes * 60_000;
    return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      const startMs = new Date(startedAt).getTime();
      const endMs = startMs + timeLimitMinutes * 60_000;
      const secs = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setRemainingSeconds(secs);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, timeLimitMinutes]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const setSingleAnswer = (questionId: number, value: string) => {
    setAnswers(prev => ({ ...prev, [String(questionId)]: value }));
  };

  const toggleMultiAnswer = (questionId: number, option: string, checked: boolean) => {
    setAnswers(prev => {
      const current = prev[String(questionId)];
      const list = Array.isArray(current) ? [...current] : [];
      if (checked && !list.includes(option)) list.push(option);
      if (!checked) {
        const idx = list.indexOf(option);
        if (idx !== -1) list.splice(idx, 1);
      }
      return { ...prev, [String(questionId)]: list };
    });
  };

  const answeredCount = questions.filter(q => {
    const val = answers[String(q.id)];
    if (Array.isArray(val)) return val.length > 0;
    return Boolean(val && String(val).trim().length > 0);
  }).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#132b45]/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-runner-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#ded8cc] bg-[#fdfcf9] shadow-2xl">
        {/* Header with live countdown */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e0d6] bg-[#faf8f3] px-6 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#98764a]">
              Active Quiz Attempt #{attemptId} · Pass Mark {passMarkPercent}%
            </p>
            <h2 id="quiz-runner-title" className="mt-1 font-serif text-xl text-[#132b45]">
              {quizTitle}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 font-mono text-sm font-semibold tabular-nums ${
                remainingSeconds < 120
                  ? "border-[#f1c7c4] bg-[#fff1f0] text-[#af3f38]"
                  : "border-[#c8d5e1] bg-[#eef4f8] text-[#193a56]"
              }`}
              aria-live="polite"
              aria-label="Time remaining"
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span>{formatTimer(remainingSeconds)}</span>
            </div>

            <StatusPill tone="neutral">
              {answeredCount} / {questions.length} answered
            </StatusPill>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close quiz window (progress remains saved)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Proctoring & Connection Recovery Disclosure */}
          <div className="flex items-start gap-3 rounded-xl border border-[#ead49a] bg-[#fff8e5] p-3.5 text-xs text-[#6f5011]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6217]" aria-hidden="true" />
            <div>
              <p className="font-semibold">Assessment Integrity & Connection Recovery Notice</p>
              <p className="mt-0.5 leading-5">
                Start time, deadline, attempt count, and timer are enforced on the server. If your connection drops,
                reopening this quiz resumes your active attempt with your last autosaved answers. This web browser
                assessment does not claim OS-level lockdown or hardware proctoring.
              </p>
            </div>
          </div>

          {instructions ? (
            <div className="rounded-xl border border-[#e6e0d6] bg-[#f7f5f0] p-4 text-xs leading-6 text-[#48596a]">
              <p className="font-semibold text-[#203950]">Instructions</p>
              <p className="mt-1 whitespace-pre-wrap">{instructions}</p>
            </div>
          ) : null}

          {remainingSeconds === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-[#f1c7c4] bg-[#fff1f0] p-4 text-xs font-medium text-[#af3f38]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Time limit has expired. Submit your saved answers now.</span>
            </div>
          ) : null}

          <ol className="space-y-5">
            {questions.map((q, index) => {
              const currentVal = answers[String(q.id)];
              return (
                <li key={q.id} className="rounded-2xl border border-[#e2dcd0] bg-white p-5 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0ece3] pb-3">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#98764a]">
                      Question {index + 1} · {q.topic} ({q.questionType.replace("_", " ")})
                    </span>
                    <StatusPill tone="navy">{q.points} pts</StatusPill>
                  </div>

                  <p className="mt-3 text-sm font-medium leading-6 text-[#132b45]">{q.prompt}</p>

                  <div className="mt-4 space-y-2.5">
                    {(q.questionType === "multiple_choice" || q.questionType === "true_false") &&
                      q.options.map((opt, optIdx) => {
                        const inputId = `q-${q.id}-opt-${optIdx}`;
                        const checked = currentVal === opt;
                        return (
                          <label
                            key={inputId}
                            htmlFor={inputId}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-xs transition-colors ${
                              checked
                                ? "border-[#294e6b] bg-[#eef4f8] font-semibold text-[#132b45]"
                                : "border-[#e6e0d6] bg-[#fdfcf9] text-[#48596a] hover:bg-[#f7f4ee]"
                            }`}
                          >
                            <input
                              id={inputId}
                              type="radio"
                              name={`question-${q.id}`}
                              value={opt}
                              checked={checked}
                              onChange={() => setSingleAnswer(q.id, opt)}
                              className="h-4 w-4 accent-[#132b45]"
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}

                    {q.questionType === "multiple_select" &&
                      q.options.map((opt, optIdx) => {
                        const inputId = `q-${q.id}-ms-${optIdx}`;
                        const selectedList = Array.isArray(currentVal) ? currentVal : [];
                        const checked = selectedList.includes(opt);
                        return (
                          <div
                            key={inputId}
                            className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-xs ${
                              checked
                                ? "border-[#294e6b] bg-[#eef4f8] font-semibold text-[#132b45]"
                                : "border-[#e6e0d6] bg-[#fdfcf9] text-[#48596a]"
                            }`}
                          >
                            <Checkbox
                              id={inputId}
                              checked={checked}
                              onCheckedChange={val => toggleMultiAnswer(q.id, opt, Boolean(val))}
                            />
                            <Label htmlFor={inputId} className="cursor-pointer text-xs font-normal">
                              {opt}
                            </Label>
                          </div>
                        );
                      })}

                    {q.questionType === "short_answer" && (
                      <div>
                        <Label htmlFor={`q-sa-${q.id}`} className="sr-only">
                          Short answer for question {index + 1}
                        </Label>
                        <Input
                          id={`q-sa-${q.id}`}
                          value={typeof currentVal === "string" ? currentVal : ""}
                          onChange={e => setSingleAnswer(q.id, e.target.value)}
                          placeholder="Type your concise answer..."
                        />
                      </div>
                    )}

                    {q.questionType === "essay" && (
                      <div>
                        <Label htmlFor={`q-essay-${q.id}`} className="sr-only">
                          Essay response for question {index + 1}
                        </Label>
                        <Textarea
                          id={`q-essay-${q.id}`}
                          className="min-h-28"
                          value={typeof currentVal === "string" ? currentVal : ""}
                          onChange={e => setSingleAnswer(q.id, e.target.value)}
                          placeholder="Write your structured analytical response..."
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Footer actions */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e0d6] bg-[#faf8f3] px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-[#687582]">
            <CheckCircle2 className="h-4 w-4 text-[#167363]" aria-hidden="true" />
            <span>Answers can be autosaved at any time during your attempt window.</span>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isAutosaving || isSubmitting}
              onClick={() => onAutosave(answers)}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {isAutosaving ? "Saving..." : "Autosave Progress"}
            </Button>

            <Button
              type="button"
              size="sm"
              className="bg-[#132b45] text-white hover:bg-[#1c3b5c]"
              disabled={isSubmitting}
              onClick={() => onSubmit(answers)}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {isSubmitting ? "Submitting Quiz..." : "Submit Final Attempt"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
