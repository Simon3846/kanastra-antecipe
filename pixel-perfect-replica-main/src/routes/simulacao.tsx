import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/antecipe/api";
import { useLoteAtual } from "@/lib/antecipe/hooks";
import { formatarMoeda } from "@/lib/antecipe/format";
import { DemoTag, EmptyState, ErrorBox, PageHeader, Panel } from "@/components/antecipe/ui";

export const Route = createFileRoute("/simulacao")({
  validateSearch: (s: Record<string, unknown>): { lote?: string | undefined } => ({ lote: typeof s["lote"] === "string" ? s["lote"] : undefined }),
  head: () => ({
    meta: [
      { title: "Simulação financeira — Antecipe" },
      { name: "description", content: "Valor nominal, desconto e valor líquido da antecipação do lote." },
      { property: "og:title", content: "Simulação financeira — Antecipe" },
      { property: "og:description", content: "Valor nominal, desconto e valor líquido da antecipação do lote." },
    ],
  }),
  component: Simulacao,
});

function Simulacao() {
  const { lote } = Route.useSearch();
  const navigate = useNavigate({ from: "/simulacao" });
  const { lista, id, analise } = useLoteAtual(lote);
  const sim = useQuery({ queryKey: queryKeys.simulacao(id ?? ""), queryFn: () => api.simular(id!), enabled: !!id });

  if (lista.isLoading) return <Panel className="p-6 text-sm text-muted-foreground">A carregar…</Panel>;
  if (!id) return (<><PageHeader title="Simulação" /><EmptyState title="Sem lotes para simular" text="Importe e analise um CSV primeiro." cta /></>);

  const s = sim.data;
  const pct = s && s.valor_nominal > 0 ? (s.valor_liquido / s.valor_nominal) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Simulação financeira"
        description="Antecipação das notas aprovadas no lote."
        actions={
          (lista.data?.length ?? 0) > 1 ? (
            <select value={id} onChange={(e) => navigate({ search: { lote: e.target.value } })} className="rounded-lg border bg-card px-3 py-2 text-sm">
              {lista.data!.map((l) => <option key={l.lote_id} value={l.lote_id}>{l.lote_id}</option>)}
            </select>
          ) : undefined
        }
      />
      {sim.error && <ErrorBox error={sim.error} />}
      {sim.isLoading && <Panel className="p-6 text-sm text-muted-foreground">A calcular…</Panel>}
      {s && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Panel className="p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Lote <span className="font-mono">{id}</span> {s.demo && <DemoTag />}
            </div>
            <div className="mt-6 space-y-4">
              <Linha label="Valor nominal (notas aprovadas)" valor={formatarMoeda(s.valor_nominal)} />
              <Linha label="Desconto" valor={`− ${formatarMoeda(s.desconto)}`} tone="text-destructive" />
              <div className="border-t pt-4">
                <Linha label="Valor líquido" valor={formatarMoeda(s.valor_liquido)} grande />
              </div>
            </div>
            <div className="mt-6 h-3 overflow-hidden rounded-full bg-destructive-soft">
              <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>Líquido {pct.toFixed(1)}%</span>
              <span>Desconto {(100 - pct).toFixed(1)}%</span>
            </div>
            {s.demo && (
              <p className="mt-6 rounded-lg bg-warning-soft p-3 text-xs text-warning">
                Modo demonstrativo: sem taxa de desconto real, o desconto não é calculado. O valor real virá do backend.
              </p>
            )}
          </Panel>
          <Panel className="h-fit p-5">
            <h2 className="font-semibold">Parâmetros</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Param k="Taxa mensal" v={s.taxa_mensal != null ? `${(s.taxa_mensal * 100).toFixed(2)}%` : "Não informada"} />
              <Param k="Prazo médio" v={s.prazo_medio_dias != null ? `${s.prazo_medio_dias} dias` : "Não informado"} />
              <Param k="Notas aprovadas" v={String(analise.data?.resumo.aprovadas ?? "—")} />
              <Param k="Notas recusadas" v={String(analise.data?.resumo.recusadas ?? "—")} />
            </dl>
          </Panel>
        </div>
      )}
    </>
  );
}

function Linha({ label, valor, tone, grande }: { label: string; valor: string; tone?: string; grande?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={grande ? "font-semibold" : "text-sm text-muted-foreground"}>{label}</span>
      <span className={`tabular font-bold ${grande ? "text-2xl text-success sm:text-3xl" : "text-lg"} ${tone ?? ""}`}>{valor}</span>
    </div>
  );
}

function Param({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
