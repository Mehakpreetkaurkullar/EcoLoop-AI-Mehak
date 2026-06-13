"""
EcoLoop AI - Assessment Router

POST /api/assess - Run the agentic assessment pipeline on a product.
"""

from fastapi import APIRouter, Header, HTTPException
from typing import Optional

from models.schemas import (
    AssessmentRequest,
    AssessmentResponse,
    ErrorResponse,
)
from models.database import save_assessment, update_user_metrics
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
        "green credits, CO2 savings, and buyer personas."
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
    """
    print(f"[ROUTE] POST /api/assess received: image_key={request.image_key}, session={x_session_id}")

    # Run the orchestrator pipeline (Vision Agent calls Bedrock)
    try:
        assessment = await orchestrator.run(request)
        print(f"[ROUTE] Orchestrator returned: grade={assessment.condition_grade}, action={assessment.action_recommendation}")
    except RuntimeError as e:
        print(f"[ROUTE] Orchestrator failed: {e}")
        raise HTTPException(status_code=502, detail={"error": "assessment_failed", "message": str(e)})

    # Persist to DynamoDB
    try:
        await save_assessment(assessment, request, x_session_id)
        print(f"[ROUTE] Assessment {assessment.assessment_id} saved to DynamoDB")
    except Exception as e:
        print(f"[ERROR] Failed to save assessment: {type(e).__name__}: {e}")

    try:
        await update_user_metrics(
            user_session_id=x_session_id,
            action=assessment.action_recommendation,
            green_credits=assessment.green_credits,
            co2_savings_kg=assessment.co2_savings_kg,
        )
    except Exception as e:
        print(f"[ERROR] Failed to update user metrics: {type(e).__name__}: {e}")

    return assessment
