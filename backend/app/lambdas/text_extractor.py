import json
import logging
import os
from datetime import UTC, datetime

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

textract = boto3.client("textract")
s3 = boto3.client("s3")
sqs = boto3.client("sqs")
dynamodb = boto3.resource("dynamodb")

TABLE_NAME = os.environ["DYNAMODB_TABLE_NAME"]
QUEUE_URL = os.environ["SQS_QUEUE_URL"]


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _extract_user_id_from_key(s3_key: str) -> str:
    """S3 key format: profiles/{user_id}/{uuid}.pdf"""
    parts = s3_key.split("/")
    return parts[1]


def lambda_handler(event, context):
    table = dynamodb.Table(TABLE_NAME)

    for record in event["Records"]:
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]
        logger.info("Processing S3 object: bucket=%s, key=%s", bucket, key)

        user_id = _extract_user_id_from_key(key)

        table.update_item(
            Key={"PK": f"USER#{user_id}", "SK": "PROFILE#RAW"},
            UpdateExpression="SET #s = :status, updated_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "processing", ":now": _now()},
        )

        try:
            s3_obj = s3.get_object(Bucket=bucket, Key=key)
            doc_bytes = s3_obj["Body"].read()

            response = textract.detect_document_text(Document={"Bytes": doc_bytes})
            lines = [block["Text"] for block in response.get("Blocks", []) if block["BlockType"] == "LINE"]
            extracted_text = "\n".join(lines)
            logger.info("Extracted %d lines from %s", len(lines), key)

            table.update_item(
                Key={"PK": f"USER#{user_id}", "SK": "PROFILE#RAW"},
                UpdateExpression="SET raw_text = :text, #s = :status, updated_at = :now",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":text": extracted_text,
                    ":status": "ready",
                    ":now": _now(),
                },
            )

            table.put_item(
                Item={
                    "PK": f"USER#{user_id}",
                    "SK": "PROFILE#STRUCTURED",
                    "status": "processing",
                    "created_at": _now(),
                    "updated_at": _now(),
                }
            )

            sqs.send_message(
                QueueUrl=QUEUE_URL,
                MessageBody=json.dumps(
                    {
                        "user_id": user_id,
                        "s3_key": key,
                        "raw_text": extracted_text,
                    }
                ),
            )
            logger.info("Sent message to SQS for user_id=%s", user_id)

        except Exception:
            logger.exception("Failed to process %s", key)
            table.update_item(
                Key={"PK": f"USER#{user_id}", "SK": "PROFILE#RAW"},
                UpdateExpression="SET #s = :status, updated_at = :now",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":status": "failed", ":now": _now()},
            )

    return {"statusCode": 200}
