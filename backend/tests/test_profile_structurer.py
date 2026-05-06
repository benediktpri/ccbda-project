import json
import os
from io import BytesIO
from unittest.mock import patch

import boto3
import pytest
from moto import mock_aws

os.environ["AWS_DEFAULT_REGION"] = "eu-west-1"
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_SECURITY_TOKEN"] = "testing"
os.environ["AWS_SESSION_TOKEN"] = "testing"
os.environ["DYNAMODB_TABLE_NAME"] = "AppTable"
os.environ["BEDROCK_MODEL_ID"] = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"


@pytest.fixture
def aws_resources():
    with mock_aws():
        dynamo = boto3.client("dynamodb", region_name="eu-west-1")
        dynamo.create_table(
            TableName="AppTable",
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table = boto3.resource("dynamodb", region_name="eu-west-1").Table("AppTable")
        table.put_item(Item={"PK": "USER#user123", "SK": "METADATA", "user_id": "user123"})
        table.put_item(
            Item={
                "PK": "USER#user123",
                "SK": "PROFILE#STRUCTURED",
                "status": "processing",
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T00:00:00Z",
            }
        )
        yield


def _sqs_event(user_id, raw_text):
    return {
        "Records": [
            {"body": json.dumps({"user_id": user_id, "s3_key": f"profiles/{user_id}/abc.pdf", "raw_text": raw_text})}
        ]
    }


VALID_BEDROCK_RESPONSE = {
    "content": [
        {
            "type": "text",
            "text": json.dumps(
                {
                    "first_name": "John",
                    "last_name": "Doe",
                    "email": "john@example.com",
                    "location": "Stockholm",
                    "languages": [{"language": "English", "level": "native"}],
                    "skills": [{"name": "Python", "level": "advanced", "years": 5, "last_used": "2025-01"}],
                    "experience": [
                        {
                            "title": "Software Engineer",
                            "company": "TechCorp",
                            "start": "2020-01",
                            "end": None,
                            "description": "Built APIs",
                            "achievements": ["Improved latency by 40%"],
                        }
                    ],
                    "education": [
                        {"degree": "MSc", "field": "Computer Science", "institution": "KTH", "graduation_year": "2020"}
                    ],
                }
            ),
        }
    ]
}


class TestProfileStructurer:
    @patch("app.lambdas.profile_structurer.bedrock")
    def test_successful_structuring(self, mock_bedrock, aws_resources):
        mock_bedrock.invoke_model.return_value = {"body": BytesIO(json.dumps(VALID_BEDROCK_RESPONSE).encode())}

        from app.lambdas.profile_structurer import lambda_handler

        result = lambda_handler(_sqs_event("user123", "John Doe\nSoftware Engineer"), None)
        assert result["statusCode"] == 200

        table = boto3.resource("dynamodb", region_name="eu-west-1").Table("AppTable")
        structured = table.get_item(Key={"PK": "USER#user123", "SK": "PROFILE#STRUCTURED"})["Item"]
        assert structured["status"] == "ready"
        assert structured["first_name"] == "John"
        assert structured["last_name"] == "Doe"
        assert structured["skills"][0]["name"] == "Python"

    @patch("app.lambdas.profile_structurer.bedrock")
    def test_invalid_json_response_marks_failed(self, mock_bedrock, aws_resources):
        mock_bedrock.invoke_model.return_value = {
            "body": BytesIO(json.dumps({"content": [{"type": "text", "text": "not valid json {"}]}).encode())
        }

        from app.lambdas.profile_structurer import lambda_handler

        result = lambda_handler(_sqs_event("user123", "Some CV text"), None)
        assert result["statusCode"] == 200

        table = boto3.resource("dynamodb", region_name="eu-west-1").Table("AppTable")
        structured = table.get_item(Key={"PK": "USER#user123", "SK": "PROFILE#STRUCTURED"})["Item"]
        assert structured["status"] == "failed"

    @patch("app.lambdas.profile_structurer.bedrock")
    def test_bedrock_exception_marks_failed(self, mock_bedrock, aws_resources):
        mock_bedrock.invoke_model.side_effect = Exception("Bedrock throttled")

        from app.lambdas.profile_structurer import lambda_handler

        result = lambda_handler(_sqs_event("user123", "Some CV text"), None)
        assert result["statusCode"] == 200

        table = boto3.resource("dynamodb", region_name="eu-west-1").Table("AppTable")
        structured = table.get_item(Key={"PK": "USER#user123", "SK": "PROFILE#STRUCTURED"})["Item"]
        assert structured["status"] == "failed"
