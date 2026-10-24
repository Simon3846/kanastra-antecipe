import { createFileRoute, Link } from "@tanstack/react-router";
import { FileStack, CheckCircle2, XCircle, Wallet } from "lucide-react";
import { useAnalises } from "@/lib/antecipe/hooks";
import { formatarDataHora, formatarMoeda } from "@/lib/antecipe/format";
import { DemoTag, EmptyState, ErrorBox, MetricCard, PageHeader, Panel } from "@/components/antecipe/ui";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Antecipe" },
      { name: "description", content: "Resumo dos lotes de recebíveis e total líquido estimado." },
      { property: "og:title", content: "Dashboard — Antecipe" },
      { property: "og:description", content: "Resumo dos lotes de recebíveis e total líquido estimado." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading, error } = useAnalises();
  const lotes = data ?? [];
  const soma = (f: (r: (typeof lotes)[number]["resumo"]) => number) => lotes.reduce((s, l) => s + f(l.resumo), 0);
  const liquidos = lotes.map((l) => l.resumo.valor_liquido_estimado);
  const liquidoTotal = liquidos.length && liquidos.every((v) => v != null) ? liquidos.reduce<number>((s, v) => s + (v ?? 0), 0) : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral dos lotes analisados."
        actions={
          <Link to="/importar" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Novo lote
          </Link>
        }
      />
      {error && <ErrorBox error={error} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Lotes analisados" value={lotes.length} icon={FileStack} />
        <MetricCard label="Notas aprovadas" value={soma((r) => r.aprovadas)} icon={CheckCircle2} tone="success" />
        <MetricCard label="Notas recusadas" value={soma((r) => r.recusadas)} icon={XCircle} tone="destructive" />
        <MetricCard
          label="Total líquido estimado"
          value={formatarMoeda(liquidoTotal)}
          icon={Wallet}
          hint={liquidoTotal == null ? "Aguarda cálculo do backend" : undefined}
        />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Lotes recentes</h2>
      {isLoading ? (
        <Panel className="p-6 text-sm text-muted-foreground">A carregar…</Panel>
      ) : lotes.length === 0 ? (
        <EmptyState title="Ainda não há lotes" text="Importe um ficheiro CSV com recebíveis para iniciar a análise." cta />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                {["Lote", "Ficheiro", "Data", "Notas", "Aprovadas", "Nominal aprovado", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.lote_id} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs">
                    <div className="flex items-center gap-2">{l.lote_id} {l.demo && <DemoTag />}</div>
                  </td>
                  <td className="px-4 py-3">{l.ficheiro}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatarDataHora(l.criado_em)}</td>
                  <td className="tabular px-4 py-3">{l.resumo.total_notas}</td>
                  <td className="tabular px-4 py-3 text-success">{l.resumo.aprovadas}</td>
                  <td className="tabular px-4 py-3 font-semibold">{formatarMoeda(l.resumo.valor_nominal_aprovado)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/resultados" search={{ lote: l.lote_id }} className="font-semibold text-primary hover:underline">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
