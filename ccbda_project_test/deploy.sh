#!/bin/bash
set -euo pipefail


source "$1"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"


STAGE=${STAGE:-production}


LAMBDA_UPLOAD=${LAMBDA_UPLOAD:-"cv-api-upload"}
LAMBDA_RESULT=${LAMBDA_RESULT:-"cv-api-result"}
LAMBDA_EXTRACTOR=${LAMBDA_EXTRACTOR:-"cv-text-extractor"}
LAMBDA_GENERATOR=${LAMBDA_GENERATOR:-"cv-ai-generator"}
QUEUE_NAME=${QUEUE_NAME:-"cv-processing-queue"}
DLQ_NAME=${DLQ_NAME:-"cv-processing-dlq"}

echo "Using account: ${ACCOUNT_ID}"
echo "Using region: ${REGION}"

create_bucket_if_missing() {
  if aws s3api head-bucket --bucket "${S3_BUCKET_NAME}" 2>/dev/null; then
    echo "S3 bucket already exists: ${S3_BUCKET_NAME}"
  else
    echo "Creating S3 bucket: ${S3_BUCKET_NAME}"
    if [ "${REGION}" = "us-east-1" ]; then
      aws s3api create-bucket \
        --bucket "${S3_BUCKET_NAME}" >/dev/null
    else
      aws s3api create-bucket \
        --bucket "${S3_BUCKET_NAME}" \
        --create-bucket-configuration LocationConstraint="${REGION}" >/dev/null
    fi
  fi
}

configure_bucket_cors() {
  echo "Configuring S3 CORS for ${S3_BUCKET_NAME}"

  cat > /tmp/s3-cors.json <<EOF
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["PUT", "GET", "HEAD", "POST"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

  aws s3api put-bucket-cors \
    --bucket "${S3_BUCKET_NAME}" \
    --cors-configuration file:///tmp/s3-cors.json >/dev/null
}

create_table_if_missing() {
  if aws dynamodb describe-table --table-name "${DYNAMO_TABLE}" --region "${REGION}" >/dev/null 2>&1; then
    echo "DynamoDB table already exists: ${DYNAMO_TABLE}"
  else
    echo "Creating DynamoDB table: ${DYNAMO_TABLE}"
    aws dynamodb create-table \
      --table-name "${DYNAMO_TABLE}" \
      --attribute-definitions AttributeName=FileId,AttributeType=S \
      --key-schema AttributeName=FileId,KeyType=HASH \
      --billing-mode PAY_PER_REQUEST \
      --region "${REGION}" >/dev/null
  fi
}

wait_for_table() {
  echo "Waiting for DynamoDB table to become ACTIVE..."
  aws dynamodb wait table-exists \
    --table-name "${DYNAMO_TABLE}" \
    --region "${REGION}"
}

create_sqs_if_missing() {
  echo "Setting up SQS and DLQ..."
  
  # 1. Skapa DLQ
  DLQ_URL=$(aws sqs create-queue --queue-name "${DLQ_NAME}" --region "${REGION}" | jq -r '.QueueUrl')
  DLQ_ARN=$(aws sqs get-queue-attributes --queue-url "${DLQ_URL}" --attribute-names QueueArn --region "${REGION}" | jq -r '.Attributes.QueueArn')
  echo "DLQ created/exists: ${DLQ_NAME}"

  # 2. Skapa Huvudkö med RedrivePolicy (Max 3 försök)
  # Vi sparar policyn i en temporär fil för att undvika AWS CLI's problem med kommatecken och quotes.
  cat > /tmp/sqs-attributes.json <<EOF
{
  "RedrivePolicy": "{\"deadLetterTargetArn\":\"${DLQ_ARN}\",\"maxReceiveCount\":\"3\"}"
}
EOF

  export QUEUE_URL=$(aws sqs create-queue --queue-name "${QUEUE_NAME}" \
      --attributes file:///tmp/sqs-attributes.json --region "${REGION}" | jq -r '.QueueUrl')
  
  export QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url "${QUEUE_URL}" \
      --attribute-names QueueArn --region "${REGION}" | jq -r '.Attributes.QueueArn')
  
  echo "Main Queue created/exists: ${QUEUE_NAME}"
}

zip_lambda() {
  local zip_name=$1
  shift
  rm -f "${zip_name}"
  zip -j "${zip_name}" "$@" >/dev/null
}

deploy_lambda() {
  local function_name=$1
  local zip_file=$2
  local handler=$3
  local env_vars=$4

  if aws lambda get-function --function-name "${function_name}" --region "${REGION}" >/dev/null 2>&1; then
    echo "Updating Lambda code: ${function_name}"
    aws lambda update-function-code \
      --function-name "${function_name}" \
      --zip-file "fileb://${zip_file}" \
      --region "${REGION}" >/dev/null

    echo "Waiting for Lambda code update: ${function_name}"
    aws lambda wait function-updated \
      --function-name "${function_name}" \
      --region "${REGION}"

    if [ -n "${env_vars}" ]; then
      echo "Updating Lambda configuration: ${function_name}"
      aws lambda update-function-configuration \
        --function-name "${function_name}" \
        --environment "Variables={${env_vars}}" \
        --region "${REGION}" >/dev/null

      echo "Waiting for Lambda config update: ${function_name}"
      aws lambda wait function-updated \
        --function-name "${function_name}" \
        --region "${REGION}"
    fi
  else
    echo "Creating Lambda: ${function_name}"
    aws lambda create-function \
      --function-name "${function_name}" \
      --zip-file "fileb://${zip_file}" \
      --handler "${handler}" \
      --runtime python3.10 \
      --role "${ROLE_ARN}" \
      --timeout 30 \
      --memory-size 256 \
      --environment "Variables={${env_vars}}" \
      --region "${REGION}" >/dev/null

    echo "Waiting for Lambda create: ${function_name}"
    aws lambda wait function-active-v2 \
      --function-name "${function_name}" \
      --region "${REGION}"
  fi
}

get_api_id_by_name() {
  aws apigatewayv2 get-apis --region "${REGION}" \
    | jq -r --arg NAME "${API_NAME}" '.Items[] | select(.Name==$NAME) | .ApiId' \
    | head -n 1
}

create_api_if_missing() {
  API_ID=$(get_api_id_by_name)

  if [ -n "${API_ID}" ] && [ "${API_ID}" != "null" ]; then
    echo "API Gateway already exists: ${API_NAME} (${API_ID})"
  else
    echo "Creating API Gateway: ${API_NAME}"
    API_ID=$(aws apigatewayv2 create-api \
      --name "${API_NAME}" \
      --protocol-type HTTP \
      --cors-configuration AllowOrigins="*",AllowHeaders="content-type",AllowMethods="GET,POST,OPTIONS" \
      --region "${REGION}" \
      | jq -r '.ApiId')
    echo "Created API_ID=${API_ID}"
  fi
}

get_integration_id() {
  local lambda_arn=$1
  aws apigatewayv2 get-integrations \
    --api-id "${API_ID}" \
    --region "${REGION}" \
    | jq -r --arg URI "${lambda_arn}" '.Items[] | select(.IntegrationUri==$URI) | .IntegrationId' \
    | head -n 1
}

ensure_lambda_permission() {
  local function_name=$1
  local statement_id=$2

  if aws lambda get-policy --function-name "${function_name}" --region "${REGION}" 2>/dev/null | grep -q "${API_ID}"; then
    echo "Lambda permission already exists for API Gateway on ${function_name}"
  else
    echo "Adding Lambda permission for API Gateway: ${function_name}"
    aws lambda add-permission \
      --function-name "${function_name}" \
      --statement-id "${statement_id}" \
      --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
      --region "${REGION}" >/dev/null
  fi
}

ensure_route_and_integration() {
  local route_key=$1
  local function_name=$2
  local http_method=$3

  local lambda_arn
  lambda_arn=$(aws lambda get-function \
    --function-name "${function_name}" \
    --region "${REGION}" \
    | jq -r '.Configuration.FunctionArn')

  local integration_id
  integration_id=$(get_integration_id "${lambda_arn}")

  if [ -z "${integration_id}" ] || [ "${integration_id}" = "null" ]; then
    echo "Creating integration for ${function_name}"
    integration_id=$(aws apigatewayv2 create-integration \
      --api-id "${API_ID}" \
      --integration-type AWS_PROXY \
      --integration-uri "${lambda_arn}" \
      --integration-method "${http_method}" \
      --payload-format-version 2.0 \
      --region "${REGION}" \
      | jq -r '.IntegrationId')
  else
    echo "Integration already exists for ${function_name}: ${integration_id}"
  fi

  local route_exists
  route_exists=$(aws apigatewayv2 get-routes \
    --api-id "${API_ID}" \
    --region "${REGION}" \
    | jq -r --arg RK "${route_key}" '.Items[] | select(.RouteKey==$RK) | .RouteId' \
    | head -n 1)

  if [ -n "${route_exists}" ] && [ "${route_exists}" != "null" ]; then
    echo "Route already exists: ${route_key}"
  else
    echo "Creating route: ${route_key}"
    aws apigatewayv2 create-route \
      --api-id "${API_ID}" \
      --route-key "${route_key}" \
      --target "integrations/${integration_id}" \
      --region "${REGION}" >/dev/null
  fi
}

ensure_stage() {
  if aws apigatewayv2 get-stage \
    --api-id "${API_ID}" \
    --stage-name "${STAGE}" \
    --region "${REGION}" >/dev/null 2>&1; then
    echo "Stage already exists: ${STAGE}"
  else
    echo "Creating stage: ${STAGE}"
    aws apigatewayv2 create-stage \
      --api-id "${API_ID}" \
      --stage-name "${STAGE}" \
      --auto-deploy \
      --region "${REGION}" >/dev/null
  fi
}

deploy_api() {
  echo "Creating deployment..."
  aws apigatewayv2 create-deployment \
    --api-id "${API_ID}" \
    --stage-name "${STAGE}" \
    --region "${REGION}" >/dev/null || true
}

ensure_s3_invoke_permission() {
  local lambda_name=$1

  if aws lambda get-policy --function-name "${lambda_name}" --region "${REGION}" 2>/dev/null | grep -q "${S3_BUCKET_NAME}"; then
    echo "S3 invoke permission already exists for ${lambda_name}"
  else
    echo "Adding S3 invoke permission for ${lambda_name}"
    aws lambda add-permission \
      --function-name "${lambda_name}" \
      --statement-id "s3invoke-$(date +%s)" \
      --action lambda:InvokeFunction \
      --principal s3.amazonaws.com \
      --source-arn "arn:aws:s3:::${S3_BUCKET_NAME}" \
      --source-account "${ACCOUNT_ID}" \
      --region "${REGION}" >/dev/null
  fi
}

configure_s3_notification() {
  local function_arn
  function_arn=$(aws lambda get-function \
    --function-name "${LAMBDA_EXTRACTOR}" \
    --region "${REGION}" | jq -r '.Configuration.FunctionArn')

  echo "Configuring S3 notification for bucket ${S3_BUCKET_NAME} -> ${LAMBDA_EXTRACTOR}"
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
    --region "${REGION}" | jq -r '.EventSourceMappings[0].UUID')

  if [ "${mapping_uuid}" != "null" ] && [ -n "${mapping_uuid}" ]; then
     echo "SQS mapping already exists for ${function_name}"
  else
     echo "Creating SQS mapping for ${function_name} -> ${queue_arn}"
     aws lambda create-event-source-mapping \
        --function-name "${function_name}" \
        --batch-size 1 \
        --event-source-arn "${queue_arn}" \
        --region "${REGION}" >/dev/null
  fi
}

write_frontend_config() {
  local url="https://${API_ID}.execute-api.${REGION}.amazonaws.com/${STAGE}"

  mkdir -p Frontend

  cat > Frontend/variables.json <<EOF
{
  "apiUrl": "${url}"
}
EOF

  echo "Created Frontend/variables.json"
  cat Frontend/variables.json
}

echo "=== Step 1: create shared infrastructure if missing ==="
create_bucket_if_missing
configure_bucket_cors
create_table_if_missing
wait_for_table
create_sqs_if_missing 

echo "=== Step 2: package Lambda functions ==="
pushd backend >/dev/null
zip_lambda upload.zip upload.py
zip_lambda result.zip result.py
zip_lambda text_extractor.zip text_extractor.py
zip_lambda cv_generator.zip cv_generator.py
popd >/dev/null

echo "=== Step 3: deploy/update Lambda functions ==="
deploy_lambda "${LAMBDA_UPLOAD}" "backend/upload.zip" "upload.lambda_handler" "S3_BUCKET=${S3_BUCKET_NAME},DYNAMO_TABLE=${DYNAMO_TABLE}"
deploy_lambda "${LAMBDA_RESULT}" "backend/result.zip" "result.lambda_handler" "DYNAMO_TABLE=${DYNAMO_TABLE}"
deploy_lambda "${LAMBDA_EXTRACTOR}" "backend/text_extractor.zip" "text_extractor.lambda_handler" "DYNAMO_TABLE=${DYNAMO_TABLE},QUEUE_URL=${QUEUE_URL}"
deploy_lambda "${LAMBDA_GENERATOR}" "backend/cv_generator.zip" "cv_generator.lambda_handler" "DYNAMO_TABLE=${DYNAMO_TABLE}"

echo "=== Step 4: create/reuse API Gateway ==="
create_api_if_missing

# Rättigheter för de nya API Lambdorna
ensure_lambda_permission "${LAMBDA_UPLOAD}" "apigw-upload-handler"
ensure_lambda_permission "${LAMBDA_RESULT}" "apigw-result-handler"

# Nya renodlade routes
ensure_route_and_integration "POST /upload" "${LAMBDA_UPLOAD}" "POST"
ensure_route_and_integration "GET /result" "${LAMBDA_RESULT}" "POST"
# (OPTIONS hanteras nu helt automatiskt av API Gateways inbyggda CORS-konfiguration)

ensure_stage
deploy_api

echo "=== Step 5: connect S3 to Lambda ==="
ensure_s3_invoke_permission "${LAMBDA_EXTRACTOR}"
configure_s3_notification

echo "=== Step 6: connect SQS to Lambda ==="
ensure_sqs_event_mapping "${LAMBDA_GENERATOR}" "${QUEUE_ARN}"

echo "=== Step 7: output config ==="
write_frontend_config

echo ""
echo "Done."
echo "API URL: https://${API_ID}.execute-api.${REGION}.amazonaws.com/${STAGE}"
echo "Upload bucket: ${S3_BUCKET_NAME}"
echo "Jobs table: ${DYNAMO_TABLE}"
echo "SQS Queue: ${QUEUE_NAME}"