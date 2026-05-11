"""Pre-commit check: verify extraction schemas match the Pydantic models."""

import json
import sys
from pathlib import Path

from app.models.schemas import ExtractedJob, ExtractedProfile

SCHEMAS = [
    (ExtractedProfile, Path(__file__).resolve().parent.parent / "app" / "lambdas" / "extraction_schema.json"),
    (ExtractedJob, Path(__file__).resolve().parent.parent / "app" / "lambdas" / "job_extraction_schema.json"),
]

fix = "--fix" in sys.argv
errors = False

for model, schema_path in SCHEMAS:
    expected = json.dumps(model.model_json_schema(), indent=2) + "\n"

    if not schema_path.exists():
        if fix:
            schema_path.write_text(expected)
            print(f"Created {schema_path}")
        else:
            print(f"ERROR: {schema_path} does not exist.")
            print("Run: uv run python scripts/check_extraction_schema.py --fix")
            errors = True
        continue

    actual = schema_path.read_text()
    if actual != expected:
        if fix:
            schema_path.write_text(expected)
            print(f"Updated {schema_path}")
        else:
            print(f"ERROR: {schema_path} is stale.")
            print("Run: uv run python scripts/check_extraction_schema.py --fix")
            errors = True

if errors:
    sys.exit(1)
