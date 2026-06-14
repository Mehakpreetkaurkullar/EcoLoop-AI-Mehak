"""
EcoLoop AI - Assessment Router

POST /api/assess - Run the agentic assessment pipeline on a product.
         Supports both image and video uploads.
         For videos, frames are extracted and passed through the image pipeline.
"""

from fastapi import APIRouter, Header, HTTPException
from typing import Optional

from models.schemas import (
    AssessmentRequest,
    AssessmentResponse,
    ErrorResponse,
)
from models.database import save_assessment
from services.assessment_orchestrator import orchestrator
from services.video_assessment_service import video_assessment_service

# Video MIME types that the upload service accepts
_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm"}

router = APIRouter(prefix="/api", tags=["assessment"])


def _is_video_key(image_key: str) -> bool:
    """
    Detect whether an S3 key points to a video file by its extension.

    This mirrors the file extensions used during upload without importing
    the upload_service MIME lookup (which needs the UploadFile object).
    """
    lower_key = image_key.lower()
    return any(lower_key.endswith(ext) for ext in _VIDEO_EXTENSIONS)


@router.post(
    "/assess",
    response_model=AssessmentResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request data"},
        502: {"model": ErrorResponse, "description": "Backend service failure"},
    },
    summary="Run product assessment",
    description=(
        "Submit a product image (or video) key and metadata to run the AI assessment pipeline. "
        "For videos, 3 representative frames are extracted and assessed; the worst condition "
        "grade is used in the final result. "
        "Returns condition grade, action recommendation, resale value estimate, "
        "green credits, CO2 savings, and buyer personas. "
        "NOTE: Sustainability metrics are awarded only when the user completes a circular action."
    ),
)
async def assess_product(
    request: AssessmentRequest,
    x_session_id: Optional[str] = Header(
        default="anonymous",
        description="User session ID for tracking assessments",
    ),
):
    """
    Run the agentic assessment pipeline on a product.

    Image pipeline: Vision Agent → Valuation Agent → Decision Agent →
                    Sustainability Agent → Buyer Matching Agent

    Video pipeline: Frame Extractor (3 frames) → Vision Agent × 3 →
                    Merge (worst grade wins) → remaining 4 agents
    """
    is_video = _is_video_key(request.image_key)
    print(
        f"[ROUTE] POST /api/assess received: image_key={request.image_key}, "
        f"is_video={is_video}, session={x_session_id}"
    )

    # Run the appropriate pipeline
    try:
        if is_video:
            print("[ROUTE] Routing to VideoAssessmentService...")
            assessment = await video_assessment_service.assess(request)
        else:
            assessment = await orchestrator.run(request)

        print(
            f"[ROUTE] Assessment complete: grade={assessment.condition_grade}, "
            f"action={assessment.action_recommendation}, "
            f"video_note={assessment.video_note!r}"
        )
    except RuntimeError as e:
        print(f"[ROUTE] Assessment pipeline failed: {e}")
        raise HTTPException(status_code=502, detail={"error": "assessment_failed", "message": str(e)})

    # Persist assessment record (with recommended_action, final_action=null)
    try:
        await save_assessment(assessment, request, x_session_id)
        print(f"[ROUTE] Assessment {assessment.assessment_id} saved (recommended_action={assessment.action_recommendation}, final_action=pending)")
    except Exception as e:
        print(f"[ERROR] Failed to save assessment: {type(e).__name__}: {e}")

    # NO metrics update here — metrics are awarded on listing creation / exchange completion

    return assessment
