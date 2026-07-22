# RefactorAI [GENARTION 2 UPGRADE]

> **Created:** (2026-03-21)  
> **Latest update:** (2026-07-22) — RefactorAI Gen-2 full-stack product metadata (FastAPI + React + Docker + Ollama/Groq)

AI-Powered Code Refactoring & Optimization Assistant (Python-first).

## Features

- Upload a Python `.py` file (drag & drop or file picker, ~2MB max)
- Analyze:
  - Per-block explanations (module/function/class/main)
  - Anti-patterns + suggestions
  - Security issues (LLM + Bandit)
  - Quality score (0–100)
- Generate optimized version:
  - Cleaner, faster, PEP8-oriented refactor with type hints
- Beautiful dark-first UI:
  - Side-by-side Monaco editors + highlighted diff
  - Download + copy-to-clipboard

## Tech stack

- **Backend**: FastAPI (async), Pydantic v2, Instructor, LiteLLM, ruff + bandit (subprocess), `ast` parsing
- **Frontend**: Vite + React 19 + TypeScript (strict), Tailwind + shadcn-style UI primitives, Zustand, TanStack Query, Axios, Monaco editor, diff2html, Sonner toasts
- **Production**: backend serves `/frontend/dist` at `/`

## Setup

### 1) Configure environment

Copy `.env.example` to `.env` and choose your mode:

- **Local (offline, default)**: Ollama on your machine
- **Cloud (Groq)**: Groq API key

#### Local Mode (Ollama, 100% offline)

1) Install Ollama: see the Ollama installation docs.

2) Start Ollama (defaults to `http://localhost:11434`):

```bash
ollama serve
```

3) Pull the default model:

```bash
ollama pull qwen2.5-coder:7b
```

4) Set `.env`:

- `REFACTORAI_MODE=local`
- `OLLAMA_BASE_URL=http://localhost:11434`
- `LOCAL_MODEL=ollama/qwen2.5-coder:7b`

> **Recommended:** `qwen2.5-coder:7b` on 16GB RAM laptops. Use larger variants (e.g. `qwen2.5-coder:14b`) only on machines with more memory.

#### Cloud Mode (Groq)

Set `.env`:

- `REFACTORAI_MODE=cloud`
- `GROQ_API_KEY=...`
- `CLOUD_MODEL=groq/llama-3.1-8b-instant`

### 2) Run with Docker (recommended)

```bash
docker compose up --build backend
```

Open the app at `http://localhost:8000`.

### 3) Run locally (dev)

Backend:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies API requests to `http://localhost:8000`.

## API

- `POST /api/analyze` (multipart form field `file`) → `AnalysisResponse`
- `POST /api/refactor` (multipart form field `file`) → `RefactoredResponse`

