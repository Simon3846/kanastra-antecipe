"""Motor de validação de recebíveis em Polars.

Tradução do protótipo `teste/teste.py` (pandas) para Polars. As regras vêm de um
JSON de validadores (padrão do servidor ou enviado pelo usuário) e a situação
cadastral dos sacados vem de uma tabela de CNPJs (`data/cnpjs_ativos.csv`).
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

import polars as pl


class ErroValidacao(ValueError):
    """Entrada inválida: CSV, JSON de validadores ou tabela de CNPJs."""


COLUNAS_OBRIGATORIAS = [
    "NU_DOCUMENTO",
    "NOME_SACADO",
    "DOC_SACADO",
    "TIPO_RECEBIVEL",
    "VALOR_NOMINAL",
    "DATA_VENCIMENTO_ORIGINAL",
]
COLUNAS_OPCIONAIS = ["NOME_CEDENTE", "DOC_CEDENTE"]


# --------------------------------------------------------------------------- #
# Catálogo de regras
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Regra:
    nome: str
    descricao: str
    # Expressão Polars que é True quando a nota FALHA na regra.
    falha: Callable[[dict[str, Any]], pl.Expr]
    motivo: Callable[[dict[str, Any]], str]


def _concentracao(coluna_raiz: str, pct: Any) -> pl.Expr:
    limite = pl.col("_valor").sum() * (float(pct) / 100.0)
    return pl.col("_valor").sum().over(coluna_raiz) > limite


REGRAS: dict[str, Regra] = {
    "CNPJ_SACADO_VALIDO": Regra(
        "CNPJ do sacado válido",
        "O CNPJ do sacado deve ter 14 dígitos.",
        lambda p: pl.col("_cnpj").str.len_chars() != 14,
        lambda p: "CNPJ do sacado possui formato inválido.",
    ),
    "SITUACAO_CADASTRAL_SACADO": Regra(
        "Situação cadastral do sacado",
        "O sacado deve constar na tabela de CNPJs com uma situação aceita.",
        lambda p: ~pl.col("_situacao")
        .is_in([str(s).upper() for s in p["situacoes_aceitas"]])
        .fill_null(False),
        lambda p: "Situação cadastral irregular ou CNPJ do sacado não encontrado na tabela de CNPJs.",
    ),
    "TIPO_RECEBIVEL": Regra(
        "Tipo de recebível",
        "Apenas os tipos de recebível configurados são aceitos.",
        lambda p: ~pl.col("_tipo")
        .str.to_lowercase()
        .is_in([str(t).lower() for t in p["tipos_aceitos"]])
        .fill_null(False),
        lambda p: "Tipo de recebível não autorizado.",
    ),
    "VALOR_MINIMO": Regra(
        "Valor mínimo da nota",
        "O valor nominal deve ser igual ou superior ao mínimo.",
        lambda p: pl.col("_valor") < float(p["valor_minimo"]),
        lambda p: f"Valor inferior ao mínimo exigido (R$ {p['valor_minimo']}).",
    ),
    "NAO_VENCIDA": Regra(
        "Nota não vencida",
        "A data de vencimento não pode ser anterior a hoje.",
        lambda p: pl.col("_prazo") < 0,
        lambda p: "Nota já se encontra vencida.",
    ),
    "PRAZO_MINIMO": Regra(
        "Prazo mínimo até o vencimento",
        "O vencimento deve estar a, pelo menos, N dias.",
        lambda p: pl.col("_prazo") < int(p["prazo_minimo_dias"]),
        lambda p: f"Prazo inferior ao mínimo de {p['prazo_minimo_dias']} dias.",
    ),
    "PRAZO_MAXIMO": Regra(
        "Prazo máximo até o vencimento",
        "O vencimento deve estar a, no máximo, N dias.",
        lambda p: pl.col("_prazo") > int(p["prazo_maximo_dias"]),
        lambda p: f"Prazo excede o limite máximo de {p['prazo_maximo_dias']} dias.",
    ),
    "CONCENTRACAO_MAXIMA_SACADO": Regra(
        "Concentração máxima por sacado",
        "Um mesmo sacado (raiz do CNPJ) não pode superar o percentual da carteira.",
        lambda p: _concentracao("_raiz_sacado", p["percentual_maximo"]),
        lambda p: f"Sacado supera {p['percentual_maximo']}% de concentração na carteira.",
    ),
    "CONCENTRACAO_MAXIMA_CEDENTE": Regra(
        "Concentração máxima por cedente",
        "Um mesmo cedente (raiz do CNPJ) não pode superar o percentual da carteira.",
        lambda p: _concentracao("_raiz_cedente", p["percentual_maximo"]),
        lambda p: f"Cedente supera {p['percentual_maximo']}% de concentração na carteira.",
    ),
}


# --------------------------------------------------------------------------- #
# Configuração (JSON de validadores)
# --------------------------------------------------------------------------- #
def validar_config(config: Any) -> dict[str, Any]:
    if not isinstance(config, dict) or not isinstance(config.get("validadores"), list):
        raise ErroValidacao('O JSON de validadores deve ter a chave "validadores" com uma lista.')
    for i, item in enumerate(config["validadores"], start=1):
        if not isinstance(item, dict) or not isinstance(item.get("codigo"), str):
            raise ErroValidacao(f'Validador #{i}: o campo "codigo" é obrigatório (texto).')
        if not isinstance(item.get("ativo", False), bool):
            raise ErroValidacao(f'Validador {item["codigo"]}: "ativo" deve ser true ou false.')
        if not isinstance(item.get("parametros", {}), dict):
            raise ErroValidacao(f'Validador {item["codigo"]}: "parametros" deve ser um objeto.')
    return config


def regras_ativas(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    ativos: dict[str, dict[str, Any]] = {}
    for item in config["validadores"]:
        if not item.get("ativo"):
            continue
        codigo = item["codigo"]
        if codigo not in REGRAS:
            raise ErroValidacao(
                f"Validador desconhecido: {codigo!r}. Disponíveis: {', '.join(REGRAS)}."
            )
        ativos[codigo] = item.get("parametros") or {}
    return ativos


# --------------------------------------------------------------------------- #
# Leitura de CSVs
# --------------------------------------------------------------------------- #
def _ler_tabela(conteudo: bytes) -> pl.DataFrame:
    try:
        texto = conteudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = conteudo.decode("latin-1")
    if not texto.strip():
        raise ErroValidacao("O ficheiro está vazio.")
    primeira = texto.lstrip().splitlines()[0]
    # Aceita ';', ',' ou TAB (planilhas coladas/exportadas do Excel usam TAB)
    sep = max([";", "\t", ","], key=primeira.count)
    try:
        df = pl.read_csv(
            io.BytesIO(texto.encode("utf-8")),
            separator=sep,
            infer_schema=False,  # tudo como texto: preserva zeros à esquerda de CNPJ/ids
            truncate_ragged_lines=True,
        )
    except pl.exceptions.PolarsError as e:
        raise ErroValidacao(f"Não foi possível ler o CSV: {e}") from e
    return df.rename({c: c.strip().upper() for c in df.columns})


def ler_csv(conteudo: bytes) -> pl.DataFrame:
    df = _ler_tabela(conteudo)
    faltam = [c for c in COLUNAS_OBRIGATORIAS if c not in df.columns]
    if faltam:
        raise ErroValidacao(f"Colunas em falta no CSV: {', '.join(faltam)}.")
    if df.height == 0:
        raise ErroValidacao("O ficheiro não tem linhas de dados.")
    return df


@lru_cache(maxsize=4)
def _situacoes_em_cache(caminho: str, mtime_ns: int) -> pl.DataFrame:
    df = _ler_tabela(Path(caminho).read_bytes())
    for c in ("DOC", "SITUACAO_CADASTRAL"):
        if c not in df.columns:
            raise ErroValidacao(f"A tabela de CNPJs precisa da coluna {c}.")
    return df.select(
        pl.col("DOC").str.replace_all(r"\D", "").alias("_cnpj"),
        pl.col("SITUACAO_CADASTRAL").str.strip_chars().str.to_uppercase().alias("_situacao"),
    ).unique(subset="_cnpj", keep="last", maintain_order=True)


def carregar_situacoes(caminho: Path) -> pl.DataFrame:
    """Tabela de CNPJs (colunas DOC e SITUACAO_CADASTRAL; separador ';', ',' ou TAB).

    O resultado fica em cache e só é relido quando o arquivo é modificado.
    Quem não consta na tabela é tratado como não ativo (a regra barra a nota).
    """
    if not caminho.exists():
        raise ErroValidacao(f"Tabela de CNPJs não encontrada: {caminho.name}.")
    return _situacoes_em_cache(str(caminho.resolve()), caminho.stat().st_mtime_ns)


# --------------------------------------------------------------------------- #
# Validação
# --------------------------------------------------------------------------- #
def _preparar(df: pl.DataFrame, hoje: date) -> pl.DataFrame:
    def txt(nome: str) -> pl.Expr:
        if nome in df.columns:
            return pl.col(nome).str.strip_chars()
        return pl.lit(None, dtype=pl.String)

    # "15.200,50" -> 15200.5 ; "15200.5" -> 15200.5
    bruto = txt("VALOR_NOMINAL").str.replace_all(r"[R$\s]", "")
    valor = (
        pl.when(bruto.str.contains(",", literal=True))
        .then(bruto.str.replace_all(r"\.", "").str.replace(",", ".", literal=True))
        .otherwise(bruto)
        .cast(pl.Float64, strict=False)
    )
    venc_txt = txt("DATA_VENCIMENTO_ORIGINAL")
    venc = pl.coalesce(
        venc_txt.str.to_date("%d/%m/%Y", strict=False),
        venc_txt.str.to_date("%Y-%m-%d", strict=False),
    )
    cnpj = txt("DOC_SACADO").str.replace_all(r"\D", "")
    cnpj_ced = txt("DOC_CEDENTE").str.replace_all(r"\D", "")

    return (
        df.with_row_index("linha", offset=2)  # linha 1 é o cabeçalho
        .with_columns(
            txt("NU_DOCUMENTO").fill_null("").alias("id"),
            cnpj.alias("_cnpj"),
            cnpj.str.slice(0, 8).alias("_raiz_sacado"),
            cnpj_ced.str.slice(0, 8).alias("_raiz_cedente"),
            valor.alias("_valor"),
            venc.alias("_venc"),
            txt("TIPO_RECEBIVEL").alias("_tipo"),
        )
        .with_columns((pl.col("_venc") - pl.lit(hoje)).dt.total_days().alias("_prazo"))
    )


@dataclass
class Resultado:
    df: pl.DataFrame
    ativos: dict[str, dict[str, Any]]


def validar(
    df_bruto: pl.DataFrame,
    config: dict[str, Any],
    tabela_cnpjs: Path,
    hoje: date | None = None,
) -> Resultado:
    hoje = hoje or date.today()
    ativos = regras_ativas(config)

    if "CONCENTRACAO_MAXIMA_CEDENTE" in ativos and "DOC_CEDENTE" not in df_bruto.columns:
        raise ErroValidacao("A regra CONCENTRACAO_MAXIMA_CEDENTE exige a coluna DOC_CEDENTE no CSV.")

    df = _preparar(df_bruto, hoje)
    if "SITUACAO_CADASTRAL_SACADO" in ativos:
        df = df.join(carregar_situacoes(tabela_cnpjs), on="_cnpj", how="left")
    else:
        df = df.with_columns(pl.lit(None, dtype=pl.String).alias("_situacao"))

    falhas: list[pl.Expr] = []
    for codigo, params in ativos.items():
        try:
            expr = REGRAS[codigo].falha(params)
        except KeyError as e:
            raise ErroValidacao(f"Validador {codigo}: parâmetro {e.args[0]!r} em falta.") from e
        except (TypeError, ValueError) as e:
            raise ErroValidacao(f"Validador {codigo}: parâmetro inválido ({e}).") from e
        # Se a nota não pode ser avaliada (data/valor ilegível), ela é barrada.
        falhas.append(expr.fill_null(True).alias(f"f_{codigo}"))

    try:
        if falhas:
            df = df.with_columns(falhas)
            barrado = pl.concat_list(
                [pl.when(pl.col(f"f_{c}")).then(pl.lit(c)).otherwise(None) for c in ativos]
            ).list.drop_nulls()
            df = df.with_columns(barrado.alias("barrado_por"))
        else:
            df = df.with_columns(
                pl.Series("barrado_por", [[] for _ in range(df.height)], dtype=pl.List(pl.String))
            )
        df = df.sort("linha")
    except pl.exceptions.PolarsError as e:
        raise ErroValidacao(f"Falha ao aplicar os validadores: {e}") from e

    return Resultado(df=df, ativos=ativos)


# --------------------------------------------------------------------------- #
# Saídas
# --------------------------------------------------------------------------- #
def resultado_json(res: Resultado) -> list[dict[str, Any]]:
    """Formato pedido: {"linha", "id", "status", "barrado_por"?}."""
    saida: list[dict[str, Any]] = []
    for r in res.df.select("linha", "id", "barrado_por").iter_rows(named=True):
        item: dict[str, Any] = {
            "linha": r["linha"],
            "id": r["id"],
            "status": "BARRADO" if r["barrado_por"] else "APROVADO",
        }
        if r["barrado_por"]:
            item["barrado_por"] = r["barrado_por"]
        saida.append(item)
    return saida


def montar_notas(res: Resultado, lote_id: str) -> list[dict[str, Any]]:
    """Notas no formato que o frontend consome (ResultadoNota)."""
    df = res.df

    def col(nome: str) -> list[Any]:
        return df[nome].to_list() if nome in df.columns else [None] * df.height

    linhas, ids = col("linha"), col("id")
    nomes, docs = col("NOME_SACADO"), col("DOC_SACADO")
    cedentes, tipos = col("NOME_CEDENTE"), col("_tipo")
    valores, vencs, prazos = col("_valor"), col("_venc"), col("_prazo")
    venc_brutos, barrados = col("DATA_VENCIMENTO_ORIGINAL"), col("barrado_por")
    falhas = {c: col(f"f_{c}") for c in res.ativos}

    notas = []
    for i, linha in enumerate(linhas):
        regras = []
        for codigo, params in res.ativos.items():
            reprovada = bool(falhas[codigo][i])
            regras.append(
                {
                    "validador_id": codigo,
                    "nome": REGRAS[codigo].nome,
                    "aprovada": not reprovada,
                    "motivo": REGRAS[codigo].motivo(params) if reprovada else None,
                }
            )
        venc = vencs[i]
        notas.append(
            {
                "id": f"{lote_id}-{linha}",
                "linha": linha,
                "numero_nota": ids[i],
                "sacado": (nomes[i] or "").strip(),
                "cnpj_sacado": (docs[i] or "").strip(),
                "cedente": (cedentes[i] or "").strip(),
                "tipo_recebivel": tipos[i] or "",
                "valor_nominal": valores[i] if valores[i] is not None else 0.0,
                "data_vencimento": venc.isoformat() if venc else (venc_brutos[i] or ""),
                "prazo_dias": prazos[i],
                "status": "recusada" if barrados[i] else "aprovada",
                "regras": regras,
            }
        )
    return notas
