from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import json
import io
import os
from datetime import datetime

app = FastAPI(title="API Antecipe - Backend Teste Compatível")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Carrega a base de situação cadastral de CNPJs na inicialização
CNPJ_STATUS_MAP = {}
if os.path.exists("cnpj_situacao_mock.csv"):
    try:
        df_cnpj = pd.read_csv("cnpj_situacao_mock.csv", sep=";")
        df_cnpj.columns = [str(c).strip().upper() for c in df_cnpj.columns]
        if "DOC" in df_cnpj.columns and "SITUACAO_CADASTRAL" in df_cnpj.columns:
            CNPJ_STATUS_MAP = pd.Series(
                df_cnpj.SITUACAO_CADASTRAL.values, 
                index=df_cnpj.DOC.astype(str).str.strip()
            ).to_dict()
    except Exception as e:
        print(f"Erro ao carregar cnpj_situacao_mock.csv: {e}")

@app.get("/validadores")
def listar_validadores():
    """Endpoint exigido pelo api.ts do front-end para ler as regras do JSON"""
    if os.path.exists("validadores_antecipe.json"):
        with open("validadores_antecipe.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("validadores", data if isinstance(data, list) else [])
    return []

@app.post("/analises")
def criar_analise(file: UploadFile = File(...)):
    """Endpoint exigido pelo api.ts do front-end para upload do CSV e motor de regras"""
    try:
        # 1. Carrega validadores do arquivo local
        regras = []
        if os.path.exists("validadores_antecipe.json"):
            with open("validadores_antecipe.json", "r", encoding="utf-8") as f:
                data = json.load(f)
                regras = data.get("validadores", data if isinstance(data, list) else [])
        
        regras_ativas = [r for r in regras if r.get("ativo", True)]

        # 2. Lê o CSV enviado pela interface
        content = file.file.read()
        df = pd.read_csv(io.BytesIO(content), sep=";", decimal=",")
        df.columns = [str(c).strip().upper() for c in df.columns]

        resultados = []
        duplicidades_lote = set()

        # 3. Processa cada linha aplicando o motor de regras
        for _, row in df.iterrows():
            aprovada = True
            motivos_recusa = []

            doc_cedente = str(row.get("DOC_CEDENTE", "")).strip()
            doc_sacado = str(row.get("DOC_SACADO", "")).strip()
            nu_documento = str(row.get("NU_DOCUMENTO", "")).strip()
            nome_sacado = str(row.get("NOME_SACADO", "")).strip()
            tipo_recebivel = str(row.get("TIPO_RECEBIVEL", "")).strip()
            
            try:
                valor_nominal = float(row.get("VALOR_NOMINAL", 0))
            except (ValueError, TypeError):
                valor_nominal = 0.0

            data_aquisicao_str = str(row.get("DATA_AQUISICAO", "")).strip()
            data_vencimento_str = str(row.get("DATA_VENCIMENTO_ORIGINAL", "")).strip()

            # Verificação de Duplicidade (Idempotência)
            chave_unica = f"{doc_cedente}-{doc_sacado}-{nu_documento}"
            if chave_unica in duplicidades_lote:
                aprovada = False
                motivos_recusa.append("Esta nota já foi enviada neste mesmo lote de antecipação (duplicidade detectada).")
            else:
                duplicidades_lote.add(chave_unica)

            # Aplicação das Regras Dinâmicas
            for regra in regras_ativas:
                codigo = str(regra.get("codigo", "")).upper()
                params = regra.get("parametros", {})

                # Validação de CNPJ / Situação Cadastral
                if "SITUACAO" in codigo or "CNPJ" in codigo:
                    situacoes_aceitas = [s.upper() for s in params.get("situacoes_aceitas", ["ATIVA"])]
                    situacao_atual = CNPJ_STATUS_MAP.get(doc_sacado, "DESCONHECIDO")
                    if situacao_atual not in situacoes_aceitas:
                        aprovada = False
                        motivos_recusa.append(
                            f"O CNPJ do sacado ({doc_sacado}) possui situação cadastral '{situacao_atual}', não permitida pelo fundo."
                        )

                # Validação de Tipo de Recebível
                elif "TIPO_RECEBIVEL" in codigo:
                    tipos_aceitos = [t.lower() for t in params.get("tipos_aceitos", [])]
                    if tipos_aceitos and tipo_recebivel.lower() not in tipos_aceitos:
                        aprovada = False
                        motivos_recusa.append(f"O tipo de recebível '{tipo_recebivel}' não é aceito pelas regras do fundo.")

                # Validação de Valor Mínimo
                elif "VALOR_MINIMO" in codigo or "MIN" in codigo:
                    val_minimo = float(params.get("valor_minimo", 0))
                    if valor_nominal < val_minimo:
                        aprovada = False
                        motivos_recusa.append(f"O valor nominal de R$ {valor_nominal:,.2f} está abaixo do mínimo exigido de R$ {val_minimo:,.2f}.")

                # Validação de Prazo Máximo
                elif "PRAZO_MAXIMO" in codigo or "MAX" in codigo:
                    max_dias = int(params.get("prazo_maximo_dias", 365))
                    try:
                        dt_aq = datetime.strptime(data_aquisicao_str, "%d/%m/%Y")
                        dt_ven = datetime.strptime(data_vencimento_str, "%d/%m/%Y")
                        dias = (dt_ven - dt_aq).days
                        if dias > max_dias:
                            aprovada = False
                            motivos_recusa.append(f"O prazo de {dias} dias excede o limite máximo permitido de {max_dias} dias.")
                    except Exception:
                        pass

            # Cálculo do Valor Líquido (Desconto Simples)
            valor_liquido = 0.0
            if aprovada:
                try:
                    dt_aq = datetime.strptime(data_aquisicao_str, "%d/%m/%Y")
                    dt_ven = datetime.strptime(data_vencimento_str, "%d/%m/%Y")
                    dias = max(1, (dt_ven - dt_aq).days)
                    taxa_dia = 0.02 / 30  # 2% ao mês proporcional
                    desconto = valor_nominal * taxa_dia * dias
                    valor_liquido = round(max(0.0, valor_nominal - desconto), 2)
                except Exception:
                    valor_liquido = valor_nominal

            resultados.append({
                "id": nu_documento,
                "nu_documento": nu_documento,
                "cedente": str(row.get("NOME_CEDENTE", "")),
                "sacado": nome_sacado,
                "valor_nominal": round(valor_nominal, 2),
                "valor_liquido": valor_liquido if aprovada else 0.0,
                "status": "APROVADA" if aprovada else "RECUSADA",
                "motivos": motivos_recusa
            })

        total_liquido = sum(r["valor_liquido"] for r in resultados if r["status"] == "APROVADA")

        return {
            "id": "lote-atual",
            "status": "processado",
            "resumo": {
                "total_recebiveis": len(resultados),
                "aprovadas": sum(1 for r in resultados if r["status"] == "APROVADA"),
                "recusadas": sum(1 for r in resultados if r["status"] == "RECUSADA"),
                "valor_total_liquido": round(total_liquido, 2)
            },
            "recebiveis": resultados
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))