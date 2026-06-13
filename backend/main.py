"""
EcoLoop AI - FastAPI Application Entry Point

AI-Powered Sustainability Platform for Amazon HackOn 2026.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import get_settings
from routers.upload import router as upload_router
from routers.assess import router as assess_router
from routers.dashboard import router as dashboard_router
from routers.marketplace import router as marketplace_router

settings = get_settings()

app = FastAPI(
    title="EcoLoop AI",
    description="AI-Powered Sustainability Platform - Amazon HackOn 2026",
    version="0.1.0",
)

# CORS middleware - allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(upload_router)
app.include_router(assess_router)
app.include_router(dashboard_router)
app.include_router(marketplace_router)


@app.get("/health")
async def health_check():
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "service": "ecoloop-ai",
        "environment": settings.app_env,
    }
