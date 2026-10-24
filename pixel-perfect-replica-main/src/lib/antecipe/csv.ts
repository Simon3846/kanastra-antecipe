import type { LinhaRecebivel } from "./types";

/** Colunas que o CSV deve conter. Ajustar quando o backend publicar o contrato final. */
export const COLUNAS_OBRIGATORIAS = [
  "numero_nota",
  "sacado",
  "cnpj_sacado",
  "valor_nominal",
  "data_emissao",
  "data_vencimento",
] as const;

export const TAMANHO_MAXIMO_MB = 5;

export interface ErroCsv {
  linha: number | null;
  mensagem: string;
}

export interface CsvAnalisado {
  cabecalho: string[];
  linhas: Record<string, string>[];
  registos: LinhaRecebivel[];
  erros: ErroCsv[];
}

function detetarSeparador(primeiraLinha: string): string {
  const pv = (primeiraLinha.match(/;/g) ?? []).length;
  const v = (primeiraLinha.match(/,/g) ?? []).length;
  return pv > v ? ";" : ",";
}

export function dividirLinhas(texto: string, sep: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (quoted) {
      if (c === '"' && texto[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) out.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) out.push(row);
  return out;
}

export function parseValor(v: string): number | null {
  const s = v.trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

function dataValida(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) || /^\d{2}\/\d{2}\/\d{4}$/.test(v.trim());
}

export function analisarCsv(texto: string): CsvAnalisado {
  const limpo = texto.replace(/^\uFEFF/, "");
  const sep = detetarSeparador(limpo.split(/\r?\n/)[0] ?? "");
  const matriz = dividirLinhas(limpo, sep);
  const erros: ErroCsv[] = [];
  if (matriz.length === 0) {
    return { cabecalho: [], linhas: [], registos: [], erros: [{ linha: null, mensagem: "O ficheiro está vazio." }] };
  }
  const cabecalho = (matriz[0] ?? []).map((h) => h.trim().toLowerCase());
  const faltam = COLUNAS_OBRIGATORIAS.filter((c) => !cabecalho.includes(c));
  if (faltam.length) erros.push({ linha: null, mensagem: `Colunas em falta: ${faltam.join(", ")}.` });

  const linhas = matriz.slice(1).map((r) => Object.fromEntries(cabecalho.map((h, i) => [h, (r[i] ?? "").trim()])));
  if (linhas.length === 0) erros.push({ linha: null, mensagem: "O ficheiro não tem linhas de dados." });

  const registos: LinhaRecebivel[] = [];
  if (!faltam.length) {
    linhas.forEach((row, i) => {
      const l = new Proxy(row, { get: (t, k: string) => t[k] ?? "" }) as Record<(typeof COLUNAS_OBRIGATORIAS)[number], string>;
      const n = i + 2;
      const valor = parseValor(l.valor_nominal);
      if (!l.numero_nota) erros.push({ linha: n, mensagem: "numero_nota vazio." });
      if (valor === null) erros.push({ linha: n, mensagem: `valor_nominal inválido ("${l.valor_nominal}").` });
      if (!dataValida(l.data_emissao)) erros.push({ linha: n, mensagem: "data_emissao deve estar em AAAA-MM-DD ou DD/MM/AAAA." });
      if (!dataValida(l.data_vencimento)) erros.push({ linha: n, mensagem: "data_vencimento deve estar em AAAA-MM-DD ou DD/MM/AAAA." });
      registos.push({
        numero_nota: l.numero_nota,
        sacado: l.sacado,
        cnpj_sacado: l.cnpj_sacado,
        valor_nominal: valor ?? 0,
        data_emissao: l.data_emissao,
        data_vencimento: l.data_vencimento,
      });
    });
  }
  return { cabecalho, linhas, registos, erros };
}
