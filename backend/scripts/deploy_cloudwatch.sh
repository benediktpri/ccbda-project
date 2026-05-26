#!/bin/bash
set -euo pipefail

# Deploy CloudWatch Alarms and Dashboards for the CV processing pipeline
# Usage: ./scripts/deploy_cloudwatch.sh scripts/pipeline_env.sh

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <path_to_env_file>"
  exit 1
fi

source "$1"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account: ${ACCOUNT_ID}, Region: ${AWS_REGION}"

# Tunable thresholds (override in env file if needed)
BEDROCK_HOURLY_INVOCATIONS_THRESHOLD="${BEDROCK_HOURLY_INVOCATIONS_THRESHOLD:-100}"
LAMBDA_HOURLY_INVOCATIONS_THRESHOLD="${LAMBDA_HOURLY_INVOCATIONS_THRESHOLD:-50}"
BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-eu.anthropic.claude-haiku-4-5-20251001-v1:0}"
ALARM_SNS_TOPIC_NAME="${ALARM_SNS_TOPIC_NAME:-ccbda-alarms}"

echo "=== Step 1: SNS topic for alarm notifications ==="
TOPIC_ARN=$(aws sns create-topic \
  --name "${ALARM_SNS_TOPIC_NAME}" \
  --region "${AWS_REGION}" \
  --query TopicArn --output text)
echo "SNS topic: ${TOPIC_ARN}"

SUB_COUNT=$(aws sns list-subscriptions-by-topic \
  --topic-arn "${TOPIC_ARN}" \
  --region "${AWS_REGION}" \
  --query 'length(Subscriptions[?SubscriptionArn!=`PendingConfirmation`])' \
  --output text)
if [ "${SUB_COUNT}" = "0" ]; then
  echo ""
  echo "WARNING: SNS topic has no confirmed subscribers. Alarms will fire but nobody will be notified."
  echo "To subscribe your email (one-time, then confirm via AWS email):"
  echo ""
  echo "  aws sns subscribe \\"
  echo "    --topic-arn ${TOPIC_ARN} \\"
  echo "    --protocol email \\"
  echo "    --notification-endpoint your@email.com \\"
  echo "    --region ${AWS_REGION}"
  echo ""
fi

echo "=== Step 2: DLQ alarms ==="
for queue in "$DLQ_NAME" "$JOB_DLQ_NAME"; do
  aws cloudwatch put-metric-alarm \
    --alarm-name "High-DLQ-Messages-${queue}" \
    --alarm-description "Alarm when DLQ has visible messages" \
    --metric-name ApproximateNumberOfMessagesVisible \
    --namespace AWS/SQS \
    --statistic Maximum \
    --period 300 \
    --threshold 1 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --dimensions Name=QueueName,Value="${queue}" \
    --evaluation-periods 1 \
    --treat-missing-data notBreaching \
    --alarm-actions "${TOPIC_ARN}" \
    --region "${AWS_REGION}" >/dev/null
done

echo "=== Step 3: Lambda error alarms ==="
for func in "$LAMBDA_EXTRACTOR_NAME" "$LAMBDA_STRUCTURER_NAME" "$LAMBDA_JOB_STRUCTURER_NAME" "$LAMBDA_DLQ_HANDLER_NAME"; do
  aws cloudwatch put-metric-alarm \
    --alarm-name "High-Error-Rate-${func}" \
    --alarm-description "Alarm when Lambda function has errors" \
    --metric-name Errors \
    --namespace AWS/Lambda \
    --statistic Sum \
    --period 300 \
    --threshold 1 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --dimensions Name=FunctionName,Value="${func}" \
    --evaluation-periods 1 \
    --treat-missing-data notBreaching \
    --alarm-actions "${TOPIC_ARN}" \
    --region "${AWS_REGION}" >/dev/null
done

echo "=== Step 4: High-volume invocation alarms (abuse detection) ==="
# Catches credit-burn scenarios where an attacker hammers the upload pipeline.
# Threshold is hourly; tune via LAMBDA_HOURLY_INVOCATIONS_THRESHOLD in env file.
for func in "$LAMBDA_STRUCTURER_NAME" "$LAMBDA_JOB_STRUCTURER_NAME"; do
  aws cloudwatch put-metric-alarm \
    --alarm-name "High-Invocation-Volume-${func}" \
    --alarm-description "Alarm when Lambda invocation volume exceeds normal usage (potential abuse)" \
    --metric-name Invocations \
    --namespace AWS/Lambda \
    --statistic Sum \
    --period 3600 \
    --threshold "${LAMBDA_HOURLY_INVOCATIONS_THRESHOLD}" \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=FunctionName,Value="${func}" \
    --evaluation-periods 1 \
    --treat-missing-data notBreaching \
    --alarm-actions "${TOPIC_ARN}" \
    --region "${AWS_REGION}" >/dev/null
done

echo "=== Step 5: Bedrock invocation alarm (credit-burn detection) ==="
aws cloudwatch put-metric-alarm \
  --alarm-name "High-Bedrock-Invocations" \
  --alarm-description "Alarm when Bedrock invocation count exceeds normal usage (potential credit burn)" \
  --metric-name Invocations \
  --namespace AWS/Bedrock \
  --statistic Sum \
  --period 3600 \
  --threshold "${BEDROCK_HOURLY_INVOCATIONS_THRESHOLD}" \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=ModelId,Value="${BEDROCK_MODEL_ID}" \
  --evaluation-periods 1 \
  --treat-missing-data notBreaching \
  --alarm-actions "${TOPIC_ARN}" \
  --region "${AWS_REGION}" >/dev/null

echo "=== Step 6: Elastic Beanstalk log streaming + enhanced health ==="
# Enhanced health is required for the AWS/ElasticBeanstalk ApplicationRequests5xx metric below.
# Skip silently if the EB env isn't running (e.g. after teardown) — the alarm will sit in
# INSUFFICIENT_DATA until the env comes back, and the next deploy/run will configure it.
EB_STATUS=$(aws elasticbeanstalk describe-environments \
  --environment-names "${EB_ENV_NAME}" \
  --region "${AWS_REGION}" \
  --query 'Environments[?Status!=`Terminated`].Status' \
  --output text 2>/dev/null || echo "")

if [ -z "${EB_STATUS}" ]; then
  echo "EB environment '${EB_ENV_NAME}' not running — skipping log streaming + health config."
else
  aws elasticbeanstalk update-environment \
    --application-name "ccbda-backend" \
    --environment-name "${EB_ENV_NAME}" \
    --option-settings \
      Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=StreamLogs,Value=true \
      Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=RetentionInDays,Value=7 \
      Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=DeleteOnTerminate,Value=false \
      Namespace=aws:elasticbeanstalk:healthreporting:system,OptionName=SystemType,Value=enhanced \
    --region "${AWS_REGION}" >/dev/null
fi

echo "=== Step 7: FastAPI 5xx alarm ==="
aws cloudwatch put-metric-alarm \
  --alarm-name "High-5xx-Rate-FastAPI" \
  --alarm-description "Alarm when FastAPI returns 5xx errors" \
  --metric-name ApplicationRequests5xx \
  --namespace AWS/ElasticBeanstalk \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=EnvironmentName,Value="${EB_ENV_NAME}" \
  --evaluation-periods 1 \
  --treat-missing-data notBreaching \
  --alarm-actions "${TOPIC_ARN}" \
  --region "${AWS_REGION}" >/dev/null

echo "=== Step 8: CloudWatch dashboard ==="

cat > /tmp/dashboard.json <<EOF
{
  "widgets": [
    {
      "type": "metric",
      "x": 0,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/Lambda", "Invocations", "FunctionName", "${LAMBDA_EXTRACTOR_NAME}" ],
          [ ".", ".", ".", "${LAMBDA_STRUCTURER_NAME}" ],
          [ ".", ".", ".", "${LAMBDA_JOB_STRUCTURER_NAME}" ],
          [ ".", ".", ".", "${LAMBDA_DLQ_HANDLER_NAME}" ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "${AWS_REGION}",
        "title": "Lambda Invocations",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 12,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/Lambda", "Errors", "FunctionName", "${LAMBDA_EXTRACTOR_NAME}" ],
          [ ".", ".", ".", "${LAMBDA_STRUCTURER_NAME}" ],
          [ ".", ".", ".", "${LAMBDA_JOB_STRUCTURER_NAME}" ],
          [ ".", ".", ".", "${LAMBDA_DLQ_HANDLER_NAME}" ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "${AWS_REGION}",
        "title": "Lambda Errors",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 0,
      "y": 6,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "${QUEUE_NAME}" ],
          [ ".", ".", ".", "${JOB_QUEUE_NAME}" ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "${AWS_REGION}",
        "title": "Main Queues Depth",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 12,
      "y": 6,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "${DLQ_NAME}" ],
          [ ".", ".", ".", "${JOB_DLQ_NAME}" ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "${AWS_REGION}",
        "title": "DLQ Queues Depth",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 0,
      "y": 12,
      "width": 24,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/Bedrock", "Invocations", "ModelId", "${BEDROCK_MODEL_ID}" ],
          [ ".", "InputTokenCount", ".", "." ],
          [ ".", "OutputTokenCount", ".", "." ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "${AWS_REGION}",
        "title": "Bedrock Usage",
        "period": 300
      }
    },
    {
      "type": "log",
      "x": 0,
      "y": 18,
      "width": 24,
      "height": 8,
      "properties": {
        "query": "SOURCE '/aws/lambda/${LAMBDA_EXTRACTOR_NAME}' | SOURCE '/aws/lambda/${LAMBDA_STRUCTURER_NAME}' | SOURCE '/aws/lambda/${LAMBDA_JOB_STRUCTURER_NAME}' | SOURCE '/aws/lambda/${LAMBDA_DLQ_HANDLER_NAME}' | filter @message not like /^(START|END|REPORT|INIT_START)/\n| fields @timestamp, @log, level, logger, message, exception\n| sort @timestamp desc\n| limit 100",
        "region": "${AWS_REGION}",
        "title": "Lambda Logs (App Only)",
        "view": "table"
      }
    },
    {
      "type": "log",
      "x": 0,
      "y": 26,
      "width": 24,
      "height": 8,
      "properties": {
        "query": "SOURCE '/aws/elasticbeanstalk/${EB_ENV_NAME}/var/log/eb-docker/containers/eb-current-app/stdouterr.log' | filter @message not like \"INFO:\" and @message not like \"/health\"\n| fields @timestamp, @log, level, logger, message, exception\n| sort @timestamp desc\n| limit 100",
        "region": "${AWS_REGION}",
        "title": "FastAPI Logs (App Only)",
        "view": "table"
      }
    }
  ]
}
EOF

aws cloudwatch put-dashboard \
    --dashboard-name "CCBDA-Project-Dashboard" \
    --dashboard-body file:///tmp/dashboard.json \
    --region "${AWS_REGION}" >/dev/null

echo ""
echo "=== Done ==="
echo "SNS topic:    ${TOPIC_ARN}"
echo "Dashboard:    https://${AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards/dashboard/CCBDA-Project-Dashboard"
echo ""
echo "Alarms now notify the SNS topic above. Subscribe your email to receive notifications:"
echo "  aws sns subscribe --topic-arn ${TOPIC_ARN} --protocol email --notification-endpoint you@example.com --region ${AWS_REGION}"
