import json
import os
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
os.environ["SQS_QUEUE_URL"] = "https://sqs.eu-west-1.amazonaws.com/123456789012/test-queue"


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
        sqs = boto3.client("sqs", region_name="eu-west-1")
        queue = sqs.create_queue(QueueName="test-queue")
        os.environ["SQS_QUEUE_URL"] = queue["QueueUrl"]

        s3 = boto3.client("s3", region_name="eu-west-1")
        s3.create_bucket(
            Bucket="bucket",
            CreateBucketConfiguration={"LocationConstraint": "eu-west-1"},
        )
        s3.put_object(Bucket="bucket", Key="profiles/user123/abc.pdf", Body=b"%PDF-1.4 test")

        table = boto3.resource("dynamodb", region_name="eu-west-1").Table("AppTable")
        table.put_item(Item={"PK": "USER#user123", "SK": "METADATA", "user_id": "user123"})
        table.put_item(
            Item={
                "PK": "USER#user123",
                "SK": "PROFILE#RAW",
                "status": "pending",
                "s3_key": "profiles/user123/abc.pdf",
                "raw_text": "",
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T00:00:00Z",
            }
        )
        yield


def _s3_event(bucket, key):
    return {"Records": [{"s3": {"bucket": {"name": bucket}, "object": {"key": key}}}]}


class TestTextExtractor:
    @patch("app.lambdas.text_extractor.textract")
    @patch("app.lambdas.text_extractor.s3")
    def test_successful_extraction(self, mock_s3, mock_textract, aws_resources):
        mock_s3.get_object.return_value = {"Body": __import__("io").BytesIO(b"%PDF-1.4 test")}
        mock_textract.detect_document_text.return_value = {
            "Blocks": [
                {"BlockType": "PAGE", "Text": ""},
                {"BlockType": "LINE", "Text": "John Doe"},
                {"BlockType": "LINE", "Text": "Software Engineer"},
                {"BlockType": "LINE", "Text": "Python, AWS, FastAPI"},
            ]
        }

        from app.lambdas.text_extractor import lambda_handler

        result = lambda_handler(_s3_event("bucket", "profiles/user123/abc.pdf"), None)
        assert result["statusCode"] == 200

        table = boto3.resource("dynamodb", region_name="eu-west-1").Table("AppTable")
        raw = table.get_item(Key={"PK": "USER#user123", "SK": "PROFILE#RAW"})["Item"]
        assert raw["status"] == "ready"
        assert "John Doe" in raw["raw_text"]
        assert "Software Engineer" in raw["raw_text"]

        structured = table.get_item(Key={"PK": "USER#user123", "SK": "PROFILE#STRUCTURED"})["Item"]
        assert structured["status"] == "processing"

    @patch("app.lambdas.text_extractor.textract")
    @patch("app.lambdas.text_extractor.s3")
    def test_textract_failure_marks_failed(self, mock_s3, mock_textract, aws_resources):
        mock_s3.get_object.return_value = {"Body": __import__("io").BytesIO(b"%PDF-1.4 test")}
        mock_textract.detect_document_text.side_effect = Exception("Textract unavailable")

        from app.lambdas.text_extractor import lambda_handler

        result = lambda_handler(_s3_event("bucket", "profiles/user123/abc.pdf"), None)
        assert result["statusCode"] == 200

        table = boto3.resource("dynamodb", region_name="eu-west-1").Table("AppTable")
        raw = table.get_item(Key={"PK": "USER#user123", "SK": "PROFILE#RAW"})["Item"]
        assert raw["status"] == "failed"

    @patch("app.lambdas.text_extractor.textract")
    @patch("app.lambdas.text_extractor.s3")
    def test_sends_sqs_message(self, mock_s3, mock_textract, aws_resources):
        mock_s3.get_object.return_value = {"Body": __import__("io").BytesIO(b"%PDF-1.4 test")}
        mock_textract.detect_document_text.return_value = {"Blocks": [{"BlockType": "LINE", "Text": "Hello World"}]}

        from app.lambdas.text_extractor import lambda_handler

        lambda_handler(_s3_event("bucket", "profiles/user123/abc.pdf"), None)

        sqs = boto3.client("sqs", region_name="eu-west-1")
        messages = sqs.receive_message(QueueUrl=os.environ["SQS_QUEUE_URL"])
        assert "Messages" in messages
        body = json.loads(messages["Messages"][0]["Body"])
        assert body["user_id"] == "user123"
        assert body["raw_text"] == "Hello World"
        assert body["s3_key"] == "profiles/user123/abc.pdf"
