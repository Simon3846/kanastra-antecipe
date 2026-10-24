import pandas as pd
import json

def validar_estoque(caminho_csv, caminho_json):
    # 1. Carregar as regras do arquivo JSON
    with open(caminho_json, 'r', encoding='utf-8') as f:
        config = json.load(f)

    # 2. Filtrar e armazenar apenas os validadores que estão marcados como ativos
    regras_ativas = {
        validador['codigo']: validador.get('parametros', {})
        for validador in config['validadores']
        if validador['ativo']
    }

    # 3. Ler o arquivo CSV respeitando a formatação regional
    try:
        # Adaptação: O arquivo real utiliza ';' como separador e ',' como separador decimal
        df = pd.read_csv(caminho_csv, sep=';', decimal=',', encoding='utf-8')
    except Exception as e:
        return f"Erro ao ler o CSV: {e}"

    # 4. Inicializar colunas de resultado (todas as notas começam como válidas)
    df['situacao_valida'] = True
    df['motivo_rejeicao'] = ""

    # Função auxiliar para registrar a falha em uma regra
    def rejeitar(condicao, motivo):
        df.loc[condicao, 'situacao_valida'] = False
        df.loc[condicao, 'motivo_rejeicao'] += motivo + " | "

    # 5. Aplicar restrições lógicas utilizando as colunas exatas do dataset

    # Validação do formato do CNPJ do Sacado
    if 'CNPJ_SACADO_VALIDO' in regras_ativas:
        cnpj_limpo = df['DOC_SACADO'].astype(str).str.replace(r'\D', '', regex=True)
        rejeitar(cnpj_limpo.str.len() != 14, "CNPJ do sacado possui formato inválido")

    # Adaptação: O arquivo CSV não possui a coluna SITUACAO_CADASTRAL nativamente. 
    # Foi incluída uma proteção (and 'SITUACAO_CADASTRAL' in df.columns) para evitar falhas 
    # caso os dados não tenham passado por um enriquecimento prévio via API da Receita.
    if 'SITUACAO_CADASTRAL_SACADO' in regras_ativas and 'SITUACAO_CADASTRAL' in df.columns:
        situacoes = regras_ativas['SITUACAO_CADASTRAL_SACADO']['situacoes_aceitas']
        rejeitar(~df['SITUACAO_CADASTRAL'].isin(situacoes), "Situação cadastral irregular")

    # Verifica o tipo de recebível
    if 'TIPO_RECEBIVEL' in regras_ativas:
        tipos = regras_ativas['TIPO_RECEBIVEL']['tipos_aceitos']
        rejeitar(~df['TIPO_RECEBIVEL'].isin(tipos), "Tipo de recebível não autorizado")

    # Verifica o valor mínimo da nota
    if 'VALOR_MINIMO' in regras_ativas:
        valor_min = regras_ativas['VALOR_MINIMO']['valor_minimo']
        rejeitar(df['VALOR_NOMINAL'] < valor_min, f"Valor inferior ao mínimo exigido (R$ {valor_min})")

    # Padronização de datas para verificações de prazo
    hoje = pd.Timestamp('today').normalize()
    # Adaptação: Forçando o parsing de data no padrão brasileiro para evitar inversão (Mês/Dia)
    df['DATA_VENCIMENTO_ORIGINAL'] = pd.to_datetime(df['DATA_VENCIMENTO_ORIGINAL'], format='%d/%m/%Y', errors='coerce')

    # Verifica se a nota não está vencida
    if 'NAO_VENCIDA' in regras_ativas:
        rejeitar(df['DATA_VENCIMENTO_ORIGINAL'] < hoje, "Nota fiscal já encontra-se vencida")

    # Verifica o prazo máximo de dias até o vencimento
    if 'PRAZO_MAXIMO' in regras_ativas:
        prazo_max = regras_ativas['PRAZO_MAXIMO']['prazo_maximo_dias']
        prazo_dias = (df['DATA_VENCIMENTO_ORIGINAL'] - hoje).dt.days
        rejeitar(prazo_dias > prazo_max, f"Prazo excede o limite máximo de {prazo_max} dias")

    # Verifica a concentração máxima permitida por sacado
    if 'CONCENTRACAO_MAXIMA_SACADO' in regras_ativas:
        pct_max = regras_ativas['CONCENTRACAO_MAXIMA_SACADO']['percentual_maximo']
        # Agrupamento definido pela raiz do CNPJ (8 primeiros dígitos)
        df['raiz_cnpj_sacado'] = df['DOC_SACADO'].astype(str).str.replace(r'\D', '', regex=True).str[:8]
        
        valor_total_operacao = df['VALOR_NOMINAL'].sum()
        limite_concentracao = valor_total_operacao * (pct_max / 100.0)

        concentracao_atual = df.groupby('raiz_cnpj_sacado')['VALOR_NOMINAL'].transform('sum')
        rejeitar(concentracao_atual > limite_concentracao, f"Sacado supera {pct_max}% de concentração na carteira")

    # Adaptação: A lógica da concentração de Cedente foi preparada e vinculada à coluna exata (DOC_CEDENTE)
    # para ser executada automaticamente caso o validador 'CONCENTRACAO_MAXIMA_CEDENTE' seja ativado no JSON no futuro.
    if 'CONCENTRACAO_MAXIMA_CEDENTE' in regras_ativas:
        pct_max_cedente = regras_ativas['CONCENTRACAO_MAXIMA_CEDENTE']['percentual_maximo']
        df['raiz_cnpj_cedente'] = df['DOC_CEDENTE'].astype(str).str.replace(r'\D', '', regex=True).str[:8]
        
        limite_concentracao_cedente = df['VALOR_NOMINAL'].sum() * (pct_max_cedente / 100.0)
        concentracao_atual_cedente = df.groupby('raiz_cnpj_cedente')['VALOR_NOMINAL'].transform('sum')
        rejeitar(concentracao_atual_cedente > limite_concentracao_cedente, f"Cedente supera {pct_max_cedente}% de concentração na carteira")

    # 6. Limpar formatação residual do texto de rejeição
    df['motivo_rejeicao'] = df['motivo_rejeicao'].str.rstrip(" | ")

    # 7. Retornar os resultados selecionando colunas ricas para conferência do analista
    colunas_retorno = [
        'NU_DOCUMENTO', 'NOME_CEDENTE', 'NOME_SACADO', 'DOC_SACADO', 
        'VALOR_NOMINAL', 'situacao_valida', 'motivo_rejeicao'
    ]
    return df[colunas_retorno]

# Execução do algoritmo
# relatorio_notas = validar_estoque('estoque_antecipe.csv', 'validadores_antecipe.json')
# notas_rejeitadas = relatorio_notas[~relatorio_notas['situacao_valida']]


#TESTE

if __name__ == "__main__":
    print("Iniciando processamento do estoque...")
    
    # 1. Executa a função de validação
    df_resultado = validar_estoque('estoque_antecipe.csv', 'validadores_antecipe.json')
    
    # Verifica se houve erro na leitura
    if isinstance(df_resultado, str):
        print(df_resultado)
    else:
        # 2. Exibe o resumo das validações
        total_notas = len(df_resultado)
        aprovadas = df_resultado['situacao_valida'].sum()
        rejeitadas = total_notas - aprovadas
        
        print("\n--- RESUMO DA VALIDAÇÃO ---")
        print(f"Total de Notas Processadas: {total_notas}")
        print(f"✅ Notas Válidas: {aprovadas} ({(aprovadas/total_notas)*100:.1f}%)")
        print(f"❌ Notas Rejeitadas: {rejeitadas} ({(rejeitadas/total_notas)*100:.1f}%)")
        
        if rejeitadas > 0:
            print("\n--- PRINCIPAIS MOTIVOS DE REJEIÇÃO ---")
            # Mostra uma amostra das notas que falharam e os motivos
            df_falhas = df_resultado[~df_resultado['situacao_valida']]
            print(df_falhas[['NU_DOCUMENTO', 'motivo_rejeicao']].head(10))
        
        # 3. Exporta o resultado para conferência no Excel/Numbers
        arquivo_saida = 'resultado_validacao.csv'
        df_resultado.to_csv(arquivo_saida, sep=';', decimal=',', index=False, encoding='utf-8')
        print(f"\nArquivo de conferência gerado com sucesso: {arquivo_saida}")