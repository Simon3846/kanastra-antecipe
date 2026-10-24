from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import json
import io
from datetime import datetime
import os

app = FastAPI(title="API Antecipe - Motor de Elegibilidade com Validação de CNPJ")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Carrega a base de situação cadastral de CNPJs (cnpj_situacao_mock.csv) na inicialização
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
        print(f"Aviso: Não foi possível carregar o arquivo cnpj_situacao_mock.csv: {e}")

@app.post("/api/antecipe/analisar")
async def analisar_recebiveis(
    csv_file: UploadFile = File(...),
    json_file: UploadFile = File(...)
):
    if not csv_file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="O arquivo de estoque deve ser um CSV válido.")
    if not json_file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="O arquivo de validadores deve ser um JSON válido.")

    try:
        # 1. Leitura do JSON de Validadores dinâmicos
        json_content = await json_file.read()
        validadores_data = json.loads(json_content.decode('utf-8'))
        regras = validadores_data if isinstance(validadores_data, list) else validadores_data.get("validadores", validadores_data.get("rules", []))
        regras_ativas = [r for r in regras if r.get("ativo", True)]

        # 2. Leitura do CSV de Notas (estoque) com Pandas
        csv_content = await csv_file.read()
        df = pd.read_csv(io.BytesIO(csv_content), sep=';', decimal=',')
        df.columns = [str(c).strip().upper() for c in df.columns]

        resultados = []
        duplicidades_lote = set()

        # 3. Processamento linha por linha (Motor de Regras)
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

            # Verificação de Duplicidade no Lote (Idempotência)
            chave_unica = f"{doc_cedente}-{doc_sacado}-{nu_documento}"
            if chave_unica in duplicidades_lote:
                aprovada = False
                motivos_recusa.append("Esta nota já foi enviada neste mesmo lote de antecipação (duplicidade detectada).")
            else:
                duplicidades_lote.add(chave_unica)

            # 4. Aplicação Dinâmica das Regras do JSON
            for regra in regras_ativas:
                codigo = str(regra.get("codigo", "")).upper()
                params = regra.get("parametros", {})

                # A. Validação de Situação Cadastral do Sacado (consultando cnpj_situacao_mock.csv)
                if "SITUACAO_CADASTRAL" in codigo or "CNPJ" in codigo:
                    situacoes_aceitas = [s.upper() for s in params.get("situacoes_aceitas", ["ATIVA"])]
                    situacao_atual = CNPJ_STATUS_MAP.get(doc_sacado, "DESCONHECIDO")
                    if situacao_atual not in situacoes_aceitas:
                        aprovada = False
                        motivos_recusa.append(
                            f"O CNPJ do sacado ({doc_sacado}) possui situação cadastral '{situacao_atual}', não permitida pelo fundo (exigida: {', '.join(situacoes_aceitas)})."
                        )

                # B. Validação de Tipo de Recebível
                elif "TIPO_RECEBIVEL" in codigo:
                    tipos_aceitos = [t.lower() for t in params.get("tipos_aceitos", [])]
                    if tipos_aceitos and tipo_recebivel.lower() not in tipos_aceitos:
                        aprovada = False
                        motivos_recusa.append(f"O tipo de recebível '{tipo_recebivel}' não é aceito pelo fundo.")

                # C. Validação de Valor Mínimo
                elif "VALOR_MINIMO" in codigo or "MIN" in codigo:
                    val_minimo = float(params.get("valor_minimo", 0))
                    if valor_nominal < val_minimo:
                        aprovada = False
                        motivos_recusa.append(f"O valor nominal de R$ {valor_nominal:,.2f} está abaixo do mínimo exigido de R$ {val_minimo:,.2f}.")

                # D. Validação de Prazo Máximo
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

            # 5. Cálculo Financeiro (Valor Líquido via Taxa de Desconto Simples)
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
                "nu_documento": nu_documento,
                "cedente": str(row.get("NOME_CEDENTE", "")),
                "sacado": nome_sacado,
                "doc_sacado": doc_sacado,
                "tipo_recebivel": tipo_recebivel,
                "valor_nominal": round(valor_nominal, 2),
                "valor_liquido": valor_liquido if aprovada else 0.0,
                "status": "APROVADA" if aprovada else "RECUSADA",
                "motivos_recusa": motivos_recusa if not aprovada else []
            })

        total_notas = len(resultados)
        aprovadas_count = sum(1 for r in resultados if r["status"] == "APROVADA")
        recusadas_count = sum(1 for r in resultados if r["status"] == "RECUSADA")
        valor_total_liquido = sum(r["valor_liquido"] for r in resultados if r["status"] == "APROVADA")

        return {
            "sucesso": True,
            "resumo": {
                "total_notas": total_notas,
                "total_aprovadas": aprovadas_count,
                "total_recusadas": recusadas_count,
                "valor_total_a_receber": round(valor_total_liquido, 2)
            },
            "notas": resultados
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno ao processar os arquivos: {str(e)}")