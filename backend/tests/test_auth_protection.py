from fastapi.testclient import TestClient


def test_protected_user_route_requires_bearer_token():
    from app.main import app

    client = TestClient(app)
    response = client.get("/api/users/some-user/jobs")

    assert response.status_code in {401, 403}


def test_user_id_mismatch_returns_403():
    from app.main import app
    from app.services.auth import get_current_user

    async def override_current_user():
        return "authenticated-user"

    app.dependency_overrides[get_current_user] = override_current_user
    try:
        client = TestClient(app)
        response = client.get("/api/users/other-user/jobs")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Access to other user's resources is forbidden"
