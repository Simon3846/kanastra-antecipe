# Portal Antecipe integrado

Projeto reunido com frontend React + Vite e API Python + FastAPI. O frontend mantém a interface enviada e consome a API real para importar CSV, visualizar resultados, baixar o resultado JSON e executar simulações.

## Estrutura

- `frontend/` — interface React/TypeScript.
- `backend/backend/` — API FastAPI, motor de validação, regras e dados de apoio.
- `backend/.env.example` — exemplo de configuração do backend.
- `frontend/.env.example` — URL da API para o frontend.

## Requisitos

- Python 3.10 ou superior (recomendado Python 3.11/3.12 para melhor compatibilidade das dependências).
- Node.js 20.19+ ou 22.12+.

## 1. Iniciar o backend

No terminal, entre na pasta `backend/backend`:

```bash
cd backend/backend
python -m venv .venv
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
```

Configure a taxa mensal usada pela simulação. `0.02` equivale a 2% ao mês; substitua pelo valor aprovado para sua operação. No macOS/Linux:

```bash
export ANTECIPE_TAXA_MENSAL=0.02
uvicorn main:app --reload --port 8000
```

No Windows PowerShell:

```powershell
$env:ANTECIPE_TAXA_MENSAL="0.02"
uvicorn main:app --reload --port 8000
```

A API estará em `http://localhost:8000` e a documentação interativa em `http://localhost:8000/docs`. Teste `http://localhost:8000/saude`, que deve responder `{"status":"ok"}`.

## 2. Iniciar o frontend

Em outro terminal, entre na pasta `frontend`:

```bash
cd frontend
npm install
```

Copie `.env.example` para `.env.local` (ou crie `.env.local`) com:

```env
VITE_ANTECIPE_API_URL=http://localhost:8000
```

Depois execute:

```bash
npm run dev
```

Abra o endereço local informado pelo Vite (normalmente `http://localhost:5173`). Se alterar `.env.local`, reinicie o servidor Vite.

## Fluxo de uso

1. Abra **Importar CSV** e selecione o arquivo de recebíveis.
2. O frontend envia o CSV e os validadores configurados para `POST /analises`.
3. Os lotes ficam disponíveis em **Resultados**; selecione uma nota para consultar as regras que passaram/falharam.
4. Use **Baixar JSON** para exportar o resultado processado.
5. Em **Simulação**, selecione o lote e solicite o cálculo usando a taxa configurada no backend.
6. Alterações em **Validadores** ficam salvas no navegador e são enviadas junto da próxima análise. O botão de exportação permite salvar a configuração em JSON.

## Observações importantes

- A taxa `ANTECIPE_TAXA_MENSAL=0.02` é apenas um valor de exemplo para execução local. Não use em produção sem confirmar a taxa aplicável.
- Os dados de `data/cnpjs_ativos.csv` são dados de apoio/demonstração; valide a origem e a atualização antes de usar em operação real.
- A API atualmente permite CORS por padrão. Em produção, configure `ANTECIPE_CORS` para a origem exata do frontend.
- Não coloque senhas, tokens ou credenciais no frontend. Variáveis `VITE_*` ficam visíveis no navegador.
- A configuração de validadores enviada na análise é aplicada àquele lote. A tela de validadores não altera silenciosamente o arquivo global do servidor.
