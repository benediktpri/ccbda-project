import json
import logging
import os
from datetime import UTC, datetime

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["DYNAMODB_TABLE_NAME"]


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def lambda_handler(event, context):
    table = dynamodb.Table(TABLE_NAME)

    for record in event["Records"]:
        try:
            body = json.loads(record["body"])
            user_id = body["user_id"]
        except (json.JSONDecodeError, KeyError):
            logger.error(
                "Cannot parse DLQ message, skipping. messageId=%s, body=%s",
                record.get("messageId", "unknown"),
                record.get("body", "")[:200],
            )
            continue

        message_id = record.get("messageId", "unknown")
        receive_count = record.get("attributes", {}).get("ApproximateReceiveCount", "unknown")

        logger.error(
            "Message exhausted retries. user_id=%s, messageId=%s, receiveCount=%s",
            user_id,
            message_id,
            receive_count,
        )

        now = _now()
        table.update_item(
            Key={"PK": f"USER#{user_id}", "SK": "PROFILE#STRUCTURED"},
            UpdateExpression="SET #s = :status, updated_at = :now, failure_reason = :reason, failed_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":status": "failed",
                ":now": now,
                ":reason": f"Processing failed after all retries (messageId={message_id})",
            },
        )
        logger.info("Marked PROFILE#STRUCTURED as failed for user_id=%s", user_id)

    return {"statusCode": 200}
