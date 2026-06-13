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
