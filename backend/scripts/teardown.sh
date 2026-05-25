#!/bin/bash
set -euo pipefail

export AWS_PAGER=""

# Tear down everything that costs money or generates idle activity:
#   1. Disable SQS → Lambda event source mappings (stops Lambda's poll fleet)
#   2. Terminate the Elastic Beanstalk environment (stops the always-on EC2 cost)
#
# Lambdas, S3, DynamoDB, CloudFront, SQS queues all stay — essentially free at idle.
# Re-deploying with `git tag vX.Y.Z && git push origin vX.Y.Z` (or running
# deploy_pipeline.sh again) recreates EB and re-enables polling automatically.
#
# Usage: ./scripts/teardown.sh scripts/pipeline_env.sh

ENV_FILE=${1:-}

if [ -z "${ENV_FILE}" ]; then
    echo "Usage: $0 <env-file>" >&2
    exit 1
fi

source "${ENV_FILE}"

EB_ENV_NAME=${EB_ENV_NAME:-ccbda-backend-prod}

echo "=== Step 1: Disable SQS event source mappings ==="
"$(dirname "$0")/toggle_pipeline.sh" disable "${ENV_FILE}"

echo ""
echo "=== Step 2: Terminate Elastic Beanstalk environment ==="

ENV_STATUS=$(aws elasticbeanstalk describe-environments \
    --environment-names "${EB_ENV_NAME}" \
    --region "${AWS_REGION}" \
    --query 'Environments[0].Status' --output text 2>/dev/null || echo "None")

case "${ENV_STATUS}" in
    None|Terminated)
        echo "EB environment '${EB_ENV_NAME}' is already terminated or does not exist."
        ;;
    Terminating)
        echo "EB environment '${EB_ENV_NAME}' is already terminating."
        ;;
    *)
        echo "Terminating EB environment: ${EB_ENV_NAME} (current status: ${ENV_STATUS})"
        aws elasticbeanstalk terminate-environment \
            --environment-name "${EB_ENV_NAME}" \
            --region "${AWS_REGION}" >/dev/null
        echo "Termination requested. EB takes ~5-10 min to fully shut down."
        ;;
esac

echo ""
echo "=== Done ==="
echo "Costs stopped. To bring it back: push a new tag (CI deploys) or run deploy_pipeline.sh."
