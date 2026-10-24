"""Persistência em disco dos lotes analisados e simulação financeira."""

from __future__ import annotations

import json
import os
import re
import secrets
from datetime import datetime
from pathlib import Path
from typing import Any

BASE = Path(__file__).parent
DATA_DIR = Path(os.getenv("ANTECIPE_DATA_DIR", BASE / "data" / "lotes"))
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class LoteNaoEncontrado(Exception):
    pass


class SemTaxa(Exception):
    pass


def novo_lote_id() -> str:
    return f"LOTE-{datetime.now():%Y%m%d-%H%M%S}-{secrets.token_hex(2).upper()}"


def _pasta(lote_id: str) -> Path:
    if not _ID_RE.match(lote_id):
        raise LoteNaoEncontrado(lote_id)
    return DATA_DIR / lote_id


def _escrever(caminho: Path, dados: Any) -> None:
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")


def salvar(
    lote_id: str,
    analise: dict[str, Any],
    resultado: list[dict[str, Any]],
    config: dict[str, Any],
) -> None:
    pasta = _pasta(lote_id)
    pasta.mkdir(parents=True, exist_ok=True)
    _escrever(pasta / "analise.json", analise)
    _escrever(pasta / "meta.json", {k: v for k, v in analise.items() if k != "notas"})
    _escrever(pasta / "resultado.json", resultado)
    _escrever(pasta / "validadores_usados.json", config)


def listar() -> list[dict[str, Any]]:
    if not DATA_DIR.exists():
        return []
    metas = [json.loads(p.read_text(encoding="utf-8")) for p in DATA_DIR.glob("*/meta.json")]
    return sorted(metas, key=lambda m: m["criado_em"], reverse=True)


def obter(lote_id: str) -> dict[str, Any]:
    caminho = _pasta(lote_id) / "analise.json"
    if not caminho.exists():
        raise LoteNaoEncontrado(lote_id)
    return json.loads(caminho.read_text(encoding="utf-8"))


def caminho_resultado(lote_id: str) -> Path:
    caminho = _pasta(lote_id) / "resultado.json"
    if not caminho.exists():
        raise LoteNaoEncontrado(lote_id)
    return caminho


# --------------------------------------------------------------------------- #
# Financeiro
# --------------------------------------------------------------------------- #
def taxa_mensal() -> float | None:
    """Taxa de desconto ao mês, em fração (0.02 = 2% a.m.), via ANTECIPE_TAXA_MENSAL."""
    bruto = os.getenv("ANTECIPE_TAXA_MENSAL", "").strip()
    if not bruto:
        return None
    return float(bruto.replace(",", "."))


def _prazo(nota: dict[str, Any]) -> int:
    return max(int(nota.get("prazo_dias") or 0), 0)


def simular(analise: dict[str, Any], taxa: float | None) -> dict[str, Any]:
    if taxa is None:
        raise SemTaxa("Taxa de desconto não configurada (defina ANTECIPE_TAXA_MENSAL).")
    aprovadas = [n for n in analise["notas"] if n["status"] == "aprovada"]
    nominal = sum(n["valor_nominal"] for n in aprovadas)
    # Desconto composto: valor presente = valor / (1 + taxa) ** (dias / 30)
    liquido = sum(n["valor_nominal"] / (1 + taxa) ** (_prazo(n) / 30) for n in aprovadas)
    prazo_medio = (
        round(sum(n["valor_nominal"] * _prazo(n) for n in aprovadas) / nominal) if nominal > 0 else None
    )
    return {
        "lote_id": analise["lote_id"],
        "valor_nominal": round(nominal, 2),
        "desconto": round(nominal - liquido, 2),
        "valor_liquido": round(liquido, 2),
        "taxa_mensal": taxa,
        "prazo_medio_dias": prazo_medio,
    }
