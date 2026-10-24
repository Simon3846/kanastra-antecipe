// Contratos partilhados com o backend Antecipe.
// O backend é a fonte de verdade das regras (lê validadores_antecipe.json).

export type StatusNota = "aprovada" | "recusada" | "pendente";

export interface LinhaRecebivel {
  numero_nota: string;
  sacado: string;
  cnpj_sacado: string;
  valor_nominal: number;
  data_emissao: string;
  data_vencimento: string;
}

export interface RegraVerificada {
  validador_id: string;
  nome: string;
  aprovada: boolean;
  /** Motivo em linguagem simples, devolvido pelo backend. */
  motivo?: string | null;
}

export interface ResultadoNota extends LinhaRecebivel {
  id: string;
  status: StatusNota;
  regras: RegraVerificada[];
}

export interface ResumoLote {
  total_notas: number;
  aprovadas: number;
  recusadas: number;
  pendentes: number;
  valor_nominal_total: number;
  valor_nominal_aprovado: number;
  valor_liquido_estimado: number | null;
}

export interface Analise {
  lote_id: string;
  ficheiro: string;
  criado_em: string;
  resumo: ResumoLote;
  notas: ResultadoNota[];
  /** true quando gerado pelo modo demonstrativo do frontend. */
  demo?: boolean;
}

export type AnaliseResumida = Omit<Analise, "notas">;

export interface Validador {
  id: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  parametros: Record<string, string | number | boolean>;
}

export interface Simulacao {
  lote_id: string;
  valor_nominal: number;
  desconto: number;
  valor_liquido: number;
  taxa_mensal?: number | null;
  prazo_medio_dias?: number | null;
  demo?: boolean;
}
