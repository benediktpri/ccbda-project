import json
import logging
import os
from datetime import UTC, datetime

import boto3


class _JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        })


logger = logging.getLogger()
logger.setLevel(logging.INFO)
if logger.handlers:
    logger.handlers[0].setFormatter(_JsonFormatter())

textract = boto3.client("textract")
s3 = boto3.client("s3")
sqs = boto3.client("sqs")
dynamodb = boto3.resource("dynamodb")

TABLE_NAME = os.environ["DYNAMODB_TABLE_NAME"]
PROFILE_QUEUE_URL = os.environ["SQS_QUEUE_URL"]
JOB_QUEUE_URL = os.environ.get("JOB_SQS_QUEUE_URL")


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _parse_s3_key(s3_key: str) -> dict:
    """Parse S3 key to determine pipeline type and extract IDs.

    Formats:
      profiles/{user_id}/{uuid}.pdf
      jobs/{user_id}/{job_id}.pdf
    """
    parts = s3_key.split("/")
    prefix = parts[0]
    user_id = parts[1]

    if prefix == "jobs":
        job_id = parts[2].replace(".pdf", "")
        return {"type": "job", "user_id": user_id, "job_id": job_id}
    return {"type": "profile", "user_id": user_id}


def _process_profile(table, user_id, key, extracted_text):
    now = _now()
    table.update_item(
        Key={"PK": f"USER#{user_id}", "SK": "PROFILE#RAW"},
        UpdateExpression="SET raw_text = :text, #s = :status, updated_at = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":text": extracted_text, ":status": "ready", ":now": now},
    )
    table.put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": "PROFILE#STRUCTURED",
            "status": "processing",
            "created_at": now,
            "updated_at": now,
        }
    )
    sqs.send_message(
        QueueUrl=PROFILE_QUEUE_URL,
        MessageBody=json.dumps({"user_id": user_id, "s3_key": key, "raw_text": extracted_text}),
    )
    logger.info("Sent profile message to SQS for user_id=%s", user_id)


def _process_job(table, user_id, job_id, key, extracted_text):
    if not JOB_QUEUE_URL:
        logger.error("JOB_SQS_QUEUE_URL not configured, skipping job processing for key=%s", key)
        return

    now = _now()
    table.update_item(
        Key={"PK": f"USER#{user_id}", "SK": f"JOB_RAW#{job_id}"},
        UpdateExpression="SET raw_text = :text, #s = :status, updated_at = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":text": extracted_text, ":status": "ready", ":now": now},
    )
    table.update_item(
        Key={"PK": f"USER#{user_id}", "SK": f"JOB#{job_id}"},
        UpdateExpression="SET #s = :status, updated_at = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":status": "processing", ":now": now},
    )
    sqs.send_message(
        QueueUrl=JOB_QUEUE_URL,
        MessageBody=json.dumps({"user_id": user_id, "job_id": job_id, "raw_text": extracted_text}),
    )
    logger.info("Sent job message to SQS for user_id=%s, job_id=%s", user_id, job_id)


def lambda_handler(event, context):
    table = dynamodb.Table(TABLE_NAME)

    for record in event["Records"]:
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]
        logger.info("Processing S3 object: bucket=%s, key=%s", bucket, key)

        parsed = _parse_s3_key(key)
        user_id = parsed["user_id"]

        raw_sk = "PROFILE#RAW" if parsed["type"] == "profile" else f"JOB_RAW#{parsed['job_id']}"
        table.update_item(
            Key={"PK": f"USER#{user_id}", "SK": raw_sk},
            UpdateExpression="SET #s = :status, updated_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "processing", ":now": _now()},
        )

        s3_obj = s3.get_object(Bucket=bucket, Key=key)
        doc_bytes = s3_obj["Body"].read()

        response = textract.detect_document_text(Document={"Bytes": doc_bytes})
        lines = [block["Text"] for block in response.get("Blocks", []) if block["BlockType"] == "LINE"]
        extracted_text = "\n".join(lines)
        logger.info("Extracted %d lines from %s", len(lines), key)

        if parsed["type"] == "profile":
            _process_profile(table, user_id, key, extracted_text)
        else:
            _process_job(table, user_id, parsed["job_id"], key, extracted_text)

    return {"statusCode": 200}
