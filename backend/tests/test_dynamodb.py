import os

import boto3
import pytest
from moto import mock_aws

os.environ["AWS_DEFAULT_REGION"] = "eu-west-1"
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_SECURITY_TOKEN"] = "testing"
os.environ["AWS_SESSION_TOKEN"] = "testing"


@pytest.fixture
def dynamodb_table():
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
        yield


class TestUser:
    def test_create_user(self, dynamodb_table):
        from app.services.dynamodb import create_user

        item = create_user()
        assert "user_id" in item
        assert "created_at" in item
        assert item["PK"] == f"USER#{item['user_id']}"
        assert item["SK"] == "METADATA"

    def test_get_user(self, dynamodb_table):
        from app.services.dynamodb import create_user, get_user

        item = create_user()
        fetched = get_user(item["user_id"])
        assert fetched is not None
        assert fetched["user_id"] == item["user_id"]

    def test_get_user_not_found(self, dynamodb_table):
        from app.services.dynamodb import get_user

        assert get_user("nonexistent-id") is None

    def test_create_user_unique_ids(self, dynamodb_table):
        from app.services.dynamodb import create_user

        user1 = create_user()
        user2 = create_user()
        assert user1["user_id"] != user2["user_id"]


class TestJobs:
    def test_create_and_get_job_raw(self, dynamodb_table):
        from app.services.dynamodb import create_job_raw, create_user, get_job_raw

        user = create_user()
        uid = user["user_id"]

        job = create_job_raw(uid, raw_text="Looking for a Python developer", source_type="text")
        assert job["status"] == "ready"
        assert job["source_type"] == "text"

        fetched = get_job_raw(uid, job["job_id"])
        assert fetched is not None
        assert fetched["raw_text"] == "Looking for a Python developer"

    def test_create_job_pdf_status_pending(self, dynamodb_table):
        from app.services.dynamodb import create_job_raw, create_user

        user = create_user()
        job = create_job_raw(user["user_id"], raw_text=None, source_type="pdf", s3_key="jobs/test.pdf")
        assert job["status"] == "pending"

    def test_list_jobs_returns_structured_only(self, dynamodb_table):
        from app.services.dynamodb import create_job_raw, create_user, list_jobs, put_job_structured

        user = create_user()
        uid = user["user_id"]

        job = create_job_raw(uid, raw_text="Some job description", source_type="text")
        put_job_structured(uid, job["job_id"], {"title": "Engineer", "company": "Acme"})

        jobs = list_jobs(uid)
        assert len(jobs) == 1
        assert jobs[0]["job_id"] == job["job_id"]
        assert jobs[0]["title"] == "Engineer"

    def test_delete_job_removes_both_records(self, dynamodb_table):
        from app.services.dynamodb import (
            create_job_raw,
            create_user,
            delete_job,
            get_job_raw,
            get_job_structured,
            put_job_structured,
        )

        user = create_user()
        uid = user["user_id"]

        job = create_job_raw(uid, raw_text="Description", source_type="text")
        put_job_structured(uid, job["job_id"], {"title": "Role"})

        delete_job(uid, job["job_id"])

        assert get_job_raw(uid, job["job_id"]) is None
        assert get_job_structured(uid, job["job_id"]) is None

    def test_list_jobs_empty(self, dynamodb_table):
        from app.services.dynamodb import create_user, list_jobs

        user = create_user()
        assert list_jobs(user["user_id"]) == []


class TestProfile:
    def test_put_and_get_profile_structured(self, dynamodb_table):
        from app.services.dynamodb import create_user, get_profile_structured, put_profile_structured

        user = create_user()
        uid = user["user_id"]

        fields = {
            "first_name": "Test",
            "last_name": "User",
            "skills": [{"name": "Python", "level": "advanced"}],
        }
        put_profile_structured(uid, fields)

        fetched = get_profile_structured(uid)
        assert fetched is not None
        assert fetched["first_name"] == "Test"
        assert fetched["skills"] == [{"name": "Python", "level": "advanced"}]

    def test_update_profile_structured(self, dynamodb_table):
        from app.services.dynamodb import (
            create_user,
            get_profile_structured,
            put_profile_structured,
            update_profile_structured,
        )

        user = create_user()
        uid = user["user_id"]

        put_profile_structured(uid, {"first_name": "Before"})
        update_profile_structured(uid, {"first_name": "After", "location": "Berlin"})

        fetched = get_profile_structured(uid)
        assert fetched["first_name"] == "After"
        assert fetched["location"] == "Berlin"

    def test_put_profile_requires_user(self, dynamodb_table):
        from app.services.dynamodb import put_profile_structured

        with pytest.raises(ValueError, match="not found"):
            put_profile_structured("nonexistent", {"first_name": "X"})

    def test_update_profile_creates_if_missing(self, dynamodb_table):
        from app.services.dynamodb import create_user, get_profile_structured, update_profile_structured

        user = create_user()
        uid = user["user_id"]

        update_profile_structured(uid, {"first_name": "New"})
        fetched = get_profile_structured(uid)
        assert fetched is not None
        assert fetched["first_name"] == "New"
