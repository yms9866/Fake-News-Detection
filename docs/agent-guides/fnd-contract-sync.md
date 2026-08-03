# fnd-contract-sync

Use this guide after changing request or response shapes.

Primary files:

- `packages/contracts/python/analysis_contracts.py`
- `packages/contracts/typescript/api.ts`
- `packages/contracts/openapi/openapi.json`
- Client mirrors under `apps/*/src/**/contracts.ts`
- Serializers in `apps/api/app/serializers.py`

Required command:

```powershell
$env:PYTHONPATH="C:\Users\yosef\fakemodel;C:\Users\yosef\fakemodel\venv\Lib\site-packages"
C:\Users\yosef\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe apps\api\scripts\export_openapi.py --output packages\contracts\openapi\openapi.json
```

Then run Python contract tests and all affected client tests.

