import time

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwk, jwt
from jose.utils import base64url_decode

from app.config import settings

security = HTTPBearer()


class CognitoAuthenticator:
    def __init__(self, pool_id: str, client_id: str, region: str):
        self.pool_id = pool_id
        self.client_id = client_id
        self.region = region
        self.keys_url = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"
        self._jwks = None

    @property
    def jwks(self):
        if self._jwks is None:
            try:
                response = requests.get(self.keys_url, timeout=5)
                response.raise_for_status()
                self._jwks = response.json()["keys"]
            except Exception as e:
                print(f"Error fetching JWKS: {e}")
                return []
        return self._jwks

    def verify_token(self, token: str):
        try:
            # Get the kid from the header
            headers = jwt.get_unverified_header(token)
            kid = headers.get("kid")
            if not kid:
                return None

            # Find the correct public key
            key_data = next((key for key in self.jwks if key["kid"] == kid), None)
            if not key_data:
                return None

            # Construct the public key
            public_key = jwk.construct(key_data)

            # Get the message and signature for verification
            message, encoded_signature = str(token).rsplit(".", 1)
            decoded_signature = base64url_decode(encoded_signature.encode("utf-8"))

            # Verify signature
            if not public_key.verify(message.encode("utf8"), decoded_signature):
                return None

            # Get claims and verify them
            claims = jwt.get_unverified_claims(token)

            # Verify expiration
            if time.time() > claims.get("exp", 0):
                return None

            # Verify audience/client_id
            # Note: access tokens have 'client_id', id tokens have 'aud'
            aud = claims.get("client_id") or claims.get("aud")
            if aud != self.client_id:
                return None

            # Verify issuer
            expected_iss = f"https://cognito-idp.{self.region}.amazonaws.com/{self.pool_id}"
            if claims.get("iss") != expected_iss:
                return None

            return claims.get("sub")
        except Exception as e:
            print(f"Token verification error: {e}")
            return None


# Initialize authenticator if config is present
authenticator = None
if settings.cognito_user_pool_id and settings.cognito_app_client_id:
    authenticator = CognitoAuthenticator(
        settings.cognito_user_pool_id, settings.cognito_app_client_id, settings.aws_region
    )


async def get_current_user(res: HTTPAuthorizationCredentials = Depends(security)):
    if not authenticator:
        # Fallback for development if Cognito is not set up
        if settings.environment == "dev" and not settings.cognito_user_pool_id:
            return "dev-user-id"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Authentication provider not configured"
        )

    token = res.credentials
    user_id = authenticator.verify_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id


async def verify_user_id(user_id: str, current_user_id: str = Depends(get_current_user)):
    """
    Dependency that checks if the user_id in the path matches the user_id in the token.
    """
    if user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access to other user's resources is forbidden"
        )
    return user_id
