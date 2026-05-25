# AWS Cognito Implementation

This document explains how AWS Cognito is implemented in the CCBDA Job Application Assistant, how it is integrated with the frontend and backend, how user identity is validated, and how Cognito connects to the existing application data model.

## Overview

AWS Cognito is used as the identity provider for the application. It handles user registration, email verification, password-based sign-in, and JWT token generation.

The application still uses its own `user_id` model for DynamoDB, S3 keys, profiles, jobs, and results. The important change is that this `user_id` is now based on the verified Cognito user identity.

In practice:

```text
Cognito user sub = application user_id
```

The Cognito `sub` is the unique and stable identifier for a user in Cognito. After login, the backend verifies the Cognito token and uses the `sub` as the trusted `user_id`.

## Main Components

| Component | File | Responsibility |
| --- | --- | --- |
| Cognito setup script | `backend/scripts/setup_cognito.sh` | Creates or reuses the Cognito User Pool and App Client |
| Backend settings | `backend/app/config.py` | Loads Cognito configuration from environment variables |
| Backend auth service | `backend/app/services/auth.py` | Verifies Cognito JWT tokens and checks user access |
| Users router | `backend/app/routers/users.py` | Provides `/users/me` and connects Cognito users to DynamoDB users |
| Protected profile routes | `backend/app/routers/profiles.py` | Protects profile read/update operations |
| Protected upload routes | `backend/app/routers/upload.py` | Protects CV upload operations |
| Protected jobs routes | `backend/app/routers/jobs.py` | Protects job CRUD and upload operations |
| Protected results routes | `backend/app/routers/results.py` | Protects analysis and result operations |
| Frontend Cognito client | `frontend/src/lib/cognito.ts` | Sends signup, confirmation, and login requests directly to Cognito |
| Frontend auth hook | `frontend/src/lib/useAuth.ts` | Stores login state, user id, and tokens |
| Frontend API client | `frontend/src/lib/api.ts` | Sends the Cognito token to the backend |
| Login page | `frontend/src/app/login/page.tsx` | Provides signup, confirmation, and sign-in UI |

## Cognito Configuration

Cognito is configured using a **User Pool** and an **App Client**.

### User Pool

The User Pool stores and manages the application users. It is responsible for:

- storing users
- securely handling passwords
- validating login credentials
- sending email confirmation codes
- tracking whether a user account is confirmed
- issuing JWT tokens after successful login

The User Pool is configured with:

- email as the username
- automatic email verification
- a password policy

The password policy requires:

- minimum length of 8 characters
- uppercase letters
- lowercase letters
- numbers
- symbols are not required

### App Client

The App Client is used by the frontend to authenticate users against the User Pool.

The App Client is created **without a client secret**:

```bash
--no-generate-secret
```

This is important because the frontend runs in the browser. Browser applications cannot safely store secrets, so the frontend only uses the public App Client ID.

The App Client allows these authentication flows:

```text
ALLOW_USER_PASSWORD_AUTH
ALLOW_REFRESH_TOKEN_AUTH
ALLOW_USER_SRP_AUTH
```

The current frontend login flow uses:

```text
USER_PASSWORD_AUTH
```

## Cognito Setup Script

The setup script is:

```text
backend/scripts/setup_cognito.sh
```

It uses the AWS CLI to create or reuse:

- a Cognito User Pool
- a Cognito App Client

The script reads configuration from an environment file and uses default names if no custom names are provided:

```text
COGNITO_USER_POOL_NAME=ccbda-user-pool
COGNITO_APP_CLIENT_NAME=ccbda-app-client
```

After running, the script prints:

```text
COGNITO_USER_POOL_ID=...
COGNITO_APP_CLIENT_ID=...
AWS_REGION=...
```

These values must be added to the backend and frontend environment files.

## Environment Variables

### Backend

The backend uses these Cognito-related environment variables:

```bash
AWS_REGION=eu-west-1
COGNITO_USER_POOL_ID=eu-west-1_xxxxxxxxx
COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
ENVIRONMENT=dev
```

They are loaded in:

```text
backend/app/config.py
```

The backend needs these values so it knows:

- which AWS region Cognito is running in
- which User Pool it should trust
- which App Client the token must belong to

### Frontend

The frontend uses:

```bash
NEXT_PUBLIC_AWS_REGION=eu-west-1
NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_USER_POOL_ID=eu-west-1_xxxxxxxxx
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The frontend mainly needs:

- `NEXT_PUBLIC_AWS_REGION`
- `NEXT_PUBLIC_COGNITO_APP_CLIENT_ID`

The App Client ID is sent to Cognito when signing up, confirming signup, and signing in.

## Complete Authentication Workflow

### 1. User Opens the Login Page

The user goes to:

```text
/login
```

The login page is implemented in:

```text
frontend/src/app/login/page.tsx
```

The page supports three modes:

- sign in
- sign up
- confirm account

### 2. User Signs Up

The user enters an email and password.

The frontend calls:

```ts
cognito.signUp(email, password)
```

This is implemented in:

```text
frontend/src/lib/cognito.ts
```

The frontend sends a request directly to Cognito using the `SignUp` operation.

The request includes:

- email
- password
- Cognito App Client ID

Cognito creates the user in the User Pool, but the user is not fully confirmed yet.

### 3. Cognito Sends an Email Confirmation Code

Because the User Pool is configured with email verification, Cognito sends a confirmation code to the user's email address.

At this point:

- the user exists in Cognito
- the user has not yet completed verification
- the user cannot fully sign in until the confirmation step is completed

### 4. User Confirms the Account

The user enters the confirmation code in the frontend.

The frontend calls:

```ts
cognito.confirmSignUp(email, code)
```

This sends a `ConfirmSignUp` request to Cognito.

If the code is valid, Cognito marks the account as confirmed.

### 5. User Signs In

The user enters email and password again.

The frontend calls:

```ts
cognito.signIn(email, password)
```

This sends an `InitiateAuth` request to Cognito using:

```text
USER_PASSWORD_AUTH
```

If the credentials are correct and the account is confirmed, Cognito returns JWT tokens:

```text
IdToken
AccessToken
RefreshToken
ExpiresIn
```

The application mainly uses the `IdToken` when calling the backend.

### 6. Frontend Stores the Auth State

After successful login, the frontend parses the `IdToken` and extracts the Cognito `sub`.

The `sub` is Cognito's unique user identifier.

The frontend stores auth data in `localStorage` under:

```text
ccbda_auth
```

The stored data includes:

```json
{
  "userId": "<cognito-sub>",
  "email": "user@example.com",
  "idToken": "...",
  "accessToken": "...",
  "refreshToken": "..."
}
```

In the frontend, the Cognito `sub` is stored as `userId`.

### 7. Frontend Calls the Backend

For backend requests, the frontend API client reads the stored `idToken` and sends it in the authorization header:

```http
Authorization: Bearer <IdToken>
```

This is implemented in:

```text
frontend/src/lib/api.ts
```

The frontend sends this token when calling protected endpoints such as:

```text
/users/me
/users/{user_id}/profile
/users/{user_id}/jobs
/users/{user_id}/results
```

### 8. Backend Verifies the Token

The backend verifies the token in:

```text
backend/app/services/auth.py
```

The backend does not trust the frontend by itself. It verifies that the token is real and valid.

The backend fetches Cognito's public keys from the JWKS endpoint:

```text
https://cognito-idp.<region>.amazonaws.com/<user_pool_id>/.well-known/jwks.json
```

Then it checks:

- the JWT signature
- the expiration time
- the issuer
- the audience or client id

The issuer must match:

```text
https://cognito-idp.<region>.amazonaws.com/<user_pool_id>
```

The audience/client id must match the configured Cognito App Client ID.

If the token is invalid, expired, or from the wrong User Pool/App Client, the backend returns:

```text
401 Unauthorized
```

### 9. Backend Extracts the Trusted User ID

After the token has been verified, the backend extracts the `sub` claim from the token.

This `sub` becomes the trusted backend `user_id`.

This is the key security improvement:

```text
The backend no longer simply trusts the user_id sent by the frontend.
It trusts the user_id extracted from a verified Cognito token.
```

### 10. Backend Checks That the User Can Only Access Their Own Data

Most user-specific routes contain a path parameter:

```text
/users/{user_id}/...
```

The backend compares:

```text
user_id from the URL
```

with:

```text
sub from the verified Cognito token
```

If they match, the request is allowed.

If they do not match, the backend returns:

```text
403 Forbidden
```

Example:

```text
Token sub: abc123
URL:       /users/abc123/profile
Result:    allowed
```

But:

```text
Token sub: abc123
URL:       /users/other-user/profile
Result:    403 Forbidden
```

## The `/users/me` Endpoint

The `/users/me` endpoint connects the Cognito identity to the application database.

It is implemented in:

```text
backend/app/routers/users.py
```

After login, the frontend calls:

```text
GET /users/me
```

with:

```http
Authorization: Bearer <IdToken>
```

The backend then:

1. verifies the Cognito token
2. extracts the `sub`
3. uses the `sub` as the application `user_id`
4. checks DynamoDB for an existing user record
5. creates the user if it does not already exist
6. returns the user metadata

The response contains:

```json
{
  "user_id": "<cognito-sub>",
  "created_at": "timestamp"
}
```

This means Cognito owns the identity, while DynamoDB stores the application-specific user record.

## Where User Data Is Stored

Cognito stores authentication-related identity data:

- email
- password information
- confirmation status
- Cognito `sub`

The application stores application data in DynamoDB and S3.

The value that connects Cognito and the application database is:

```text
Cognito sub
```

In DynamoDB, a user is stored using:

```text
PK = USER#<sub>
SK = METADATA
user_id = <sub>
created_at = <timestamp>
```

The same `user_id` is also used in S3 keys:

```text
profiles/<user_id>/<file_id>.pdf
jobs/<user_id>/<job_id>.pdf
```

This keeps each user's data separated.

## Protected Backend Endpoints

The following user-scoped endpoints are protected by Cognito token validation and user-id matching.

| Endpoint | Protection |
| --- | --- |
| `GET /users/me` | Requires a valid Cognito token |
| `GET /users/{user_id}` | Requires token user to match `user_id` |
| `POST /users/{user_id}/profile/upload` | Requires token user to match `user_id` |
| `POST /users/{user_id}/profile/upload-file` | Requires token user to match `user_id` |
| `GET /users/{user_id}/profile` | Requires token user to match `user_id` |
| `PATCH /users/{user_id}/profile` | Requires token user to match `user_id` |
| `GET /users/{user_id}/profile/status` | Requires token user to match `user_id` |
| `POST /users/{user_id}/jobs` | Requires token user to match `user_id` |
| `POST /users/{user_id}/jobs/upload` | Requires token user to match `user_id` |
| `POST /users/{user_id}/jobs/upload-file` | Requires token user to match `user_id` |
| `GET /users/{user_id}/jobs` | Requires token user to match `user_id` |
| `GET /users/{user_id}/jobs/{job_id}` | Requires token user to match `user_id` |
| `GET /users/{user_id}/jobs/{job_id}/status` | Requires token user to match `user_id` |
| `DELETE /users/{user_id}/jobs/{job_id}` | Requires token user to match `user_id` |
| `POST /users/{user_id}/jobs/{job_id}/analyze` | Requires token user to match `user_id` |
| `GET /users/{user_id}/results` | Requires token user to match `user_id` |
| `GET /users/{user_id}/results/{job_id}` | Requires token user to match `user_id` |

## Relationship to Lambda

Cognito is not used directly inside the Lambda functions.

Cognito protects the entry point into the system through the frontend and FastAPI backend.

The flow is:

```text
User logs in with Cognito
Frontend sends token to backend
Backend verifies token
Backend stores data with validated user_id
S3/SQS triggers Lambda
Lambda processes data for that user_id
```

The Lambda functions process data that has already entered the system through an authenticated backend request.

They receive user context indirectly through:

- S3 object keys
- DynamoDB records
- SQS messages

For example:

```text
profiles/<user_id>/<file_id>.pdf
jobs/<user_id>/<job_id>.pdf
```

So Lambda does not need to verify Cognito tokens directly in the current architecture.

## How to Verify That a User Has Been Saved

After a user signs in, the frontend calls:

```text
GET /users/me
```

If the response contains a `user_id`, then the backend has either found or created the user in DynamoDB.

Example response:

```json
{
  "user_id": "abc123",
  "created_at": "2026-05-22T10:00:00Z"
}
```

You can also verify the user directly in DynamoDB by looking for:

```text
PK = USER#abc123
SK = METADATA
```

If that item exists, the Cognito user has been connected to an application user record.

## Security Model

The core security model is:

```text
Cognito proves who the user is.
The backend verifies that proof.
The backend only allows access when the route user_id matches the verified Cognito sub.
```

This prevents users from accessing another user's resources by manually changing the `user_id` in the URL.

Before Cognito, `user_id` was already used in the application, but it was mainly an application-level identifier. With Cognito, the same `user_id` is now tied to a verified identity.

## Current Limitations

The current implementation works for signup, confirmation, login, backend token validation, and user isolation. However, there are still possible improvements:

- tokens are stored in `localStorage`
- refresh-token renewal is not implemented yet
- logout is local only and does not perform global Cognito sign-out
- forgot password is not implemented
- resend confirmation code is not implemented
- tests need to be updated to account for protected endpoints

## Summary

AWS Cognito is integrated as the application's identity provider. The frontend communicates directly with Cognito for signup, confirmation, and login. Cognito returns JWT tokens after login. The frontend sends the `IdToken` to the FastAPI backend. The backend verifies the token using Cognito's public keys and extracts the Cognito `sub`. That `sub` is used as the trusted application `user_id`.

All user-scoped backend routes compare the `user_id` in the URL with the verified Cognito `sub`. This ensures that users can only access their own profiles, uploads, jobs, and analysis results.
