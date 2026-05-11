import json
import logging
import uuid

import boto3
from botocore.config import Config
from fastapi import APIRouter, HTTPException, UploadFile, status

from app.config import settings
from app.models.schemas import (
    CreateJobRequest,
    JobFileUploadResponse,
    JobListItem,
    JobResponse,
    JobStatusResponse,
    JobUploadResponse,
)
from app.services import dynamodb

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024


def _get_sqs_client():
    return boto3.client("sqs", region_name=settings.aws_region)


def _get_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        config=Config(signature_version="s3v4"),
    )


def _send_to_structurer(user_id: str, job_id: str, raw_text: str):
    if not settings.job_processing_queue_url:
        logger.warning("job_processing_queue_url not configured, skipping SQS send for job_id=%s", job_id)
        return
    sqs = _get_sqs_client()
    sqs.send_message(
        QueueUrl=settings.job_processing_queue_url,
        MessageBody=json.dumps({"user_id": user_id, "job_id": job_id, "raw_text": raw_text}),
    )
    logger.info("Sent job structuring message for user_id=%s, job_id=%s", user_id, job_id)


@router.post("/jobs", status_code=status.HTTP_201_CREATED)
def create_job(user_id: str, body: CreateJobRequest):
    if body.source_type == "text" and not body.raw_text:
        raise HTTPException(status_code=400, detail="raw_text is required for text source type")
    if body.source_type == "pdf":
        raise HTTPException(status_code=400, detail="Use /jobs/upload or /jobs/upload-file for PDF uploads")

    item = dynamodb.create_job_raw(
        user_id=user_id,
        raw_text=body.raw_text,
        source_type=body.source_type,
        source_url=body.source_url,
    )

    if body.source_type == "text" and body.raw_text:
        _send_to_structurer(user_id, item["job_id"], body.raw_text)

    return {"job_id": item["job_id"], "status": item["status"]}


@router.post("/jobs/upload", response_model=JobUploadResponse)
def upload_job_pdf(user_id: str):
    user = dynamodb.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    job_id = str(uuid.uuid4())
    s3_key = f"jobs/{user_id}/{job_id}.pdf"

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

    dynamodb.create_job_raw(
        user_id=user_id,
        raw_text=None,
        source_type="pdf",
        s3_key=s3_key,
        job_id=job_id,
    )

    logger.info("Generated job upload URL for user_id=%s, job_id=%s", user_id, job_id)

    return JobUploadResponse(
        job_id=job_id,
        upload_url=presigned["url"],
        upload_fields=presigned["fields"],
        s3_key=s3_key,
    )


@router.post("/jobs/upload-file", response_model=JobFileUploadResponse)
async def upload_job_file(user_id: str, file: UploadFile):
    user = dynamodb.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit")

    job_id = str(uuid.uuid4())
    s3_key = f"jobs/{user_id}/{job_id}.pdf"

    s3 = _get_s3_client()
    s3.put_object(
        Bucket=settings.s3_bucket_name,
        Key=s3_key,
        Body=contents,
        ContentType="application/pdf",
    )

    dynamodb.create_job_raw(
        user_id=user_id,
        raw_text=None,
        source_type="pdf",
        s3_key=s3_key,
        job_id=job_id,
    )

    logger.info("Uploaded job file for user_id=%s, job_id=%s", user_id, job_id)

    return JobFileUploadResponse(
        job_id=job_id,
        s3_key=s3_key,
        message="Upload successful, processing started",
    )


@router.get("/jobs", response_model=list[JobListItem])
def list_jobs(user_id: str):
    items = dynamodb.list_jobs(user_id)
    return [
        JobListItem(
            job_id=item["job_id"],
            title=item.get("title"),
            company=item.get("company"),
            status=item["status"],
            source_type=item.get("source_type", "text"),
            created_at=item.get("created_at"),
        )
        for item in items
    ]


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(user_id: str, job_id: str):
    structured = dynamodb.get_job_structured(user_id, job_id)
    raw = dynamodb.get_job_raw(user_id, job_id)
    if not raw and not structured:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobResponse(
        job_id=job_id,
        status=structured["status"] if structured else raw.get("status", "processing"),
        raw_text=raw.get("raw_text") if raw else None,
        source_type=raw.get("source_type", "text") if raw else "text",
        title=structured.get("title") if structured else None,
        company=structured.get("company") if structured else None,
        location=structured.get("location") if structured else None,
        seniority=structured.get("seniority") if structured else None,
        required_skills=structured.get("required_skills", []) if structured else [],
        created_at=raw.get("created_at") if raw else structured.get("created_at"),
        updated_at=structured.get("updated_at") if structured else raw.get("updated_at"),
    )


@router.get("/jobs/{job_id}/status", response_model=JobStatusResponse)
def get_job_status(user_id: str, job_id: str):
    raw = dynamodb.get_job_raw(user_id, job_id)
    structured = dynamodb.get_job_structured(user_id, job_id)
    if not raw and not structured:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        raw_status=raw["status"] if raw else None,
        structured_status=structured["status"] if structured else None,
    )


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(user_id: str, job_id: str):
    raw = dynamodb.get_job_raw(user_id, job_id)
    structured = dynamodb.get_job_structured(user_id, job_id)
    if not raw and not structured:
        raise HTTPException(status_code=404, detail="Job not found")
    dynamodb.delete_job(user_id, job_id)
