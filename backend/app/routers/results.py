import logging

from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import AnalysisResultResponse
from app.services import dynamodb
from app.services.auth import verify_user_id
from app.services.bedrock import analyze_skills_gap

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/jobs/{job_id}/analyze", response_model=AnalysisResultResponse)
def analyze_job(job_id: str, user_id: str = Depends(verify_user_id)):
    profile_structured = dynamodb.get_profile_structured(user_id)
    if not profile_structured or profile_structured.get("status") != "ready":
        raise HTTPException(status_code=404, detail="Profile not found or not yet processed")

    job = dynamodb.get_job_structured(user_id, job_id)
    if not job or job.get("status") != "ready":
        raise HTTPException(status_code=404, detail="Job not found or not yet processed")

    job_raw = dynamodb.get_job_raw(user_id, job_id)
    job_raw_text = job_raw.get("raw_text", "") if job_raw else ""

    logger.info("Starting skills-gap analysis for user_id=%s, job_id=%s", user_id, job_id)
    result = analyze_skills_gap(
        profile_structured=profile_structured,
        job_raw_text=job_raw_text,
        job_structured=job,
    )

    stored = dynamodb.put_result(user_id, job_id, result)
    logger.info("Stored analysis result for user_id=%s, job_id=%s", user_id, job_id)

    return AnalysisResultResponse(
        job_id=stored["job_id"],
        match_score=stored["match_score"],
        matched_skills=stored.get("matched_skills", []),
        missing_skills=stored.get("missing_skills", []),
        recommendations=stored.get("recommendations"),
        created_at=stored.get("created_at"),
    )


@router.get("/results", response_model=list[AnalysisResultResponse])
def list_results(user_id: str = Depends(verify_user_id)):
    items = dynamodb.list_results(user_id)
    return [
        AnalysisResultResponse(
            job_id=item["job_id"],
            match_score=item["match_score"],
            matched_skills=item.get("matched_skills", []),
            missing_skills=item.get("missing_skills", []),
            recommendations=item.get("recommendations"),
            created_at=item.get("created_at"),
        )
        for item in items
    ]


@router.get("/results/{job_id}", response_model=AnalysisResultResponse)
def get_result(job_id: str, user_id: str = Depends(verify_user_id)):
    item = dynamodb.get_result(user_id, job_id)
    if not item:
        raise HTTPException(status_code=404, detail="Analysis result not found")
    return AnalysisResultResponse(
        job_id=item["job_id"],
        match_score=item["match_score"],
        matched_skills=item.get("matched_skills", []),
        missing_skills=item.get("missing_skills", []),
        recommendations=item.get("recommendations"),
        created_at=item.get("created_at"),
    )
