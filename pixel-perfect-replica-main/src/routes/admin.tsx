import { createFileRoute } from "@tanstack/react-router";
import { MODO_DEMO } from "@/lib/antecipe/api";
import { useValidadores } from "@/lib/antecipe/hooks";
import { ErrorBox, PageHeader, Panel } from "@/components/antecipe/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Validadores — Antecipe" },
      { name: "description", content: "Validadores de elegibilidade e parâmetros ativos no backend." },
      { property: "og:title", content: "Validadores — Antecipe" },
      { property: "og:description", content: "Validadores de elegibilidade e parâmetros ativos no backend." },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { data, isLoading, error } = useValidadores();
  return (
    <>
      <PageHeader
        title="Validadores e parâmetros"
        description={MODO_DEMO ? "Exemplos de demonstração — as regras reais vêm de validadores_antecipe.json no backend." : "Lidos pelo backend a partir de validadores_antecipe.json."}
      />
      {error && <ErrorBox error={error} />}
      {isLoading && <Panel className="p-6 text-sm text-muted-foreground">A carregar…</Panel>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((v) => (
          <Panel key={v.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{v.nome}</div>
                <div className="font-mono text-xs text-muted-foreground">{v.id}</div>
              </div>
              <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold", v.ativo ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>
                {v.ativo ? "Ativo" : "Inativo"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{v.descricao}</p>
            {Object.keys(v.parametros).length > 0 && (
              <dl className="mt-4 divide-y rounded-lg border text-sm">
                {Object.entries(v.parametros).map(([k, val]) => (
                  <div key={k} className="flex justify-between gap-3 px-3 py-2">
                    <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{String(val)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>
        ))}
      </div>
    </>
  );
}
