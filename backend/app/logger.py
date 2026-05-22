"""Centralized JSON logging configuration for the FastAPI application.

Configures the root logger to emit structured JSON, making logs
queryable in CloudWatch Insights.  Uses only the standard library
so there are no extra deployment dependencies.

Note: Lambda functions use an identical _JsonFormatter defined inline
in each handler file because they are packaged as standalone zip archives
without access to this module.
"""

import json
import logging
import sys


class JsonFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)


def configure_logging() -> None:
    """Configure the root logger with JSON output on stdout."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Remove any existing handlers to avoid duplicate plain-text lines
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)

    # Silence noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
