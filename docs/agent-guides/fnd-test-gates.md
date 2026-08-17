# fnd-test-gates

Run these from the repository root before handing off changes.

## Python

```powershell
python -m pip install -e .
python -m ruff check apps packages tests
python -m black --check apps packages tests
python -m pytest tests
```

## Clients

```powershell
pnpm install
pnpm -r typecheck
pnpm -r lint
pnpm -r test
```

Do not claim PostgreSQL, MySQL, Gemini grounding, or real OCR works unless the corresponding external integration or smoke test was actually run.

GitHub Actions runs the Python and client jobs in `.github/workflows/ci.yml`.
