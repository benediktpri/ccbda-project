# CCBDA Backend

FastAPI backend for the Job Application Assistant.

## Setup (First Time)

Each team member runs their own AWS account. Follow these steps once to get everything working.

### 1. Install dependencies

```bash
uv sync
```

### 2. Verify AWS credentials

You should already have the `lab_cli_user` profile configured from the lab sessions. Verify it works:

```bash
aws sts get-caller-identity --profile lab_cli_user
```

If this fails, reconfigure it with your IAM user's access key:
```bash
aws configure --profile lab_cli_user
```

Then export the profile so the deploy scripts (steps 4–5) pick it up:
```bash
export AWS_PROFILE=lab_cli_user
```

### 3. Enable Bedrock model access

In the AWS Console, go to **Bedrock → Model access** (region: `eu-west-1`) and request access to Anthropic Claude models. This may take a few minutes to be approved.

### 4. Create the IAM role for Lambdas

```bash
./scripts/create_lambda_role.sh scripts/pipeline_env.example.sh
```

This creates `ccbda-lambda-role` with permissions for Textract, S3, DynamoDB, SQS, Bedrock, and CloudWatch.

### 5. Deploy the processing pipeline

```bash
cp scripts/pipeline_env.example.sh scripts/pipeline_env.sh
# Edit scripts/pipeline_env.sh if you want to change names (defaults are fine)
./scripts/deploy_pipeline.sh scripts/pipeline_env.sh
```

This creates:
- S3 bucket (`ccbda-app-bucket`)
- SQS queues (profile + job processing, each with a DLQ)
- 4 Lambda functions (text extractor, profile structurer, job structurer, DLQ handler)
- S3 → Lambda event notifications
- SQS → Lambda event source mappings

Note the **Job Queue URL** printed at the end — you'll need it for `.env`.

### 6. Set up CloudWatch Dashboards and Alarms

```bash
./scripts/deploy_cloudwatch.sh scripts/pipeline_env.sh
```

This creates a dashboard named `CCBDA-Project-Dashboard` and configures alarms for DLQ visibility and Lambda errors.

### 7. Set up `.env`

```bash
cp .env.example .env
```

Edit `.env` and fill in `JOB_PROCESSING_QUEUE_URL` with the queue URL printed in step 5.

### 8. Create the DynamoDB table

```bash
uv run python scripts/create_table.py
```

### 9. Run the backend

```bash
uv run uvicorn app.main:app --reload
```

API at http://localhost:8000. Interactive docs at http://localhost:8000/docs.

## Daily Development

Once setup is done, day-to-day is just:

```bash
uv sync                                  # If dependencies changed
uv run uvicorn app.main:app --reload     # Start dev server
```

### Running Tests

Tests use [moto](https://github.com/getmoto/moto) to mock AWS services — no real credentials needed:

```bash
uv run pytest
```

### Linting & Formatting

```bash
uv run ruff check .     # Lint
uv run ruff format .    # Format
```

Or just commit — pre-commit hooks handle this automatically.

## Project Structure

```
backend/
├── app/
│   ├── main.py            # FastAPI app + CORS + router registration
│   ├── config.py          # Pydantic Settings (loaded from .env)
│   ├── routers/
│   │   ├── users.py       # POST /users, GET /users/{id}
│   │   ├── upload.py      # POST /users/{id}/profile/upload[-file]
│   │   ├── profiles.py    # GET/PATCH /users/{id}/profile
│   │   ├── jobs.py        # CRUD /users/{id}/jobs + upload
│   │   └── results.py     # POST analyze, GET results
│   ├── models/
│   │   └── schemas.py     # Pydantic models for request/response + Bedrock tool schemas
│   ├── services/
│   │   ├── dynamodb.py    # All DynamoDB operations
│   │   └── bedrock.py     # Skills-gap analysis via Bedrock
│   └── lambdas/
│       ├── text_extractor.py      # S3 trigger → Textract → SQS
│       ├── profile_structurer.py  # SQS → Bedrock → DynamoDB (profile)
│       ├── job_structurer.py      # SQS → Bedrock → DynamoDB (job)
│       └── dlq_handler.py         # DLQ → marks items as failed
├── scripts/
│   ├── create_table.py            # Create DynamoDB AppTable
│   ├── deploy_pipeline.sh         # Deploy Lambdas + SQS + S3 notifications
│   ├── deploy_cloudwatch.sh       # Deploy CloudWatch Alarms + Dashboard
│   ├── pipeline_env.example.sh    # Config for deploy script
│   └── create_lambda_role.sh      # IAM role for Lambdas
├── tests/
├── Dockerfile
└── pyproject.toml
```

## API Endpoints

All user-scoped endpoints are prefixed with `/users/{user_id}`.

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/users` | Create a new user |
| GET | `/users/{user_id}` | Get user |
| POST | `.../profile/upload` | Get presigned S3 URL for CV upload |
| POST | `.../profile/upload-file` | Direct file upload (PDF) |
| GET | `.../profile` | Get structured profile |
| PATCH | `.../profile` | Update profile fields |
| GET | `.../profile/status` | Check raw + structured processing status |
| POST | `.../jobs` | Create job from text |
| POST | `.../jobs/upload` | Get presigned URL for job PDF |
| POST | `.../jobs/upload-file` | Direct job PDF upload |
| GET | `.../jobs` | List all jobs |
| GET | `.../jobs/{job_id}` | Get job details |
| GET | `.../jobs/{job_id}/status` | Check job processing status |
| DELETE | `.../jobs/{job_id}` | Delete a job |
| POST | `.../jobs/{job_id}/analyze` | Run skills-gap analysis |
| GET | `.../results` | List all analysis results |
| GET | `.../results/{job_id}` | Get specific analysis result |
| GET | `/health` | Health check |

## Environment Variables

See `.env.example` for a ready-to-copy template.

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_REGION` | `eu-west-1` | AWS region |
| `AWS_PROFILE` | `lab_cli_user` | Named profile from `~/.aws/credentials` |
| `DYNAMODB_TABLE_NAME` | `AppTable` | DynamoDB table name |
| `S3_BUCKET_NAME` | `ccbda-app-bucket` | S3 bucket for file uploads |
| `JOB_PROCESSING_QUEUE_URL` | — | SQS queue URL for job structuring (from `deploy_pipeline.sh` output) |
| `BEDROCK_MODEL_ID` | `eu.anthropic.claude-haiku-4-5-20251001-v1:0` | Bedrock model for LLM calls |
| `ENVIRONMENT` | `dev` | Environment name |

## Async Processing Pipeline

When a PDF is uploaded to S3, this pipeline runs automatically:

1. **text_extractor** (Lambda) — triggered by S3 event, uses Textract to extract text, sends to SQS
2. **profile_structurer** / **job_structurer** (Lambda) — reads from SQS, uses Bedrock to parse into structured data, writes to DynamoDB
3. **dlq_handler** (Lambda) — processes failed messages, marks DynamoDB items as `status: failed`

The pipeline is deployed via `scripts/deploy_pipeline.sh`.
