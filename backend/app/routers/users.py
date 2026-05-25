from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import UserResponse
from app.services import dynamodb
from app.services.auth import get_current_user

router = APIRouter()


@router.get("/users/me", response_model=UserResponse)
def get_my_user(user_id: str = Depends(get_current_user)):
    """
    Get or create the user profile for the currently logged in user.
    """
    item = dynamodb.get_user(user_id)
    if not item:
        # Auto-create in DynamoDB on first login
        item = dynamodb.create_user(user_id=user_id)
    return UserResponse(user_id=item["user_id"], created_at=item["created_at"])


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: str, current_user_id: str = Depends(get_current_user)):
    """
    Get user metadata. Only allowed if it's the current user.
    """
    if user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    item = dynamodb.get_user(user_id)
    if not item:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(user_id=item["user_id"], created_at=item["created_at"])
