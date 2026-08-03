# fnd-test-gates

Use this guide before handing off changes.

Python:

```powershell
$env:PYTHONPATH="C:\Users\yosef\fakemodel;C:\Users\yosef\fakemodel\venv\Lib\site-packages"
C:\Users\yosef\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m black --check apps\api\app packages\backend\fnd packages\contracts\python tests infra\alembic
C:\Users\yosef\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m ruff check apps\api\app packages\backend\fnd packages\contracts\python tests infra\alembic
C:\Users\yosef\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m unittest discover tests
```

Clients:

```powershell
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web test:e2e
pnpm --filter desktop typecheck
pnpm --filter desktop lint
pnpm --filter desktop test
pnpm --filter desktop test:e2e
pnpm --filter extension typecheck
pnpm --filter extension lint
pnpm --filter extension test
pnpm --filter extension test:e2e
pnpm --filter mobile typecheck
pnpm --filter mobile lint
pnpm --filter mobile test
pnpm --filter mobile test:static
pnpm --filter mobile test:e2e
```

Do not claim PostgreSQL, MySQL, Gemini grounding, or real OCR works unless the corresponding external integration or smoke test was actually run.

