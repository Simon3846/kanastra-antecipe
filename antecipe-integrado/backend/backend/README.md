# Backend Antecipe (FastAPI + Polars)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# taxa usada só na simulação (fração ao mês; 0.02 = 2% a.m.) — defina a sua
export ANTECIPE_TAXA_MENSAL=0.02
uvicorn main:app --reload --port 8000
```

Frontend: copie `.env.example` para `.env.local` (na raiz) e rode `npm run dev`.

## Arquivos
- `validacao.py` – motor de validação em Polars (tradução do `teste/teste.py`).
- `validadores_antecipe.json` – restrições padrão do servidor.
- `data/cnpjs_ativos.csv` – tabela fictícia `DOC;SITUACAO_CADASTRAL`.
- `data/estoque_exemplo.csv` – estoque de exemplo (datas calibradas para 24/10/2026).
- `test_api.py` – testes (`pytest`).

## Variáveis de ambiente (opcionais)
`ANTECIPE_TAXA_MENSAL`, `ANTECIPE_VALIDADORES`, `ANTECIPE_CNPJS`, `ANTECIPE_DATA_DIR`,
`ANTECIPE_CORS` (origens separadas por vírgula; padrão `*`), `ANTECIPE_HOJE` (AAAA-MM-DD, só para testes).

## Teste rápido via curl
```bash
ANTECIPE_HOJE=2026-10-24 uvicorn main:app --port 8000 &
curl -F file=@data/estoque_exemplo.csv http://localhost:8000/analises            # análise completa
curl -F file=@data/estoque_exemplo.csv -F validadores=@validadores_antecipe.json \
     http://localhost:8000/analises                                             # com restrições do usuário
curl -OJ http://localhost:8000/analises/<LOTE_ID>/resultado.json                 # arquivo JSON
```
