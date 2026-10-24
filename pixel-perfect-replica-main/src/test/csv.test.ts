import { describe, expect, it } from "vitest";
import { analisarCsv, parseValor } from "@/lib/antecipe/csv";

describe("validação de formato CSV", () => {
  it("aponta colunas obrigatórias em falta", () => {
    const r = analisarCsv("numero_nota;sacado\nNF1;A");
    expect(r.erros[0]?.mensagem).toContain("cnpj_sacado");
  });
  it("aceita valores no formato brasileiro", () => {
    expect(parseValor("15.200,50")).toBe(15200.5);
  });
});
