#!/bin/bash
set -euo pipefail

export AWS_PAGER=""

# Deploy the CV processing pipeline (S3 → Lambda 1 → SQS → Lambda 2)
# Usage: ./scripts/deploy_pipeline.sh pipeline_env.sh

source "$1"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_ROLE_NAME}"

echo "Account: ${ACCOUNT_ID}, Region: ${AWS_REGION}"

# --- Helpers ---

create_bucket_if_missing() {
    if aws s3api head-bucket --bucket "${S3_BUCKET_NAME}" 2>/dev/null; then
        echo "S3 bucket already exists: ${S3_BUCKET_NAME}"
    else
        echo "Creating S3 bucket: ${S3_BUCKET_NAME}"
        aws s3api create-bucket \
            --bucket "${S3_BUCKET_NAME}" \
            --create-bucket-configuration LocationConstraint="${AWS_REGION}" >/dev/null
    fi
}

configure_bucket_cors() {
    echo "Configuring S3 CORS"
    aws s3api put-bucket-cors \
        --bucket "${S3_BUCKET_NAME}" \
        --cors-configuration '{
            "CORSRules": [{
                "AllowedHeaders": ["*"],
                "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
                "AllowedOrigins": ["*"],
                "ExposeHeaders": ["ETag"],
                "MaxAgeSeconds": 3000
            }]
        }' >/dev/null
}

create_sqs() {
    echo "Creating DLQ: ${DLQ_NAME}"
    DLQ_URL=$(aws sqs create-queue --queue-name "${DLQ_NAME}" --region "${AWS_REGION}" | jq -r '.QueueUrl')
    DLQ_ARN=$(aws sqs get-queue-attributes --queue-url "${DLQ_URL}" \
        --attribute-names QueueArn --region "${AWS_REGION}" | jq -r '.Attributes.QueueArn')

    echo "Creating main queue: ${QUEUE_NAME}"
    cat > /tmp/sqs-attrs.json <<EOF
{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"${DLQ_ARN}\",\"maxReceiveCount\":\"3\"}",
    "VisibilityTimeout": "120"
}
EOF
    QUEUE_URL=$(aws sqs create-queue --queue-name "${QUEUE_NAME}" \
        --attributes file:///tmp/sqs-attrs.json --region "${AWS_REGION}" | jq -r '.QueueUrl')
    QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url "${QUEUE_URL}" \
        --attribute-names QueueArn --region "${AWS_REGION}" | jq -r '.Attributes.QueueArn')

    echo "Queue URL: ${QUEUE_URL}"

    echo "Creating Job DLQ: ${JOB_DLQ_NAME}"
    JOB_DLQ_URL=$(aws sqs create-queue --queue-name "${JOB_DLQ_NAME}" --region "${AWS_REGION}" | jq -r '.QueueUrl')
    JOB_DLQ_ARN=$(aws sqs get-queue-attributes --queue-url "${JOB_DLQ_URL}" \
        --attribute-names QueueArn --region "${AWS_REGION}" | jq -r '.Attributes.QueueArn')

    echo "Creating Job main queue: ${JOB_QUEUE_NAME}"
    cat > /tmp/sqs-job-attrs.json <<EOF
{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"${JOB_DLQ_ARN}\",\"maxReceiveCount\":\"3\"}",
    "VisibilityTimeout": "120"
}
EOF
    JOB_QUEUE_URL=$(aws sqs create-queue --queue-name "${JOB_QUEUE_NAME}" \
        --attributes file:///tmp/sqs-job-attrs.json --region "${AWS_REGION}" | jq -r '.QueueUrl')
    JOB_QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url "${JOB_QUEUE_URL}" \
        --attribute-names QueueArn --region "${AWS_REGION}" | jq -r '.Attributes.QueueArn')

    echo "Job Queue URL: ${JOB_QUEUE_URL}"
}

package_lambda() {
    local name=$1
    local source=$2
    echo "Packaging ${name}"
    rm -f "/tmp/${name}.zip"
    zip -j "/tmp/${name}.zip" "${source}" >/dev/null
}

deploy_lambda() {
    local function_name=$1
    local zip_file=$2
    local handler=$3
    local env_vars=$4
    local timeout=${5:-60}

    if aws lambda get-function --function-name "${function_name}" --region "${AWS_REGION}" >/dev/null 2>&1; then
        echo "Updating Lambda: ${function_name}"
        aws lambda update-function-code \
            --function-name "${function_name}" \
            --zip-file "fileb://${zip_file}" \
            --region "${AWS_REGION}" >/dev/null

        aws lambda wait function-updated --function-name "${function_name}" --region "${AWS_REGION}"

        aws lambda update-function-configuration \
            --function-name "${function_name}" \
            --environment "Variables={${env_vars}}" \
            --timeout "${timeout}" \
            --region "${AWS_REGION}" >/dev/null

        aws lambda wait function-updated --function-name "${function_name}" --region "${AWS_REGION}"
    else
        echo "Creating Lambda: ${function_name}"
        aws lambda create-function \
            --function-name "${function_name}" \
            --zip-file "fileb://${zip_file}" \
            --handler "${handler}" \
            --runtime python3.13 \
            --role "${ROLE_ARN}" \
            --timeout "${timeout}" \
            --memory-size 256 \
            --environment "Variables={${env_vars}}" \
            --region "${AWS_REGION}" >/dev/null

        aws lambda wait function-active-v2 --function-name "${function_name}" --region "${AWS_REGION}"
    fi
}

ensure_s3_invoke_permission() {
    local lambda_name=$1
    if aws lambda get-policy --function-name "${lambda_name}" --region "${AWS_REGION}" 2>/dev/null | grep -q "s3.amazonaws.com"; then
        echo "S3 invoke permission already exists for ${lambda_name}"
    else
        echo "Adding S3 invoke permission for ${lambda_name}"
        aws lambda add-permission \
            --function-name "${lambda_name}" \
            --statement-id "s3-invoke-$(date +%s)" \
            --action lambda:InvokeFunction \
            --principal s3.amazonaws.com \
            --source-arn "arn:aws:s3:::${S3_BUCKET_NAME}" \
            --source-account "${ACCOUNT_ID}" \
            --region "${AWS_REGION}" >/dev/null
    fi
}

configure_s3_notification() {
    local function_arn
    function_arn=$(aws lambda get-function --function-name "${LAMBDA_EXTRACTOR_NAME}" \
        --region "${AWS_REGION}" | jq -r '.Configuration.FunctionArn')

    echo "Configuring S3 notifications → ${LAMBDA_EXTRACTOR_NAME}"
    aws s3api put-bucket-notification-configuration \
        --bucket "${S3_BUCKET_NAME}" \
        --notification-configuration "{
            \"LambdaFunctionConfigurations\": [
                {
                    \"LambdaFunctionArn\": \"${function_arn}\",
                    \"Events\": [\"s3:ObjectCreated:*\"],
                    \"Filter\": {
                        \"Key\": {
                            \"FilterRules\": [
                                {\"Name\": \"prefix\", \"Value\": \"profiles/\"},
                                {\"Name\": \"suffix\", \"Value\": \".pdf\"}
                            ]
                        }
                    }
                },
                {
                    \"LambdaFunctionArn\": \"${function_arn}\",
                    \"Events\": [\"s3:ObjectCreated:*\"],
                    \"Filter\": {
                        \"Key\": {
                            \"FilterRules\": [
                                {\"Name\": \"prefix\", \"Value\": \"jobs/\"},
                                {\"Name\": \"suffix\", \"Value\": \".pdf\"}
                            ]
                        }
                    }
                }
            ]
        }" >/dev/null
}

ensure_sqs_event_mapping() {
    local function_name=$1
    local queue_arn=$2

    local mapping_uuid
    mapping_uuid=$(aws lambda list-event-source-mappings \
        --function-name "${function_name}" \
        --event-source-arn "${queue_arn}" \
        --region "${AWS_REGION}" | jq -r '.EventSourceMappings[0].UUID')

    if [ "${mapping_uuid}" != "null" ] && [ -n "${mapping_uuid}" ]; then
        echo "SQS mapping already exists for ${function_name}"
    else
        echo "Creating SQS → Lambda mapping for ${function_name}"
        aws lambda create-event-source-mapping \
            --function-name "${function_name}" \
            --batch-size 1 \
            --event-source-arn "${queue_arn}" \
            --region "${AWS_REGION}" >/dev/null
    fi
}

# --- Execution ---

echo "=== Step 1: S3 bucket ==="
create_bucket_if_missing
configure_bucket_cors

echo "=== Step 2: SQS queues ==="
create_sqs

echo "=== Step 3: Package Lambdas ==="
package_lambda "text_extractor" "app/lambdas/text_extractor.py"

echo "Generating extraction schema from Pydantic model"
uv run python -c "from app.models.schemas import ExtractedProfile; import json, pathlib; pathlib.Path('/tmp/extraction_schema.json').write_text(json.dumps(ExtractedProfile.model_json_schema()))"
echo "Packaging profile_structurer"
rm -f /tmp/profile_structurer.zip
zip -j /tmp/profile_structurer.zip app/lambdas/profile_structurer.py /tmp/extraction_schema.json >/dev/null

echo "Generating job extraction schema from Pydantic model"
uv run python -c "from app.models.schemas import ExtractedJob; import json, pathlib; pathlib.Path('/tmp/job_extraction_schema.json').write_text(json.dumps(ExtractedJob.model_json_schema()))"
echo "Packaging job_structurer"
rm -f /tmp/job_structurer.zip
zip -j /tmp/job_structurer.zip app/lambdas/job_structurer.py /tmp/job_extraction_schema.json >/dev/null

package_lambda "dlq_handler" "app/lambdas/dlq_handler.py"

echo "=== Step 4: Deploy Lambdas ==="
deploy_lambda \
    "${LAMBDA_EXTRACTOR_NAME}" \
    "/tmp/text_extractor.zip" \
    "text_extractor.lambda_handler" \
    "DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME},SQS_QUEUE_URL=${QUEUE_URL},JOB_SQS_QUEUE_URL=${JOB_QUEUE_URL}" \
    60

deploy_lambda \
    "${LAMBDA_STRUCTURER_NAME}" \
    "/tmp/profile_structurer.zip" \
    "profile_structurer.lambda_handler" \
    "DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME},BEDROCK_MODEL_ID=${BEDROCK_MODEL_ID}" \
    120

deploy_lambda \
    "${LAMBDA_JOB_STRUCTURER_NAME}" \
    "/tmp/job_structurer.zip" \
    "job_structurer.lambda_handler" \
    "DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME},BEDROCK_MODEL_ID=${BEDROCK_MODEL_ID}" \
    120

deploy_lambda \
    "${LAMBDA_DLQ_HANDLER_NAME}" \
    "/tmp/dlq_handler.zip" \
    "dlq_handler.lambda_handler" \
    "DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME}" \
    30

echo "=== Step 5: S3 → Lambda 1 ==="
ensure_s3_invoke_permission "${LAMBDA_EXTRACTOR_NAME}"
configure_s3_notification

echo "=== Step 6: SQS → Lambda 2 ==="
ensure_sqs_event_mapping "${LAMBDA_STRUCTURER_NAME}" "${QUEUE_ARN}"

echo "=== Step 7: Job SQS → Job Structurer ==="
ensure_sqs_event_mapping "${LAMBDA_JOB_STRUCTURER_NAME}" "${JOB_QUEUE_ARN}"

echo "=== Step 8: DLQ → DLQ Handler ==="
ensure_sqs_event_mapping "${LAMBDA_DLQ_HANDLER_NAME}" "${DLQ_ARN}"
ensure_sqs_event_mapping "${LAMBDA_DLQ_HANDLER_NAME}" "${JOB_DLQ_ARN}"

echo "=== Step 9: Enable event source mappings ==="
"$(dirname "$0")/toggle_pipeline.sh" enable "$1"

echo ""
echo "=== Done ==="
echo "S3 bucket:       ${S3_BUCKET_NAME}"
echo "Profile queue:   ${QUEUE_NAME}"
echo "Profile DLQ:     ${DLQ_NAME}"
echo "Job queue:       ${JOB_QUEUE_NAME}"
echo "Job DLQ:         ${JOB_DLQ_NAME}"
echo "Lambda 1:        ${LAMBDA_EXTRACTOR_NAME} (S3 → Textract → SQS)"
echo "Lambda 2:        ${LAMBDA_STRUCTURER_NAME} (SQS → Bedrock → DynamoDB)"
echo "Lambda 3:        ${LAMBDA_JOB_STRUCTURER_NAME} (SQS → Bedrock → DynamoDB)"
echo "Lambda 4:        ${LAMBDA_DLQ_HANDLER_NAME} (DLQ → DynamoDB status=failed)"
echo ""
echo "IAM role '${LAMBDA_ROLE_NAME}' must have permissions for:"
echo "  textract:DetectDocumentText, sqs:SendMessage, sqs:ReceiveMessage,"
echo "  sqs:DeleteMessage, sqs:GetQueueAttributes, dynamodb:GetItem,"
echo "  dynamodb:PutItem, dynamodb:UpdateItem, s3:GetObject,"
echo "  bedrock:InvokeModel, logs:CreateLogGroup, logs:CreateLogStream,"
echo "  logs:PutLogEvents"
echo ""
echo "To stop costs when done:"
echo "  ./scripts/teardown.sh ${1}"
