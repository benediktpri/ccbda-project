# DynamoDB Schema Design

## Table Configuration

| Property | Value |
|----------|-------|
| Table name | `AppTable` |
| Partition key | `PK` (String) |
| Sort key | `SK` (String) |
| Billing mode | On-demand (PAY_PER_REQUEST) |
| Region | eu-west-1 |

All IDs are UUID v4, all timestamps are ISO 8601 UTC, both generated server-side.

### Status State Machine

All records with a `status` field follow this progression:

```
pending → processing → ready
                    ↘ failed
```

- **`pending`** — queued, no work has started yet
- **`processing`** — actively being worked on (Textract/scrape/Bedrock running)
- **`ready`** — complete, all fields populated
- **`failed`** — processing encountered an error

---

## Entity Definitions

### User

| Field | Type | Description |
|-------|------|-------------|
| PK | `USER#<user_id>` | |
| SK | `METADATA` | Fixed literal |
| user_id | String | UUID v4 |
| created_at | String | ISO 8601 UTC |

---

### Profile (Raw Text)

Written by Lambda after Textract processes the uploaded CV PDF. Kept for re-processing without re-uploading.

| Field | Type | Description |
|-------|------|-------------|
| PK | `USER#<user_id>` | |
| SK | `PROFILE#RAW` | Fixed literal |
| raw_text | String | Full text extracted from PDF |
| s3_key | String | S3 object key of original PDF |
| status | String | `pending` / `processing` / `ready` / `failed` |
| created_at | String | ISO 8601 UTC |
| updated_at | String | ISO 8601 UTC |

### Profile (Structured)

Bedrock-extracted fields plus user-provided preferences. All fields fully editable via PATCH.

| Field | Type | Description |
|-------|------|-------------|
| PK | `USER#<user_id>` | |
| SK | `PROFILE#STRUCTURED` | Fixed literal |
| status | String | `pending` / `processing` / `ready` / `failed` |
| email | String | |
| first_name | String | |
| last_name | String | |
| location | String | Current location |
| willingness_to_relocate | Boolean | |
| target_compensation | Map | `{min, max, currency}` |
| languages | List[Map] | `{language, level}` |
| skills | List[Map] | `{name, level, years, last_used}` |
| experience | List[Map] | `{title, company, start, end, description, achievements[]}` |
| education | List[Map] | `{degree, field, institution, graduation_year}` |
| created_at | String | ISO 8601 UTC |
| updated_at | String | ISO 8601 UTC |

---

### Job Description (Raw)

Stores the raw source material. For text input, raw_text is written immediately. For PDF/URL, raw_text is populated after extraction.

| Field | Type | Description |
|-------|------|-------------|
| PK | `USER#<user_id>` | |
| SK | `JOB_RAW#<job_id>` | UUID v4 |
| job_id | String | UUID v4 |
| source_type | String | `text` / `pdf` / `url` |
| raw_text | String | Extracted/submitted plain text (null while processing PDF/URL) |
| s3_key | String | S3 key if source_type=pdf (nullable) |
| source_url | String | URL if source_type=url (nullable) |
| status | String | `pending` / `processing` / `ready` / `failed` |
| created_at | String | ISO 8601 UTC |
| updated_at | String | ISO 8601 UTC |

### Job Description (Structured)

Key fields parsed by Bedrock from the raw text. The LLM reads raw_text directly for analysis — these fields are for frontend display.

| Field | Type | Description |
|-------|------|-------------|
| PK | `USER#<user_id>` | |
| SK | `JOB#<job_id>` | Same job_id as JOB_RAW |
| job_id | String | UUID v4 |
| status | String | `pending` / `processing` / `ready` / `failed` |
| title | String | Extracted job title |
| company | String | Company name |
| location | Map | `{office_locations[], remote_policy, regions[]}` |
| seniority | String | junior / mid / senior / lead / staff / etc. |
| required_skills | List[Map] | `{name, importance}` — importance: `required` / `preferred` |
| created_at | String | ISO 8601 UTC |
| updated_at | String | ISO 8601 UTC |

---

### Analysis Result (Skills-Gap)

One result per user+job pair. Re-running overwrites the previous result.

| Field | Type | Description |
|-------|------|-------------|
| PK | `USER#<user_id>` | |
| SK | `ANALYSIS#<job_id>` | |
| job_id | String | Reference to the analyzed job |
| match_score | Number | 0–100 overall match percentage |
| matched_skills | List[Map] | `{name, user_level, job_requirement}` |
| missing_skills | List[Map] | `{name, importance}` |
| recommendations | String | Bedrock-generated improvement suggestions |
| created_at | String | ISO 8601 UTC |

---

## Processing Pipelines

### Profile Pipeline

```
User uploads PDF → S3
                    ↓ (S3 event)
                  Lambda Step 1: Textract → writes PROFILE#RAW (status=ready)
                    ↓
                  Lambda Step 2: Bedrock structures → writes PROFILE#STRUCTURED (status=ready)
                    ↓
                  User edits via PATCH → updates PROFILE#STRUCTURED
```

### Job Description Pipeline

```
Source: text          Source: PDF              Source: URL
─────────────         ───────────              ───────────
Write raw_text to     Store in S3, write       Write JOB_RAW#
JOB_RAW# (ready)     JOB_RAW# (pending)       (pending)
      │                     │                        │
      │               Textract → update         Scrape → update
      │               JOB_RAW# (ready)          JOB_RAW# (ready)
      │                     │                        │
      └─────────────────────┼────────────────────────┘
                            ↓
                    Bedrock extracts key fields
                            ↓
                    Writes JOB# (status=ready)
```

---

## Access Patterns

| Pattern | Operation | Key Condition |
|---------|-----------|---------------|
| Create user | PutItem + `attribute_not_exists(PK)` | PK=`USER#uid`, SK=`METADATA` |
| Get user | GetItem | PK=`USER#uid`, SK=`METADATA` |
| Write raw profile | PutItem (verify user exists) | PK=`USER#uid`, SK=`PROFILE#RAW` |
| Get raw profile | GetItem | PK=`USER#uid`, SK=`PROFILE#RAW` |
| Write/update structured profile | PutItem (verify user exists) | PK=`USER#uid`, SK=`PROFILE#STRUCTURED` |
| Get structured profile | GetItem | PK=`USER#uid`, SK=`PROFILE#STRUCTURED` |
| Create job raw | PutItem | PK=`USER#uid`, SK=`JOB_RAW#<job_id>` |
| Update job raw (after extraction) | UpdateItem | PK=`USER#uid`, SK=`JOB_RAW#<job_id>` |
| Get job raw | GetItem | PK=`USER#uid`, SK=`JOB_RAW#<job_id>` |
| Write job structured | PutItem | PK=`USER#uid`, SK=`JOB#<job_id>` |
| Get job structured | GetItem | PK=`USER#uid`, SK=`JOB#<job_id>` |
| List user's jobs (structured) | Query + filter | PK=`USER#uid`, SK begins_with `JOB#`, filter out `JOB_RAW#` |
| Delete job (both records) | DeleteItem ×2 | SK=`JOB_RAW#<id>` + SK=`JOB#<id>` |
| Write/overwrite analysis result | PutItem | PK=`USER#uid`, SK=`ANALYSIS#<job_id>` |
| Get result for job | GetItem | PK=`USER#uid`, SK=`ANALYSIS#<job_id>` |
| List user's results | Query | PK=`USER#uid`, SK begins_with `ANALYSIS#` |

No Global Secondary Indexes (GSIs) needed for MVP — all access is user-scoped.

---

## Condition Expressions

| Operation | Condition | Purpose |
|-----------|-----------|---------|
| `create_user` | `attribute_not_exists(PK)` | Prevent overwriting existing user |
| `put_profile_raw` | Verify user exists (separate GetItem) | Ensure user exists before writing |
| `put_profile_structured` | Verify user exists (separate GetItem) | Ensure user exists before writing |

---

## SK Prefix → API Endpoint Mapping

| SK Prefix | REST Path | Notes |
|-----------|-----------|-------|
| `METADATA` | `/users`, `/users/{user_id}` | |
| `PROFILE#RAW` | Internal (written by Lambda) | Exposed via status endpoint only |
| `PROFILE#STRUCTURED` | `/users/{user_id}/profile` | GET + PATCH |
| `JOB_RAW#<job_id>` | Internal (raw source) | Raw text included in job GET response |
| `JOB#<job_id>` | `/users/{user_id}/jobs` | CRUD |
| `ANALYSIS#<job_id>` | `/users/{user_id}/results` | SK uses "ANALYSIS", endpoint uses "results" |

---

## Post-MVP Record Types (Reserved)

| Entity | PK | SK | Description |
|--------|----|----|-------------|
| Cover Letter | `USER#<user_id>` | `COVER_LETTER#<job_id>` | Generated cover letter for a specific job |
| Tailored CV | `USER#<user_id>` | `TAILORED_CV#<job_id>` | CV rewritten to target a specific job |

---

## Example Items

```json
{
  "PK": "USER#550e8400-e29b-41d4-a716-446655440000",
  "SK": "METADATA",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2026-05-06T10:30:00Z"
}
```

```json
{
  "PK": "USER#550e8400-e29b-41d4-a716-446655440000",
  "SK": "PROFILE#STRUCTURED",
  "status": "ready",
  "first_name": "Benedikt",
  "last_name": "Prisett",
  "email": "benedikt@example.com",
  "location": "Munich, Germany",
  "willingness_to_relocate": true,
  "target_compensation": {"min": 70000, "max": 90000, "currency": "EUR"},
  "languages": [{"language": "German", "level": "native"}, {"language": "English", "level": "fluent"}],
  "skills": [
    {"name": "Python", "level": "advanced", "years": 4, "last_used": "2026"},
    {"name": "AWS", "level": "intermediate", "years": 2, "last_used": "2026"}
  ],
  "experience": [
    {
      "title": "Backend Engineer",
      "company": "TechCo",
      "start": "2023-01",
      "end": "2026-04",
      "description": "Built microservices...",
      "achievements": ["Reduced latency by 40%", "Led migration to AWS"]
    }
  ],
  "education": [{"degree": "MSc", "field": "Computer Science", "institution": "TU Munich", "graduation_year": "2023"}],
  "created_at": "2026-05-06T10:31:00Z",
  "updated_at": "2026-05-06T12:00:00Z"
}
```

```json
{
  "PK": "USER#550e8400-e29b-41d4-a716-446655440000",
  "SK": "JOB_RAW#7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "job_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "source_type": "text",
  "raw_text": "We are looking for a Senior Backend Engineer with 5+ years of experience in Python...",
  "s3_key": null,
  "source_url": null,
  "status": "ready",
  "created_at": "2026-05-06T11:00:00Z",
  "updated_at": "2026-05-06T11:00:00Z"
}
```

```json
{
  "PK": "USER#550e8400-e29b-41d4-a716-446655440000",
  "SK": "JOB#7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "job_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "status": "ready",
  "title": "Senior Backend Engineer",
  "company": "Acme Corp",
  "location": {"office_locations": ["Berlin"], "remote_policy": "hybrid", "regions": ["EU"]},
  "seniority": "senior",
  "required_skills": [
    {"name": "Python", "importance": "required"},
    {"name": "Kubernetes", "importance": "preferred"}
  ],
  "created_at": "2026-05-06T11:00:00Z",
  "updated_at": "2026-05-06T11:02:00Z"
}
```

```json
{
  "PK": "USER#550e8400-e29b-41d4-a716-446655440000",
  "SK": "ANALYSIS#7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "job_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "match_score": 72,
  "matched_skills": [
    {"name": "Python", "user_level": "advanced", "job_requirement": "required"},
    {"name": "AWS", "user_level": "intermediate", "job_requirement": "required"}
  ],
  "missing_skills": [
    {"name": "Kubernetes", "importance": "preferred"}
  ],
  "recommendations": "Your Python and AWS experience align well. Consider gaining Kubernetes experience through a certification or side project to strengthen your application.",
  "created_at": "2026-05-06T11:05:00Z"
}
```
