import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useLoteAtual } from "@/lib/antecipe/hooks";
import { formatarData, formatarMoeda } from "@/lib/antecipe/format";
import { DemoTag, EmptyState, PageHeader, Panel, StatusBadge } from "@/components/antecipe/ui";

export const Route = createFileRoute("/resultados/$id")({
  validateSearch: (s: Record<string, unknown>): { lote?: string | undefined } => ({ lote: typeof s["lote"] === "string" ? s["lote"] : undefined }),
  head: () => ({
    meta: [
      { title: "Detalhe da nota — Antecipe" },
      { name: "description", content: "Regras verificadas e motivos de recusa de um recebível." },
      { property: "og:title", content: "Detalhe da nota — Antecipe" },
      { property: "og:description", content: "Regras verificadas e motivos de recusa de um recebível." },
    ],
  }),
  component: Detalhe,
});

function Detalhe() {
  const { id } = Route.useParams();
  const { lote } = Route.useSearch();
  const { analise } = useLoteAtual(lote);
  const nota = analise.data?.notas.find((n) => n.id === id);

  if (analise.isLoading) return <Panel className="p-6 text-sm text-muted-foreground">A carregar…</Panel>;
  if (!nota) return <EmptyState title="Nota não encontrada" text="Esta nota não existe no lote selecionado." cta />;

  const campos = [
    ["Sacado", nota.sacado || "—"],
    ["CNPJ do sacado", nota.cnpj_sacado],
    ["Valor nominal", formatarMoeda(nota.valor_nominal)],
    ["Emissão", formatarData(nota.data_emissao)],
    ["Vencimento", formatarData(nota.data_vencimento)],
  ];
  const falhas = nota.regras.filter((r) => !r.aprovada);

  return (
    <>
      <Link to="/resultados" search={{ lote }} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Voltar aos resultados
      </Link>
      <PageHeader title={`Nota ${nota.numero_nota}`} actions={<div className="flex items-center gap-2">{analise.data?.demo && <DemoTag />}<StatusBadge status={nota.status} /></div>} />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="h-fit p-5">
          <dl className="space-y-3">
            {campos.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="tabular font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <div className="space-y-6">
          {falhas.length > 0 && (
            <Panel className="border-destructive/30 bg-destructive-soft p-5">
              <h2 className="font-semibold text-destructive">Porque foi recusada</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {falhas.map((r) => (
                  <li key={r.validador_id}>{r.motivo ?? `A regra "${r.nome}" não foi cumprida (o backend não indicou motivo).`}</li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel>
            <h2 className="border-b p-4 font-semibold">Regras verificadas ({nota.regras.length})</h2>
            {nota.regras.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">O backend não devolveu regras para esta nota.</p>
            ) : (
              <ul>
                {nota.regras.map((r) => (
                  <li key={r.validador_id} className="flex gap-3 border-b p-4 last:border-0">
                    {r.aprovada ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
                    <div className="min-w-0">
                      <div className="font-medium">{r.nome}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.validador_id}</div>
                      {!r.aprovada && r.motivo && <p className="mt-1 text-sm">{r.motivo}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
