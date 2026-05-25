from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import ProfileResponse, ProfileStatusResponse, UpdateProfileRequest
from app.services import dynamodb
from app.services.auth import verify_user_id

router = APIRouter()


@router.get("/profile", response_model=ProfileResponse)
def get_profile(user_id: str = Depends(verify_user_id)):
    item = dynamodb.get_profile_structured(user_id)
    if not item:
        raise HTTPException(status_code=404, detail="Profile not found")
    return item


@router.patch("/profile", response_model=ProfileResponse)
def update_profile(body: UpdateProfileRequest, user_id: str = Depends(verify_user_id)):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Serialize nested models to dicts for DynamoDB
    for key, value in fields.items():
        if isinstance(value, list):
            fields[key] = [v.model_dump() if hasattr(v, "model_dump") else v for v in value]
        elif hasattr(value, "model_dump"):
            fields[key] = value.model_dump()
    try:
        result = dynamodb.update_profile_structured(user_id, fields)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.get("/profile/status", response_model=ProfileStatusResponse)
def get_profile_status(user_id: str = Depends(verify_user_id)):
    raw = dynamodb.get_profile_raw(user_id)
    structured = dynamodb.get_profile_structured(user_id)
    return ProfileStatusResponse(
        raw_status=raw["status"] if raw else None,
        structured_status=structured["status"] if structured else None,
    )
