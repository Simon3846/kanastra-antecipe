"""API Antecipe (FastAPI): liga o frontend ao motor de validação em Polars.

Executar:  uvicorn main:app --reload --port 8000   (dentro de backend/)
"""

from __future__ import annotations

import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import store
from validacao import (
    REGRAS,
    ErroValidacao,
    ler_csv,
    montar_notas,
    resultado_json,
    validar,
    validar_config,
)

BASE = Path(__file__).parent
CONFIG_PADRAO = Path(os.getenv("ANTECIPE_VALIDADORES", BASE / "validadores_antecipe.json"))
TABELA_CNPJS = Path(os.getenv("ANTECIPE_CNPJS", BASE / "data" / "cnpjs_ativos.csv"))
# Só para testes/demonstração com dados de datas fixas: ANTECIPE_HOJE=2026-10-24
HOJE = date.fromisoformat(os.environ["ANTECIPE_HOJE"]) if os.getenv("ANTECIPE_HOJE") else None

app = FastAPI(title="Antecipe API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ANTECIPE_CORS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Utilitários
# --------------------------------------------------------------------------- #
def _ler_upload(arquivo: UploadFile) -> bytes:
    conteudo = arquivo.file.read()
    return conteudo

def _carregar_config(conteudo: bytes | None) -> dict[str, Any]:
    """JSON enviado pelo usuário; sem ele, usa o validadores_antecipe.json do servidor."""
    origem = conteudo if conteudo else CONFIG_PADRAO.read_bytes()
    try:
        config = json.loads(origem.decode("utf-8-sig"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ErroValidacao(f"O JSON de validadores é inválido: {e}") from e
    return validar_config(config)


def _taxa() -> float | None:
    try:
        return store.taxa_mensal()
    except ValueError as e:
        raise HTTPException(500, "ANTECIPE_TAXA_MENSAL inválida no servidor.") from e


# --------------------------------------------------------------------------- #
# Rotas (contrato esperado por src/lib/antecipe/api.ts)
# --------------------------------------------------------------------------- #
@app.get("/saude")
def saude() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/validadores")
def listar_validadores() -> list[dict[str, Any]]:
    try:
        config = _carregar_config(None)
    except ErroValidacao as e:
        raise HTTPException(500, str(e)) from e
    saida = []
    for item in config["validadores"]:
        regra = REGRAS.get(item["codigo"])
        parametros = {
            k: ", ".join(map(str, v)) if isinstance(v, list) else v
            for k, v in (item.get("parametros") or {}).items()
        }
        saida.append(
            {
                "id": item["codigo"],
                "nome": regra.nome if regra else item["codigo"],
                "descricao": regra.descricao if regra else "Validador não reconhecido pelo backend.",
                "ativo": bool(item.get("ativo")),
                "parametros": parametros,
            }
        )
    return saida


@app.post("/analises")
def criar_analise(
    file: UploadFile = File(...),
    validadores: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    """Recebe o CSV (e, opcionalmente, o JSON de restrições) e devolve a análise."""
    conteudo = _ler_upload(file)
    json_usuario = _ler_upload(validadores) if validadores is not None and validadores.filename else None
    try:
        config = _carregar_config(json_usuario)
        resultado = validar(ler_csv(conteudo), config, TABELA_CNPJS, hoje=HOJE)
    except ErroValidacao as e:
        raise HTTPException(422, str(e)) from e

    lote_id = store.novo_lote_id()
    notas = montar_notas(resultado, lote_id)
    aprovadas = [n for n in notas if n["status"] == "aprovada"]
    taxa = _taxa()
    analise: dict[str, Any] = {
        "lote_id": lote_id,
        "ficheiro": file.filename or "estoque.csv",
        "criado_em": datetime.now(timezone.utc).isoformat(),
        "resumo": {
            "total_notas": len(notas),
            "aprovadas": len(aprovadas),
            "recusadas": len(notas) - len(aprovadas),
            "pendentes": 0,
            "valor_nominal_total": round(sum(n["valor_nominal"] for n in notas), 2),
            "valor_nominal_aprovado": round(sum(n["valor_nominal"] for n in aprovadas), 2),
            "valor_liquido_estimado": (
                store.simular({"lote_id": lote_id, "notas": notas}, taxa)["valor_liquido"]
                if taxa is not None
                else None
            ),
        },
        "notas": notas,
    }
    store.salvar(lote_id, analise, resultado_json(resultado), config)
    return analise


@app.get("/analises")
def listar_analises() -> list[dict[str, Any]]:
    return store.listar()


@app.get("/analises/{lote_id}")
def obter_analise(lote_id: str) -> dict[str, Any]:
    try:
        return store.obter(lote_id)
    except store.LoteNaoEncontrado as e:
        raise HTTPException(404, "Lote não encontrado.") from e


@app.get("/analises/{lote_id}/resultado.json")
def baixar_resultado(lote_id: str) -> FileResponse:
    """Arquivo JSON no formato [{"linha", "id", "status", "barrado_por"?}, ...]."""
    try:
        caminho = store.caminho_resultado(lote_id)
    except store.LoteNaoEncontrado as e:
        raise HTTPException(404, "Lote não encontrado.") from e
    return FileResponse(
        caminho, media_type="application/json", filename=f"resultado_{lote_id}.json"
    )


class PedidoSimulacao(BaseModel):
    lote_id: str


@app.post("/simulacoes")
def simular(pedido: PedidoSimulacao) -> dict[str, Any]:
    try:
        analise = store.obter(pedido.lote_id)
    except store.LoteNaoEncontrado as e:
        raise HTTPException(404, "Lote não encontrado.") from e
    try:
        return store.simular(analise, _taxa())
    except store.SemTaxa as e:
        raise HTTPException(409, str(e)) from e
