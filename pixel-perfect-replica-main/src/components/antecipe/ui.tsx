import { Link } from "@tanstack/react-router";
import type { ReactNode, ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { StatusNota } from "@/lib/antecipe/types";

export function PageHeader({ title, description, actions }: { title: string; description?: string | undefined; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-xl border bg-card shadow-card", className)}>{children}</section>;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tone?: "primary" | "success" | "destructive";
  hint?: string | undefined;
}) {
  const tones = {
    primary: "bg-accent text-primary",
    success: "bg-success-soft text-success",
    destructive: "bg-destructive-soft text-destructive",
  };
  return (
    <Panel className="flex items-start gap-3 p-4">
      <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="tabular mt-0.5 truncate text-xl font-bold">{value}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
    </Panel>
  );
}

const statusStyle: Record<StatusNota, string> = {
  aprovada: "bg-success-soft text-success",
  recusada: "bg-destructive-soft text-destructive",
  pendente: "bg-muted text-muted-foreground",
};
const statusLabel: Record<StatusNota, string> = { aprovada: "Aprovada", recusada: "Recusada", pendente: "Pendente" };

export function StatusBadge({ status }: { status: StatusNota }) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-semibold", statusStyle[status])}>
      {statusLabel[status]}
    </span>
  );
}

export function DemoTag() {
  return (
    <span className="inline-flex rounded-md bg-warning-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">
      Demo
    </span>
  );
}

export function EmptyState({ title, text, cta }: { title: string; text: string; cta?: boolean }) {
  return (
    <Panel className="flex flex-col items-center gap-2 p-10 text-center">
      <div className="font-semibold">{title}</div>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      {cta && (
        <Link to="/importar" className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Importar CSV
        </Link>
      )}
    </Panel>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive">
      {error instanceof Error ? error.message : "Ocorreu um erro inesperado."}
    </div>
  );
}
