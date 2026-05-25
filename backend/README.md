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

### 4. Prepare the pipeline environment file

```bash
cp scripts/pipeline_env.example.sh scripts/pipeline_env.sh
```

Edit `scripts/pipeline_env.sh` if you want to change resource names. Defaults are fine for a first run, but S3 bucket names must be globally unique. If bucket creation fails, change `S3_BUCKET_NAME` to something unique, for example:

```bash
S3_BUCKET_NAME=ccbda-app-bucket-yourname
```

The same file is used by the Lambda/SQS/S3 setup and the Cognito setup script.

### 5. Create the IAM role for Lambdas

```bash
./scripts/create_lambda_role.sh scripts/pipeline_env.sh
```

This creates `ccbda-lambda-role` with permissions for Textract, S3, DynamoDB, SQS, Bedrock, and CloudWatch.

### 6. Deploy the processing pipeline

```bash
./scripts/deploy_pipeline.sh scripts/pipeline_env.sh
```

This creates:
- S3 bucket (`ccbda-app-bucket`)
- SQS queues (profile + job processing, each with a DLQ)
- 4 Lambda functions (text extractor, profile structurer, job structurer, DLQ handler)
- S3 → Lambda event notifications
- SQS → Lambda event source mappings

Note the **Job Queue URL** printed at the end. You need it for `JOB_PROCESSING_QUEUE_URL` in `.env`.

### 7. Set up CloudWatch Dashboards and Alarms

```bash
./scripts/deploy_cloudwatch.sh scripts/pipeline_env.sh
```

This creates a dashboard named `CCBDA-Project-Dashboard` and configures alarms for DLQ visibility and Lambda errors.

### 8. Create Cognito User Pool and App Client

```bash
./scripts/setup_cognito.sh scripts/pipeline_env.sh
```

This creates or reuses:

- Cognito User Pool (`COGNITO_USER_POOL_NAME`, default `ccbda-user-pool`)
- Cognito App Client (`COGNITO_APP_CLIENT_NAME`, default `ccbda-app-client`)

The User Pool uses email as the username and sends email verification codes. The App Client is created without a client secret because it is used by the browser frontend.

The script prints:

```bash
COGNITO_USER_POOL_ID=...
COGNITO_APP_CLIENT_ID=...
AWS_REGION=...
```

Keep these values for the backend `.env` and frontend `.env.local`.

### 9. Set up backend `.env`

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```bash
JOB_PROCESSING_QUEUE_URL=<Job Queue URL from deploy_pipeline.sh>
COGNITO_USER_POOL_ID=<value from setup_cognito.sh>
COGNITO_APP_CLIENT_ID=<value from setup_cognito.sh>
```

Also make sure `S3_BUCKET_NAME`, `DYNAMODB_TABLE_NAME`, and `AWS_REGION` match `scripts/pipeline_env.sh`.

### 10. Create the DynamoDB table

```bash
uv run python scripts/create_table.py
```

### 11. Set up frontend `.env.local`

From the repository root:

```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_AWS_REGION=eu-west-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=<value from setup_cognito.sh>
NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=<value from setup_cognito.sh>
```

The frontend primarily needs `NEXT_PUBLIC_AWS_REGION` and `NEXT_PUBLIC_COGNITO_APP_CLIENT_ID` to call Cognito.

### 12. Run the backend

```bash
cd backend
uv run uvicorn app.main:app --reload
```

API at http://localhost:8000. Interactive docs at http://localhost:8000/docs.

### 13. Run the frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend at http://localhost:3000.

Go to http://localhost:3000/login, sign up, confirm the email code, and sign in. After login, the frontend calls `GET /users/me`; the backend verifies the Cognito token and creates the DynamoDB user record if it does not already exist.

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
│   │   ├── users.py       # GET /users/me, GET /users/{id}
│   │   ├── upload.py      # POST /users/{id}/profile/upload[-file]
│   │   ├── profiles.py    # GET/PATCH /users/{id}/profile
│   │   ├── jobs.py        # CRUD /users/{id}/jobs + upload
│   │   └── results.py     # POST analyze, GET results
│   ├── models/
│   │   └── schemas.py     # Pydantic models for request/response + Bedrock tool schemas
│   ├── services/
│   │   ├── dynamodb.py    # All DynamoDB operations
│   │   ├── bedrock.py     # Skills-gap analysis via Bedrock
│   │   └── auth.py        # Cognito JWT verification and user-id checks
│   └── lambdas/
│       ├── text_extractor.py      # S3 trigger → Textract → SQS
│       ├── profile_structurer.py  # SQS → Bedrock → DynamoDB (profile)
│       ├── job_structurer.py      # SQS → Bedrock → DynamoDB (job)
│       └── dlq_handler.py         # DLQ → marks items as failed
├── scripts/
│   ├── create_table.py            # Create DynamoDB AppTable
│   ├── deploy_pipeline.sh         # Deploy Lambdas + SQS + S3 notifications
│   ├── deploy_cloudwatch.sh       # Deploy CloudWatch Alarms + Dashboard
│   ├── setup_cognito.sh           # Create Cognito User Pool + App Client
│   ├── toggle_pipeline.sh         # Enable/disable SQS event source mappings
│   ├── teardown.sh                # Disable polling + terminate EB (stops costs)
│   ├── pipeline_env.example.sh    # Config for deploy and Cognito setup scripts
│   └── create_lambda_role.sh      # IAM role for Lambdas
├── tests/
├── Dockerfile
└── pyproject.toml
```

## API Endpoints

All user-scoped endpoints are prefixed with `/users/{user_id}`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/users/me` | Get or create current user from Cognito token |
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
| `COGNITO_USER_POOL_ID` | — | Cognito User Pool ID from `setup_cognito.sh` |
| `COGNITO_APP_CLIENT_ID` | — | Cognito App Client ID from `setup_cognito.sh` |
| `ENVIRONMENT` | `dev` | Environment name |

## Cognito Authentication

The frontend talks directly to Cognito for signup, email confirmation, and login. After login, Cognito returns JWT tokens. The frontend sends the `IdToken` to the backend:

```http
Authorization: Bearer <IdToken>
```

The backend verifies the JWT in `app/services/auth.py` using Cognito's public JWKS keys. After verification, the Cognito `sub` is used as the trusted application `user_id`.

All `/users/{user_id}/...` endpoints compare the route `user_id` with the verified token `sub`. If they do not match, the request returns `403 Forbidden`.

For the complete design, see [../docs/Cognito_Implementation.md](../docs/Cognito_Implementation.md).

## Async Processing Pipeline

When a PDF is uploaded to S3, this pipeline runs automatically:

1. **text_extractor** (Lambda) — triggered by S3 event, uses Textract to extract text, sends to SQS
2. **profile_structurer** / **job_structurer** (Lambda) — reads from SQS, uses Bedrock to parse into structured data, writes to DynamoDB
3. **dlq_handler** (Lambda) — processes failed messages, marks DynamoDB items as `status: failed`

The pipeline is deployed via `scripts/deploy_pipeline.sh`.

## Stopping Costs When Idle

EB is the only always-on cost (~$15-30/mo for the EC2 instance). Lambda's SQS poller fleet also generates ~6 idle requests per queue per minute even with nothing to process — within the SQS free tier, but unnecessary when the app is paused.

Tear down both with one command:

```bash
./scripts/teardown.sh scripts/pipeline_env.sh
```

This disables the SQS → Lambda event source mappings and terminates the `ccbda-backend-prod` EB environment. Lambdas, DynamoDB, S3, CloudFront, and the SQS queues themselves remain — essentially free at idle.

To pause polling without terminating EB (e.g., during local backend development against deployed infra):

```bash
./scripts/toggle_pipeline.sh disable scripts/pipeline_env.sh
./scripts/toggle_pipeline.sh enable  scripts/pipeline_env.sh
```

Re-deploying with `./scripts/deploy_pipeline.sh` (or pushing a `v*` tag for CI deploy) automatically re-enables the mappings — no manual `enable` step needed after a teardown + redeploy cycle.
