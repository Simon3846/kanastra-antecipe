import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, ChevronDown } from "lucide-react";
import { useLoteAtual } from "@/lib/antecipe/hooks";
import { formatarData, formatarMoeda } from "@/lib/antecipe/format";
import type { StatusNota } from "@/lib/antecipe/types";
import { DemoTag, EmptyState, ErrorBox, PageHeader, Panel, StatusBadge } from "@/components/antecipe/ui";
import { cn } from "@/lib/utils";

type Search = { lote?: string | undefined };

export const Route = createFileRoute("/resultados/")({
  validateSearch: (s: Record<string, unknown>): Search => ({ lote: typeof s["lote"] === "string" ? s["lote"] : undefined }),
  head: () => ({
    meta: [
      { title: "Resultados da análise — Antecipe" },
      { name: "description", content: "Tabela pesquisável dos recebíveis analisados e respetivo estado." },
      { property: "og:title", content: "Resultados da análise — Antecipe" },
      { property: "og:description", content: "Tabela pesquisável dos recebíveis analisados e respetivo estado." },
    ],
  }),
  component: Resultados,
});

const POR_PAGINA = 10;
const filtros: { v: StatusNota | "todas"; l: string }[] = [
  { v: "todas", l: "Todas" },
  { v: "aprovada", l: "Aprovadas" },
  { v: "recusada", l: "Recusadas" },
  { v: "pendente", l: "Pendentes" },
];

function Resultados() {
  const { lote } = Route.useSearch();
  const navigate = useNavigate({ from: "/resultados/" });
  const { lista, id, analise } = useLoteAtual(lote);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusNota | "todas">("todas");
  const [page, setPage] = useState(1);
  const [aberta, setAberta] = useState<string | null>(null);

  const notas = useMemo(() => {
    const t = q.toLowerCase();
    return (analise.data?.notas ?? []).filter(
      (n) =>
        (status === "todas" || n.status === status) &&
        (!t || n.numero_nota.toLowerCase().includes(t) || n.sacado.toLowerCase().includes(t) || n.cnpj_sacado.includes(t)),
    );
  }, [analise.data, q, status]);
  const paginas = Math.max(1, Math.ceil(notas.length / POR_PAGINA));
  const visiveis = notas.slice((page - 1) * POR_PAGINA, page * POR_PAGINA);

  if (lista.isLoading || analise.isLoading) return <Panel className="p-6 text-sm text-muted-foreground">A carregar…</Panel>;
  if (!id) return (<><PageHeader title="Resultados" /><EmptyState title="Sem análises" text="Importe um CSV para ver os resultados aqui." cta /></>);

  const a = analise.data;
  return (
    <>
      <PageHeader
        title="Resultados da análise"
        description={a ? `${a.ficheiro} · ${a.resumo.total_notas} notas` : undefined}
        actions={
          <>
            {(lista.data?.length ?? 0) > 1 && (
              <select
                value={id}
                onChange={(e) => navigate({ search: { lote: e.target.value } })}
                className="rounded-lg border bg-card px-3 py-2 text-sm"
              >
                {lista.data!.map((l) => <option key={l.lote_id} value={l.lote_id}>{l.lote_id}</option>)}
              </select>
            )}
            <Link to="/simulacao" search={{ lote: id }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Simular antecipação
            </Link>
          </>
        }
      />
      {analise.error && <ErrorBox error={analise.error} />}
      {a && (
        <Panel>
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Recebíveis</span>
              {a.demo && <DemoTag />}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
                {filtros.map((f) => (
                  <button
                    key={f.v}
                    onClick={() => { setStatus(f.v); setPage(1); }}
                    className={cn("whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold", status === f.v ? "bg-card text-foreground shadow-card" : "text-muted-foreground")}
                  >
                    {f.l}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1); }}
                  placeholder="Nota, sacado ou CNPJ"
                  className="w-full bg-transparent text-sm outline-none sm:w-52"
                />
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="w-8 px-4 py-3" />
                  {["Nota", "Sacado", "Vencimento", "Valor nominal", "Estado", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((n) => {
                  const open = aberta === n.id;
                  const falhas = n.regras.filter((r) => !r.aprovada);
                  return (
                    <Fragment key={n.id}>
                      <tr className="border-b hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <button aria-label="Expandir" onClick={() => setAberta(open ? null : n.id)} className="text-muted-foreground">
                            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium">{n.numero_nota}</td>
                        <td className="px-4 py-3">
                          <div>{n.sacado || "—"}</div>
                          <div className="text-xs text-muted-foreground">{n.cnpj_sacado}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatarData(n.data_vencimento)}</td>
                        <td className="tabular px-4 py-3 font-semibold">{formatarMoeda(n.valor_nominal)}</td>
                        <td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                        <td className="px-4 py-3 text-right">
                          <Link to="/resultados/$id" params={{ id: n.id }} search={{ lote: id }} className="font-semibold text-primary hover:underline">Detalhes</Link>
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${n.id}-x`} className="border-b bg-muted/30">
                          <td />
                          <td colSpan={6} className="px-4 py-3 text-sm">
                            {falhas.length === 0 ? (
                              <span className="text-success">Todas as {n.regras.length} regras verificadas foram cumpridas.</span>
                            ) : (
                              <ul className="space-y-1">
                                {falhas.map((r) => (
                                  <li key={r.validador_id}><span className="font-semibold text-destructive">{r.nome}:</span> {r.motivo ?? "Sem motivo indicado pelo backend."}</li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {visiveis.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhuma nota corresponde aos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between p-4 text-sm">
            <span className="text-muted-foreground">Total: {notas.length}</span>
            <div className="flex items-center gap-1">
              <button aria-label="Anterior" disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-md p-1.5 hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span className="tabular px-2">{page} / {paginas}</span>
              <button aria-label="Seguinte" disabled={page === paginas} onClick={() => setPage(page + 1)} className="rounded-md p-1.5 hover:bg-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}
