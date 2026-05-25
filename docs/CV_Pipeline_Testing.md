# CV Pipeline — End-to-End Testing Guide

## Prerequisites

- AWS CLI configured (`aws configure` or `AWS_PROFILE` in `.env`)
- Python environment ready (`uv sync`)
- Frontend environment ready if you want to test the authenticated browser flow

## Step 1: Configure environment

```bash
cd backend
cp pipeline_env.example.sh pipeline_env.sh
```

Edit `pipeline_env.sh` if you want to change names. Defaults are fine for first run, except that S3 bucket names must be globally unique.

## Step 2: Enable Bedrock model access (one-time, manual)

The pipeline uses Claude Haiku 4.5 via Amazon Bedrock. Before it can be invoked:

1. **Anthropic FTU form**: First-time Anthropic users must submit use case details. Go to the Bedrock console → Model catalog → select an Anthropic model and complete the form.
2. **Marketplace permissions**: The Lambda role needs `aws-marketplace:Subscribe`, `aws-marketplace:Unsubscribe`, and `aws-marketplace:ViewSubscriptions` permissions (included in the IAM role script below).
3. **Wait**: After completing these steps, it can take up to 15 minutes for the subscription to finalize. During this time `InvokeModel` calls may return `AccessDeniedException`.

## Step 3: Run setup scripts

```bash
# Create the IAM role with all required permissions
./scripts/create_lambda_role.sh pipeline_env.sh

# Create DynamoDB table on AWS (remove DYNAMODB_ENDPOINT_URL from .env first)
uv run python scripts/create_table.py

# Deploy the pipeline (S3 bucket, SQS queues, Lambdas, triggers)
./scripts/deploy_pipeline.sh pipeline_env.sh

# Create Cognito User Pool and App Client
./scripts/setup_cognito.sh pipeline_env.sh
```

Create backend `.env` if you have not already:

```bash
cp .env.example .env
```

Copy the printed `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, and `AWS_REGION` values into `backend/.env` and `frontend/.env.local`. Also copy the Job Queue URL printed by `deploy_pipeline.sh` into `JOB_PROCESSING_QUEUE_URL`.

Backend `.env` needs:

```bash
COGNITO_USER_POOL_ID=<printed user pool id>
COGNITO_APP_CLIENT_ID=<printed app client id>
JOB_PROCESSING_QUEUE_URL=<printed job queue url>
```

Frontend `.env.local` needs:

```bash
NEXT_PUBLIC_AWS_REGION=eu-west-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=<printed user pool id>
NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=<printed app client id>
```

## Step 4: Start the API and frontend

```bash
uv run uvicorn app.main:app --reload
```

Open **http://localhost:8000/docs** in your browser (Swagger UI).

In another terminal:

```bash
cd frontend          # from the repository root
npm install
npm run dev
```

Open **http://localhost:3000/login**, sign up, confirm the email code, and sign in.

## Step 5: Get an authenticated user

The old unauthenticated `POST /users` flow is no longer used. Users are created through Cognito.

After sign-in, the frontend calls:

```text
GET /users/me
```

The backend verifies the Cognito token, extracts the Cognito `sub`, and creates the DynamoDB user record if it does not already exist.

To test protected endpoints in Swagger UI:

1. Open browser DevTools on the frontend.
2. Go to Application/Storage → Local Storage → `http://localhost:3000`.
3. Open `ccbda_auth`.
4. Copy `idToken` and `userId`.
5. In Swagger UI, click **Authorize** and paste the `idToken` as the bearer token.
6. Use the copied `userId` for `/users/{user_id}` endpoints.

### 5.1 Upload a PDF

- Expand `POST /users/{user_id}/profile/upload-file` → click **Try it out**
- Paste the `userId` from `ccbda_auth`
- Click **Choose File** and select a PDF
- Click **Execute**
- Response contains `s3_key` and a confirmation message

> **Alternative (presigned URL):** The `POST /users/{user_id}/profile/upload` endpoint returns a presigned URL for client-side upload — useful for frontend integrations but requires curl to test.

### 5.2 Poll for completion

Back in Swagger:

- Expand `GET /users/{user_id}/profile/status`
- Paste your `userId` → **Execute**
- Repeat every few seconds until you see:
  ```json
  {"raw_status": "ready", "structured_status": "ready"}
  ```

Typical processing time: 10–30 seconds.

### 5.3 View the structured profile

- Expand `GET /users/{user_id}/profile`
- Paste your `userId` → **Execute**
- You should see the fully parsed CV with skills, experience, education, etc.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `raw_status` stays `pending` | PDF wasn't uploaded to S3, or S3 notification not triggering Lambda 1. Check Lambda 1 logs in CloudWatch. |
| `raw_status` = `failed` | Textract failed. Check CloudWatch logs for `ccbda-text-extractor`. Common cause: file isn't a valid PDF. |
| `structured_status` stays `processing` | Lambda 2 hasn't run yet. Check SQS queue in console — is there a message? Check Lambda 2 logs. |
| `structured_status` = `failed` | Bedrock call failed. Check CloudWatch logs for `ccbda-profile-structurer`. Common cause: model access not enabled. |
| Swagger returns `401` | No Cognito token was provided, or the token expired. Copy a fresh `idToken` from frontend local storage and use Swagger **Authorize**. |
| Swagger returns `403` | The `user_id` in the URL does not match the Cognito `sub` in the token. Use the `userId` from `ccbda_auth`. |

### Checking Lambda logs

```bash
# Lambda 1 logs
aws logs tail /aws/lambda/ccbda-text-extractor --follow --region eu-west-1

# Lambda 2 logs
aws logs tail /aws/lambda/ccbda-profile-structurer --follow --region eu-west-1
```

### Checking SQS

```bash
# Messages in DLQ (failed after 3 retries)
aws sqs get-queue-attributes \
  --queue-url "$(aws sqs get-queue-url --queue-name ccbda-cv-processing-dlq --query QueueUrl --output text)" \
  --attribute-names ApproximateNumberOfMessages
```

## Tearing down

To remove all deployed resources:

```bash
source pipeline_env.sh

# Delete Lambdas
aws lambda delete-function --function-name ccbda-text-extractor --region $AWS_REGION
aws lambda delete-function --function-name ccbda-profile-structurer --region $AWS_REGION

# Delete SQS queues
aws sqs delete-queue --queue-url "$(aws sqs get-queue-url --queue-name ccbda-cv-processing --query QueueUrl --output text)" --region $AWS_REGION
aws sqs delete-queue --queue-url "$(aws sqs get-queue-url --queue-name ccbda-cv-processing-dlq --query QueueUrl --output text)" --region $AWS_REGION

# Remove S3 notification (keeps the bucket)
aws s3api put-bucket-notification-configuration --bucket $S3_BUCKET_NAME --notification-configuration '{}'

# Delete IAM role
aws iam delete-role-policy --role-name ccbda-lambda-role --policy-name ccbda-pipeline-permissions
aws iam delete-role --role-name ccbda-lambda-role
```
