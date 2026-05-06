#!/bin/bash
set -euo pipefail

# Creates the IAM role for the CV pipeline Lambdas with all required permissions.
# Usage: ./scripts/create_lambda_role.sh [scripts/pipeline_env.sh]

if [ "${1:-}" != "" ]; then
    source "$1"
fi

AWS_REGION="${AWS_REGION:-eu-west-1}"
ROLE_NAME="${LAMBDA_ROLE_NAME:-ccbda-lambda-role}"
S3_BUCKET_NAME="${S3_BUCKET_NAME:-ccbda-app-bucket}"
DYNAMODB_TABLE_NAME="${DYNAMODB_TABLE_NAME:-AppTable}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account: ${ACCOUNT_ID}, Region: ${AWS_REGION}"

# --- Trust policy (allows Lambda to assume this role) ---

TRUST_POLICY='{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "lambda.amazonaws.com"},
        "Action": "sts:AssumeRole"
    }]
}'

# --- Create role ---

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
    echo "Role already exists: ${ROLE_NAME}"
else
    echo "Creating IAM role: ${ROLE_NAME}"
    aws iam create-role \
        --role-name "${ROLE_NAME}" \
        --assume-role-policy-document "${TRUST_POLICY}" \
        --description "Execution role for CCBDA CV pipeline Lambdas" >/dev/null
    echo "Waiting for role to propagate..."
    sleep 10
fi

# --- Inline policy with all required permissions ---

POLICY_NAME="ccbda-pipeline-permissions"

cat > /tmp/lambda-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "CloudWatchLogs",
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:*"
        },
        {
            "Sid": "S3Read",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::${S3_BUCKET_NAME}/profiles/*"
        },
        {
            "Sid": "DynamoDB",
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem"
            ],
            "Resource": "arn:aws:dynamodb:${AWS_REGION}:${ACCOUNT_ID}:table/${DYNAMODB_TABLE_NAME}"
        },
        {
            "Sid": "Textract",
            "Effect": "Allow",
            "Action": [
                "textract:DetectDocumentText"
            ],
            "Resource": "*"
        },
        {
            "Sid": "SQS",
            "Effect": "Allow",
            "Action": [
                "sqs:SendMessage",
                "sqs:ReceiveMessage",
                "sqs:DeleteMessage",
                "sqs:GetQueueAttributes"
            ],
            "Resource": "arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:ccbda-cv-processing*"
        },
        {
            "Sid": "Bedrock",
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel"
            ],
            "Resource": [
                "arn:aws:bedrock:*::foundation-model/anthropic.*",
                "arn:aws:bedrock:*:*:inference-profile/eu.anthropic.*"
            ]
        },
        {
            "Sid": "Marketplace",
            "Effect": "Allow",
            "Action": [
                "aws-marketplace:Subscribe",
                "aws-marketplace:Unsubscribe",
                "aws-marketplace:ViewSubscriptions"
            ],
            "Resource": "*"
        }
    ]
}
EOF

echo "Attaching inline policy: ${POLICY_NAME}"
aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "${POLICY_NAME}" \
    --policy-document file:///tmp/lambda-policy.json

echo ""
echo "Done. Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo ""
echo "NOTE: Complete the Anthropic FTU form in the Bedrock console before first invocation."
