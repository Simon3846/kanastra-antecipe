/**
 * ADAPTADOR DEMONSTRATIVO — NÃO REPRESENTA REGRAS NEM RESULTADOS REAIS.
 *
 * Serve apenas para navegar no fluxo sem backend. Os "validadores" abaixo
 * verificam apenas o formato dos dados do CSV (campos preenchidos, datas
 * coerentes) e NÃO são os critérios de elegibilidade do Antecipe, que vêm
 * exclusivamente do backend (validadores_antecipe.json).
 */
import { analisarCsv } from "./csv";
import type { Analise, AnaliseResumida, ResultadoNota, Simulacao, Validador } from "./types";

const validadoresDemo: [Validador, Validador] = [
  {
    id: "demo_campos_preenchidos",
    nome: "[Demo] Campos obrigatórios preenchidos",
    descricao: "Exemplo de verificação de formato: todas as colunas da linha têm valor.",
    ativo: true,
    parametros: { origem: "frontend-demo" },
  },
  {
    id: "demo_datas_coerentes",
    nome: "[Demo] Vencimento posterior à emissão",
    descricao: "Exemplo de verificação de formato: a data de vencimento é posterior à data de emissão.",
    ativo: true,
    parametros: { origem: "frontend-demo" },
  },
];

const analises = new Map<string, Analise>();

function toIso(d: string) {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
}

const delay = <T,>(v: T, ms = 350) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export const demoApi = {
  listarValidadores: () => delay(validadoresDemo),
  listarAnalises: () =>
    delay<AnaliseResumida[]>(
      [...analises.values()].map(({ notas: _n, ...r }) => r).sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
    ),
  obterAnalise: async (loteId: string) => {
    const a = analises.get(loteId);
    if (!a) throw new Error("Lote não encontrado.");
    return delay(a, 150);
  },
  enviarCsv: async (file: File) => {
    const { registos, erros } = analisarCsv(await file.text());
    if (erros.some((e) => e.linha === null)) throw new Error(erros[0]?.mensagem);
    const lote_id = `DEMO-${Date.now().toString(36).toUpperCase()}`;
    const notas: ResultadoNota[] = registos.map((r, i) => {
      const campos = !!(r.numero_nota && r.sacado && r.cnpj_sacado && r.valor_nominal > 0);
      const datas = toIso(r.data_vencimento) > toIso(r.data_emissao);
      const regras = [
        {
          validador_id: validadoresDemo[0].id,
          nome: validadoresDemo[0].nome,
          aprovada: campos,
          motivo: campos ? null : "Há campos vazios ou o valor nominal não é positivo nesta linha.",
        },
        {
          validador_id: validadoresDemo[1].id,
          nome: validadoresDemo[1].nome,
          aprovada: datas,
          motivo: datas ? null : "A data de vencimento não é posterior à data de emissão.",
        },
      ];
      return { ...r, id: `${lote_id}-${i + 1}`, status: regras.every((x) => x.aprovada) ? "aprovada" : "recusada", regras };
    });
    const aprov = notas.filter((n) => n.status === "aprovada");
    const analise: Analise = {
      lote_id,
      ficheiro: file.name,
      criado_em: new Date().toISOString(),
      demo: true,
      notas,
      resumo: {
        total_notas: notas.length,
        aprovadas: aprov.length,
        recusadas: notas.length - aprov.length,
        pendentes: 0,
        valor_nominal_total: notas.reduce((s, n) => s + n.valor_nominal, 0),
        valor_nominal_aprovado: aprov.reduce((s, n) => s + n.valor_nominal, 0),
        // Sem taxa real disponível no modo demo: não estimamos líquido.
        valor_liquido_estimado: null,
      },
    };
    analises.set(lote_id, analise);
    return delay(analise, 700);
  },
  simular: async (loteId: string): Promise<Simulacao> => {
    const a = analises.get(loteId);
    if (!a) throw new Error("Lote não encontrado.");
    // Sem taxa real: o modo demo não calcula desconto.
    return delay({
      lote_id: loteId,
      valor_nominal: a.resumo.valor_nominal_aprovado,
      desconto: 0,
      valor_liquido: a.resumo.valor_nominal_aprovado,
      taxa_mensal: null,
      prazo_medio_dias: null,
      demo: true,
    });
  },
};

export const CSV_EXEMPLO = `numero_nota;sacado;cnpj_sacado;valor_nominal;data_emissao;data_vencimento
NF-1001;Comercial Andrade Ltda;12.345.678/0001-90;15.200,00;2026-09-01;2026-11-30
NF-1002;Distribuidora Sol;98.765.432/0001-10;8.430,50;2026-09-05;2026-12-15
NF-1003;Metalúrgica Ponte;11.222.333/0001-44;22.000,00;2026-10-10;2026-10-01
NF-1004;;55.666.777/0001-88;4.900,00;2026-09-20;2026-12-20
`;
