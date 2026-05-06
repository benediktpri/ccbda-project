# CV Pipeline — End-to-End Testing Guide

## Prerequisites

- AWS CLI configured (`aws configure` or `AWS_PROFILE` in `.env`)
- Python environment ready (`uv sync`)

## Step 1: Configure environment

```bash
cd backend
cp scripts/pipeline_env.example.sh scripts/pipeline_env.sh
```

Edit `scripts/pipeline_env.sh` if you want to change names. Defaults are fine for first run.

## Step 2: Enable Bedrock model access (one-time, manual)

The pipeline uses Claude Haiku 4.5 via Amazon Bedrock. Before it can be invoked:

1. **Anthropic FTU form**: First-time Anthropic users must submit use case details. Go to the Bedrock console → Model catalog → select an Anthropic model and complete the form.
2. **Marketplace permissions**: The Lambda role needs `aws-marketplace:Subscribe`, `aws-marketplace:Unsubscribe`, and `aws-marketplace:ViewSubscriptions` permissions (included in the IAM role script below).
3. **Wait**: After completing these steps, it can take up to 15 minutes for the subscription to finalize. During this time `InvokeModel` calls may return `AccessDeniedException`.

## Step 3: Run setup scripts

```bash
# Create the IAM role with all required permissions
./scripts/create_lambda_role.sh scripts/pipeline_env.sh

# Create DynamoDB table on AWS (remove DYNAMODB_ENDPOINT_URL from .env first)
uv run python scripts/create_table.py

# Deploy the pipeline (S3 bucket, SQS queues, Lambdas, triggers)
./scripts/deploy_pipeline.sh scripts/pipeline_env.sh
```

## Step 4: Start the API

```bash
uv run uvicorn app.main:app --reload
```

Open **http://localhost:8000/docs** in your browser (Swagger UI).

## Step 5: Test via Swagger UI

### 5.1 Create a user

- Expand `POST /users` → click **Try it out** → click **Execute**
- Copy the `user_id` from the response

### 5.2 Upload a PDF

- Expand `POST /users/{user_id}/profile/upload-file` → click **Try it out**
- Paste your `user_id`
- Click **Choose File** and select a PDF
- Click **Execute**
- Response contains `s3_key` and a confirmation message

> **Alternative (presigned URL):** The `POST /users/{user_id}/profile/upload` endpoint returns a presigned URL for client-side upload — useful for frontend integrations but requires curl to test.

### 5.3 Poll for completion

Back in Swagger:

- Expand `GET /users/{user_id}/profile/status`
- Paste your `user_id` → **Execute**
- Repeat every few seconds until you see:
  ```json
  {"raw_status": "ready", "structured_status": "ready"}
  ```

Typical processing time: 10–30 seconds.

### 5.4 View the structured profile

- Expand `GET /users/{user_id}/profile`
- Paste your `user_id` → **Execute**
- You should see the fully parsed CV with skills, experience, education, etc.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `raw_status` stays `pending` | PDF wasn't uploaded to S3, or S3 notification not triggering Lambda 1. Check Lambda 1 logs in CloudWatch. |
| `raw_status` = `failed` | Textract failed. Check CloudWatch logs for `ccbda-text-extractor`. Common cause: file isn't a valid PDF. |
| `structured_status` stays `processing` | Lambda 2 hasn't run yet. Check SQS queue in console — is there a message? Check Lambda 2 logs. |
| `structured_status` = `failed` | Bedrock call failed. Check CloudWatch logs for `ccbda-profile-structurer`. Common cause: model access not enabled. |

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
source scripts/pipeline_env.sh

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
