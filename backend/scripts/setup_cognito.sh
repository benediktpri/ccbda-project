#!/bin/bash
set -euo pipefail

# Script to set up AWS Cognito User Pool and App Client
# Usage: ./scripts/setup_cognito.sh pipeline_env.sh

if [ -z "${1:-}" ]; then
    echo "Usage: $0 <env_file>"
    exit 1
fi

source "$1"

# Default names if not provided in env file
USER_POOL_NAME="${COGNITO_USER_POOL_NAME:-ccbda-user-pool}"
CLIENT_NAME="${COGNITO_APP_CLIENT_NAME:-ccbda-app-client}"

echo "Checking if User Pool '${USER_POOL_NAME}' already exists..."
EXISTING_POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 --region "${AWS_REGION}" --query "UserPools[?Name=='${USER_POOL_NAME}'].Id" --output text)

if [ -n "${EXISTING_POOL_ID}" ] && [ "${EXISTING_POOL_ID}" != "None" ]; then
    echo "User Pool already exists: ${EXISTING_POOL_ID}"
    USER_POOL_ID="${EXISTING_POOL_ID}"
else
    echo "Creating User Pool: ${USER_POOL_NAME}"
    USER_POOL_ID=$(aws cognito-idp create-user-pool \
        --pool-name "${USER_POOL_NAME}" \
        --username-attributes email \
        --auto-verified-attributes email \
        --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":false}}' \
        --region "${AWS_REGION}" \
        --query 'UserPool.Id' \
        --output text)
    echo "User Pool created: ${USER_POOL_ID}"
fi

echo "Checking if App Client '${CLIENT_NAME}' already exists..."
EXISTING_CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id "${USER_POOL_ID}" --region "${AWS_REGION}" --query "UserPoolClients[?ClientName=='${CLIENT_NAME}'].ClientId" --output text)

if [ -n "${EXISTING_CLIENT_ID}" ] && [ "${EXISTING_CLIENT_ID}" != "None" ]; then
    echo "App Client already exists: ${EXISTING_CLIENT_ID}"
    CLIENT_ID="${EXISTING_CLIENT_ID}"
else
    echo "Creating App Client: ${CLIENT_NAME}"
    CLIENT_ID=$(aws cognito-idp create-user-pool-client \
        --user-pool-id "${USER_POOL_ID}" \
        --client-name "${CLIENT_NAME}" \
        --no-generate-secret \
        --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH \
        --region "${AWS_REGION}" \
        --query 'UserPoolClient.ClientId' \
        --output text)
    echo "App Client created: ${CLIENT_ID}"
fi

echo ""
echo "=== Cognito Setup Complete ==="
echo "COGNITO_USER_POOL_ID=${USER_POOL_ID}"
echo "COGNITO_APP_CLIENT_ID=${CLIENT_ID}"
echo "AWS_REGION=${AWS_REGION}"
echo ""
echo "Update your .env files with these values."
