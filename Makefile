# FND monorepo — common dev, test, train, and evaluate targets.
#
# Requires: make, python 3.11+, pnpm
# Windows: use Git Bash, WSL, or `choco install make` and run from repo root.
#
# Override defaults, e.g.:
#   make setup
#   make evaluate TEST_CSV=datasets/test.csv MODEL_PATH=models/my_model
#   make train OUTPUT=models/local_run EPOCHS=1 BATCH_SIZE=2

SHELL := /usr/bin/env bash

.DEFAULT_GOAL := help

VENV           ?= venv
PNPM           ?= pnpm
UVICORN_HOST   ?= 127.0.0.1
UVICORN_PORT   ?= 8000
API_MODULE     ?= apps.api.app.main:app

ifeq ($(OS),Windows_NT)
  VENV_PYTHON  := $(VENV)/Scripts/python.exe
else
  VENV_PYTHON  := $(VENV)/bin/python
endif

PYTHON_BOOTSTRAP ?= python

# Prefer ./venv when present (override: make PYTHON=/path/to/python ...)
ifdef PYTHON
  PY           := $(PY)
else ifneq ($(wildcard $(VENV_PYTHON)),)
  PY           := $(VENV_PYTHON)
else
  PY           := $(PYTHON_BOOTSTRAP)
endif

MODEL_PATH     ?= models/modernbert_fake_news_512
DATASETS_DIR   ?= datasets
TRAIN_OUTPUT   ?= models/modernbert_fake_news_512

# Evaluation defaults (override per run)
TEST_CSV       ?= $(DATASETS_DIR)/test.csv
EVAL_OUTPUT    ?= evaluation_results
EVAL_BATCH     ?= 16
EVAL_MAX_LEN   ?= 512
EVAL_CLEANING  ?= training

# Training defaults
TRAIN_MODEL    ?= answerdotai/ModernBERT-large
TRAIN_EPOCHS   ?= 3
TRAIN_BATCH    ?= 1
TRAIN_GRAD_ACC ?= 8
TRAIN_MAX_LEN  ?= 1024
TRAIN_LR       ?= 2e-5

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z0-9_.-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# Primary shortcuts (most common)
# ---------------------------------------------------------------------------

TEXT ?=
URL ?=
FILE ?=
DEEP_CHECK ?=

.PHONY: backend web desktop mobile cli extension-build extention-build
backend: api-reload ## Start FastAPI backend with reload

web: dev-web ## Start web dev server

desktop: dev-desktop ## Start Electron desktop dev

mobile: dev-mobile ## Start Expo mobile dev

extension-build: build-extension ## Production build of Chrome extension

extention-build: extension-build ## Alias (common typo)

cli: ## Analysis CLI — make cli TEXT='...' | URL=... | FILE=... [DEEP_CHECK=1]
	@if [ -n "$(TEXT)" ]; then \
	  $(PY) predict.py --text "$(TEXT)" $(if $(DEEP_CHECK),--deep-check,); \
	elif [ -n "$(URL)" ]; then \
	  $(PY) predict.py --url "$(URL)" $(if $(DEEP_CHECK),--deep-check,); \
	elif [ -n "$(FILE)" ]; then \
	  $(PY) predict.py --file "$(FILE)" $(if $(DEEP_CHECK),--deep-check,); \
	else \
	  $(PY) predict.py --help; \
	fi

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

.PHONY: setup venv require-venv install install-python install-node install-editable
setup: venv install ## First-time setup: venv + pip install -e . + pnpm install (all clients)

venv: ## Create ./venv if it does not exist
	@$(PYTHON_BOOTSTRAP) -c "import os,subprocess,sys; v=r'$(VENV)'; py=r'$(VENV_PYTHON)'; (os.path.isfile(py) or (print('Creating venv in '+v+'...') or subprocess.check_call([sys.executable,'-m','venv',v])))"

require-venv:
	@$(PYTHON_BOOTSTRAP) -c "import os,sys; py=r'$(VENV_PYTHON)'; sys.exit(0 if os.path.isfile(py) else (print('No venv at $(VENV). Run: make setup', file=sys.stderr) or 1))"

install: install-python install-node ## Install Python (editable) + pnpm workspace deps

install-python: venv ## pip install -e . into ./venv
	$(VENV_PYTHON) -m pip install --upgrade pip
	$(VENV_PYTHON) -m pip install -e .

install-editable: install-python ## Alias for install-python

install-node: ## pnpm install (all workspace packages)
	$(PNPM) install

# ---------------------------------------------------------------------------
# Local API
# ---------------------------------------------------------------------------

.PHONY: api api-reload api-export-openapi
api: require-venv ## Run FastAPI on $(UVICORN_HOST):$(UVICORN_PORT)
	$(VENV_PYTHON) -m uvicorn $(API_MODULE) --host $(UVICORN_HOST) --port $(UVICORN_PORT)

api-reload: require-venv ## Run FastAPI with auto-reload (development)
	$(VENV_PYTHON) -m uvicorn $(API_MODULE) --host $(UVICORN_HOST) --port $(UVICORN_PORT) --reload

api-export-openapi: ## Export OpenAPI schema to packages/contracts/openapi/openapi.json
	$(PY) apps/api/scripts/export_openapi.py

# ---------------------------------------------------------------------------
# Client dev servers (run API separately: make api-reload)
# ---------------------------------------------------------------------------

.PHONY: dev dev-web dev-desktop dev-extension dev-mobile
dev: ## Print reminder to run api + a client in separate terminals
	@echo "Terminal 1: make api-reload"
	@echo "Terminal 2: make dev-web   (or dev-desktop / dev-extension / dev-mobile)"

dev-web: ## Vite web client
	$(PNPM) --filter web dev

dev-desktop: ## Electron desktop client
	$(PNPM) --filter desktop dev

dev-extension: ## Chrome extension watch build
	$(PNPM) --filter extension dev

dev-mobile: ## Expo mobile dev server
	$(PNPM) --filter mobile dev

# ---------------------------------------------------------------------------
# Builds
# ---------------------------------------------------------------------------

.PHONY: build build-web build-desktop build-extension build-mobile
build: build-web build-desktop build-extension build-mobile ## Build all clients

build-web:
	$(PNPM) --filter web build

build-desktop:
	$(PNPM) --filter desktop build

build-extension:
	$(PNPM) --filter extension build

build-mobile:
	$(PNPM) --filter mobile build

# ---------------------------------------------------------------------------
# Quality — repo-wide
# ---------------------------------------------------------------------------

.PHONY: typecheck lint test test-all
typecheck: ## Typecheck all pnpm packages that define typecheck
	$(PNPM) -r --if-present typecheck

lint: ## Lint all pnpm packages that define lint
	$(PNPM) -r --if-present lint

test: test-py test-js ## Run Python pytest + all JS package tests

test-all: test test-e2e ## Run unit/integration + e2e where defined

test-py: ## pytest tests/
	$(PY) -m pytest tests

test-js: ## pnpm test in all workspace packages
	$(PNPM) -r --if-present test

.PHONY: test-web test-desktop test-extension test-mobile
test-web:
	$(PNPM) --filter web test

test-desktop:
	$(PNPM) --filter desktop test

test-extension:
	$(PNPM) --filter extension test

test-mobile:
	$(PNPM) --filter mobile test

.PHONY: test-e2e test-e2e-web test-e2e-desktop test-e2e-extension test-e2e-mobile
test-e2e: test-e2e-web test-e2e-desktop test-e2e-extension test-e2e-mobile

test-e2e-web:
	$(PNPM) --filter web test:e2e

test-e2e-desktop:
	$(PNPM) --filter desktop test:e2e

test-e2e-extension:
	$(PNPM) --filter extension test:e2e

test-e2e-mobile:
	$(PNPM) --filter mobile test:e2e

.PHONY: lint-py format-py
lint-py: ## ruff check apps packages tests
	$(PY) -m ruff check apps packages tests train.py evaluatemodel.py predict.py

format-py: ## black apps packages tests (check only with --check via format-py-check)
	$(PY) -m black apps packages tests train.py evaluatemodel.py predict.py

.PHONY: format-py-check
format-py-check:
	$(PY) -m black --check apps packages tests train.py evaluatemodel.py predict.py

# ---------------------------------------------------------------------------
# CLI analysis (requires model + optional GEMINI_API_KEY for deep check)
# ---------------------------------------------------------------------------

.PHONY: predict predict-text predict-url predict-file
predict: ## CLI help (run predict-text / predict-url / predict-file)
	@echo "Examples:"
	@echo "  make cli TEXT='Claim to verify'"
	@echo "  make predict-url URL=https://example.com/article"
	@echo "  make predict-file FILE=path/to/article.txt"

predict-text: ## Analyze text: make predict-text TEXT='...' [DEEP_CHECK=1]
	$(PY) predict.py --text "$(TEXT)" $(if $(DEEP_CHECK),--deep-check,)

predict-url: ## Analyze URL: make predict-url URL=https://... [DEEP_CHECK=1]
	$(PY) predict.py --url "$(URL)" $(if $(DEEP_CHECK),--deep-check,)

predict-file: ## Analyze file: make predict-file FILE=path [DEEP_CHECK=1]
	$(PY) predict.py --file "$(FILE)" $(if $(DEEP_CHECK),--deep-check,)

# ---------------------------------------------------------------------------
# ML — train & evaluate
# ---------------------------------------------------------------------------

.PHONY: train train-quick
train: ## Fine-tune ModernBERT (GPU recommended). Override TRAIN_OUTPUT, TRAIN_EPOCHS, etc.
	$(PY) train.py \
	  --model-name $(TRAIN_MODEL) \
	  --output $(TRAIN_OUTPUT) \
	  --epochs $(TRAIN_EPOCHS) \
	  --batch-size $(TRAIN_BATCH) \
	  --grad-accum $(TRAIN_GRAD_ACC) \
	  --max-length $(TRAIN_MAX_LEN) \
	  --learning-rate $(TRAIN_LR)

train-quick: ## Quick training smoke (100 samples per split)
	$(PY) train.py \
	  --model-name $(TRAIN_MODEL) \
	  --output $(TRAIN_OUTPUT) \
	  --epochs 1 \
	  --batch-size $(TRAIN_BATCH) \
	  --grad-accum $(TRAIN_GRAD_ACC) \
	  --max-length $(TRAIN_MAX_LEN) \
	  --max-samples 100

.PHONY: evaluate evaluate-enhanced evaluate-limit
evaluate: ## Evaluate style model (defaults: test.csv -> evaluation_results/)
	$(PY) evaluatemodel.py \
	  --model $(MODEL_PATH) \
	  --test-csv $(TEST_CSV) \
	  --output-dir $(EVAL_OUTPUT) \
	  --batch-size $(EVAL_BATCH) \
	  --max-length $(EVAL_MAX_LEN) \
	  --cleaning-mode $(EVAL_CLEANING)

evaluate-enhanced: ## Evaluate with enhanced cleaning (strips media/category markers)
	$(MAKE) evaluate EVAL_CLEANING=enhanced

evaluate-limit: ## Evaluate first N rows: make evaluate-limit LIMIT=200
	$(PY) evaluatemodel.py \
	  --model $(MODEL_PATH) \
	  --test-csv $(TEST_CSV) \
	  --output-dir $(EVAL_OUTPUT) \
	  --batch-size $(EVAL_BATCH) \
	  --max-length $(EVAL_MAX_LEN) \
	  --cleaning-mode $(EVAL_CLEANING) \
	  --limit $(LIMIT)

# Preset evaluation sets (override MODEL_PATH as needed)
.PHONY: evaluate-test evaluate-backup evaluate-backup-gt30 evaluate-valid
evaluate-test: ## Evaluate datasets/test.csv -> evaluation_results/
	$(MAKE) evaluate TEST_CSV=$(DATASETS_DIR)/test.csv EVAL_OUTPUT=evaluation_results

evaluate-backup: ## Evaluate datasets/backup/test.csv -> evaluationresults/
	$(MAKE) evaluate TEST_CSV=$(DATASETS_DIR)/backup/test.csv EVAL_OUTPUT=evaluationresults

evaluate-backup-gt30: ## Evaluate datasets/backup/test_gt30_words.csv -> evaluation_resultsgt30/
	$(MAKE) evaluate TEST_CSV=$(DATASETS_DIR)/backup/test_gt30_words.csv EVAL_OUTPUT=evaluation_resultsgt30

evaluate-valid: ## Evaluate datasets/valid.csv -> evaluation_results_valid/
	$(MAKE) evaluate TEST_CSV=$(DATASETS_DIR)/valid.csv EVAL_OUTPUT=evaluation_results_valid

# ---------------------------------------------------------------------------
# Dataset utilities
# ---------------------------------------------------------------------------

.PHONY: filter-backup-gt30 filter-test-gt30
filter-backup-gt30: ## Create datasets/backup/test_gt30_words.csv from backup/test.csv
	$(PY) scripts/filter_test_gt30_words.py \
	  --input $(DATASETS_DIR)/backup/test.csv \
	  --output $(DATASETS_DIR)/backup/test_gt30_words.csv \
	  --text-column text

filter-test-gt30: ## Create datasets/test_gt30_words.csv from datasets/test.csv (title+text)
	$(PY) scripts/filter_test_gt30_words.py \
	  --input $(DATASETS_DIR)/test.csv \
	  --output $(DATASETS_DIR)/test_gt30_words.csv \
	  --text-column text \
	  --title-column title

# ---------------------------------------------------------------------------
# Infra / enterprise
# ---------------------------------------------------------------------------

.PHONY: migrate
migrate: ## Print Alembic-style migration SQL (set PERSISTENCE_BACKEND if needed)
	$(PY) infra/alembic/run_migrations.py

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

.PHONY: clean clean-py clean-js
clean: clean-js ## Remove common build artifacts

clean-js:
	@find apps packages -type d \( -name dist -o -name node_modules -o -name .expo-export \) -prune 2>/dev/null | head -5 || true
	@echo "Remove manually if needed: apps/*/dist, apps/*/.expo-export, node_modules"

clean-py:
	@find . -type d -name __pycache__ -prune 2>/dev/null | head -5 || true
	@echo "Remove manually: __pycache__, .pytest_cache, .mypy_cache"
