import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, Trash2, UploadCloud, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { api, MODO_DEMO, queryKeys } from "@/lib/antecipe/api";
import { analisarCsv, COLUNAS_OBRIGATORIAS, TAMANHO_MAXIMO_MB, type CsvAnalisado } from "@/lib/antecipe/csv";
import { CSV_EXEMPLO } from "@/lib/antecipe/demo";
import { ErrorBox, PageHeader, Panel } from "@/components/antecipe/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/importar")({
  head: () => ({
    meta: [
      { title: "Importar CSV — Antecipe" },
      { name: "description", content: "Envie um CSV de recebíveis, pré-visualize e valide o formato." },
      { property: "og:title", content: "Importar CSV — Antecipe" },
      { property: "og:description", content: "Envie um CSV de recebíveis, pré-visualize e valide o formato." },
    ],
  }),
  component: Importar,
});

function Importar() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<CsvAnalisado | null>(null);
  const [drag, setDrag] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const enviar = useMutation({
    mutationFn: (f: File) => api.enviarCsv(f),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: queryKeys.analises });
      qc.setQueryData(queryKeys.analise(a.lote_id), a);
      navigate({ to: "/resultados", search: { lote: a.lote_id } });
    },
  });

  async function escolher(f: File | undefined) {
    setLocalErr(null);
    enviar.reset();
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return setLocalErr("O ficheiro deve ter extensão .csv.");
    if (f.size > TAMANHO_MAXIMO_MB * 1024 * 1024) return setLocalErr(`O ficheiro excede ${TAMANHO_MAXIMO_MB} MB.`);
    setFile(f);
    setParsed(analisarCsv(await f.text()));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    escolher(e.dataTransfer.files[0]);
  }

  function usarExemplo() {
    escolher(new File([CSV_EXEMPLO], "exemplo_demo.csv", { type: "text/csv" }));
  }

  const valido = parsed && parsed.erros.length === 0;
  const preview = parsed?.linhas.slice(0, 8) ?? [];

  return (
    <>
      <PageHeader title="Importar CSV" description="Carregue um ficheiro de recebíveis para análise de elegibilidade." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="p-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => input.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors sm:p-10",
              drag ? "border-primary bg-accent" : "border-input hover:border-primary/60 hover:bg-muted/50",
            )}
          >
            <div className="grid h-12 w-12 place-items-center rounded-full bg-accent text-primary">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="font-semibold">Arraste o CSV para aqui</div>
            <div className="text-sm text-muted-foreground">ou clique para selecionar ({TAMANHO_MAXIMO_MB} MB máx.)</div>
            <span className="mt-2 rounded-lg border bg-card px-4 py-1.5 text-sm font-semibold">Selecionar ficheiro</span>
            <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
          </div>

          {localErr && <div className="mt-4"><ErrorBox error={new Error(localErr)} /></div>}

          {file && parsed && (
            <div className="mt-5 flex items-center gap-3 rounded-xl bg-muted/60 p-4">
              <div className="grid h-11 w-10 shrink-0 place-items-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">CSV</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · {parsed.linhas.length} linhas
                </div>
              </div>
              <button aria-label="Remover" onClick={() => { setFile(null); setParsed(null); }} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}

          {parsed && (
            <div className="mt-5">
              {valido ? (
                <div className="flex items-center gap-2 rounded-lg bg-success-soft p-3 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" /> Formato válido. Pronto para análise.
                </div>
              ) : (
                <div className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive">
                  <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Problemas de formato</div>
                  <ul className="ml-6 list-disc space-y-0.5">
                    {parsed.erros.slice(0, 10).map((e, i) => (
                      <li key={i}>{e.linha ? `Linha ${e.linha}: ` : ""}{e.mensagem}</li>
                    ))}
                    {parsed.erros.length > 10 && <li>… e mais {parsed.erros.length - 10}.</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {preview.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-sm font-semibold">Pré-visualização <span className="font-normal text-muted-foreground">(primeiras {preview.length} linhas)</span></div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 text-left text-muted-foreground">
                    <tr>{parsed!.cabecalho.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((l, i) => (
                      <tr key={i} className="border-t">
                        {parsed!.cabecalho.map((h) => <td key={h} className="whitespace-nowrap px-3 py-2">{l[h] || <span className="text-destructive">vazio</span>}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {enviar.error && <div className="mt-4"><ErrorBox error={enviar.error} /></div>}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => { setFile(null); setParsed(null); }} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">
              Cancelar
            </button>
            <button
              disabled={!valido || enviar.isPending}
              onClick={() => file && enviar.mutate(file)}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {enviar.isPending ? "A analisar…" : "Analisar recebíveis"}
            </button>
          </div>
        </Panel>

        <Panel className="h-fit p-5">
          <div className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="h-4 w-4 text-primary" /> Formato esperado</div>
          <p className="mt-2 text-sm text-muted-foreground">Separador vírgula ou ponto e vírgula. Datas em AAAA-MM-DD ou DD/MM/AAAA.</p>
          <ul className="mt-3 space-y-1.5">
            {COLUNAS_OBRIGATORIAS.map((c) => (
              <li key={c} className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs">{c}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">A elegibilidade é decidida pelo backend, não por esta verificação de formato.</p>
          {MODO_DEMO && (
            <button onClick={usarExemplo} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted">
              <Download className="h-4 w-4" /> Usar CSV de exemplo (demo)
            </button>
          )}
        </Panel>
      </div>
    </>
  );
}
