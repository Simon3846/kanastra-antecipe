/**
 * Camada de serviços Antecipe.
 *
 * Com VITE_ANTECIPE_API_URL definido, todas as chamadas vão ao backend real.
 * Sem ele, usa o adaptador demonstrativo (src/lib/antecipe/demo.ts) e a UI
 * mostra um aviso "Dados demonstrativos" em todas as páginas.
 *
 * Endpoints esperados do backend:
 *   GET  /validadores              -> Validador[]   (lidos de validadores_antecipe.json)
 *   POST /analises  (multipart: file) -> Analise
 *   GET  /analises                 -> AnaliseResumida[]
 *   GET  /analises/:loteId         -> Analise
 *   POST /simulacoes { lote_id }   -> Simulacao
 */
import type { Analise, AnaliseResumida, Simulacao, Validador } from "./types";
import { demoApi } from "./demo";

const BASE = (import.meta.env["VITE_ANTECIPE_API_URL"] as string | undefined)?.replace(/\/$/, "");

export const MODO_DEMO = !BASE;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Erro ${res.status} ao contactar o servidor.`);
  }
  return res.json() as Promise<T>;
}

const realApi = {
  listarValidadores: () => req<Validador[]>("/validadores"),
  listarAnalises: () => req<AnaliseResumida[]>("/analises"),
  obterAnalise: (loteId: string) => req<Analise>(`/analises/${encodeURIComponent(loteId)}`),
  enviarCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<Analise>("/analises", { method: "POST", body: fd });
  },
  simular: (loteId: string) =>
    req<Simulacao>("/simulacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lote_id: loteId }),
    }),
};

export type AntecipeApi = typeof realApi;

export const api: AntecipeApi = MODO_DEMO ? demoApi : realApi;

export const queryKeys = {
  validadores: ["validadores"] as const,
  analises: ["analises"] as const,
  analise: (id: string) => ["analises", id] as const,
  simulacao: (id: string) => ["simulacoes", id] as const,
};
