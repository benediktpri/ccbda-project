"""Pre-commit check: verify extraction_schema.json matches the Pydantic model."""

import json
import sys
from pathlib import Path

from app.models.schemas import ExtractedProfile

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "app" / "lambdas" / "extraction_schema.json"

expected = json.dumps(ExtractedProfile.model_json_schema(), indent=2) + "\n"

if not SCHEMA_PATH.exists():
    print(f"ERROR: {SCHEMA_PATH} does not exist.")
    print("Run: uv run python scripts/check_extraction_schema.py --fix")
    sys.exit(1)

actual = SCHEMA_PATH.read_text()

if actual != expected:
    if "--fix" in sys.argv:
        SCHEMA_PATH.write_text(expected)
        print(f"Updated {SCHEMA_PATH}")
        sys.exit(0)
    print(f"ERROR: {SCHEMA_PATH} is stale.")
    print("Run: uv run python scripts/check_extraction_schema.py --fix")
    sys.exit(1)
