# Architecture Overview

A consolidated reference for understanding what the CCBDA project does, how its pieces fit together, and which AWS services power each piece. Organised top-down: start with the high-level picture, then drill into individual layers.

---

## 1. High-Level Overview

### What the app does

A **Job Application Assistant**. A user uploads a CV (PDF), enters one or more job descriptions, and receives an AI-generated **skills-gap analysis**: a match score, matched/missing skills, recommendations, and CV-improvement advice.

### Three big pieces

| Piece | Tech | Hosted on |
|---|---|---|
| **Frontend** | Next.js 16 + React 19 + Tailwind | S3 + CloudFront |
| **Backend API** | FastAPI (Python 3.13) in Docker | Elastic Beanstalk (single t3.micro) |
| **Async pipeline** | 4 Lambdas + SQS + Textract + Bedrock | Lambda |

### One-paragraph mental model

The browser talks to **Cognito** directly for auth and to the **FastAPI backend** for everything else. Heavy work — extracting text from PDFs and turning free-form text into structured data — does not happen in the request/response path. Instead, the backend drops files into S3 or messages into SQS, and a chain of Lambdas does the work asynchronously, writing results back to **DynamoDB**. The frontend polls until the result is ready. The final skills-gap analysis is the only synchronous AI call: backend reads the structured profile + structured job, calls **Bedrock**, stores the result, and returns it.

### Top-down diagram

```
                          ┌──────────────┐
                          │   Browser    │
                          │  (Next.js)   │
                          └───┬──────┬───┘
                              │      │
                  Auth (JWT)  │      │  REST + Bearer JWT
                              │      │
                       ┌──────▼─┐  ┌─▼────────────────────┐
                       │Cognito │  │  CloudFront           │
                       │  Pool  │  │  (frontend assets +   │
                       └────────┘  │   /api → backend)     │
                                   └─┬────────────────┬────┘
                                     │                │
                            S3 (static site)   ┌──────▼──────┐
                                               │ Elastic     │
                                               │ Beanstalk   │
                                               │ (FastAPI)   │
                                               └──┬───┬───┬──┘
                                                  │   │   │
                              ┌───────────────────┘   │   └────────────────┐
                              │                       │                    │
                       ┌──────▼──────┐         ┌──────▼──────┐      ┌──────▼──────┐
                       │ S3 uploads  │         │  DynamoDB   │      │  Bedrock    │
                       │ (CVs, jobs) │         │  AppTable   │      │ (sync call: │
                       └──────┬──────┘         └─────▲───────┘      │ skills-gap) │
                              │                      │              └─────────────┘
                       (S3 PUT event)                │
                              │                      │
                       ┌──────▼──────┐    ┌──────────┴──────────┐
                       │  Lambda:    │    │  Lambda:            │
                       │ text_       │    │ profile_structurer  │
                       │ extractor   │    │ job_structurer      │
                       │ (Textract)  │    │ (Bedrock tool-use)  │
                       └──────┬──────┘    └──────────▲──────────┘
                              │                      │
                              └──────►  SQS  ────────┘
                                       │
                                  (DLQ on fail)
                                       │
                              ┌────────▼────────┐
                              │ Lambda:         │
                              │ dlq_handler     │
                              │ (mark failed)   │
                              └─────────────────┘
```

---

## 2. AWS Services at a Glance

Region: **eu-west-1**.

| Service | Role in this project |
|---|---|
| **Cognito** | User pool + app client. Browser hits Cognito directly for sign-up/sign-in; backend verifies the JWT. |
| **S3** | Two roles: (1) static frontend hosting bucket, (2) `ccbda-app-bucket` for uploaded PDFs (`profiles/`, `jobs/`). |
| **CloudFront** | CDN for the static frontend; routes `/api/*` paths to the Elastic Beanstalk backend. |
| **Elastic Beanstalk** | Hosts the FastAPI Docker container (single instance, t3.micro). |
| **Lambda** | Four functions for the async pipeline (see §5). |
| **SQS** | Two work queues (profile, job) + two dead-letter queues. Decouples Lambdas. |
| **DynamoDB** | Single-table store (`AppTable`) for users, profiles, jobs, results. On-demand billing. |
| **Textract** | PDF → text extraction inside `text_extractor` Lambda. |
| **Bedrock** | Claude Haiku 4.5 with tool-use, used in three places: profile structuring, job structuring, skills-gap analysis. |
| **CloudWatch** | Structured JSON logs from FastAPI middleware + all Lambdas; dashboards and credit-burn alarms. |
| **IAM** | Roles for EB EC2, Lambdas, GitHub Actions deploy. |

---

## 3. End-to-End User Journey

The whole point of the system, expressed as a flow:

1. **Sign up / sign in.** Browser calls Cognito directly (`USER_PASSWORD_AUTH`). Stores `IdToken` in `localStorage`. Every subsequent API call sends `Authorization: Bearer <IdToken>`.
2. **Upload CV.** Browser POSTs the PDF to FastAPI. Backend writes a `PROFILE#RAW` row (status=`pending`) and uploads the PDF to S3 under `profiles/{user_id}/{uuid}.pdf`.
3. **Async extraction (Lambda 1: `text_extractor`).** S3 PUT event fires the Lambda. It calls Textract, writes raw text into `PROFILE#RAW` (status=`ready`), and pushes a message to the **profile** SQS queue.
4. **Async structuring (Lambda 2: `profile_structurer`).** Pulls from SQS, calls Bedrock with `extraction_schema.json` as a tool definition, writes the structured profile to `PROFILE#STRUCTURED` (status=`ready`).
5. **Frontend polling.** The upload page polls `GET /profile/status` every 3s until `structured_status == "ready"`, then redirects to `/profile`.
6. **Add a job.** User pastes job text or uploads a job PDF. Same pattern: backend writes `JOB_RAW`, pushes to SQS, Lambda 3 (`job_structurer`) writes `JOB#{job_id}` (status=`ready`).
7. **Run analysis (synchronous).** User clicks "Analyse". Backend fetches `PROFILE#STRUCTURED` + `JOB#{job_id}`, calls Bedrock with the `report_skills_gap` tool, stores the result in `ANALYSIS#{job_id}`, and returns it immediately.
8. **Failures.** Any SQS message that fails N times lands in a DLQ. `dlq_handler` Lambda marks the corresponding DynamoDB row as `status=failed` so the UI can show an error.

---

## 4. Frontend

**Location:** `frontend/`. **Framework:** Next.js 16 App Router, React 19, Tailwind 4.

### Pages

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Landing |
| `/login` | `src/app/login/page.tsx` | Cognito sign-up / sign-in / confirm |
| `/upload` | `src/app/upload/page.tsx` | CV upload + status polling |
| `/onboarding` | `src/app/onboarding/page.tsx` | Edit extracted profile |
| `/profile` | `src/app/profile/page.tsx` | View / edit profile |
| `/jobs` | `src/app/jobs/page.tsx` | Job CRUD + trigger analysis + view results |

### Key modules

- `src/lib/cognito.ts` — direct calls to the Cognito Identity Provider API (`signUp`, `confirmSignUp`, `signIn`).
- `src/lib/useAuth.ts` — auth hook; reads/writes `localStorage["ccbda_auth"]`.
- `src/lib/api.ts` — fetch wrapper that auto-attaches the bearer token. Base URL from `NEXT_PUBLIC_API_URL`.

### Build & host

`next build` → static `out/`. CI syncs `out/` to the frontend S3 bucket and invalidates CloudFront. The CloudFront distribution also forwards `/api/*` to Elastic Beanstalk so the browser sees a single origin.

### Required env vars

```
NEXT_PUBLIC_API_URL=<CloudFront URL or http://localhost:8000>
NEXT_PUBLIC_AWS_REGION=eu-west-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=...
NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=...
```

---

## 5. Backend API (FastAPI on Elastic Beanstalk)

**Location:** `backend/app/`. Entry point `app/main.py`. All routes mounted under `/api` so CloudFront can route by path.

### Layout

```
backend/app/
├── main.py              FastAPI app, CORS, request-logging middleware
├── config.py            Pydantic settings loaded from .env
├── routers/
│   ├── users.py         GET /users/me, /users/{id}
│   ├── upload.py        POST /profile/upload[-file]
│   ├── profiles.py      GET/PATCH /profile, GET /profile/status
│   ├── jobs.py          POST/GET/DELETE /jobs (text + file uploads)
│   └── results.py       POST /jobs/{id}/analyze, GET /results
├── services/
│   ├── auth.py          Cognito JWT verification (JWKS)
│   ├── dynamodb.py      All single-table CRUD
│   └── bedrock.py       Skills-gap analysis call
├── models/schemas.py    Pydantic models (Skill, Experience, JobSkill, AnalysisOutput, …)
└── lambdas/             Async pipeline (deployed separately, see §6)
```

### Authentication

- The frontend sends `Authorization: Bearer <IdToken>`.
- `services/auth.py` fetches the Cognito JWKS once, verifies signature + `exp` + `iss` + `aud` on each request.
- The Cognito `sub` claim becomes the application `user_id`.
- **Bypass for local dev:** set `AUTH_BYPASS=1` in `.env` and every request is treated as `dev-user-id`. Never set this in deployed environments — production should leave it at `0` (see `backend/.env.example:11`).

### Logging

Custom middleware (`main.py`) emits structured JSON for every request. Picked up by CloudWatch via the EB Docker log group; alarms are wired up in `scripts/deploy_cloudwatch.sh`.

### Required env vars

```
AWS_REGION=eu-west-1
DYNAMODB_TABLE_NAME=AppTable
S3_BUCKET_NAME=ccbda-app-bucket
JOB_PROCESSING_QUEUE_URL=https://sqs.eu-west-1.amazonaws.com/<acct>/ccbda-job-processing
BEDROCK_MODEL_ID=eu.anthropic.claude-haiku-4-5-20251001-v1:0
COGNITO_USER_POOL_ID=eu-west-1_xxxxxxxxx
COGNITO_APP_CLIENT_ID=...
AUTH_BYPASS=0
ENVIRONMENT=production
```

---

## 6. Async Pipeline (Lambdas + SQS)

**Location:** `backend/app/lambdas/`. Deployed by `backend/scripts/deploy_pipeline.sh`.

| Lambda | Trigger | What it does |
|---|---|---|
| `text_extractor` | S3 `ObjectCreated` on `ccbda-app-bucket` | Detects whether the key is a profile or a job, calls Textract, writes raw text to DynamoDB, pushes a message to the matching SQS queue. |
| `profile_structurer` | SQS profile queue | Calls Bedrock with `extraction_schema.json` as a tool. Writes `PROFILE#STRUCTURED` (status=`ready`). |
| `job_structurer` | SQS job queue | Same idea with `job_extraction_schema.json`. Writes `JOB#{job_id}` (status=`ready`). |
| `dlq_handler` | DLQs | Marks the corresponding DynamoDB row as `status=failed` so the UI surfaces the failure. |

### Pipeline diagram

Two parallel paths share the same shape: **upload → extract text → structure with Bedrock → mark ready**. The S3 key prefix decides which path a file takes; jobs entered as text skip Textract and go straight to SQS.

```
                      ┌──────────────────────────┐
                      │  FastAPI (backend)       │
                      │  POST /profile/upload    │
                      │  POST /jobs (text)       │
                      │  POST /jobs/upload       │
                      └──┬──────────┬────────────┘
                         │          │
        PDF upload       │          │  job text (no PDF)
                         ▼          │
              ┌──────────────────┐  │
              │ S3: ccbda-app-   │  │
              │ bucket           │  │
              │  profiles/{u}/…  │  │
              │  jobs/{u}/…      │  │
              └────────┬─────────┘  │
                       │            │
              S3 ObjectCreated      │
                       │            │
                       ▼            │
              ┌──────────────────┐  │
              │ Lambda:          │  │
              │ text_extractor   │  │
              │ • key prefix?    │  │
              │ • Textract       │  │
              │ • write RAW row  │  │
              └─┬───────────┬────┘  │
       profile/ │           │ jobs/ │
                ▼           ▼       ▼
         ┌──────────┐   ┌──────────────────┐
         │ SQS:     │   │ SQS:             │
         │ profile  │   │ job              │
         │ queue    │   │ queue            │
         └────┬─────┘   └────┬─────────────┘
              │              │
   on N retries│              │ on N retries
              ▼              ▼              ▼
       ┌──────────────┐ ┌──────────────┐  ┌──────────────┐
       │ Lambda:      │ │ Lambda:      │  │ Lambdas      │
       │ profile_     │ │ job_         │  │ DLQs ───────►│
       │ structurer   │ │ structurer   │  │ dlq_handler  │
       │ • Bedrock    │ │ • Bedrock    │  │ • mark item  │
       │   tool-use   │ │   tool-use   │  │   status =   │
       └──────┬───────┘ └──────┬───────┘  │   "failed"   │
              │                │          └──────┬───────┘
              ▼                ▼                 │
       PROFILE#STRUCTURED   JOB#{job_id}         │
       status = ready       status = ready       │
              │                │                 │
              └──────┬─────────┴─────────────────┘
                     ▼
                  DynamoDB
                  (frontend polls /status until ready or failed)
```

### Why this shape

- **Decoupling.** Textract and Bedrock latency don't block the API.
- **Retries for free.** SQS retries failed messages; DLQs catch the rest.
- **Independently scalable.** Each Lambda has its own concurrency and event source.
- **Cost-friendly.** Idle = nearly free.

### Bedrock tool-use

Both structurers and the analysis call use Claude's tool-use feature: the schema is passed as a tool definition, and the model is forced to "call" the tool, returning a structured JSON object that matches the schema exactly. No prompt-parsing brittleness.

---

## 7. Data Layer (DynamoDB Single-Table)

Single table `AppTable`, partition key `PK`, sort key `SK`, on-demand billing.

| Entity | PK | SK | Notable fields |
|---|---|---|---|
| User metadata | `USER#{user_id}` | `METADATA` | `created_at` |
| Profile (raw text) | `USER#{user_id}` | `PROFILE#RAW` | `status`, `raw_text`, `s3_key` |
| Profile (structured) | `USER#{user_id}` | `PROFILE#STRUCTURED` | `status`, `skills[]`, `experience[]`, `education[]`, `languages[]` |
| Job (raw) | `USER#{user_id}` | `JOB_RAW#{job_id}` | `status`, `raw_text` |
| Job (structured) | `USER#{user_id}` | `JOB#{job_id}` | `status`, `title`, `company`, `required_skills[]` |
| Analysis result | `USER#{user_id}` | `ANALYSIS#{job_id}` | `match_score`, `matched_skills[]`, `missing_skills[]`, `recommendations`, `cv_improvements` |

Status lifecycle for processed entities: `pending → processing → ready` (or `failed`).

All access is user-scoped: `query(PK = USER#{user_id})` returns everything for one user. See `docs/DynamoDB_Schema.md` for full field-level detail.

### One user's partition

Visualising a single partition (one `PK`) makes the access pattern click. Everything for a user lives stacked under their `USER#{user_id}` key, sorted by `SK`. One Query returns the lot; ranged Queries fetch slices (e.g. all jobs).

```
PK = USER#550e8400-...
│
├── SK = METADATA                       ← user row
│      created_at
│
├── SK = PROFILE#RAW                    ← from text_extractor (Textract)
│      status, raw_text, s3_key
│
├── SK = PROFILE#STRUCTURED             ← from profile_structurer (Bedrock)
│      status, skills[], experience[],
│      education[], languages[]
│
├── SK = JOB_RAW#7c9e6679-...           ┐
│      status, raw_text                  │  one pair per job:
│                                        │  raw + structured
├── SK = JOB#7c9e6679-...                │
│      status, title, company,           │
│      required_skills[]                ┘
│
├── SK = JOB_RAW#a3b1c2d4-...
├── SK = JOB#a3b1c2d4-...
│
├── SK = ANALYSIS#7c9e6679-...          ← from POST /analyze (Bedrock, sync)
│      match_score, matched_skills[],
│      missing_skills[], recommendations,
│      cv_improvements
│
└── SK = ANALYSIS#a3b1c2d4-...

Common access patterns:
  • everything for a user      → Query(PK = USER#{u})
  • just their jobs            → Query(PK = USER#{u}, SK begins_with "JOB#")
  • a job + its analysis       → Query(PK = USER#{u}, SK in ["JOB#{id}", "ANALYSIS#{id}"])
  • profile readiness          → GetItem(PK = USER#{u}, SK = "PROFILE#STRUCTURED")
```

---

## 8. CI/CD

**Location:** `.github/workflows/`.

### `ci.yml` — runs on push / PR to `main`

- Backend: `ruff check`, `ruff format --check`, schema-check script, `pytest` (uses `moto` to mock AWS).
- Frontend: `npm run lint`, `tsc --noEmit`, `npm run build`.

### `deploy.yml` — runs on tag push (`v*`)

Sequential jobs:

1. **setup-cognito** — runs `scripts/setup_cognito.sh`, creates or reuses pool + client, exports their IDs as job outputs.
2. **deploy-backend** — patches `eb-options.json` with the Cognito IDs, builds the Docker source bundle, uploads to the EB S3 bucket, creates a new application version, updates the environment, polls until `Ready`.
3. **deploy-lambdas** — runs `scripts/deploy_pipeline.sh` to package and deploy the four Lambdas, plus the S3-trigger and SQS event-source mappings.
4. **deploy-frontend** — builds Next.js with the Cognito IDs and API URL injected as `NEXT_PUBLIC_*`, syncs `out/` to S3, invalidates CloudFront.

Tag → live in ~10–15 minutes:

```bash
git tag v1.2.3 && git push origin v1.2.3
```

See `backend/README.md` for the surrounding setup.

---

## 9. Notable Architectural Decisions

- **Single-table DynamoDB** — every entity for a user is one query. Simpler than per-entity tables; trade-off is that queries across users are not cheap (we don't need them).
- **JWT verification in FastAPI rather than API Gateway** — fewer moving parts, no API Gateway authorizer, backend stays the single ingress.
- **Browser-to-Cognito direct** — backend never sees passwords, doesn't proxy auth.
- **Async pipeline via SQS + Lambda** — keeps Textract and Bedrock latency off the request path; failures retry naturally.
- **Bedrock tool-use for structured extraction** — schema-conformant JSON without prompt-parsing.
- **Polling instead of WebSockets** — the EB single instance stays stateless; one fewer thing to operate.
- **Synchronous skills-gap analysis** — fast enough (one Bedrock call), and the user is actively waiting, so async would only add complexity.
- **Single-instance EB + on-demand DynamoDB + Lambdas** — cost-conscious shape suitable for a course project; horizontal scaling paths exist (EB auto-scaling group, DynamoDB on-demand already elastic, Lambdas inherently parallel).

---

## 10. Where to Look Next

- `docs/DynamoDB_Schema.md` — full schema reference
- `docs/Cognito_Implementation.md` — auth details and component-by-component walkthrough
- `docs/CV_Pipeline_Testing.md` — how to exercise the async pipeline locally
- `backend/README.md` — endpoint reference and local dev
- `backend/scripts/` — operational scripts (Cognito, pipeline, CloudWatch, teardown)
