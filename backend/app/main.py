from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.logger import configure_logging
from app.routers import jobs, profiles, results, upload, users

configure_logging()

app = FastAPI(title="CCBDA API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router, tags=["users"])
app.include_router(upload.router, prefix="/users/{user_id}", tags=["upload"])
app.include_router(profiles.router, prefix="/users/{user_id}", tags=["profiles"])
app.include_router(jobs.router, prefix="/users/{user_id}", tags=["jobs"])
app.include_router(results.router, prefix="/users/{user_id}", tags=["results"])


@app.get("/health")
def health():
    return {"status": "ok"}
