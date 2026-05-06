from fastapi import APIRouter, HTTPException, status

from app.models.schemas import AnalysisResultResponse
from app.services import dynamodb

router = APIRouter()


@router.post("/jobs/{job_id}/analyze", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def analyze_job(user_id: str, job_id: str):
    raw = dynamodb.get_job_raw(user_id, job_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"detail": "Analysis not yet implemented — Bedrock integration pending"}


@router.get("/results", response_model=list[AnalysisResultResponse])
def list_results(user_id: str):
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
def get_result(user_id: str, job_id: str):
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
