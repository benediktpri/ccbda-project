# CV Analyzer – CCBDA Project Test

A serverless AWS application that lets users upload a CV (PDF) and receive an AI-driven analysis – including a summary, top skills, and improvement tips.

---

## Architecture

```
User (Next.js)
    │
    ├─ POST /upload ──► Lambda: upload.py
    │                       └─ Generates a presigned POST URL for S3
    │
    ├─ [Uploads PDF directly to S3]
    │
    │   S3 (ObjectCreated event)
    │       └─► Lambda: text_extractor.py
    │               ├─ Runs AWS Textract on the PDF
    │               ├─ Saves raw text + status "PROCESSING_AI" to DynamoDB
    │               └─ Sends message to SQS
    │
    │   SQS (trigger, max 3 attempts)
    │       ├─► Lambda: cv_generator.py
    │       │       ├─ Calls AWS Bedrock (Gemma 3) with the CV text
    │       │       └─ Saves AI analysis + status "COMPLETED" to DynamoDB
    │       │
    │       └─ [On failure] Dead Letter Queue (DLQ)
    │               └─ Failed messages end up here after 3 attempts
    │
    └─ GET /result?id=<filename> ──► Lambda: result.py
                                        └─ Fetches status/analysis from DynamoDB
```

---

## What is implemented

### Backend (4 Lambda functions)

| File | Description |
|---|---|
| `upload.py` | Generates a presigned S3 POST URL so the frontend can upload the PDF directly to S3. |
| `text_extractor.py` | Triggered automatically by S3 when a PDF is uploaded. Runs Textract, saves the raw text to DynamoDB, and forwards the message to SQS. |
| `cv_generator.py` | Triggered by SQS. Calls Bedrock (Gemma 3) with the CV text and requests a JSON response with `summary`, `top_skills`, and `improvement_tip`. Saves the result to DynamoDB. On failure, marks the job as `FAILED_AI` and returns 200 so SQS does not retry with a logic error. |
| `result.py` | API endpoint polled by the frontend. Fetches the current status and AI analysis from DynamoDB. |

### Frontend

- **`frontend/`** – Simple static HTML page.
- **`next-frontend/`** – Next.js app with Tailwind CSS. Features drag-and-drop file upload, status indicators, and structured display of the AI analysis.

### Infrastructure (`deploy.sh`)

Automated deploy script that provisions the full AWS stack:

- S3 bucket with CORS configuration
- DynamoDB table (`FileId` as primary key)
- SQS queue with a **Dead Letter Queue (DLQ)** – messages are retried up to 3 times before being moved to the DLQ
- 4 Lambda functions (creates or updates)
- API Gateway (HTTP API) with routes `POST /upload` and `GET /result`
- S3 → Lambda notification (triggered on `.pdf` uploads)
- SQS → Lambda event source mapping

---

## Requirements

- AWS CLI configured (`aws configure`)
- An IAM role with permissions for: Lambda, S3, DynamoDB, SQS, Textract, Bedrock, API Gateway
- `jq` installed (`brew install jq`)
- Node.js (for the Next.js frontend)

---

## How to run

### 1. Configure environment variables

Copy the example file and fill in your values:

```bash
cp envexample.txt .env
```

`.env` should contain:

```
REGION=eu-west-1
S3_BUCKET_NAME=<your-bucket-name>
DYNAMO_TABLE=<your-table-name>
ROLE_NAME=<your-iam-role-name>
API_NAME=<your-api-gateway-name>
API_URL=<filled in after deploy>
```

### 2. Deploy AWS infrastructure

```bash
chmod +x deploy.sh
./deploy.sh .env
```

The script prints the API URL when finished. Copy it.

### 3. Start the Next.js frontend

```bash
cd next-frontend
npm install
```

Create a `.env.local` file inside `next-frontend/`:

```
NEXT_PUBLIC_API_URL=<your-api-url-from-deploy>
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## End-to-end flow

1. The user drags and drops a PDF into the frontend.
2. The frontend calls `POST /upload` → receives a presigned S3 URL.
3. The PDF is uploaded **directly to S3** using the presigned URL.
4. S3 triggers `text_extractor` → Textract extracts the text → saved to DynamoDB → forwarded to SQS.
5. SQS triggers `cv_generator` → Bedrock analyses the text → result saved to DynamoDB.
6. The frontend polls `GET /result?id=<filename>` every 3 seconds until the status is `COMPLETED`.
7. The AI analysis is displayed in a structured format in the UI.

---

## DynamoDB status values

| Status | Description |
|---|---|
| `PROCESSING_AI` | Textract is done; waiting for Bedrock |
| `COMPLETED` | AI analysis is ready |
| `FAILED_AI` | Bedrock call failed (message moved to DLQ after 3 SQS attempts) |
