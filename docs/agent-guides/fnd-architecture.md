# fnd-architecture

Use this guide when changing backend structure or deciding where code belongs.

- Domain code: `packages/backend/fnd/domain/`
- Ports: `packages/backend/fnd/ports/`
- Application workflows/services: `packages/backend/fnd/application/`
- Adapters: `packages/backend/fnd/adapters/`
- FastAPI composition root and routes: `apps/api/app/`

Rules:

- Do not import FastAPI, SQLAlchemy, Gemini SDKs, Torch, Transformers, React, Electron, Expo, or browser APIs from domain code.
- Route handlers stay thin and call application services.
- Concrete provider construction happens in `packages/backend/fnd/application/bootstrap.py` or `apps/api/app/state.py`.
- Keep CLI compatibility through the existing workflow entry points.

