import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "./api";

export const useAnalises = () => useQuery({ queryKey: queryKeys.analises, queryFn: api.listarAnalises });

export const useAnalise = (id: string | undefined) =>
  useQuery({ queryKey: queryKeys.analise(id ?? ""), queryFn: () => api.obterAnalise(id!), enabled: !!id });

export const useValidadores = () => useQuery({ queryKey: queryKeys.validadores, queryFn: api.listarValidadores });

/** Lote indicado, ou o mais recente. */
export function useLoteAtual(lote?: string) {
  const lista = useAnalises();
  const id = lote ?? lista.data?.[0]?.lote_id;
  return { lista, id, analise: useAnalise(id) };
}
