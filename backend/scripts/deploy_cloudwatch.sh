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

echo "Creating CloudWatch Alarms..."

# DLQ Alarms
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
    --region "${AWS_REGION}" >/dev/null
done

# Lambda Error Alarms
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
    --region "${AWS_REGION}" >/dev/null
done

# Enable CloudWatch log streaming for Elastic Beanstalk (FastAPI backend)
echo "Enabling CloudWatch log streaming for Elastic Beanstalk..."
aws elasticbeanstalk update-environment \
  --application-name "ccbda-backend" \
  --environment-name "${EB_ENV_NAME}" \
  --option-settings \
    Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=StreamLogs,Value=true \
    Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=RetentionInDays,Value=7 \
    Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=DeleteOnTerminate,Value=false \
  --region "${AWS_REGION}" >/dev/null

# FastAPI (Elastic Beanstalk) HTTP 5xx Error Alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "High-5xx-Rate-FastAPI" \
  --alarm-description "Alarm when FastAPI returns 5xx errors" \
  --metric-name ApplicationRequests5xx \
  --namespace AWSEBV2/LoadBalancer \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=EnvironmentName,Value="${EB_ENV_NAME}" \
  --evaluation-periods 1 \
  --treat-missing-data notBreaching \
  --region "${AWS_REGION}" >/dev/null

echo "Creating CloudWatch Dashboard..."

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
      "type": "log",
      "x": 0,
      "y": 12,
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
      "y": 20,
      "width": 24,
      "height": 8,
      "properties": {
        "query": "SOURCE '/aws/elasticbeanstalk/${EB_ENV_NAME}/var/log/web.stdout.log' | filter @message not like /^INFO:uvicorn/ and @message not like /GET \/health/\n| fields @timestamp, @log, level, logger, message, exception\n| sort @timestamp desc\n| limit 100",
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

echo "CloudWatch Alarms and Dashboard created successfully."
echo "Dashboard URL: https://${AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards/dashboard/CCBDA-Project-Dashboard"
