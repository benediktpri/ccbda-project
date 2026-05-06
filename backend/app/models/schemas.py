from datetime import datetime

from pydantic import BaseModel, Field

# --- Nested Models ---


class Language(BaseModel):
    language: str
    level: str | None = None


class Skill(BaseModel):
    name: str
    level: str | None = None
    years: int | None = None
    last_used: str | None = None


class Experience(BaseModel):
    title: str
    company: str | None = None
    start: str | None = None
    end: str | None = None
    description: str | None = None
    achievements: list[str] = Field(default_factory=list)


class Education(BaseModel):
    degree: str
    field: str | None = None
    institution: str | None = None
    graduation_year: str | None = None


class Compensation(BaseModel):
    min: int | None = None
    max: int | None = None
    currency: str | None = None


class JobLocation(BaseModel):
    office_locations: list[str] = Field(default_factory=list)
    remote_policy: str | None = None
    regions: list[str] = Field(default_factory=list)


class JobSkill(BaseModel):
    name: str
    importance: str = "required"


class MatchedSkill(BaseModel):
    name: str
    user_level: str | None = None
    job_requirement: str | None = None


class MissingSkill(BaseModel):
    name: str
    importance: str | None = None


# --- Request Models ---


class CreateJobRequest(BaseModel):
    raw_text: str | None = None
    source_type: str = "text"
    source_url: str | None = None


class UpdateProfileRequest(BaseModel):
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    location: str | None = None
    willingness_to_relocate: bool | None = None
    target_compensation: Compensation | None = None
    languages: list[Language] | None = None
    skills: list[Skill] | None = None
    experience: list[Experience] | None = None
    education: list[Education] | None = None


# --- Response Models ---


class UserResponse(BaseModel):
    user_id: str
    created_at: datetime


class ProfileResponse(BaseModel):
    status: str
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    location: str | None = None
    willingness_to_relocate: bool | None = None
    target_compensation: Compensation | None = None
    languages: list[Language] = Field(default_factory=list)
    skills: list[Skill] = Field(default_factory=list)
    experience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProfileStatusResponse(BaseModel):
    raw_status: str | None = None
    structured_status: str | None = None


class JobResponse(BaseModel):
    job_id: str
    status: str
    raw_text: str | None = None
    source_type: str
    title: str | None = None
    company: str | None = None
    location: JobLocation | None = None
    seniority: str | None = None
    required_skills: list[JobSkill] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class JobListItem(BaseModel):
    job_id: str
    title: str | None = None
    company: str | None = None
    status: str
    source_type: str
    created_at: datetime | None = None


class JobStatusResponse(BaseModel):
    raw_status: str | None = None
    structured_status: str | None = None


class AnalysisResultResponse(BaseModel):
    job_id: str
    match_score: int
    matched_skills: list[MatchedSkill] = Field(default_factory=list)
    missing_skills: list[MissingSkill] = Field(default_factory=list)
    recommendations: str | None = None
    created_at: datetime | None = None


class UploadResponse(BaseModel):
    upload_url: str
    upload_fields: dict
    s3_key: str


class FileUploadResponse(BaseModel):
    s3_key: str
    message: str
