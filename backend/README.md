# CCBDA Backend

FastAPI backend for the Job Application Assistant.

## Quick Start

```bash
uv sync
cp .env.example .env
docker compose up -d
uv run python scripts/create_table.py
uv run uvicorn app.main:app --reload
```

The API will be available at http://localhost:8000. Interactive docs at http://localhost:8000/docs.

## Local Development with DynamoDB Local

The backend uses DynamoDB Local (via Docker) for development so you don't need real AWS credentials.

1. **Start DynamoDB Local:**
   ```bash
   docker compose up -d
   ```

2. **Create the table:**
   ```bash
   uv run python scripts/create_table.py
   ```

3. **Run the API:**
   ```bash
   uv run uvicorn app.main:app --reload
   ```

DynamoDB Local data is in-memory and resets when the container stops. Re-run `create_table.py` after restarting Docker.

## Running Against Real AWS

1. Set your AWS profile in `.env`:
   ```
   AWS_PROFILE=your-profile-name
   ```
   Alternatively, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` directly.

2. Remove or comment out `DYNAMODB_ENDPOINT_URL` (so it defaults to the real AWS endpoint).

3. Create the table:
   ```bash
   uv run python scripts/create_table.py
   ```

## Project Structure

```
backend/
├── app/
│   ├── main.py        # FastAPI app entrypoint
│   ├── config.py      # Settings (loaded from environment / .env)
│   ├── routers/       # API route handlers
│   ├── models/        # Pydantic schemas (request/response)
│   └── services/      # Business logic & AWS clients
├── scripts/
│   └── create_table.py  # Creates DynamoDB table (local or AWS)
├── tests/
├── docker-compose.yml   # DynamoDB Local
├── pyproject.toml
└── .env.example
```

## Commands

```bash
uv run uvicorn app.main:app --reload   # Start dev server
uv run pytest                           # Run tests
uv run ruff check .                     # Lint
uv run ruff format .                    # Format
docker compose up -d                    # Start DynamoDB Local
docker compose down                     # Stop DynamoDB Local
```

## Pre-commit Hooks

Install once (from `backend/`):

```bash
uv run pre-commit install
```

## Environment Variables

See `.env.example` for required variables. Copy to `.env` for local development.

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_REGION` | `eu-west-1` | AWS region |
| `AWS_PROFILE` | — | Named profile from `~/.aws/credentials` (preferred for real AWS) |
| `AWS_ACCESS_KEY_ID` | — | AWS credentials (alternative to profile; use `local` for DynamoDB Local) |
| `AWS_SECRET_ACCESS_KEY` | — | AWS credentials (alternative to profile; use `local` for DynamoDB Local) |
| `DYNAMODB_TABLE_NAME` | `AppTable` | DynamoDB table name |
| `DYNAMODB_ENDPOINT_URL` | — | Set to `http://localhost:8000` for DynamoDB Local; unset for real AWS |
| `S3_BUCKET_NAME` | `ccbda-app-bucket` | S3 bucket for file uploads |
| `ENVIRONMENT` | `dev` | Environment name |
