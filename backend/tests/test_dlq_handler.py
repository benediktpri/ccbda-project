import json
import os

import boto3
import pytest
from moto import mock_aws

os.environ["AWS_DEFAULT_REGION"] = "eu-west-1"
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_SECURITY_TOKEN"] = "testing"
os.environ["AWS_SESSION_TOKEN"] = "testing"
os.environ["DYNAMODB_TABLE_NAME"] = "AppTable"


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


def _dlq_event(user_id, message_id="msg-001"):
    return {
        "Records": [
            {
                "messageId": message_id,
                "body": json.dumps({"user_id": user_id, "raw_text": "...", "s3_key": f"profiles/{user_id}/cv.pdf"}),
                "attributes": {"ApproximateReceiveCount": "4"},
            }
        ]
    }


class TestDlqHandler:
    def test_marks_profile_as_failed(self, aws_resources):
        from app.lambdas.dlq_handler import lambda_handler

        result = lambda_handler(_dlq_event("user123"), None)
        assert result["statusCode"] == 200

        table = boto3.resource("dynamodb", region_name="eu-west-1").Table("AppTable")
        item = table.get_item(Key={"PK": "USER#user123", "SK": "PROFILE#STRUCTURED"})["Item"]
        assert item["status"] == "failed"
        assert "failure_reason" in item
        assert "msg-001" in item["failure_reason"]
        assert "failed_at" in item

    def test_malformed_json_does_not_raise(self, aws_resources):
        from app.lambdas.dlq_handler import lambda_handler

        event = {"Records": [{"messageId": "msg-bad", "body": "not valid json", "attributes": {}}]}
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200

    def test_missing_user_id_skipped(self, aws_resources):
        from app.lambdas.dlq_handler import lambda_handler

        event = {"Records": [{"messageId": "msg-002", "body": json.dumps({"raw_text": "..."}), "attributes": {}}]}
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200

        table = boto3.resource("dynamodb", region_name="eu-west-1").Table("AppTable")
        item = table.get_item(Key={"PK": "USER#user123", "SK": "PROFILE#STRUCTURED"})["Item"]
        assert item["status"] == "processing"
