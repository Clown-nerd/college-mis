import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-[#ded8cc] pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#98764a]">{eyebrow}</p>
        <h1 className="font-serif text-[2rem] leading-none tracking-[-0.04em] text-[#132b45] sm:text-[2.45rem]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#6e7180]">{description}</p>
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </header>
  );
}

const tones = {
  neutral: "border-[#d7d1c4] bg-[#f7f4ee] text-[#55616f]",
  good: "border-[#b9ded5] bg-[#eff9f6] text-[#167363]",
  warning: "border-[#ead49a] bg-[#fff8e5] text-[#8a6217]",
  risk: "border-[#f1c7c4] bg-[#fff1f0] text-[#af3f38]",
  navy: "border-[#c8d5e1] bg-[#eef4f8] text-[#294e6b]",
} as const;

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold", tones[tone])}>{children}</span>;
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "navy",
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "navy" | "good" | "warning" | "risk";
  icon: ReactNode;
}) {
  const surface = {
    navy: "bg-[#e9f0f5] text-[#193a56]",
    good: "bg-[#e5f4ef] text-[#176657]",
    warning: "bg-[#fff0bf] text-[#845a10]",
    risk: "bg-[#ffe3e1] text-[#a33c37]",
  }[tone];

  return (
    <article className="rounded-2xl border border-[#ded8cc] bg-[#fdfcf9] p-4 shadow-[0_8px_24px_rgba(30,42,58,0.035)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(30,42,58,0.07)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#7f786c]">{label}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", surface)}>{icon}</span>
      </div>
      <p className="mt-5 font-serif text-[2rem] leading-none tracking-[-0.04em] text-[#142b43]">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[#777a84]">{detail}</p>
    </article>
  );
}

export function ActionTile({
  title,
  detail,
  icon,
  onClick,
  emphasis = false,
}: {
  title: string;
  detail: string;
  icon: ReactNode;
  onClick?: () => void;
  emphasis?: boolean;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      {...(onClick ? { onClick, type: "button" as const } : {})}
      className={cn(
        "group flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-[transform,background,border-color] duration-150",
        emphasis
          ? "border-[#c7af64] bg-[#fffaf0] hover:bg-[#fff5e0]"
          : "border-[#e1dbd0] bg-[#fdfcf9] hover:border-[#b8c7d4] hover:bg-white",
        onClick && "active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea3b7] focus-visible:ring-offset-2",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", emphasis ? "bg-[#f4e1a6] text-[#835c13]" : "bg-[#edf3f6] text-[#315875]")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#22384f]">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-[#777a84]">{detail}</span>
      </span>
      {onClick && <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[#8d9baa] transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />}
    </Component>
  );
}

export function ContentCard({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-2xl border border-[#ded8cc] bg-[#fdfcf9] p-5 shadow-[0_8px_24px_rgba(30,42,58,0.035)] sm:p-6", className)} {...props} />;
}

export function EmptyState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-[#d8d1c4] bg-[#f9f7f2] px-5 py-9 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8eff3] text-[#315875]">{icon}</div>
      <h2 className="mt-4 font-serif text-xl tracking-[-0.025em] text-[#1f3850]">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#747682]">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
