import json
import logging
import os
from datetime import UTC, datetime

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock = boto3.client("bedrock-runtime")
dynamodb = boto3.resource("dynamodb")

TABLE_NAME = os.environ["DYNAMODB_TABLE_NAME"]
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "eu.anthropic.claude-haiku-4-5-20251001-v1:0")

SYSTEM_PROMPT = """\
You are a CV/resume parsing assistant. Extract structured information from the \
provided CV text and return ONLY valid JSON matching this exact schema:

{
  "first_name": "string or null",
  "last_name": "string or null",
  "email": "string or null",
  "location": "string or null",
  "languages": [
    {"language": "string", "level": "string or null"}
  ],
  "skills": [
    {"name": "string", "level": "string or null",
     "years": int or null, "last_used": "string or null"}
  ],
  "experience": [
    {"title": "string", "company": "string or null",
     "start": "string or null", "end": "string or null",
     "description": "string or null", "achievements": ["string"]}
  ],
  "education": [
    {"degree": "string", "field": "string or null",
     "institution": "string or null",
     "graduation_year": "string or null"}
  ]
}

Rules:
- Return ONLY the JSON object, no markdown, no explanation
- Use null for missing fields, empty arrays for missing lists
- For skill level use: beginner, intermediate, advanced, expert
- For language level use: basic, conversational, fluent, native
- Dates should be YYYY-MM format where possible
- Achievements should be concise bullet points extracted from descriptions"""


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def lambda_handler(event, context):
    table = dynamodb.Table(TABLE_NAME)

    for record in event["Records"]:
        body = json.loads(record["body"])
        user_id = body["user_id"]
        raw_text = body["raw_text"]
        logger.info("Processing profile structuring for user_id=%s", user_id)

        try:
            request_body = json.dumps(
                {
                    "anthropic_version": "bedrock-2023-05-31",
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": f"Parse this CV:\n\n{raw_text}"}],
                    "max_tokens": 4096,
                    "temperature": 0.1,
                }
            )

            response = bedrock.invoke_model(
                modelId=MODEL_ID,
                body=request_body,
                contentType="application/json",
                accept="application/json",
            )

            response_body = json.loads(response["body"].read())
            content_text = response_body["content"][0]["text"].strip()
            logger.info("Bedrock response received, length=%d", len(content_text))

            if content_text.startswith("```"):
                content_text = content_text.split("\n", 1)[1]
                content_text = content_text.rsplit("```", 1)[0].strip()

            structured_data = json.loads(content_text)

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

        except json.JSONDecodeError:
            logger.exception("Failed to parse Bedrock response as JSON for user_id=%s", user_id)
            table.update_item(
                Key={"PK": f"USER#{user_id}", "SK": "PROFILE#STRUCTURED"},
                UpdateExpression="SET #s = :status, updated_at = :now",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":status": "failed", ":now": _now()},
            )

        except Exception:
            logger.exception("Failed to structure profile for user_id=%s", user_id)
            table.update_item(
                Key={"PK": f"USER#{user_id}", "SK": "PROFILE#STRUCTURED"},
                UpdateExpression="SET #s = :status, updated_at = :now",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":status": "failed", ":now": _now()},
            )

    return {"statusCode": 200}
