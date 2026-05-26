import os

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

os.environ["AWS_DEFAULT_REGION"] = "eu-west-1"
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_SECURITY_TOKEN"] = "testing"
os.environ["AWS_SESSION_TOKEN"] = "testing"


@pytest.fixture
def aws_resources():
    from app.config import settings

    with mock_aws():
        client = boto3.client("dynamodb", region_name="eu-west-1")
        client.create_table(
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
        boto3.client("s3", region_name="eu-west-1").create_bucket(
            Bucket=settings.s3_bucket_name,
            CreateBucketConfiguration={"LocationConstraint": "eu-west-1"},
        )
        yield


@pytest.fixture
def authenticated_client():
    from app.main import app
    from app.services.auth import verify_user_id

    async def override_verify_user_id(user_id: str):
        return user_id

    app.dependency_overrides[verify_user_id] = override_verify_user_id
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


class TestUploadEndpoint:
    def test_upload_returns_presigned_url(self, aws_resources, authenticated_client):
        from app.services.dynamodb import create_user

        user = create_user()
        user_id = user["user_id"]

        response = authenticated_client.post(f"/api/users/{user_id}/profile/upload")
        assert response.status_code == 200
        data = response.json()
        assert "upload_url" in data
        assert "upload_fields" in data
        assert "s3_key" in data
        assert data["s3_key"].startswith(f"profiles/{user_id}/")
        assert data["s3_key"].endswith(".pdf")

    def test_upload_creates_pending_profile_raw(self, aws_resources, authenticated_client):
        from app.services.dynamodb import create_user, get_profile_raw

        user = create_user()
        user_id = user["user_id"]

        authenticated_client.post(f"/api/users/{user_id}/profile/upload")

        raw = get_profile_raw(user_id)
        assert raw is not None
        assert raw["status"] == "pending"
        assert raw["raw_text"] == ""

    def test_upload_nonexistent_user_returns_404(self, aws_resources, authenticated_client):
        response = authenticated_client.post("/api/users/nonexistent-id/profile/upload")
        assert response.status_code == 404


class TestUploadFileEndpoint:
    def test_upload_file_success(self, aws_resources, authenticated_client):
        from app.services.dynamodb import create_user, get_profile_raw

        user = create_user()
        user_id = user["user_id"]

        response = authenticated_client.post(
            f"/api/users/{user_id}/profile/upload-file",
            files={"file": ("cv.pdf", b"%PDF-1.4 fake content", "application/pdf")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["s3_key"].startswith(f"profiles/{user_id}/")
        assert data["s3_key"].endswith(".pdf")
        assert data["message"] == "Upload successful, processing started"

        raw = get_profile_raw(user_id)
        assert raw is not None
        assert raw["status"] == "pending"

    def test_upload_file_rejects_non_pdf(self, aws_resources, authenticated_client):
        from app.services.dynamodb import create_user

        user = create_user()
        user_id = user["user_id"]

        response = authenticated_client.post(
            f"/api/users/{user_id}/profile/upload-file",
            files={"file": ("doc.txt", b"plain text", "text/plain")},
        )
        assert response.status_code == 400
        assert "PDF" in response.json()["detail"]

    def test_upload_file_nonexistent_user_returns_404(self, aws_resources, authenticated_client):
        response = authenticated_client.post(
            "/api/users/nonexistent-id/profile/upload-file",
            files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )
        assert response.status_code == 404
