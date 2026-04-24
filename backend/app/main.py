import logging
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import ai_inference, honeypot, reporting
from app.services.persistence import initialize_database


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("honeypot.api")

settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(title="Honeypot AI Security Detection System")
    initialize_database()

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration_ms = int((time.time() - start) * 1000)
        logger.info(
            "REQUEST path=%s method=%s status=%s duration_ms=%s",
            request.url.path,
            request.method,
            response.status_code,
            duration_ms,
        )
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(honeypot.router, prefix="/honeypot", tags=["honeypot"])
    app.include_router(ai_inference.router, prefix="/ai", tags=["ai"])
    app.include_router(reporting.router, prefix="/report", tags=["reporting"])

    @app.get("/health", tags=["health"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
