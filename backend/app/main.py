from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api import activity, graph, knowledge, pocs
from app.config import settings
from app.services.common import DomainError

app = FastAPI(title="AI R&D Innovation Graph API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
async def domain_error(_: Request, exc: DomainError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "code": exc.code})


@app.exception_handler(IntegrityError)
async def integrity_error(_: Request, exc: IntegrityError):
    return JSONResponse(
        status_code=409,
        content={"detail": "The change conflicts with existing data.", "code": "integrity_error"},
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


for r in (graph.router, pocs.router, knowledge.router, activity.router):
    app.include_router(r)
