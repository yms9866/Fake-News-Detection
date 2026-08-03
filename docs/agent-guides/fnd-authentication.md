# fnd-authentication

Use this guide when changing sign-in, sessions, ownership, or client token handling.

Paths:

- API routes: `apps/api/app/routes/auth.py`
- Application service: `packages/backend/fnd/application/services/auth.py`
- Domain auth/session types: `packages/backend/fnd/domain/enterprise.py`
- Ports: `packages/backend/fnd/ports/enterprise.py`
- Web client: `apps/web/src/api/client.ts`
- Desktop client: `apps/desktop/src/renderer/api/client.ts`
- Extension client: `apps/extension/src/shared/api-client.ts`
- Mobile client: `apps/mobile/src/api/client.ts`

Rules:

- Store session tokens as hashes server-side.
- Do not render token values.
- Extension content scripts must not receive auth tokens.
- Sign out should revoke the backend session and clear local client state.
- Protected history and live-session operations must include owner checks when durable repositories are enabled.

