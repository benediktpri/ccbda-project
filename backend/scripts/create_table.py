"""Create the AppTable in DynamoDB.

Works against DynamoDB Local (with DYNAMODB_ENDPOINT_URL set) or real AWS.

Usage:
    uv run python scripts/create_table.py
"""

import boto3

from app.config import settings


def create_table():
    kwargs = {"region_name": settings.aws_region}
    if settings.dynamodb_endpoint_url:
        kwargs["endpoint_url"] = settings.dynamodb_endpoint_url

    client = boto3.client("dynamodb", **kwargs)

    existing = client.list_tables()["TableNames"]
    if settings.dynamodb_table_name in existing:
        print(f"Table '{settings.dynamodb_table_name}' already exists.")
        return

    client.create_table(
        TableName=settings.dynamodb_table_name,
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
    print(f"Table '{settings.dynamodb_table_name}' created successfully.")


if __name__ == "__main__":
    create_table()
