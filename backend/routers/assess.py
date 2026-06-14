"""
EcoLoop AI - Assessment Router

POST /api/assess - Run the agentic assessment pipeline on a product.

IMPORTANT: This endpoint runs AI analysis and stores the recommendation.
It does NOT update sustainability metrics (credits, CO₂, action_counts).
Metrics are only updated when the user takes a FINAL circular action
(listing creation or exchange completion).
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

router = APIRouter(prefix="/api", tags=["assessment"])


@router.post(
    "/assess",
    response_model=AssessmentResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request data"},
        502: {"model": ErrorResponse, "description": "Backend service failure"},
    },
    summary="Run product assessment",
    description=(
        "Submit a product image key and metadata to run the AI assessment pipeline. "
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

    Pipeline: Vision Agent → Valuation Agent → Decision Agent →
              Sustainability Agent → Buyer Matching Agent

    Stores recommended_action in assessment record.
    Does NOT update metrics — metrics update on final user action.
    """
    print(f"[ROUTE] POST /api/assess received: image_key={request.image_key}, session={x_session_id}")

    # Run the orchestrator pipeline
    try:
        assessment = await orchestrator.run(request)
        print(f"[ROUTE] Orchestrator returned: grade={assessment.condition_grade}, recommended_action={assessment.action_recommendation}")
    except RuntimeError as e:
        print(f"[ROUTE] Orchestrator failed: {e}")
        raise HTTPException(status_code=502, detail={"error": "assessment_failed", "message": str(e)})

    # Persist assessment record (with recommended_action, final_action=null)
    try:
        await save_assessment(assessment, request, x_session_id)
        print(f"[ROUTE] Assessment {assessment.assessment_id} saved (recommended_action={assessment.action_recommendation}, final_action=pending)")
    except Exception as e:
        print(f"[ERROR] Failed to save assessment: {type(e).__name__}: {e}")

    # NO metrics update here — metrics are awarded on listing creation / exchange completion

    return assessment
