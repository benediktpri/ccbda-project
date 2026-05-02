# CCBDA Project — Job Application Assistant

Cloud Computing and Big Data Analytics — Course project (UPC, 2026).

## About

A cloud-native application that helps job seekers identify skills gaps by analyzing their CV against job descriptions using AWS services (Bedrock, DynamoDB, Textract).

## Prerequisites

- Python 3.13 ([uv](https://docs.astral.sh/uv/) recommended)
- Node.js 20+ (frontend)

## Project Structure

```
ccbda-project/
├── backend/   # FastAPI backend + DynamoDB
├── frontend/  # Web app
└── docs/      # Architecture, schema design, meeting notes
```

## Getting Started

```bash
git clone https://github.com/benediktpri/ccbda-project.git
cd ccbda-project/backend
uv sync
cp .env.example .env
uv run uvicorn app.main:app --reload
```

See [backend/README.md](backend/README.md) for full details.

### Pre-commit Hooks

Install once from `backend/`:

```bash
uv run pre-commit install
```

This runs ruff lint + format on every commit automatically.
