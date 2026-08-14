import asyncio
import logging
import time
import traceback
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.config import get_settings
from app.routers import ai_inference, attack_context, honeypot, reporting, system
from app.services.persistence import initialize_database, truncate_all_tables


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("honeypot.api")

settings = get_settings()


async def _db_reset_loop(interval_hours: float) -> None:
    while True:
        await asyncio.sleep(interval_hours * 3600)
        logger.info("DB_RESET: Truncating all database tables (interval=%.1fh)", interval_hours)
        try:
            truncate_all_tables()
            from app.services.reporting import _store
            _store.clear()
            logger.info("DB_RESET: Database and in-memory store cleared successfully")
        except Exception as e:
            logger.error("DB_RESET: Failed to truncate tables: %s", e)


def create_app() -> FastAPI:
    app = FastAPI(title="Honeypot AI Security Detection System")
    initialize_database()
    
    try:
        from app.services.reporting import load_historical_alerts
        load_historical_alerts()
    except Exception as e:
        logger.error(f"Failed to load historical alerts on start: {e}")

    try:
        from app.services.ai_client import sweep_expired_sessions_db
        sweep_expired_sessions_db()
    except Exception as e:
        logger.error(f"Failed to run database session sweep on start: {e}")

    @app.on_event("startup")
    async def on_startup():
        if settings.db_reset_interval_hours > 0:
            asyncio.create_task(_db_reset_loop(settings.db_reset_interval_hours))
            logger.info("DB_RESET: Auto-reset scheduled every %.1f hour(s)", settings.db_reset_interval_hours)

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

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        logger.info(f"HTTP_EXCEPTION path={request.url.path} status={exc.status_code} detail={exc.detail}")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "error_type": "HTTPException", 
                "path": str(request.url.path),
            }
        )

    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError):
        errors = exc.errors()
        logger.error(f"VALIDATION_ERROR path={request.url.path} errors={errors}")
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Validation error",
                "error_type": "ValidationError",
                "path": str(request.url.path),
                "errors": errors
            }
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        error_msg = str(exc)
        stack_trace = traceback.format_exc()
        logger.error(f"UNHANDLED_EXCEPTION path={request.url.path} error={error_msg}\n{stack_trace}")
        return JSONResponse(
            status_code=500,
            content={
                "detail": error_msg,
                "error_type": type(exc).__name__,
                "path": str(request.url.path),
            }
        )

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
    app.include_router(system.router, prefix="/system", tags=["system"])
    app.include_router(attack_context.router, prefix="/ai", tags=["attack-context"])

    @app.get("/health", tags=["health"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}
    return app


app = create_app()
