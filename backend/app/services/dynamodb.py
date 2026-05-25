import uuid
from datetime import UTC, datetime

import boto3
from botocore.exceptions import ClientError

from app.config import settings


def _get_table():
    kwargs = {"region_name": settings.aws_region}
    if settings.dynamodb_endpoint_url:
        kwargs["endpoint_url"] = settings.dynamodb_endpoint_url
    dynamodb = boto3.resource("dynamodb", **kwargs)
    return dynamodb.Table(settings.dynamodb_table_name)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _new_id() -> str:
    return str(uuid.uuid4())


# --- User ---


def create_user(user_id: str | None = None) -> dict:
    table = _get_table()
    if user_id is None:
        user_id = _new_id()
    now = _now()
    item = {
        "PK": f"USER#{user_id}",
        "SK": "METADATA",
        "user_id": user_id,
        "created_at": now,
    }
    try:
        table.put_item(Item=item, ConditionExpression="attribute_not_exists(PK)")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            if user_id is None:
                return create_user()
            # User already exists, return existing metadata
            return get_user(user_id) or item
        raise
    return item


def get_user(user_id: str) -> dict | None:
    table = _get_table()
    resp = table.get_item(Key={"PK": f"USER#{user_id}", "SK": "METADATA"})
    return resp.get("Item")


# --- Profile ---


def _verify_user_exists(user_id: str) -> None:
    if not get_user(user_id):
        raise ValueError(f"User {user_id} not found")


def get_profile_raw(user_id: str) -> dict | None:
    table = _get_table()
    resp = table.get_item(Key={"PK": f"USER#{user_id}", "SK": "PROFILE#RAW"})
    return resp.get("Item")


def put_profile_raw(user_id: str, raw_text: str, s3_key: str, status: str = "ready") -> dict:
    _verify_user_exists(user_id)
    table = _get_table()
    now = _now()
    item = {
        "PK": f"USER#{user_id}",
        "SK": "PROFILE#RAW",
        "raw_text": raw_text,
        "s3_key": s3_key,
        "status": status,
        "created_at": now,
        "updated_at": now,
    }
    table.put_item(Item=item)
    return item


def get_profile_structured(user_id: str) -> dict | None:
    table = _get_table()
    resp = table.get_item(Key={"PK": f"USER#{user_id}", "SK": "PROFILE#STRUCTURED"})
    return resp.get("Item")


def put_profile_structured(user_id: str, fields: dict, status: str = "ready") -> dict:
    _verify_user_exists(user_id)
    table = _get_table()
    now = _now()
    item = {
        "PK": f"USER#{user_id}",
        "SK": "PROFILE#STRUCTURED",
        "status": status,
        "created_at": now,
        "updated_at": now,
        **fields,
    }
    table.put_item(Item=item)
    return item


def update_profile_structured(user_id: str, fields: dict) -> dict | None:
    _verify_user_exists(user_id)
    table = _get_table()

    existing = get_profile_structured(user_id)
    if not existing:
        now = _now()
        item = {
            "PK": f"USER#{user_id}",
            "SK": "PROFILE#STRUCTURED",
            "status": "ready",
            "created_at": now,
            "updated_at": now,
            **fields,
        }
        table.put_item(Item=item)
        return item

    fields["updated_at"] = _now()
    update_parts = []
    values = {}
    names = {}
    for i, (key, value) in enumerate(fields.items()):
        attr_name = f"#k{i}"
        attr_value = f":v{i}"
        update_parts.append(f"{attr_name} = {attr_value}")
        names[attr_name] = key
        values[attr_value] = value

    table.update_item(
        Key={"PK": f"USER#{user_id}", "SK": "PROFILE#STRUCTURED"},
        UpdateExpression="SET " + ", ".join(update_parts),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )
    return get_profile_structured(user_id)


# --- Jobs ---


def create_job_raw(
    user_id: str,
    raw_text: str | None,
    source_type: str,
    s3_key: str | None = None,
    source_url: str | None = None,
    job_id: str | None = None,
) -> dict:
    table = _get_table()
    if not job_id:
        job_id = _new_id()
    now = _now()
    raw_status = "ready" if source_type == "text" else "pending"
    raw_item = {
        "PK": f"USER#{user_id}",
        "SK": f"JOB_RAW#{job_id}",
        "job_id": job_id,
        "source_type": source_type,
        "raw_text": raw_text,
        "s3_key": s3_key,
        "source_url": source_url,
        "status": raw_status,
        "created_at": now,
        "updated_at": now,
    }
    structured_item = {
        "PK": f"USER#{user_id}",
        "SK": f"JOB#{job_id}",
        "job_id": job_id,
        "source_type": source_type,
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    table.put_item(Item=raw_item)
    table.put_item(Item=structured_item)
    return raw_item


def update_job_raw(user_id: str, job_id: str, fields: dict) -> None:
    table = _get_table()
    fields["updated_at"] = _now()
    update_parts = []
    values = {}
    names = {}
    for i, (key, value) in enumerate(fields.items()):
        attr_name = f"#k{i}"
        attr_value = f":v{i}"
        update_parts.append(f"{attr_name} = {attr_value}")
        names[attr_name] = key
        values[attr_value] = value

    table.update_item(
        Key={"PK": f"USER#{user_id}", "SK": f"JOB_RAW#{job_id}"},
        UpdateExpression="SET " + ", ".join(update_parts),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def get_job_raw(user_id: str, job_id: str) -> dict | None:
    table = _get_table()
    resp = table.get_item(Key={"PK": f"USER#{user_id}", "SK": f"JOB_RAW#{job_id}"})
    return resp.get("Item")


def put_job_structured(user_id: str, job_id: str, fields: dict) -> dict:
    table = _get_table()
    now = _now()
    item = {
        "PK": f"USER#{user_id}",
        "SK": f"JOB#{job_id}",
        "job_id": job_id,
        "status": "ready",
        "created_at": now,
        "updated_at": now,
        **fields,
    }
    table.put_item(Item=item)
    return item


def get_job_structured(user_id: str, job_id: str) -> dict | None:
    table = _get_table()
    resp = table.get_item(Key={"PK": f"USER#{user_id}", "SK": f"JOB#{job_id}"})
    return resp.get("Item")


def list_jobs(user_id: str) -> list[dict]:
    table = _get_table()
    resp = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
        ExpressionAttributeValues={
            ":pk": f"USER#{user_id}",
            ":sk_prefix": "JOB#",
        },
    )
    # begins_with "JOB#" matches both JOB# and JOB_RAW# — filter in application
    return [item for item in resp.get("Items", []) if not item["SK"].startswith("JOB_RAW#")]


def delete_job(user_id: str, job_id: str) -> None:
    table = _get_table()
    table.delete_item(Key={"PK": f"USER#{user_id}", "SK": f"JOB_RAW#{job_id}"})
    table.delete_item(Key={"PK": f"USER#{user_id}", "SK": f"JOB#{job_id}"})


# --- Results ---


def put_result(user_id: str, job_id: str, fields: dict) -> dict:
    table = _get_table()
    now = _now()
    item = {
        "PK": f"USER#{user_id}",
        "SK": f"ANALYSIS#{job_id}",
        "job_id": job_id,
        "created_at": now,
        **fields,
    }
    table.put_item(Item=item)
    return item


def get_result(user_id: str, job_id: str) -> dict | None:
    table = _get_table()
    resp = table.get_item(Key={"PK": f"USER#{user_id}", "SK": f"ANALYSIS#{job_id}"})
    return resp.get("Item")


def list_results(user_id: str) -> list[dict]:
    table = _get_table()
    resp = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
        ExpressionAttributeValues={
            ":pk": f"USER#{user_id}",
            ":sk_prefix": "ANALYSIS#",
        },
    )
    return resp.get("Items", [])
