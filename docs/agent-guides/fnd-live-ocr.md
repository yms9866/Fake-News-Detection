# fnd-live-ocr

Use this guide when changing live capture, OCR, events, or verification.

Paths:

- API routes: `apps/api/app/routes/live.py`
- Application services: `packages/backend/fnd/application/services/live_ocr.py`
- Contracts: `packages/contracts/python/analysis_contracts.py`
- Web UI: `apps/web/src/App.tsx`
- Desktop UI: `apps/desktop/src/renderer/screens/live-ocr-screen.ts`
- Extension handoff: `apps/extension/src/shared/api-client.ts`
- Mobile UI: `apps/mobile/src/App.tsx`

Rules:

- Capture only after explicit user permission.
- Submit frames at a controlled interval, not every rendered frame.
- Skip duplicate or near-duplicate frames.
- Stabilize text before verification.
- Do not show raw hashes, counters, event sequence numbers, adapter names, or temporary paths in normal UI.
- Stop/cancel should clean timers, capture tracks, temporary artifacts, and pending work.

