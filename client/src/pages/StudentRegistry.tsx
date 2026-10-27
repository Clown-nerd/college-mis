import { useAuth } from "@/_core/hooks/useAuth";
import { ContentCard, EmptyState, PageHeading, StatusPill } from "@/components/MisUi";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { CirclePlus, ContactRound, Search, UserRoundPlus, UsersRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

const staffRoles = ["admin", "registrar"];

function statusTone(status: string) {
  if (status === "active") return "good" as const;
  if (status === "leave" || status === "applicant") return "warning" as const;
  if (status === "withdrawn") return "risk" as const;
  return "neutral" as const;
}

function StudentRegistryContent() {
  const { user } = useAuth();
  const allowed = staffRoles.includes(user?.role || "");
  const utils = trpc.useUtils();
  const studentsQuery = trpc.students.list.useQuery(undefined, { enabled: allowed });
  const catalogueQuery = trpc.catalogue.get.useQuery(undefined, { enabled: allowed });
  const [isOpen, setIsOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registration, setRegistration] = useState({ studentId: "", courseOfferingId: "" });
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    studentNumber: "",
    legalFirstName: "",
    legalLastName: "",
    institutionalEmail: "",
    phone: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    programmeId: "unassigned",
    status: "active" as "applicant" | "active" | "leave" | "graduated" | "withdrawn",
  });
  const createStudent = trpc.students.create.useMutation({
    onSuccess: async () => {
      toast.success("Student record created and logged.");
      setIsOpen(false);
      setForm({ studentNumber: "", legalFirstName: "", legalLastName: "", institutionalEmail: "", phone: "", emergencyContactName: "", emergencyContactPhone: "", programmeId: "unassigned", status: "active" });
      await utils.students.list.invalidate();
      await utils.dashboard.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const registerStudent = trpc.students.register.useMutation({
    onSuccess: async () => {
      toast.success("Course registration created and audited.");
      setRegistrationOpen(false);
      setRegistration({ studentId: "", courseOfferingId: "" });
      await utils.dashboard.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const filteredStudents = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return studentsQuery.data || [];
    return (studentsQuery.data || []).filter(student =>
      [student.studentNumber, student.legalFirstName, student.legalLastName, student.institutionalEmail, student.programmeCode]
        .filter(Boolean)
        .some(value => value?.toLowerCase().includes(normalized)),
    );
  }, [studentsQuery.data, search]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createStudent.mutate({
      studentNumber: form.studentNumber,
      legalFirstName: form.legalFirstName,
      legalLastName: form.legalLastName,
      institutionalEmail: form.institutionalEmail || undefined,
      phone: form.phone || undefined,
      emergencyContactName: form.emergencyContactName || undefined,
      emergencyContactPhone: form.emergencyContactPhone || undefined,
      programmeId: form.programmeId === "unassigned" ? undefined : Number(form.programmeId),
      status: form.status,
    });
  };

  if (!allowed) return <AccessDenied title="Student registry access is restricted" detail="Your institutional role cannot browse or amend other students’ records." />;

  return (
    <>
      <PageHeading eyebrow="Student lifecycle" title="Student registry" description="Maintain authoritative learner profiles, programme placement, enrollment status, and contact details in one controlled record.">
        <Button onClick={() => setRegistrationOpen(true)} variant="outline" className="h-10 rounded-xl px-4 text-sm font-semibold"><CirclePlus className="mr-2 h-4 w-4" />Register course</Button>
        <Button onClick={() => setIsOpen(true)} className="h-10 rounded-xl bg-[#132b45] px-4 text-sm font-semibold hover:bg-[#1c3b5c]"><UserRoundPlus className="mr-2 h-4 w-4" />New student</Button>
      </PageHeading>

      <ContentCard className="p-0">
        <div className="flex flex-col gap-4 border-b border-[#e6e0d6] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Institutional record set</p><p className="mt-1 text-sm text-[#66707a]">Search the active registry by name, student number, email, or programme.</p></div>
          <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e938f]" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search records" className="h-10 rounded-xl border-[#dcd5c9] bg-[#faf8f3] pl-9" /></div>
        </div>
        {studentsQuery.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3].map(item => <Skeleton className="h-14 rounded-xl bg-[#e9e4da]" key={item} />)}</div> : null}
        {!studentsQuery.isLoading && filteredStudents.length === 0 ? <div className="p-5"><EmptyState icon={<UsersRound className="h-5 w-5" />} title={search ? "No matching student records" : "No student records yet"} detail={search ? "Try a different identifier or name." : "Create the first authoritative student profile after configuring programmes and terms."} action={!search ? <Button onClick={() => setIsOpen(true)} variant="outline" className="rounded-xl"><CirclePlus className="mr-2 h-4 w-4" />Create student</Button> : undefined} /></div> : null}
        {filteredStudents.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left"><thead className="bg-[#faf8f3] text-[10px] font-bold uppercase tracking-[0.14em] text-[#837b6e]"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Programme</th><th className="px-5 py-3">Department</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Last updated</th></tr></thead><tbody className="divide-y divide-[#eee9e0]">{filteredStudents.map(student => <tr className="transition-colors hover:bg-[#fffcf6]" key={student.id}><td className="px-5 py-4"><p className="font-medium text-[#283f55]">{student.preferredName || `${student.legalFirstName} ${student.legalLastName}`}</p><p className="mt-1 text-xs text-[#7c8087]">{student.studentNumber} · {student.institutionalEmail || "No institutional email"}</p></td><td className="px-5 py-4 text-sm text-[#536575]">{student.programmeName || "Unassigned"}<span className="mt-1 block text-xs text-[#96968f]">{student.programmeCode || "—"}</span></td><td className="px-5 py-4 text-sm text-[#536575]">{student.departmentName || "—"}</td><td className="px-5 py-4"><StatusPill tone={statusTone(student.status)}>{student.status}</StatusPill></td><td className="px-5 py-4 text-xs text-[#7c8087]">{new Date(student.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div> : null}
      </ContentCard>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader><DialogTitle className="font-serif text-2xl tracking-[-0.03em]">Create student record</DialogTitle><DialogDescription>Required fields establish the core profile. Programme placement can be assigned after the academic catalogue is configured.</DialogDescription></DialogHeader>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Student number" required><Input required value={form.studentNumber} onChange={event => setForm(current => ({ ...current, studentNumber: event.target.value }))} placeholder="e.g., 2026-0001" /></Field>
              <Field label="Enrollment status" required><Select value={form.status} onValueChange={(value: typeof form.status) => setForm(current => ({ ...current, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["active", "applicant", "leave", "graduated", "withdrawn"].map(status => <SelectItem value={status} key={status}>{status}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Legal first name" required><Input required value={form.legalFirstName} onChange={event => setForm(current => ({ ...current, legalFirstName: event.target.value }))} /></Field>
              <Field label="Legal last name" required><Input required value={form.legalLastName} onChange={event => setForm(current => ({ ...current, legalLastName: event.target.value }))} /></Field>
              <Field label="Institutional email"><Input type="email" value={form.institutionalEmail} onChange={event => setForm(current => ({ ...current, institutionalEmail: event.target.value }))} /></Field>
              <Field label="Telephone"><Input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} /></Field>
              <Field label="Emergency contact name"><Input value={form.emergencyContactName} onChange={event => setForm(current => ({ ...current, emergencyContactName: event.target.value }))} /></Field>
              <Field label="Emergency contact telephone"><Input value={form.emergencyContactPhone} onChange={event => setForm(current => ({ ...current, emergencyContactPhone: event.target.value }))} /></Field>
              <div className="sm:col-span-2"><Field label="Programme"><Select value={form.programmeId} onValueChange={programmeId => setForm(current => ({ ...current, programmeId }))}><SelectTrigger><SelectValue placeholder="Assign later" /></SelectTrigger><SelectContent><SelectItem value="unassigned">Assign later</SelectItem>{(catalogueQuery.data?.programmes || []).map(programme => <SelectItem key={programme.id} value={String(programme.id)}>{programme.code} — {programme.name}</SelectItem>)}</SelectContent></Select></Field></div>
            </div>
            <DialogFooter className="mt-7"><Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsOpen(false)}>Cancel</Button><Button type="submit" className="rounded-xl bg-[#132b45] hover:bg-[#1c3b5c]" disabled={createStudent.isPending}>{createStudent.isPending ? "Creating…" : "Create record"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={registrationOpen} onOpenChange={setRegistrationOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <form onSubmit={event => { event.preventDefault(); registerStudent.mutate({ studentId: Number(registration.studentId), courseOfferingId: Number(registration.courseOfferingId) }); }}>
            <DialogHeader><DialogTitle className="font-serif text-2xl tracking-[-0.03em]">Create course registration</DialogTitle><DialogDescription>Register a student in an available course offering. Prerequisite and capacity policy checks should be configured to match the institution’s approved academic regulations.</DialogDescription></DialogHeader>
            <div className="mt-6 grid gap-4">
              <Field label="Student" required><Select value={registration.studentId} onValueChange={studentId => setRegistration(current => ({ ...current, studentId }))}><SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger><SelectContent>{(studentsQuery.data || []).map(student => <SelectItem key={student.id} value={String(student.id)}>{student.studentNumber} — {student.legalFirstName} {student.legalLastName}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Course offering" required><Select value={registration.courseOfferingId} onValueChange={courseOfferingId => setRegistration(current => ({ ...current, courseOfferingId }))}><SelectTrigger><SelectValue placeholder="Select course offering" /></SelectTrigger><SelectContent>{(catalogueQuery.data?.offerings || []).filter(offering => offering.status === "open").map(offering => <SelectItem key={offering.id} value={String(offering.id)}>{offering.courseCode} · {offering.termName} · {offering.section}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            <DialogFooter className="mt-7"><Button type="button" variant="outline" className="rounded-xl" onClick={() => setRegistrationOpen(false)}>Cancel</Button><Button type="submit" disabled={!registration.studentId || !registration.courseOfferingId || registerStudent.isPending} className="rounded-xl bg-[#132b45] hover:bg-[#1c3b5c]">{registerStudent.isPending ? "Registering…" : "Create registration"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label className="text-xs font-semibold text-[#48596a]">{label}{required ? <span className="ml-1 text-[#af3f38]">*</span> : null}</Label>{children}</div>;
}

function AccessDenied({ title, detail }: { title: string; detail: string }) {
  return <><PageHeading eyebrow="Controlled access" title={title} description={detail} /><EmptyState icon={<ContactRound className="h-5 w-5" />} title="Use the workspace assigned to your role" detail="The navigation menu has been tailored to the privileges available to your institutional account." /></>;
}

export default function StudentRegistry() {
  return <DashboardLayout><StudentRegistryContent /></DashboardLayout>;
}
