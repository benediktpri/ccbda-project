from fastapi import APIRouter, HTTPException, status

from app.models.schemas import CreateJobRequest, JobListItem, JobResponse, JobStatusResponse
from app.services import dynamodb

router = APIRouter()


@router.post("/jobs", status_code=status.HTTP_201_CREATED)
def create_job(user_id: str, body: CreateJobRequest):
    if body.source_type == "text" and not body.raw_text:
        raise HTTPException(status_code=400, detail="raw_text is required for text source type")
    if body.source_type == "url" and not body.source_url:
        raise HTTPException(status_code=400, detail="source_url is required for url source type")

    item = dynamodb.create_job_raw(
        user_id=user_id,
        raw_text=body.raw_text,
        source_type=body.source_type,
        source_url=body.source_url,
    )
    return {"job_id": item["job_id"], "status": item["status"]}


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
