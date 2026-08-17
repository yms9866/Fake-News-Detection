# FND — fake-news analysis platform

Local-first tool for analyzing text, URLs, and media. A FastAPI backend scores writing style with ModernBERT and optionally checks claims against public sources. Clients talk to that API.

## Layout

| Path | Role |
| --- | --- |
| `apps/api` | FastAPI HTTP adapter |
| `apps/web` | Browser client |
| `apps/desktop` | Electron client |
| `apps/extension` | Chrome MV3 client |
| `apps/mobile` | Expo / React Native client |
| `apps/cli` | Command-line reporter |
| `packages/backend/fnd` | Domain, ports, workflows, adapters |
| `packages/contracts` | OpenAPI, Pydantic, TypeScript types |
| `packages/client-sdk` | Shared HTTP client |
| `packages/analysis-view-model` | Shared result/error display mapping |
| `packages/ml` | Training and model-loading code |

The 2017 LIAR dataset notes that used to live in the root README are in [docs/LIAR-dataset.md](docs/LIAR-dataset.md). Training entrypoints `train.py` and `evaluatemodel.py` import from `packages.ml`.

## Run locally

Install Python deps into a venv, then:

```powershell
python -m pip install -e .
python -m uvicorn apps.api.app.main:app --host 127.0.0.1 --port 8000
```

Web client:

```powershell
pnpm install
pnpm --filter web dev
```

Open the URL Vite prints (usually `http://127.0.0.1:5173`). The API must be on `http://127.0.0.1:8000`.

Optional CORS origins (comma-separated):

```powershell
$env:FND_CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
```

There is no user login. Analysis endpoints are open on the local API.

## Tests

```powershell
python -m pytest tests
pnpm --filter web test
```
