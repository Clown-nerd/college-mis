import { useAuth } from "@/_core/hooks/useAuth";
import { ContentCard, EmptyState, PageHeading, StatusPill } from "@/components/MisUi";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { filterAndSortLedger, ledgerToCsv } from "../../../shared/ledger";
import { ArrowDownUp, BadgeDollarSign, CircleDollarSign, Download, FileWarning, Filter, Plus } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

const formatMoney = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

function invoiceTone(status: string) {
  if (status === "paid" || status === "waived") return "good" as const;
  if (status === "overdue") return "risk" as const;
  if (status === "part_paid") return "warning" as const;
  return "navy" as const;
}

function FinanceHubContent() {
  const { user } = useAuth();
  const financeStaff = user?.role === "admin" || user?.role === "finance";
  const student = user?.role === "student" || user?.role === "user";
  const utils = trpc.useUtils();
  const institutionalInvoices = trpc.finance.invoices.useQuery(undefined, { enabled: financeStaff });
  const personalInvoices = trpc.finance.myInvoices.useQuery(undefined, { enabled: student });
  const institutionalPayments = trpc.finance.payments.useQuery(undefined, { enabled: financeStaff });
  const personalPayments = trpc.finance.myPayments.useQuery(undefined, { enabled: student });
  const reporting = trpc.finance.reporting.useQuery(undefined, { enabled: financeStaff });
  const studentOptions = trpc.finance.studentOptions.useQuery(undefined, { enabled: financeStaff });
  const catalogue = trpc.catalogue.get.useQuery(undefined, { enabled: financeStaff });
  const scholarships = trpc.finance.scholarships.useQuery(undefined, { enabled: financeStaff });
  const [open, setOpen] = useState(false);
  const [scholarshipOpen, setScholarshipOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState("all");
  const [ledgerSort, setLedgerSort] = useState("latest");
  const [form, setForm] = useState({ studentId: "", termId: "none", invoiceNumber: "", amount: "", dueAt: "" });
  const [scholarshipForm, setScholarshipForm] = useState({ studentId: "", termId: "none", name: "", amount: "" });
  const [paymentForm, setPaymentForm] = useState({ invoiceId: "", amount: "" });
  const create = trpc.finance.createInvoice.useMutation({
    onSuccess: async () => {
      toast.success("Invoice issued and audited.");
      setOpen(false);
      setForm({ studentId: "", termId: "none", invoiceNumber: "", amount: "", dueAt: "" });
      await utils.finance.invoices.invalidate();
      await utils.dashboard.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const createScholarship = trpc.finance.createScholarship.useMutation({
    onSuccess: async () => {
      toast.success("Scholarship approved and audited.");
      setScholarshipOpen(false);
      setScholarshipForm({ studentId: "", termId: "none", name: "", amount: "" });
      await utils.finance.scholarships.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const waive = trpc.finance.waiveInvoice.useMutation({
    onSuccess: async () => {
      toast.success("Invoice waived and audited.");
      await utils.finance.invoices.invalidate();
      await utils.dashboard.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const simulatePayment = trpc.finance.simulatePayment.useMutation({
    onSuccess: async response => {
      toast.success(`Simulated settlement complete: ${response.gatewayReference}`);
      setPaymentOpen(false);
      setPaymentForm({ invoiceId: "", amount: "" });
      await Promise.all([utils.finance.myInvoices.invalidate(), utils.finance.myPayments.invalidate(), utils.dashboard.overview.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const reconcile = trpc.finance.reconcilePayment.useMutation({
    onSuccess: async () => {
      toast.success("Payment reconciliation status updated and audited.");
      await Promise.all([utils.finance.payments.invalidate(), utils.finance.reporting.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate({
      studentId: Number(form.studentId),
      termId: form.termId === "none" ? undefined : Number(form.termId),
      invoiceNumber: form.invoiceNumber,
      amountCents: Math.round(Number(form.amount) * 100),
      dueAt: form.dueAt ? new Date(form.dueAt) : undefined,
    });
  };
  const submitScholarship = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createScholarship.mutate({
      studentId: Number(scholarshipForm.studentId),
      termId: scholarshipForm.termId === "none" ? undefined : Number(scholarshipForm.termId),
      name: scholarshipForm.name,
      amountCents: Math.round(Number(scholarshipForm.amount) * 100),
    });
  };
  const submitPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    simulatePayment.mutate({ invoiceId: Number(paymentForm.invoiceId), amountCents: Math.round(Number(paymentForm.amount) * 100) });
  };
  const displayedPayments = useMemo(() => filterAndSortLedger(institutionalPayments.data || [], ledgerFilter, ledgerSort), [institutionalPayments.data, ledgerFilter, ledgerSort]);
  const exportLedger = () => { const url = URL.createObjectURL(new Blob([ledgerToCsv(displayedPayments)], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "college-mis-payment-reconciliation.csv"; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); toast.success("Filtered payment ledger exported as CSV."); };

  if (!financeStaff && !student) {
    return <><PageHeading eyebrow="Controlled access" title="Finance hub" description="Your current role is not assigned to institutional finance or student financial self-service." /><EmptyState icon={<CircleDollarSign className="h-5 w-5" />} title="Finance access is restricted" detail="Finance staff manage invoices, scholarships, waivers, and reports. Students only view their own account information." /></>;
  }

  const personalBalance = (personalInvoices.data || []).reduce((total, invoice) => total + invoice.balanceCents, 0);
  const institutionalBalance = (institutionalInvoices.data || []).reduce((total, invoice) => total + invoice.balanceCents, 0);

  return (
    <>
      <PageHeading
        eyebrow={financeStaff ? "Financial operations" : "Student self-service"}
        title={financeStaff ? "Finance hub" : "My financial account"}
        description={financeStaff ? "Issue and monitor invoice records, approve scholarship awards, and apply auditable invoice waivers. Payment settlement remains a controlled institutional extension." : "Review only your own issued invoices and visible balance information."}
      >
        {financeStaff ? <><Button onClick={() => setScholarshipOpen(true)} variant="outline" className="h-10 rounded-xl px-4 text-sm font-semibold">Approve scholarship</Button><Button onClick={() => setOpen(true)} className="h-10 rounded-xl bg-[#132b45] px-4 text-sm font-semibold hover:bg-[#1c3b5c]"><Plus className="mr-2 h-4 w-4" />Issue invoice</Button></> : <Button onClick={() => setPaymentOpen(true)} className="h-10 rounded-xl bg-[#132b45] px-4 text-sm font-semibold hover:bg-[#1c3b5c]"><CircleDollarSign className="mr-2 h-4 w-4" />Simulate payment</Button>}
      </PageHeading>

      <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <ContentCard className="bg-[#132b45] text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7bd71]">Balance view</p>
          <p className="mt-4 font-serif text-5xl tracking-[-0.05em]">{formatMoney(financeStaff ? institutionalBalance : personalBalance)}</p>
          <p className="mt-3 text-sm leading-6 text-[#c5d1dc]">{financeStaff ? "Aggregate outstanding balance across displayed invoice records." : "Balance based on invoices connected to your secure student account."}</p>
        </ContentCard>
        <ContentCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">P1 finance foundations</p>
          <h2 className="mt-2 font-serif text-2xl tracking-[-0.03em] text-[#203950]">Traceable financial records</h2>
          <p className="mt-3 text-sm leading-6 text-[#72747f]">The data model supports invoices, balances, scholarship awards, and waivers with audited issuance. A payment gateway, bank reconciliation process, currency policy, and financial-aid regulations must be configured before collecting payments.</p>
        </ContentCard>
      </section>

      <ContentCard className="mt-6 p-0">
        <div className="flex items-center gap-3 border-b border-[#e6e0d6] p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf1f5] text-[#315875]"><BadgeDollarSign className="h-4 w-4" /></span>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Invoice register</p><h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-[#203950]">{financeStaff ? "Institutional receivables" : "Your invoices"}</h2></div>
        </div>
        {financeStaff ? <InstitutionalInvoiceTable invoices={institutionalInvoices.data || []} onWaive={invoiceId => waive.mutate({ invoiceId })} waiverPending={waive.isPending} /> : <PersonalInvoiceTable invoices={personalInvoices.data || []} />}
      </ContentCard>
      {financeStaff ? <><section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Settled simulations" value={formatMoney(reporting.data?.settledCents || 0)} /><Metric label="Awaiting reconciliation" value={String(reporting.data?.pendingCount || 0)} /><Metric label="Reconciled" value={String(reporting.data?.reconciledCount || 0)} /><Metric label="Exceptions" value={String(reporting.data?.exceptionCount || 0)} /></section><ContentCard className="mt-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Reconciliation controls</p><h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-[#203950]">Filter, sort, and export</h2></div><div className="flex flex-wrap gap-2"><div className="w-44"><p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#837b6e]"><Filter className="h-3 w-3" />Status</p><Select value={ledgerFilter} onValueChange={setLedgerFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All payments</SelectItem><SelectItem value="pending">Pending review</SelectItem><SelectItem value="reconciled">Reconciled</SelectItem><SelectItem value="exception">Exceptions</SelectItem></SelectContent></Select></div><div className="w-44"><p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#837b6e]"><ArrowDownUp className="h-3 w-3" />Sort</p><Select value={ledgerSort} onValueChange={setLedgerSort}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="latest">Latest settled</SelectItem><SelectItem value="amount_high">Amount: high to low</SelectItem><SelectItem value="amount_low">Amount: low to high</SelectItem></SelectContent></Select></div><Button variant="outline" onClick={exportLedger} disabled={!displayedPayments.length} className="h-10 self-end rounded-xl"><Download className="mr-2 h-4 w-4" />Export CSV</Button></div></div></ContentCard><PaymentRegister payments={displayedPayments} onReconcile={(paymentId, status) => reconcile.mutate({ paymentId, status })} reconciling={reconcile.isPending} /></> : <PaymentRegister payments={personalPayments.data || []} />}
      {financeStaff ? <ScholarshipRegister scholarships={scholarships.data || []} /> : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader><DialogTitle className="font-serif text-2xl tracking-[-0.03em]">Issue invoice</DialogTitle><DialogDescription>Issue a controlled receivable record. This action does not collect a payment or process a scholarship award.</DialogDescription></DialogHeader>
            <div className="mt-6 grid gap-4">
              <Field label="Student"><Select value={form.studentId} onValueChange={studentId => setForm(current => ({ ...current, studentId }))}><SelectTrigger><SelectValue placeholder="Select a student" /></SelectTrigger><SelectContent>{studentOptions.data?.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.studentNumber} — {item.legalFirstName} {item.legalLastName}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Term"><Select value={form.termId} onValueChange={termId => setForm(current => ({ ...current, termId }))}><SelectTrigger><SelectValue placeholder="Optional academic term" /></SelectTrigger><SelectContent><SelectItem value="none">No term association</SelectItem>{catalogue.data?.terms.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Invoice number"><Input required value={form.invoiceNumber} onChange={event => setForm(current => ({ ...current, invoiceNumber: event.target.value }))} placeholder="INV-2026-001" /></Field><Field label="Amount (USD)"><Input required type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></Field></div>
              <Field label="Due date"><Input type="date" value={form.dueAt} onChange={event => setForm(current => ({ ...current, dueAt: event.target.value }))} /></Field>
            </div>
            <DialogFooter className="mt-7"><Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={!form.studentId || create.isPending} className="rounded-xl bg-[#132b45] hover:bg-[#1c3b5c]">{create.isPending ? "Issuing…" : "Issue invoice"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={scholarshipOpen} onOpenChange={setScholarshipOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg"><form onSubmit={submitScholarship}><DialogHeader><DialogTitle className="font-serif text-2xl tracking-[-0.03em]">Approve scholarship</DialogTitle><DialogDescription>Record a financial-aid award for an eligible student. Applying an award to a balance must follow the college’s approved financial-aid policy.</DialogDescription></DialogHeader><div className="mt-6 grid gap-4"><Field label="Student"><Select value={scholarshipForm.studentId} onValueChange={studentId => setScholarshipForm(current => ({ ...current, studentId }))}><SelectTrigger><SelectValue placeholder="Select a student" /></SelectTrigger><SelectContent>{studentOptions.data?.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.studentNumber} — {item.legalFirstName} {item.legalLastName}</SelectItem>)}</SelectContent></Select></Field><Field label="Term"><Select value={scholarshipForm.termId} onValueChange={termId => setScholarshipForm(current => ({ ...current, termId }))}><SelectTrigger><SelectValue placeholder="Optional academic term" /></SelectTrigger><SelectContent><SelectItem value="none">No term association</SelectItem>{catalogue.data?.terms.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Award name"><Input required value={scholarshipForm.name} onChange={event => setScholarshipForm(current => ({ ...current, name: event.target.value }))} placeholder="Merit Scholarship" /></Field><Field label="Amount (USD)"><Input required type="number" min="0.01" step="0.01" value={scholarshipForm.amount} onChange={event => setScholarshipForm(current => ({ ...current, amount: event.target.value }))} /></Field></div></div><DialogFooter className="mt-7"><Button type="button" variant="outline" className="rounded-xl" onClick={() => setScholarshipOpen(false)}>Cancel</Button><Button type="submit" disabled={!scholarshipForm.studentId || createScholarship.isPending} className="rounded-xl bg-[#132b45] hover:bg-[#1c3b5c]">{createScholarship.isPending ? "Approving…" : "Approve scholarship"}</Button></DialogFooter></form></DialogContent>
      </Dialog>
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg"><form onSubmit={submitPayment}><DialogHeader><DialogTitle className="font-serif text-2xl tracking-[-0.03em]">Simulate fee payment</DialogTitle><DialogDescription>This is a training-only gateway simulation. It records a settled payment without charging a card, connecting to a bank, or transferring money.</DialogDescription></DialogHeader><div className="mt-6 grid gap-4"><Field label="Invoice"><Select value={paymentForm.invoiceId} onValueChange={invoiceId => { const invoice = personalInvoices.data?.find(item => item.id === Number(invoiceId)); setPaymentForm({ invoiceId, amount: invoice ? String(invoice.balanceCents / 100) : "" }); }}><SelectTrigger><SelectValue placeholder="Select an eligible invoice" /></SelectTrigger><SelectContent>{personalInvoices.data?.filter(invoice => invoice.balanceCents > 0 && ["issued", "part_paid", "overdue"].includes(invoice.status)).map(invoice => <SelectItem key={invoice.id} value={String(invoice.id)}>{invoice.invoiceNumber} · {formatMoney(invoice.balanceCents)}</SelectItem>)}</SelectContent></Select></Field><Field label="Payment amount (USD)"><Input required type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={event => setPaymentForm(current => ({ ...current, amount: event.target.value }))} /></Field></div><DialogFooter className="mt-7"><Button type="button" variant="outline" className="rounded-xl" onClick={() => setPaymentOpen(false)}>Cancel</Button><Button type="submit" disabled={!paymentForm.invoiceId || simulatePayment.isPending} className="rounded-xl bg-[#132b45] hover:bg-[#1c3b5c]">{simulatePayment.isPending ? "Simulating…" : "Simulate settlement"}</Button></DialogFooter></form></DialogContent>
      </Dialog>
    </>
  );
}

function InstitutionalInvoiceTable({ invoices, onWaive, waiverPending }: { invoices: Array<{ id: number; invoiceNumber: string; studentNumber: string; legalFirstName: string; legalLastName: string; termName: string | null; balanceCents: number; status: string }>; onWaive: (invoiceId: number) => void; waiverPending: boolean }) {
  if (!invoices.length) return <div className="p-5"><EmptyState icon={<FileWarning className="h-5 w-5" />} title="No invoices to display" detail="Issue an invoice after creating student and academic term records." /></div>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-[#faf8f3] text-[10px] font-bold uppercase tracking-[0.14em] text-[#837b6e]"><tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Student</th><th className="px-5 py-3">Term</th><th className="px-5 py-3">Balance</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Control</th></tr></thead><tbody className="divide-y divide-[#eee9e0]">{invoices.map(invoice => <tr key={invoice.id}><td className="px-5 py-4 text-sm font-semibold text-[#344a60]">{invoice.invoiceNumber}</td><td className="px-5 py-4 text-sm text-[#586b7b]">{invoice.legalFirstName} {invoice.legalLastName}<span className="mt-1 block text-xs text-[#858077]">{invoice.studentNumber}</span></td><td className="px-5 py-4 text-sm text-[#586b7b]">{invoice.termName || "—"}</td><td className="px-5 py-4 font-semibold text-[#344a60]">{formatMoney(invoice.balanceCents)}</td><td className="px-5 py-4"><StatusPill tone={invoiceTone(invoice.status)}>{invoice.status.replace("_", " ")}</StatusPill></td><td className="px-5 py-4">{invoice.status !== "waived" && invoice.balanceCents > 0 ? <Button variant="outline" size="sm" disabled={waiverPending} onClick={() => onWaive(invoice.id)} className="h-8 rounded-lg text-[11px]">Waive</Button> : <span className="text-xs text-[#858077]">—</span>}</td></tr>)}</tbody></table></div>;
}

function ScholarshipRegister({ scholarships }: { scholarships: Array<{ id: number; name: string; amountCents: number; status: string; studentNumber: string; legalFirstName: string; legalLastName: string; termName: string | null }> }) { return <ContentCard className="mt-6 p-0"><div className="flex items-center gap-3 border-b border-[#e6e0d6] p-5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf1f5] text-[#315875]"><BadgeDollarSign className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Financial-aid register</p><h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-[#203950]">Approved scholarships</h2></div></div>{scholarships.length ? <div className="divide-y divide-[#eee9e0]">{scholarships.map(scholarship => <div className="flex items-center justify-between gap-4 p-5" key={scholarship.id}><div><p className="text-sm font-semibold text-[#344a60]">{scholarship.name}</p><p className="mt-1 text-xs text-[#858077]">{scholarship.legalFirstName} {scholarship.legalLastName} · {scholarship.studentNumber} · {scholarship.termName || "No term"}</p></div><div className="text-right"><p className="text-sm font-semibold text-[#344a60]">{formatMoney(scholarship.amountCents)}</p><div className="mt-1"><StatusPill tone="good">{scholarship.status}</StatusPill></div></div></div>)}</div> : <div className="p-5"><EmptyState icon={<BadgeDollarSign className="h-5 w-5" />} title="No scholarship awards yet" detail="Approved scholarship records will be listed here for authorised finance staff." /></div>}</ContentCard>; }

function PersonalInvoiceTable({ invoices }: { invoices: Array<{ id: number; invoiceNumber: string; termName: string | null; balanceCents: number; status: string }> }) {
  if (!invoices.length) return <div className="p-5"><EmptyState icon={<FileWarning className="h-5 w-5" />} title="No invoices to display" detail="No visible invoices are linked to your student account." /></div>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left"><thead className="bg-[#faf8f3] text-[10px] font-bold uppercase tracking-[0.14em] text-[#837b6e]"><tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Term</th><th className="px-5 py-3">Balance</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-[#eee9e0]">{invoices.map(invoice => <tr key={invoice.id}><td className="px-5 py-4 text-sm font-semibold text-[#344a60]">{invoice.invoiceNumber}</td><td className="px-5 py-4 text-sm text-[#586b7b]">{invoice.termName || "—"}</td><td className="px-5 py-4 font-semibold text-[#344a60]">{formatMoney(invoice.balanceCents)}</td><td className="px-5 py-4"><StatusPill tone={invoiceTone(invoice.status)}>{invoice.status.replace("_", " ")}</StatusPill></td></tr>)}</tbody></table></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <ContentCard className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#98764a]">{label}</p><p className="mt-3 font-serif text-3xl tracking-[-0.04em] text-[#203950]">{value}</p></ContentCard>; }

type Payment = { id: number; invoiceNumber: string; amountCents: number; currency: string; gatewayReference: string; gatewayStatus: string; reconciliationStatus: string; paidAt: Date | null; studentNumber: string; legalFirstName: string; legalLastName: string };
function PaymentRegister({ payments, onReconcile, reconciling }: { payments: Payment[]; onReconcile?: (paymentId: number, status: "reconciled" | "exception") => void; reconciling?: boolean }) { return <ContentCard className="mt-6 p-0"><div className="flex items-center gap-3 border-b border-[#e6e0d6] p-5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf1f5] text-[#315875]"><CircleDollarSign className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#98764a]">Simulation ledger</p><h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-[#203950]">{onReconcile ? "Payment reconciliation" : "Your simulated payments"}</h2></div></div>{payments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-[#faf8f3] text-[10px] font-bold uppercase tracking-[0.14em] text-[#837b6e]"><tr><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Invoice</th>{onReconcile ? <th className="px-5 py-3">Student</th> : null}<th className="px-5 py-3">Amount</th><th className="px-5 py-3">Gateway</th><th className="px-5 py-3">Reconciliation</th></tr></thead><tbody className="divide-y divide-[#eee9e0]">{payments.map(payment => <tr key={payment.id}><td className="px-5 py-4 text-xs font-semibold text-[#315875]">{payment.gatewayReference}</td><td className="px-5 py-4 text-sm text-[#586b7b]">{payment.invoiceNumber}</td>{onReconcile ? <td className="px-5 py-4 text-sm text-[#586b7b]">{payment.legalFirstName} {payment.legalLastName}<span className="mt-1 block text-xs text-[#858077]">{payment.studentNumber}</span></td> : null}<td className="px-5 py-4 font-semibold text-[#344a60]">{formatMoney(payment.amountCents)}</td><td className="px-5 py-4"><StatusPill tone="good">{payment.gatewayStatus}</StatusPill></td><td className="px-5 py-4">{onReconcile && payment.reconciliationStatus === "pending" ? <div className="flex gap-2"><Button size="sm" className="h-8 rounded-lg bg-[#132b45] text-[11px] hover:bg-[#1c3b5c]" disabled={reconciling} onClick={() => onReconcile(payment.id, "reconciled")}>Reconcile</Button><Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px]" disabled={reconciling} onClick={() => onReconcile(payment.id, "exception")}>Exception</Button></div> : <StatusPill tone={payment.reconciliationStatus === "reconciled" ? "good" : payment.reconciliationStatus === "exception" ? "risk" : "warning"}>{payment.reconciliationStatus}</StatusPill>}</td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState icon={<CircleDollarSign className="h-5 w-5" />} title="No payment simulations yet" detail={onReconcile ? "Settled simulated gateway payments will appear here for review." : "Your settled fee simulations will appear here."} /></div>}</ContentCard>; }

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label className="text-xs font-semibold text-[#48596a]">{label}</Label>{children}</div>; }

export default function FinanceHub() { return <DashboardLayout><FinanceHubContent /></DashboardLayout>; }
