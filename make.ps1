# FND monorepo task runner (Windows-friendly mirror of Makefile).
# Usage: .\make.ps1 help
#        .\make.ps1 api-reload
#        .\make.ps1 evaluate-backup-gt30

param(
    [Parameter(Position = 0)]
    [string]$Target = "help",

    [string]$Text = "",
    [string]$Url = "",
    [string]$File = "",
    [switch]$DeepCheck,

    [string]$ModelPath = "models/modernbert_fake_news_512",
    [string]$TestCsv = "",
    [string]$EvalOutput = "",
    [string]$EvalCleaning = "training",
    [int]$Limit = 0,

    [string]$TrainOutput = "models/modernbert_fake_news_512",
    [int]$Epochs = 3
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$VenvDir = Join-Path $Root "venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$PythonBootstrap = if ($env:PYTHON) { $env:PYTHON } else { "python" }

function Resolve-ProjectPython {
    if ($env:PYTHON) { return $env:PYTHON }
    if (Test-Path $VenvPython) { return $VenvPython }
    return $PythonBootstrap
}

$Python = Resolve-ProjectPython
$Pnpm = if ($env:PNPM) { $env:PNPM } else { "pnpm" }
$UvicornHost = if ($env:UVICORN_HOST) { $env:UVICORN_HOST } else { "127.0.0.1" }
$UvicornPort = if ($env:UVICORN_PORT) { $env:UVICORN_PORT } else { "8000" }
$DatasetsDir = "datasets"

function Show-Help {
    @"
FND task runner — .\make.ps1 <target>

Primary (most used)
  backend              FastAPI with reload
  web                  web dev server
  desktop              Electron dev
  mobile               Expo dev
  cli                  predict.py (--help, or -Text / -Url / -File)
  extension-build      build Chrome extension dist
  evaluate             evaluate model (default: datasets/test.csv)

Setup
  setup                create venv + pip install -e . + pnpm install
  install              same as setup (venv + backend + all clients)
  install-python       pip install -e . into ./venv
  install-node         pnpm install

API
  api                  uvicorn (no reload)
  api-reload           uvicorn --reload
  api-export-openapi   export OpenAPI JSON

Dev clients (run api-reload in another terminal)
  dev-web              pnpm --filter web dev
  dev-desktop          pnpm --filter desktop dev
  dev-extension        pnpm --filter extension dev
  dev-mobile           pnpm --filter mobile dev

Build
  build                build all clients
  build-web / build-desktop / build-extension / build-mobile

Test & quality
  test                 pytest + all pnpm tests
  test-py              pytest tests/
  test-js              pnpm -r test
  test-web / test-desktop / test-extension / test-mobile
  test-e2e-web / test-e2e-desktop / test-e2e-extension / test-e2e-mobile
  typecheck            pnpm -r typecheck
  lint                 pnpm -r lint
  lint-py              ruff check

CLI predict
  predict-text -Text '...' [-DeepCheck]
  predict-url  -Url 'https://...' [-DeepCheck]
  predict-file -File 'path' [-DeepCheck]

ML
  train                full ModernBERT training
  train-quick          100 samples smoke train
  evaluate-test / evaluate-backup / evaluate-backup-gt30 / evaluate-valid
  evaluate-enhanced    enhanced cleaning mode
  filter-backup-gt30   build backup/test_gt30_words.csv
  filter-test-gt30     build datasets/test_gt30_words.csv

Other
  migrate              print migration SQL

Tip: GNU Make users can also run 'make help' from Git Bash / WSL.
"@
}

function Invoke-Python {
    param([string[]]$Args)
    & $Python @Args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Invoke-Pnpm {
    param([string[]]$Args)
    & $Pnpm @Args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Ensure-Venv {
    if (-not (Test-Path $VenvPython)) {
        Write-Host "Creating virtual environment in venv..."
        & $PythonBootstrap -m venv $VenvDir
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    $script:Python = $VenvPython
}

function Require-Venv {
    if (-not (Test-Path $VenvPython)) {
        throw "No venv found at venv\. Run: .\make.ps1 setup"
    }
    $script:Python = $VenvPython
}

function Invoke-Evaluate {
    param(
        [string]$Csv,
        [string]$Out,
        [string]$Cleaning = "training",
        [int]$RowLimit = 0
    )
    $args = @(
        "evaluatemodel.py",
        "--model", $ModelPath,
        "--test-csv", $Csv,
        "--output-dir", $Out,
        "--batch-size", "16",
        "--max-length", "512",
        "--cleaning-mode", $Cleaning
    )
    if ($RowLimit -gt 0) { $args += @("--limit", "$RowLimit") }
    Invoke-Python $args
}

switch ($Target) {
    "help" { Show-Help; exit 0 }

    "backend" { & $MyInvocation.MyCommand.Path "api-reload"; exit $LASTEXITCODE }
    "web" { & $MyInvocation.MyCommand.Path "dev-web"; exit $LASTEXITCODE }
    "desktop" { & $MyInvocation.MyCommand.Path "dev-desktop"; exit $LASTEXITCODE }
    "mobile" { & $MyInvocation.MyCommand.Path "dev-mobile"; exit $LASTEXITCODE }
    "extension-build" { & $MyInvocation.MyCommand.Path "build-extension"; exit $LASTEXITCODE }
    "extention-build" { & $MyInvocation.MyCommand.Path "extension-build"; exit $LASTEXITCODE }

    "cli" {
        if ($Text) {
            $args = @("predict.py", "--text", $Text)
            if ($DeepCheck) { $args += "--deep-check" }
            Invoke-Python $args
        } elseif ($Url) {
            $args = @("predict.py", "--url", $Url)
            if ($DeepCheck) { $args += "--deep-check" }
            Invoke-Python $args
        } elseif ($File) {
            $args = @("predict.py", "--file", $File)
            if ($DeepCheck) { $args += "--deep-check" }
            Invoke-Python $args
        } else {
            Invoke-Python @("predict.py", "--help")
        }
    }

    "evaluate" {
        $csv = if ($TestCsv) { $TestCsv } else { "$DatasetsDir/test.csv" }
        $out = if ($EvalOutput) { $EvalOutput } else { "evaluation_results" }
        Invoke-Evaluate -Csv $csv -Out $out -Cleaning $EvalCleaning -RowLimit $Limit
    }

    "setup" {
        Ensure-Venv
        Invoke-Python @("-m", "pip", "install", "--upgrade", "pip")
        Invoke-Python @("-m", "pip", "install", "-e", ".")
        Invoke-Pnpm @("install")
        Write-Host "Setup complete. Using venv Python: $Python"
    }

    "install" {
        Ensure-Venv
        Invoke-Python @("-m", "pip", "install", "--upgrade", "pip")
        Invoke-Python @("-m", "pip", "install", "-e", ".")
        Invoke-Pnpm @("install")
    }
    "install-python" {
        Ensure-Venv
        Invoke-Python @("-m", "pip", "install", "--upgrade", "pip")
        Invoke-Python @("-m", "pip", "install", "-e", ".")
    }
    "install-node" { Invoke-Pnpm @("install") }

    "api" {
        Require-Venv
        Invoke-Python @("-m", "uvicorn", "apps.api.app.main:app", "--host", $UvicornHost, "--port", $UvicornPort)
    }
    "api-reload" {
        Require-Venv
        Invoke-Python @("-m", "uvicorn", "apps.api.app.main:app", "--host", $UvicornHost, "--port", $UvicornPort, "--reload")
    }
    "api-export-openapi" { Invoke-Python @("apps/api/scripts/export_openapi.py") }

    "dev-web" { Invoke-Pnpm @("--filter", "web", "dev") }
    "dev-desktop" { Invoke-Pnpm @("--filter", "desktop", "dev") }
    "dev-extension" { Invoke-Pnpm @("--filter", "extension", "dev") }
    "dev-mobile" { Invoke-Pnpm @("--filter", "mobile", "dev") }

    "build" {
        Invoke-Pnpm @("--filter", "web", "build")
        Invoke-Pnpm @("--filter", "desktop", "build")
        Invoke-Pnpm @("--filter", "extension", "build")
        Invoke-Pnpm @("--filter", "mobile", "build")
    }
    "build-web" { Invoke-Pnpm @("--filter", "web", "build") }
    "build-desktop" { Invoke-Pnpm @("--filter", "desktop", "build") }
    "build-extension" { Invoke-Pnpm @("--filter", "extension", "build") }
    "build-mobile" { Invoke-Pnpm @("--filter", "mobile", "build") }

    "test" { Invoke-Python @("-m", "pytest", "tests"); Invoke-Pnpm @("-r", "--if-present", "test") }
    "test-py" { Invoke-Python @("-m", "pytest", "tests") }
    "test-js" { Invoke-Pnpm @("-r", "--if-present", "test") }
    "test-web" { Invoke-Pnpm @("--filter", "web", "test") }
    "test-desktop" { Invoke-Pnpm @("--filter", "desktop", "test") }
    "test-extension" { Invoke-Pnpm @("--filter", "extension", "test") }
    "test-mobile" { Invoke-Pnpm @("--filter", "mobile", "test") }
    "test-e2e-web" { Invoke-Pnpm @("--filter", "web", "test:e2e") }
    "test-e2e-desktop" { Invoke-Pnpm @("--filter", "desktop", "test:e2e") }
    "test-e2e-extension" { Invoke-Pnpm @("--filter", "extension", "test:e2e") }
    "test-e2e-mobile" { Invoke-Pnpm @("--filter", "mobile", "test:e2e") }

    "typecheck" { Invoke-Pnpm @("-r", "--if-present", "typecheck") }
    "lint" { Invoke-Pnpm @("-r", "--if-present", "lint") }
    "lint-py" { Invoke-Python @("-m", "ruff", "check", "apps", "packages", "tests", "train.py", "evaluatemodel.py", "predict.py") }

    "predict-text" {
        if (-not $Text) { throw "Use -Text 'your claim'" }
        $args = @("predict.py", "--text", $Text)
        if ($DeepCheck) { $args += "--deep-check" }
        Invoke-Python $args
    }
    "predict-url" {
        if (-not $Url) { throw "Use -Url 'https://...'" }
        $args = @("predict.py", "--url", $Url)
        if ($DeepCheck) { $args += "--deep-check" }
        Invoke-Python $args
    }
    "predict-file" {
        if (-not $File) { throw "Use -File 'path'" }
        $args = @("predict.py", "--file", $File)
        if ($DeepCheck) { $args += "--deep-check" }
        Invoke-Python $args
    }

    "train" {
        Invoke-Python @(
            "train.py",
            "--output", $TrainOutput,
            "--epochs", "$Epochs"
        )
    }
    "train-quick" {
        Invoke-Python @(
            "train.py",
            "--output", $TrainOutput,
            "--epochs", "1",
            "--max-samples", "100"
        )
    }

    "evaluate-enhanced" {
        $csv = if ($TestCsv) { $TestCsv } else { "$DatasetsDir/test.csv" }
        $out = if ($EvalOutput) { $EvalOutput } else { "evaluation_results" }
        Invoke-Evaluate -Csv $csv -Out $out -Cleaning "enhanced" -RowLimit $Limit
    }
    "evaluate-test" { Invoke-Evaluate -Csv "$DatasetsDir/test.csv" -Out "evaluation_results" }
    "evaluate-backup" { Invoke-Evaluate -Csv "$DatasetsDir/backup/test.csv" -Out "evaluationresults" }
    "evaluate-backup-gt30" { Invoke-Evaluate -Csv "$DatasetsDir/backup/test_gt30_words.csv" -Out "evaluation_resultsgt30" }
    "evaluate-valid" { Invoke-Evaluate -Csv "$DatasetsDir/valid.csv" -Out "evaluation_results_valid" }

    "filter-backup-gt30" {
        Invoke-Python @(
            "scripts/filter_test_gt30_words.py",
            "--input", "$DatasetsDir/backup/test.csv",
            "--output", "$DatasetsDir/backup/test_gt30_words.csv",
            "--text-column", "text"
        )
    }
    "filter-test-gt30" {
        Invoke-Python @(
            "scripts/filter_test_gt30_words.py",
            "--input", "$DatasetsDir/test.csv",
            "--output", "$DatasetsDir/test_gt30_words.csv",
            "--text-column", "text",
            "--title-column", "title"
        )
    }

    "migrate" { Invoke-Python @("infra/alembic/run_migrations.py") }

    default {
        Write-Error "Unknown target: $Target. Run: .\make.ps1 help"
    }
}
