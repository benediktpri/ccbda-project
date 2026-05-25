import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.logger import configure_logging
from app.routers import jobs, profiles, results, upload, users

configure_logging()

logger = logging.getLogger("app.requests")

app = FastAPI(title="CCBDA API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    logger.info(
        "request",
        extra={
            "http_method": request.method,
            "http_path": request.url.path,
            "http_status": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


app.include_router(users.router, tags=["users"])
app.include_router(upload.router, prefix="/users/{user_id}", tags=["upload"])
app.include_router(profiles.router, prefix="/users/{user_id}", tags=["profiles"])
app.include_router(jobs.router, prefix="/users/{user_id}", tags=["jobs"])
app.include_router(results.router, prefix="/users/{user_id}", tags=["results"])


@app.get("/health")
def health():
    return {"status": "ok"}
