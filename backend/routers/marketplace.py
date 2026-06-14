"""
EcoLoop AI - Marketplace Router

POST /api/listings  — Create a marketplace listing from assessment data
GET  /api/listings  — Browse active marketplace listings
"""

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field
from typing import Optional, Any

from services.marketplace_service import (
    create_listing,
    get_listings,
    generate_listing_title,
    generate_listing_description,
)
from models.database import update_user_metrics, set_final_action

router = APIRouter(prefix="/api", tags=["marketplace"])


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------


class AssessmentSnapshot(BaseModel):
    """Frozen copy of AI output at the time the listing was created."""
    condition_grade: str
    confidence_score: int
    grade_explanation: str
    action_recommendation: str
    action_reasoning: str
    resale_value: dict  # {min, max, display}
    green_credits: int
    co2_savings_kg: float
    buyer_personas: list[dict] = Field(default_factory=list)
    wanted_category: str = ""
    wanted_description: str = ""


class CreateListingRequest(BaseModel):
    """Request body for publishing a listing to the marketplace."""
    assessment_id: str = Field(..., description="Source assessment ID")
    image_key: str = Field(..., description="S3 image key from upload")
    product_category: str = Field(...)
    listing_type: str = Field(..., description="'resale' or 'refurbished'")
    assessment_snapshot: AssessmentSnapshot = Field(
        ..., description="Full AI assessment output preserved for historical integrity"
    )


class CreateListingResponse(BaseModel):
    """Response after a listing is successfully created."""
    listing_id: str
    title: str
    description: str
    suggested_price: float
    price_min: float
    price_max: float
    listing_type: str
    ai_verified: bool
    status: str


class ListingsResponse(BaseModel):
    """Response for browsing marketplace listings."""
    listings: list[dict[str, Any]]
    total: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/listings",
    response_model=CreateListingResponse,
    summary="Publish a listing to the marketplace",
    description=(
        "Create a resale or refurbished listing from an existing assessment. "
        "The full assessment_snapshot is preserved so future agent changes "
        "don't affect historical listings. Listings are marked AI Verified."
    ),
)
async def publish_listing(
    request: CreateListingRequest,
    x_session_id: Optional[str] = Header(default="anonymous"),
):
    """Create a marketplace listing from assessment results."""
    print(f"[PUBLISH_LISTING] Called with listing_type={request.listing_type}, assessment_id={request.assessment_id}, session={x_session_id}")
    snapshot = request.assessment_snapshot

    # Generate title and description from assessment data
    title = generate_listing_title(
        request.product_category,
        snapshot.condition_grade,
        request.listing_type,
    )

    price_display = snapshot.resale_value.get("display", f"${snapshot.resale_value.get('min', 0):.0f} - ${snapshot.resale_value.get('max', 0):.0f}")
    description = generate_listing_description(
        category=request.product_category,
        grade=snapshot.condition_grade,
        explanation=snapshot.grade_explanation,
        personas=snapshot.buyer_personas,
        price_display=price_display,
    )

    price_min = float(snapshot.resale_value.get("min", 0))
    price_max = float(snapshot.resale_value.get("max", 0))
    suggested_price = round((price_min + price_max) / 2, 2)

    listing_data = {
        "assessment_id": request.assessment_id,
        "user_session_id": x_session_id,
        "listing_type": request.listing_type,
        "title": title,
        "description": description,
        "image_key": request.image_key,
        "product_category": request.product_category,
        "condition_grade": snapshot.condition_grade,
        "suggested_price": suggested_price,
        "price_min": price_min,
        "price_max": price_max,
        "buyer_personas": snapshot.buyer_personas,
        "assessment_snapshot": snapshot.model_dump(),
    }

    result = await create_listing(listing_data)

    # Update sustainability metrics based on FINAL user action (not AI recommendation)
    # This is the correct place: user has committed to a circular action.
    if request.listing_type != 'exchange':
        # Exchange metrics are handled separately on completion (Schedule Exchange)
        final_action = request.listing_type  # resale/refurbished/donation/recycling
        # Map listing_type to action key for UserMetrics
        action_key_map = {'resale': 'resell', 'refurbished': 'refurbish', 'donation': 'donate', 'recycling': 'recycle'}
        action_key = action_key_map.get(final_action, final_action)
        try:
            await update_user_metrics(
                user_session_id=x_session_id,
                action=action_key,
                green_credits=snapshot.green_credits,
                co2_savings_kg=snapshot.co2_savings_kg,
            )
            print(f"[METRICS] Metrics updated: action={action_key}, session={x_session_id}")
        except Exception as e:
            print(f"[ERROR] Metrics update failed: {e}")

        # Update assessment record with final action (SEPARATE try block so metrics failure doesn't block this)
        try:
            if request.assessment_id and request.assessment_id != 'direct-exchange':
                await set_final_action(request.assessment_id, action_key)
                print(f"[FINAL_ACTION] Set final_action='{action_key}' on assessment={request.assessment_id}")
            else:
                print(f"[FINAL_ACTION] Skipped: assessment_id='{request.assessment_id}'")
        except Exception as e:
            print(f"[ERROR] set_final_action failed: {type(e).__name__}: {e}")

    return CreateListingResponse(
        listing_id=result["listing_id"],
        title=result["title"],
        description=result["description"],
        suggested_price=result["suggested_price"],
        price_min=result["price_min"],
        price_max=result["price_max"],
        listing_type=result["listing_type"],
        ai_verified=result["ai_verified"],
        status=result["status"],
    )


@router.get(
    "/listings",
    response_model=ListingsResponse,
    summary="Browse marketplace listings",
    description="Retrieve active listings. Filter by listing_type: 'resale' or 'refurbished'.",
)
async def browse_listings(listing_type: Optional[str] = None):
    """Browse the EcoLoop marketplace."""
    listings = await get_listings(listing_type=listing_type)
    return ListingsResponse(listings=listings, total=len(listings))


# ---------------------------------------------------------------------------
# Purchase Confidence Explanation
# ---------------------------------------------------------------------------

from services.purchase_confidence_explainer import generate_explanation


class ExplainRequest(BaseModel):
    """Request body for purchase confidence explanation."""
    listing_id: str
    condition_grade: str
    confidence_score: int
    purchase_confidence: int
    return_risk: str
    listing_type: str
    product_category: str
    green_credits: int = 0
    co2_saved: float = 0.0
    top_category: str = ""
    top_action: str = ""


class ExplainResponse(BaseModel):
    """AI-generated explanation for the purchase confidence score."""
    explanation: str


@router.post(
    "/listings/explain",
    response_model=ExplainResponse,
    summary="Generate AI explanation for Purchase Confidence",
    description="Uses Amazon Bedrock to explain WHY a listing received its confidence score. Cached per listing+profile.",
)
async def explain_purchase_confidence(request: ExplainRequest):
    """Generate a natural-language explanation for the buyer."""
    explanation = await generate_explanation(
        listing_id=request.listing_id,
        condition_grade=request.condition_grade,
        confidence_score=request.confidence_score,
        purchase_confidence=request.purchase_confidence,
        return_risk=request.return_risk,
        listing_type=request.listing_type,
        product_category=request.product_category,
        green_credits=request.green_credits,
        co2_saved=request.co2_saved,
        top_category=request.top_category,
        top_action=request.top_action,
    )
    return ExplainResponse(explanation=explanation)


# ---------------------------------------------------------------------------
# Exchange Completion
# ---------------------------------------------------------------------------

from models.schemas import ActionRecommendation


class ExchangeCompleteRequest(BaseModel):
    """Request to schedule a perfect match exchange between two listings."""
    listing_id_a: str = Field(..., description="First listing (the one being viewed)")
    listing_id_b: str = Field(..., description="Second listing (the perfect match)")


class ExchangeCompleteResponse(BaseModel):
    """Response after exchange is scheduled."""
    success: bool
    green_credits: int
    co2_savings_kg: float
    products_diverted: int
    message: str


@router.post(
    "/exchange/complete",
    response_model=ExchangeCompleteResponse,
    summary="Schedule a perfect match exchange",
    description="Marks both listings as 'scheduled', creates an exchange record, updates sustainability metrics.",
)
async def complete_exchange(
    request: ExchangeCompleteRequest,
    x_session_id: Optional[str] = Header(default="anonymous"),
):
    """Schedule a perfect match exchange between two listings."""
    from config.aws import get_listings_table
    from decimal import Decimal

    table = get_listings_table()

    # Fetch both listings
    resp_a = table.get_item(Key={"listing_id": request.listing_id_a})
    resp_b = table.get_item(Key={"listing_id": request.listing_id_b})
    listing_a = resp_a.get("Item")
    listing_b = resp_b.get("Item")

    if not listing_a or not listing_b:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"error": "listing_not_found", "message": "One or both listings not found."})

    # Mark both as scheduled
    for lid in [request.listing_id_a, request.listing_id_b]:
        table.update_item(
            Key={"listing_id": lid},
            UpdateExpression="SET #s = :scheduled",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":scheduled": "scheduled"},
        )

    # Calculate combined sustainability impact
    snap_a = listing_a.get("assessment_snapshot", {})
    snap_b = listing_b.get("assessment_snapshot", {})
    credits_a = int(snap_a.get("green_credits", 5))
    credits_b = int(snap_b.get("green_credits", 5))
    co2_a = float(snap_a.get("co2_savings_kg", Decimal("1.5")))
    co2_b = float(snap_b.get("co2_savings_kg", Decimal("1.5")))
    total_credits = credits_a + credits_b
    total_co2 = co2_a + co2_b

    # Update user metrics (exchange-specific: no total_assessments increment)
    from models.database import update_exchange_metrics
    try:
        await update_exchange_metrics(
            user_session_id=x_session_id,
            green_credits=total_credits,
            co2_savings_kg=total_co2,
        )
    except Exception:
        pass

    # Write exchange activity record to Assessments table for Recent Assessments display
    from config.aws import get_assessments_table
    from models.database import generate_assessment_id
    from datetime import datetime, timezone

    cat_a = listing_a.get("product_category", "")
    cat_b = listing_b.get("product_category", "")

    try:
        assessments_table = get_assessments_table()
        assessments_table.put_item(Item={
            "assessment_id": generate_assessment_id(),
            "user_session_id": x_session_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "image_key": listing_a.get("image_key", ""),
            "product_category": f"{cat_a} ↔ {cat_b}",
            "condition_grade": listing_a.get("condition_grade", "B"),
            "confidence_score": 100,
            "grade_explanation": f"Exchange scheduled between {cat_a} and {cat_b}.",
            "action_recommendation": "exchange",
            "action_reasoning": "Perfect match exchange — both products stay in circular use.",
            "green_credits": total_credits,
            "co2_savings_kg": Decimal(str(total_co2)),
            "buyer_personas": [],
        })
    except Exception:
        pass  # Non-blocking

    return ExchangeCompleteResponse(
        success=True,
        green_credits=total_credits,
        co2_savings_kg=total_co2,
        products_diverted=2,
        message=f"Exchange scheduled: {cat_a} ↔ {cat_b}. Both products stay in circular use.",
    )
