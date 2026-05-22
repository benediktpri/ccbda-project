import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path

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

bedrock = boto3.client("bedrock-runtime")
dynamodb = boto3.resource("dynamodb")

TABLE_NAME = os.environ["DYNAMODB_TABLE_NAME"]
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "eu.anthropic.claude-haiku-4-5-20251001-v1:0")

SYSTEM_PROMPT = """\
You are a CV/resume parsing assistant. Extract structured information from the \
provided CV text using the extract_cv_data tool.

Rules:
- Use null for missing fields, empty arrays for missing lists
- For skill level use: beginner, intermediate, advanced, expert
- For language level use: basic, conversational, fluent, or native
- Dates should be YYYY-MM format where possible
- Achievements should be concise bullet points extracted from descriptions"""

EXTRACTION_SCHEMA = json.loads((Path(__file__).parent / "extraction_schema.json").read_text())

TOOL_DEFINITION = {
    "name": "extract_cv_data",
    "description": "Extract structured profile data from a CV/resume",
    "input_schema": EXTRACTION_SCHEMA,
}


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def lambda_handler(event, context):
    table = dynamodb.Table(TABLE_NAME)

    for record in event["Records"]:
        body = json.loads(record["body"])
        user_id = body["user_id"]
        raw_text = body["raw_text"]

        logger.info("Processing profile structuring for user_id=%s", user_id)

        request_body = json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": f"Parse this CV:\n\n{raw_text}"}],
                "max_tokens": 4096,
                "temperature": 0.1,
                "tools": [TOOL_DEFINITION],
                "tool_choice": {"type": "tool", "name": "extract_cv_data"},
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
        logger.info("Bedrock tool_use response received for user_id=%s", user_id)

        now = _now()
        item = {
            "PK": f"USER#{user_id}",
            "SK": "PROFILE#STRUCTURED",
            "status": "ready",
            "created_at": now,
            "updated_at": now,
            **structured_data,
        }
        table.put_item(Item=item)
        logger.info("Wrote structured profile for user_id=%s", user_id)

    return {"statusCode": 200}
