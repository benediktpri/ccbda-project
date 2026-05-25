#!/bin/bash
set -euo pipefail

export AWS_PAGER=""

# Toggle SQS → Lambda event source mappings on/off.
# When disabled, Lambda stops polling SQS — zero idle activity, zero empty receives.
# Re-enable before processing CV/job uploads again.
#
# Usage:
#   ./scripts/toggle_pipeline.sh enable   scripts/pipeline_env.sh
#   ./scripts/toggle_pipeline.sh disable  scripts/pipeline_env.sh

ACTION=${1:-}
ENV_FILE=${2:-}

if [ -z "${ACTION}" ] || [ -z "${ENV_FILE}" ]; then
    echo "Usage: $0 enable|disable <env-file>" >&2
    exit 1
fi

case "${ACTION}" in
    enable)  FLAG="--enabled" ;;
    disable) FLAG="--no-enabled" ;;
    *) echo "Error: action must be 'enable' or 'disable'" >&2; exit 1 ;;
esac

source "${ENV_FILE}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

QUEUES=(
    "${QUEUE_NAME}"
    "${DLQ_NAME}"
    "${JOB_QUEUE_NAME}"
    "${JOB_DLQ_NAME}"
)

echo "${ACTION}: event source mappings (account ${ACCOUNT_ID}, region ${AWS_REGION})"

for QUEUE in "${QUEUES[@]}"; do
    QUEUE_ARN="arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${QUEUE}"

    UUID=$(aws lambda list-event-source-mappings \
        --event-source-arn "${QUEUE_ARN}" \
        --region "${AWS_REGION}" | jq -r '.EventSourceMappings[0].UUID')

    if [ "${UUID}" = "null" ] || [ -z "${UUID}" ]; then
        echo "  skip ${QUEUE}: no event source mapping found"
        continue
    fi

    echo "  ${ACTION} ${QUEUE} (${UUID})"
    aws lambda update-event-source-mapping \
        --uuid "${UUID}" ${FLAG} \
        --region "${AWS_REGION}" >/dev/null
done

echo ""
echo "Done. State changes take ~30-60s to propagate."
echo "Check with: aws lambda list-event-source-mappings --region ${AWS_REGION} --query 'EventSourceMappings[?contains(EventSourceArn, \`sqs\`)].[State,EventSourceArn]' --output table"
