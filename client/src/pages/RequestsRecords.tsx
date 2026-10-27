import { useAuth } from "@/_core/hooks/useAuth";
import { ContentCard, EmptyState, PageHeading, StatusPill } from "@/components/MisUi";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ClipboardList, FileCheck2, FileText, Plus, UploadCloud } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

const registrarRoles = ["admin", "registrar", "non_teaching"];
const requestTypes = ["document", "registration", "finance", "personal_details", "other"] as const;
const requestStatuses = ["submitted", "in_review", "approved", "rejected", "completed"] as const;

function statusTone(status: string) {
  if (status === "completed" || status === "approved") return "good" as const;
  if (status === "rejected") return "risk" as const;
  if (status === "in_review") return "warning" as const;
  return "navy" as const;
}

function RequestsRecordsContent() {
  const { user } = useAuth();
  const student = user?.role === "student" || user?.role === "user";
  const canManage = registrarRoles.includes(user?.role || "");
  const allowed = student || canManage;
  const utils = trpc.useUtils();
  const requests = trpc.requests.list.useQuery(undefined, { enabled: allowed });
  const [open, setOpen] = useState(false);
  const [documentRequestId, setDocumentRequestId] = useState<number | null>(null);
  const [form, setForm] = useState({ type: "document" as (typeof requestTypes)[number], title: "", detail: "" });
  const create = trpc.requests.create.useMutation({
    onSuccess: async () => {
      toast.success("Request submitted and audited.");
      setOpen(false);
      setForm({ type: "document", title: "", detail: "" });
      await utils.requests.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.requests.updateStatus.useMutation({
    onSuccess: async () => {
      toast.success("Request status updated and audited.");
      await utils.requests.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (!allowed) return <><PageHeading eyebrow="Controlled access" title="Requests & records" description="Your role is not assigned to student service workflows." /><EmptyState icon={<ClipboardList className="h-5 w-5" />} title="Requests are role-limited" detail="Students can submit and track their own service requests; registry staff manage the institutional queue." /></>;

  return (
    <>
      <PageHeading eyebrow={student ? "Student self-service" : "Student services"} title="Requests & records" description={student ? "Submit and track requests linked to your own secure student profile." : "Review the service queue, document each resolution, and maintain transparent status history."}>
        {student ? <Button onClick={() => setOpen(true)} className="h-10 rounded-xl bg-[#132b45] px-4 text-sm font-semibold hover:bg-[#1c3b5c]"><Plus className="mr-2 h-4 w-4" />New request</Button> : <StatusPill tone="navy">Registry queue</StatusPill>}
      </PageHeading>
      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <ContentCard className="bg-[#132b45] text-white"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Document workflow</p><h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">Traceable by design.</h2><p className="mt-4 text-sm leading-6 text-[#c5d1dc]">Approved PDF, JPG, and PNG files up to 5 MB are stored as managed objects, while request-linked document metadata preserves a retention category and audit event.</p><div className="mt-6 flex items-center gap-2 text-xs text-[#e4c969]"><UploadCloud className="h-4 w-4" />Request-scoped secure storage</div></ContentCard>
        <ContentCard><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Service principles</p><h2 className="mt-2 font-serif text-2xl tracking-[-0.03em] text-[#203950]">Clear requests, visible ownership.</h2><p className="mt-3 text-sm leading-6 text-[#72747f]">The workflow keeps the student’s submitted issue separate from staff approval. The college must still establish its retention schedule, legal-hold process, and records-destruction policy before using this with live documents.</p></ContentCard>
      </section>
      <ContentCard className="mt-6 p-0">
        <div className="flex items-center gap-3 border-b border-[#e6e0d6] p-5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf1f5] text-[#315875]"><FileCheck2 className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Service register</p><h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-[#203950]">{student ? "Your open and completed requests" : "Institutional request queue"}</h2></div></div>
        {requests.data?.length ? <div className="divide-y divide-[#eee9e0]">{requests.data.map(request => <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" key={request.id}><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[#344a60]">{request.title}</p><StatusPill tone={statusTone(request.status)}>{request.status.replace("_", " ")}</StatusPill></div><p className="mt-1 text-xs leading-5 text-[#858077]">{request.type.replace("_", " ")} · {canManage ? `${request.legalFirstName} ${request.legalLastName} · ${request.studentNumber}` : "Submitted by you"} · Updated {new Date(request.updatedAt).toLocaleDateString()}</p>{request.detail ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[#666f79]">{request.detail}</p> : null}</div><div className="flex shrink-0 flex-wrap gap-2">{canManage ? <Select value={request.status} onValueChange={status => update.mutate({ requestId: request.id, status: status as (typeof requestStatuses)[number] })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{requestStatuses.map(status => <SelectItem key={status} value={status}>{status.replace("_", " ")}</SelectItem>)}</SelectContent></Select> : null}<Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => setDocumentRequestId(request.id)}><FileText className="mr-1.5 h-3.5 w-3.5" />Documents</Button></div></div>)}</div> : <div className="p-5"><EmptyState icon={<ClipboardList className="h-5 w-5" />} title={student ? "No service requests yet" : "No service requests in the queue"} detail={student ? "Submit a controlled request for a document, registration, finance, or personal detail change." : "Student service requests will appear here as students submit them through their own workspace."} action={student ? <Button onClick={() => setOpen(true)} variant="outline" className="rounded-xl"><Plus className="mr-2 h-4 w-4" />New request</Button> : undefined} /></div>}
      </ContentCard>
      <RequestDialog open={open} onOpenChange={setOpen} form={form} setForm={setForm} onSubmit={event => { event.preventDefault(); create.mutate(form); }} isPending={create.isPending} />
      <DocumentDialog requestId={documentRequestId} onOpenChange={openValue => !openValue && setDocumentRequestId(null)} />
    </>
  );
}

function RequestDialog({ open, onOpenChange, form, setForm, onSubmit, isPending }: { open: boolean; onOpenChange: (open: boolean) => void; form: { type: (typeof requestTypes)[number]; title: string; detail: string }; setForm: (next: { type: (typeof requestTypes)[number]; title: string; detail: string }) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; isPending: boolean }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-2xl sm:max-w-lg"><form onSubmit={onSubmit}><DialogHeader><DialogTitle className="font-serif text-2xl tracking-[-0.03em]">Submit service request</DialogTitle><DialogDescription>Your request is linked to your protected student profile and visible only to assigned institutional staff.</DialogDescription></DialogHeader><div className="mt-6 grid gap-4"><Field label="Request type"><Select value={form.type} onValueChange={type => setForm({ ...form, type: type as (typeof requestTypes)[number] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{requestTypes.map(type => <SelectItem value={type} key={type}>{type.replace("_", " ")}</SelectItem>)}</SelectContent></Select></Field><Field label="Request title"><Input required minLength={3} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Briefly describe what you need" /></Field><Field label="Supporting detail"><Textarea value={form.detail} onChange={event => setForm({ ...form, detail: event.target.value })} placeholder="Provide helpful context. Do not include unnecessary sensitive personal information." /></Field></div><DialogFooter className="mt-7"><Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={isPending} className="rounded-xl bg-[#132b45] hover:bg-[#1c3b5c]">{isPending ? "Submitting…" : "Submit request"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function DocumentDialog({ requestId, onOpenChange }: { requestId: number | null; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const documents = trpc.requests.documents.useQuery({ requestId: requestId || 0 }, { enabled: requestId !== null });
  const [file, setFile] = useState<File | null>(null);
  const [retentionCategory, setRetentionCategory] = useState("student_service_record");
  const upload = trpc.requests.uploadDocument.useMutation({ onSuccess: async () => { toast.success("Document stored and audited."); setFile(null); await utils.requests.documents.invalidate(); }, onError: error => toast.error(error.message) });
  const uploadFile = () => {
    if (!file || requestId === null) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Documents must be 5 MB or smaller."); return; }
    const reader = new FileReader();
    reader.onload = () => { const result = typeof reader.result === "string" ? reader.result.split(",")[1] : undefined; if (!result) { toast.error("The selected file could not be read."); return; } upload.mutate({ requestId, name: file.name, mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png", contentBase64: result, retentionCategory }); };
    reader.readAsDataURL(file);
  };
  return <Dialog open={requestId !== null} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg"><DialogHeader><DialogTitle className="font-serif text-2xl tracking-[-0.03em]">Request documents</DialogTitle><DialogDescription>Documents are accessible only to the request’s student and authorised registry staff.</DialogDescription></DialogHeader><div className="mt-6 grid gap-4"><Field label="Upload file"><Input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => setFile(event.target.files?.[0] || null)} /></Field><Field label="Retention category"><Select value={retentionCategory} onValueChange={setRetentionCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="student_service_record">Student service record</SelectItem><SelectItem value="admissions_supporting_document">Admissions supporting document</SelectItem><SelectItem value="financial_supporting_document">Financial supporting document</SelectItem></SelectContent></Select></Field><Button onClick={uploadFile} disabled={!file || upload.isPending} className="rounded-xl bg-[#132b45] hover:bg-[#1c3b5c]">{upload.isPending ? "Uploading…" : "Upload document"}</Button></div><div className="mt-6 border-t border-[#e6e0d6] pt-5"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Stored documents</p><div className="mt-3 divide-y divide-[#eee9e0]">{documents.data?.length ? documents.data.map(document => <a key={document.id} href={document.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 py-3 text-sm text-[#315875] hover:text-[#132b45]"><span><FileText className="mr-2 inline h-4 w-4" />{document.name}</span><span className="text-xs text-[#878279]">{document.retentionCategory.replaceAll("_", " ")}</span></a>) : <p className="py-4 text-sm text-[#777a84]">No documents stored for this request.</p>}</div></div><DialogFooter className="mt-5"><Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label className="text-xs font-semibold text-[#48596a]">{label}</Label>{children}</div>; }
export default function RequestsRecords() { return <DashboardLayout><RequestsRecordsContent /></DashboardLayout>; }
