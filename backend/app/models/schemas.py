from datetime import datetime

from pydantic import BaseModel, Field

# --- Nested Models ---


class Language(BaseModel):
    language: str = Field(description="Language name, e.g. English, German, Mandarin")
    level: str | None = Field(default=None, description="Proficiency: basic, conversational, fluent, or native")


class Skill(BaseModel):
    name: str = Field(description="Skill or technology name, e.g. Python, AWS, Project Management")
    level: str | None = Field(default=None, description="Proficiency: beginner, intermediate, advanced, or expert")
    years: int | None = Field(default=None, description="Years of experience with this skill")
    last_used: str | None = Field(default=None, description="When last used, in YYYY-MM format")


class Experience(BaseModel):
    title: str = Field(description="Job title, e.g. Software Engineer, Product Manager")
    company: str | None = Field(default=None, description="Company or organization name")
    start: str | None = Field(default=None, description="Start date in YYYY-MM format")
    end: str | None = Field(default=None, description="End date in YYYY-MM format, null if current role")
    description: str | None = Field(default=None, description="Brief role description")
    achievements: list[str] = Field(default_factory=list, description="Concise bullet-point achievements")


class Education(BaseModel):
    degree: str = Field(description="Degree type, e.g. BSc, MSc, PhD, MBA")
    field: str | None = Field(default=None, description="Field of study, e.g. Computer Science")
    institution: str | None = Field(default=None, description="University or school name")
    graduation_year: str | None = Field(default=None, description="Graduation year as YYYY")


class Compensation(BaseModel):
    min: int | None = Field(default=None, description="Minimum annual salary in whole units")
    max: int | None = Field(default=None, description="Maximum annual salary in whole units")
    currency: str | None = Field(default=None, description="ISO 4217 currency code, e.g. EUR, USD")


class JobLocation(BaseModel):
    office_locations: list[str] = Field(default_factory=list, description="Physical office locations mentioned")
    remote_policy: str | None = Field(default=None, description="Remote work policy: remote, hybrid, or on-site")
    regions: list[str] = Field(default_factory=list, description="Geographic regions or countries for the role")


class JobSkill(BaseModel):
    name: str = Field(description="Skill or technology name")
    importance: str = Field(default="required", description="Importance level: required, preferred, or nice-to-have")


class MatchedSkill(BaseModel):
    name: str
    user_level: str | None = None
    job_requirement: str | None = None


class MissingSkill(BaseModel):
    name: str
    importance: str | None = None


# --- Extraction Models (used by Bedrock tool_use) ---


class ExtractedJob(BaseModel):
    title: str | None = Field(default=None, description="Job title, e.g. Senior Backend Engineer")
    company: str | None = Field(default=None, description="Company or organization name")
    location: JobLocation | None = Field(default=None, description="Location and remote work details")
    seniority: str | None = Field(
        default=None, description="Seniority level: junior, mid, senior, lead, principal, director, VP, or C-level"
    )
    required_skills: list[JobSkill] = Field(
        default_factory=list, description="Skills mentioned in the posting with their importance level"
    )


class ExtractedProfile(BaseModel):
    first_name: str | None = Field(default=None, description="Candidate's first/given name")
    last_name: str | None = Field(default=None, description="Candidate's last/family name")
    email: str | None = Field(default=None, description="Contact email address")
    location: str | None = Field(default=None, description="Current city or region, e.g. Berlin, Germany")
    willingness_to_relocate: bool | None = Field(
        default=None, description="Whether the candidate mentions willingness to relocate"
    )
    target_compensation: Compensation | None = Field(default=None, description="Desired salary range if mentioned")
    languages: list[Language] = Field(default_factory=list, description="Spoken/written languages")
    skills: list[Skill] = Field(default_factory=list, description="Technical and professional skills")
    experience: list[Experience] = Field(default_factory=list, description="Work experience, most recent first")
    education: list[Education] = Field(default_factory=list, description="Educational qualifications")


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


class JobUploadResponse(BaseModel):
    job_id: str
    upload_url: str
    upload_fields: dict
    s3_key: str


class JobFileUploadResponse(BaseModel):
    job_id: str
    s3_key: str
    message: str


class FileUploadResponse(BaseModel):
    s3_key: str
    message: str
