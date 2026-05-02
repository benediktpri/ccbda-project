# CCBDA Backend

FastAPI backend for the Job Application Assistant.

## Quick Start

```bash
uv sync
cp .env.example .env
uv run uvicorn app.main:app --reload
```

The API will be available at http://localhost:8000. Interactive docs at http://localhost:8000/docs.

## Project Structure

```
backend/
├── src/app/
│   ├── main.py        # FastAPI app entrypoint
│   ├── config.py      # Settings (loaded from environment / .env)
│   ├── routers/       # API route handlers
│   ├── models/        # Pydantic schemas (request/response)
│   └── services/      # Business logic & AWS clients
├── tests/
├── pyproject.toml
└── .env.example
```

## Commands

```bash
uv run uvicorn app.main:app --reload   # Start dev server
uv run pytest                           # Run tests
uv run ruff check .                     # Lint
uv run ruff format .                    # Format
```

## Pre-commit Hooks

Install once (from `backend/`):

```bash
uv run pre-commit install
```

## Environment Variables

See `.env.example` for required variables. Copy to `.env` for local development.
