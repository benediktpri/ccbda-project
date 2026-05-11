import json
import logging
from decimal import Decimal

import boto3

from app.config import settings
from app.models.schemas import AnalysisOutput

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
    return _client


SYSTEM_PROMPT = """\
You are a skills-gap analyst. Given a candidate's profile and a job posting, \
perform a detailed comparison and produce a structured skills-gap analysis.

Rules:
- match_score is 0-100 representing overall alignment between candidate and role
- For matched_skills: include skills the candidate demonstrably has that the job requires. \
Set user_level to the candidate's proficiency and job_requirement to what the job asks for.
- For missing_skills: include skills the job requires that the candidate lacks or has no evidence of. \
Preserve the importance level from the job posting (required, preferred, nice-to-have).
- Consider BOTH explicit skills listed AND skills implied by work experience, projects, or education.
- recommendations should be a concise paragraph addressed directly to the user (use "you/your"), \
giving actionable advice on how to close the identified gaps."""

ANALYSIS_TOOL = {
    "name": "report_skills_gap",
    "description": "Report the structured skills-gap analysis result",
    "input_schema": AnalysisOutput.model_json_schema(),
}


def _default_serializer(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def analyze_skills_gap(profile_structured: dict, job_raw_text: str, job_structured: dict) -> dict:
    profile_skills = profile_structured.get("skills", [])
    profile_experience = profile_structured.get("experience", [])
    profile_education = profile_structured.get("education", [])

    job_title = job_structured.get("title", "Unknown")
    job_company = job_structured.get("company", "Unknown")
    job_seniority = job_structured.get("seniority")
    job_skills = job_structured.get("required_skills", [])

    user_message = f"""## Candidate Structured Skills

{json.dumps(profile_skills, indent=2, default=_default_serializer)}

## Candidate Experience

{json.dumps(profile_experience, indent=2, default=_default_serializer)}

## Candidate Education

{json.dumps(profile_education, indent=2, default=_default_serializer)}

## Job Posting (full text)

{job_raw_text}

## Job Posting Structured Data

Title: {job_title}
Company: {job_company}
Seniority: {job_seniority or "Not specified"}

Required Skills:
{json.dumps(job_skills, indent=2, default=_default_serializer)}

---

Analyze the skills gap between this candidate and the job requirements. \
Use the report_skills_gap tool to provide your structured analysis."""

    request_body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_message}],
            "max_tokens": 4096,
            "temperature": 0.2,
            "tools": [ANALYSIS_TOOL],
            "tool_choice": {"type": "tool", "name": "report_skills_gap"},
        }
    )

    logger.info("Invoking Bedrock for skills-gap analysis, model=%s", settings.bedrock_model_id)
    client = _get_client()
    response = client.invoke_model(
        modelId=settings.bedrock_model_id,
        body=request_body,
        contentType="application/json",
        accept="application/json",
    )

    response_body = json.loads(response["body"].read())
    tool_use_block = next(block for block in response_body["content"] if block["type"] == "tool_use")
    result = tool_use_block["input"]
    logger.info("Skills-gap analysis complete, match_score=%d", result.get("match_score", -1))
    return result
