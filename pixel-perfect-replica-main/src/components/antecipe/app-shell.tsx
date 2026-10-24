import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Upload, ListChecks, Calculator, Settings2, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MODO_DEMO } from "@/lib/antecipe/api";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/importar", label: "Importar CSV", icon: Upload },
  { to: "/resultados", label: "Resultados", icon: ListChecks },
  { to: "/simulacao", label: "Simulação", icon: Calculator },
  { to: "/admin", label: "Validadores", icon: Settings2 },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {nav.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? path === "/" : path.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-extrabold">
        A
      </div>
      <div className="leading-tight">
        <div className="text-base font-bold text-sidebar-primary">Antecipe</div>
        <div className="text-[11px] text-sidebar-foreground/70">Antecipação de recebíveis</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-8 bg-sidebar p-5 lg:flex">
        <Brand />
        <NavLinks />
        <div className="mt-auto rounded-lg border border-sidebar-border p-3 text-xs text-sidebar-foreground/80">
          {MODO_DEMO ? "Sem backend ligado — modo demonstrativo." : "Ligado ao backend Antecipe."}
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col gap-8 bg-sidebar p-5">
            <div className="flex items-center justify-between">
              <Brand />
              <button aria-label="Fechar" onClick={() => setOpen(false)} className="text-sidebar-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3 lg:hidden">
          <button aria-label="Abrir menu" onClick={() => setOpen(true)} className="rounded-md p-1.5 hover:bg-muted">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold text-primary">Antecipe</span>
        </header>
        {MODO_DEMO && (
          <div className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-xs font-medium text-warning sm:text-sm">
            Dados demonstrativos — nenhum backend ligado. Regras e resultados exibidos não são reais.
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
