import logging
import uuid

import boto3
from botocore.config import Config
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import settings
from app.models.schemas import FileUploadResponse, UploadResponse
from app.services import dynamodb

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024


def _get_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        config=Config(signature_version="s3v4"),
    )


@router.post("/profile/upload", response_model=UploadResponse)
def upload_cv(user_id: str):
    user = dynamodb.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    file_id = str(uuid.uuid4())
    s3_key = f"profiles/{user_id}/{file_id}.pdf"

    s3 = _get_s3_client()
    presigned = s3.generate_presigned_post(
        Bucket=settings.s3_bucket_name,
        Key=s3_key,
        Fields={"Content-Type": "application/pdf"},
        Conditions=[
            {"Content-Type": "application/pdf"},
            ["content-length-range", 1, MAX_FILE_SIZE],
        ],
        ExpiresIn=3600,
    )

    dynamodb.put_profile_raw(
        user_id=user_id,
        raw_text="",
        s3_key=s3_key,
        status="pending",
    )

    logger.info("Generated upload URL for user_id=%s, s3_key=%s", user_id, s3_key)

    return UploadResponse(
        upload_url=presigned["url"],
        upload_fields=presigned["fields"],
        s3_key=s3_key,
    )


@router.post("/profile/upload-file", response_model=FileUploadResponse)
async def upload_cv_file(user_id: str, file: UploadFile):
    user = dynamodb.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit")

    file_id = str(uuid.uuid4())
    s3_key = f"profiles/{user_id}/{file_id}.pdf"

    s3 = _get_s3_client()
    s3.put_object(
        Bucket=settings.s3_bucket_name,
        Key=s3_key,
        Body=contents,
        ContentType="application/pdf",
    )

    dynamodb.put_profile_raw(
        user_id=user_id,
        raw_text="",
        s3_key=s3_key,
        status="pending",
    )

    logger.info("Uploaded file for user_id=%s, s3_key=%s", user_id, s3_key)

    return FileUploadResponse(
        s3_key=s3_key,
        message="Upload successful, processing started",
    )
