from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import honeypot, ai_inference, reporting

def create_app() -> FastAPI:
    app = FastAPI(title="Honeypot AI Security Detection")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(honeypot.router, prefix="/honeypot", tags=["honeypot"])
    app.include_router(ai_inference.router, prefix="/ai", tags=["ai"])
    app.include_router(reporting.router, prefix="/report", tags=["reporting"])

    @app.get("/health", tags=["health"])
    def health_check():
        return {"status": "ok"}

    return app

app = create_app()