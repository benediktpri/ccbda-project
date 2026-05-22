import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path

import boto3


class _JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps(
            {
                "timestamp": self.formatTime(record),
                "level": record.levelname,
                "message": record.getMessage(),
                "logger": record.name,
            }
        )


logger = logging.getLogger()
logger.setLevel(logging.INFO)
if logger.handlers:
    logger.handlers[0].setFormatter(_JsonFormatter())

bedrock = boto3.client("bedrock-runtime")
dynamodb = boto3.resource("dynamodb")

TABLE_NAME = os.environ["DYNAMODB_TABLE_NAME"]
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "eu.anthropic.claude-haiku-4-5-20251001-v1:0")

SYSTEM_PROMPT = """\
You are a job posting parser. Extract structured information from the provided \
job posting text using the extract_job_data tool.

Rules:
- Use null for missing fields, empty arrays for missing lists
- For importance use: required, preferred, or nice-to-have
- For seniority use: junior, mid, senior, lead, principal, director, VP, or C-level
- For remote_policy use: remote, hybrid, or on-site
- Extract ALL skills mentioned, including both technical and soft skills"""

EXTRACTION_SCHEMA = json.loads((Path(__file__).parent / "job_extraction_schema.json").read_text())

TOOL_DEFINITION = {
    "name": "extract_job_data",
    "description": "Extract structured data from a job posting",
    "input_schema": EXTRACTION_SCHEMA,
}


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def lambda_handler(event, context):
    table = dynamodb.Table(TABLE_NAME)

    for record in event["Records"]:
        body = json.loads(record["body"])
        user_id = body["user_id"]
        job_id = body["job_id"]
        raw_text = body["raw_text"]

        logger.info("Processing job structuring for user_id=%s, job_id=%s", user_id, job_id)

        table.update_item(
            Key={"PK": f"USER#{user_id}", "SK": f"JOB#{job_id}"},
            UpdateExpression="SET #s = :status, updated_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "processing", ":now": _now()},
        )

        request_body = json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": f"Parse this job posting:\n\n{raw_text}"}],
                "max_tokens": 4096,
                "temperature": 0.1,
                "tools": [TOOL_DEFINITION],
                "tool_choice": {"type": "tool", "name": "extract_job_data"},
            }
        )

        response = bedrock.invoke_model(
            modelId=MODEL_ID,
            body=request_body,
            contentType="application/json",
            accept="application/json",
        )

        response_body = json.loads(response["body"].read())
        tool_use_block = next(block for block in response_body["content"] if block["type"] == "tool_use")
        structured_data = tool_use_block["input"]
        logger.info("Bedrock tool_use response received for job_id=%s", job_id)

        now = _now()
        item = {
            "PK": f"USER#{user_id}",
            "SK": f"JOB#{job_id}",
            "job_id": job_id,
            "source_type": body.get("source_type", "text"),
            "status": "ready",
            "created_at": now,
            "updated_at": now,
            **structured_data,
        }
        table.put_item(Item=item)
        logger.info("Wrote structured job for user_id=%s, job_id=%s", user_id, job_id)

    return {"statusCode": 200}
