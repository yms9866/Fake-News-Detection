# fnd-evidence-pipeline

Use this guide when changing claims, search, source review, Gemini, or final verdicts.

Paths:

- Workflow: `packages/backend/fnd/application/workflows/analyze_content.py`
- Evidence review: `packages/backend/fnd/application/services/evidence_pipeline.py`
- Verdict policy: `packages/backend/fnd/application/services/verdict_policy.py`
- Search port: `packages/backend/fnd/ports/search.py`
- Search adapter: `packages/backend/fnd/adapters/search/duckduckgo.py`
- Gemini adapter: `packages/backend/fnd/adapters/llm/gemini.py`
- API serializer: `apps/api/app/serializers.py`

Rules:

- Extract atomic claims before searching.
- Generate multiple targeted public-web queries per claim.
- Do not qualify search snippets as evidence.
- Fetch and review source pages when possible.
- Unknown reliability is different from low reliability.
- Gemini evidence analysis must remain separate from deterministic final verdict.

