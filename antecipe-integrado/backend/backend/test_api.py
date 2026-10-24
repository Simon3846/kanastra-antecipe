import json
import os
import tempfile
from datetime import date
from pathlib import Path

os.environ["ANTECIPE_HOJE"] = "2026-10-24"
os.environ["ANTECIPE_DATA_DIR"] = tempfile.mkdtemp()
os.environ["ANTECIPE_TAXA_MENSAL"] = "0.02"

from fastapi.testclient import TestClient  # noqa: E402

import validacao  # noqa: E402
from main import app  # noqa: E402

BASE = Path(__file__).parent
EXEMPLO = BASE / "data" / "estoque_exemplo.csv"
client = TestClient(app)

ESPERADO = {
    "725714": [],
    "1-759172": ["CONCENTRACAO_MAXIMA_SACADO"],
    "1-759173": ["CONCENTRACAO_MAXIMA_SACADO"],
    "725715": [],
    "725716": ["SITUACAO_CADASTRAL_SACADO"],
    "725717": ["TIPO_RECEBIVEL"],
    "725718": ["VALOR_MINIMO"],
    "725719": ["NAO_VENCIDA"],
    "725720": ["PRAZO_MAXIMO"],
    "725721": ["SITUACAO_CADASTRAL_SACADO"],
    "725722": [],
    "725723": [],
    "725724": [],
    "725725": [],
    "725726": ["CONCENTRACAO_MAXIMA_SACADO"],
}


def enviar(extra=None, csv=None):
    files = {"file": ("estoque.csv", csv or EXEMPLO.read_bytes(), "text/csv")}
    if extra:
        files["validadores"] = ("regras.json", extra, "application/json")
    return client.post("/analises", files=files)


def test_fluxo_completo():
    r = enviar()
    assert r.status_code == 200, r.text
    lote = r.json()["lote_id"]

    res = client.get(f"/analises/{lote}/resultado.json")
    assert res.status_code == 200
    linhas = res.json()
    assert linhas[0] == {"linha": 2, "id": "725714", "status": "APROVADO"}
    assert linhas[1] == {
        "linha": 3,
        "id": "1-759172",
        "status": "BARRADO",
        "barrado_por": ["CONCENTRACAO_MAXIMA_SACADO"],
    }
    assert {l["id"]: l.get("barrado_por", []) for l in linhas} == ESPERADO

    a = client.get(f"/analises/{lote}").json()
    assert a["resumo"]["aprovadas"] == 6 and a["resumo"]["recusadas"] == 9
    assert client.get("/analises").json()[0]["lote_id"] == lote

    s = client.post("/simulacoes", json={"lote_id": lote}).json()
    assert s["valor_nominal"] == 15200 + 22000 + 18400 + 11900 + 9800 + 14300
    assert 0 < s["valor_liquido"] < s["valor_nominal"]


def test_restricoes_do_usuario_substituem_as_do_servidor():
    regras = {"validadores": [{"codigo": "VALOR_MINIMO", "ativo": True, "parametros": {"valor_minimo": 20000}}]}
    r = enviar(json.dumps(regras).encode())
    assert r.status_code == 200
    notas = r.json()["notas"]
    assert all(len(n["regras"]) == 1 for n in notas)
    assert {n["numero_nota"] for n in notas if n["status"] == "aprovada"} == {"1-759172", "1-759173", "725715"}


def test_erros_sao_422():
    assert enviar(csv=b"A;B\n1;2").status_code == 422
    assert enviar(b'{"validadores":[{"codigo":"XPTO","ativo":true}]}').status_code == 422
    assert enviar(b"nao e json").status_code == 422
    assert client.get("/analises/inexistente").status_code == 404


def test_cedente_e_cnpj_valido_quando_ativados():
    regras = {
        "validadores": [
            {"codigo": "CNPJ_SACADO_VALIDO", "ativo": True},
            {"codigo": "CONCENTRACAO_MAXIMA_CEDENTE", "ativo": True, "parametros": {"percentual_maximo": 8.0}},
        ]
    }
    r = enviar(json.dumps(regras).encode())
    assert r.status_code == 200
    assert all(n["status"] == "recusada" for n in r.json()["notas"])  # 2 cedentes, ~50% cada


def test_tabela_de_cnpjs_com_tab_e_cache(tmp_path):
    arq = tmp_path / "cnpjs.tsv"
    arq.write_text("DOC\tSITUACAO_CADASTRAL\n01.000.171/0001-83\tATIVA\n", encoding="utf-8")
    df = validacao.carregar_situacoes(arq)
    assert df.to_dicts() == [{"_cnpj": "01000171000183", "_situacao": "ATIVA"}]
    assert validacao.carregar_situacoes(arq) is df  # cache

    arq.write_text("DOC\tSITUACAO_CADASTRAL\n01.000.171/0001-83\tBAIXADA\n", encoding="utf-8")
    assert validacao.carregar_situacoes(arq).to_dicts()[0]["_situacao"] == "BAIXADA"  # arquivo mudou
