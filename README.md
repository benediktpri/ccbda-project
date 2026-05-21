# CCBDA Project — Job Application Assistant

Cloud Computing and Big Data Analytics — Course project (UPC, 2026).

## About

A cloud-native application that helps job seekers identify skills gaps by analyzing their CV against job descriptions. Users upload a CV (PDF), add job postings (text or PDF), and receive a structured skills-gap analysis powered by AWS Bedrock (Claude).

## Architecture (high-level)

```
Frontend (Next.js, static on S3/CloudFront)
    │
    ▼
Backend (FastAPI on Elastic Beanstalk)
    │
    ├── DynamoDB (all application data)
    ├── S3 (PDF storage)
    └── Bedrock (skills-gap analysis)

Async Pipeline:
  S3 upload → Lambda (Textract) → SQS → Lambda (Bedrock structuring) → DynamoDB
```

**AWS services used:** S3, CloudFront, Elastic Beanstalk, Lambda (×4), SQS (×2 + DLQs), DynamoDB, Textract, Bedrock, CloudWatch.


## Prerequisites

- Python 3.13 + [uv](https://docs.astral.sh/uv/)
- Node.js 22+ and npm
- AWS CLI configured with credentials for your own AWS account
- `jq` (`brew install jq` on macOS)

## Getting Started

Each team member uses their own AWS account. First-time setup requires provisioning AWS infrastructure.

### 1. Backend setup (includes AWS infra)

Follow the step-by-step guide in [backend/README.md](backend/README.md#setup-first-time). This covers:
- Installing dependencies
- Configuring AWS credentials
- Enabling Bedrock model access
- Creating the IAM role, S3 bucket, SQS queues, Lambdas, and DynamoDB table
- Filling in `.env`

### 2. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The frontend runs at http://localhost:3000.

### 3. Pre-commit hooks

Install once:

```bash
cd backend && uv run pre-commit install
```

Runs ruff lint/format + schema validation on every commit.

## Project Structure

```
ccbda-project/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI entrypoint
│   │   ├── config.py        # Settings from .env
│   │   ├── routers/         # API endpoints (users, upload, profiles, jobs, results)
│   │   ├── models/          # Pydantic schemas
│   │   ├── services/        # DynamoDB + Bedrock clients
│   │   └── lambdas/         # Lambda function handlers (deployed separately)
│   ├── scripts/             # Table creation, pipeline deployment
│   ├── tests/               # pytest + moto
│   └── Dockerfile           # Production container
├── frontend/
│   ├── src/app/             # Next.js pages (login, profile, upload, jobs)
│   └── src/components/      # Shared components
├── .github/workflows/
│   ├── ci.yml               # Lint + test on every push/PR
│   └── deploy.yml           # Deploy on tag push (v*)
└── docs/                    # Architecture docs, schema design
```

## CI/CD

| Trigger | Workflow | What it does |
|---------|----------|--------------|
| Push / PR to `main` | `ci.yml` | Backend: ruff lint + format + schema check + pytest. Frontend: ESLint + TypeScript + build. |
| Tag `v*` pushed | `deploy.yml` | Deploys backend to Elastic Beanstalk, Lambdas to AWS, frontend to S3 + CloudFront invalidation. |

### Deploying

Push a tag to trigger deployment:

```bash
git tag v1.2.3
git push origin v1.2.3
```

## Useful Commands

```bash
# Backend
cd backend
uv run uvicorn app.main:app --reload     # Dev server
uv run pytest                            # Tests
uv run ruff check .                      # Lint
uv run ruff format .                     # Format

# Frontend
cd frontend
npm run dev                              # Dev server
npm run build                            # Production build
npm run lint                             # ESLint
npx tsc --noEmit                         # Type check
```
