from fastapi import APIRouter, HTTPException, status

from app.models.schemas import UserResponse
from app.services import dynamodb

router = APIRouter()


@router.post("/users", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
def create_user():
    item = dynamodb.create_user()
    return UserResponse(user_id=item["user_id"], created_at=item["created_at"])


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: str):
    item = dynamodb.get_user(user_id)
    if not item:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(user_id=item["user_id"], created_at=item["created_at"])
