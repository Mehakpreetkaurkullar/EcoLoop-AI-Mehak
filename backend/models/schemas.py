"""
EcoLoop AI - Pydantic Request/Response Models

Defines all API request bodies, response shapes, and validation rules.
"""

from enum import Enum
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ProductCategory(str, Enum):
    """Allowed product categories."""

    ELECTRONICS = "Electronics"
    CLOTHING = "Clothing"
    FURNITURE = "Furniture"
    BOOKS = "Books"
    TOYS = "Toys"
    APPLIANCES = "Appliances"
    SPORTS_EQUIPMENT = "Sports Equipment"


class ConditionGrade(str, Enum):
    """Product condition grades assigned by the Vision Agent."""

    A = "A"  # Like New
    B = "B"  # Good
    C = "C"  # Fair
    D = "D"  # Poor


class ActionRecommendation(str, Enum):
    """Possible next-action recommendations from the Decision Agent."""

    RESELL = "resell"
    REFURBISH = "refurbish"
    DONATE = "donate"
    RECYCLE = "recycle"


# ---------------------------------------------------------------------------
# Upload Models
# ---------------------------------------------------------------------------


class UploadResponse(BaseModel):
    """Response returned after a successful image upload."""

    image_key: str
    preview_url: str
    file_name: str
    content_type: str
    file_size: int


# ---------------------------------------------------------------------------
# Product Metadata Models
# ---------------------------------------------------------------------------


class ProductMetadata(BaseModel):
    """
    Product metadata submitted alongside the image for assessment.

    Validation rules:
    - category must be one of the predefined ProductCategory values
    - product_age_months must be between 0 and 240 (inclusive)
    - original_price must be greater than 0
    """

    product_category: ProductCategory = Field(
        ...,
        description="Product category from the predefined list",
        examples=["Electronics"],
    )
    product_age_months: int = Field(
        ...,
        ge=0,
        le=240,
        description="Product age in months (0-240)",
        examples=[18],
    )
    original_price: float = Field(
        ...,
        gt=0,
        description="Original purchase price in INR (must be > 0)",
        examples=[599.99],
    )


# ---------------------------------------------------------------------------
# Assessment Request/Response Models
# ---------------------------------------------------------------------------


class AssessmentRequest(BaseModel):
    """
    Request body for POST /api/assess.

    Combines the uploaded image key with product metadata.
    """

    image_key: str = Field(
        ...,
        min_length=1,
        description="S3 object key from the upload step",
        examples=["uploads/abc123/product.jpg"],
    )
    product_category: ProductCategory = Field(
        ...,
        description="Product category",
        examples=["Electronics"],
    )
    product_age_months: int = Field(
        ...,
        ge=0,
        le=240,
        description="Product age in months (0-240)",
        examples=[18],
    )
    original_price: float = Field(
        ...,
        gt=0,
        description="Original purchase price in INR",
        examples=[599.99],
    )


class ResaleValue(BaseModel):
    """Resale value estimation range."""

    min: float = Field(..., description="Minimum estimated resale value in INR")
    max: float = Field(..., description="Maximum estimated resale value in INR")
    display: str = Field(..., description="Human-readable price range", examples=["₹142 - ₹192"])


class BuyerPersona(BaseModel):
    """A suggested buyer persona for resellable products."""

    label: str = Field(..., description="Persona label", examples=["Budget Tech Enthusiast"])
    description: str = Field(..., description="Brief buyer profile description")
    relevance_score: int = Field(..., ge=1, le=10, description="Relevance score 1-10")


class AssessmentResponse(BaseModel):
    """
    Full assessment response from the agentic pipeline.

    Returned by POST /api/assess after all 5 agents complete.
    """

    assessment_id: str = Field(..., description="Unique assessment identifier")
    condition_grade: ConditionGrade = Field(..., description="Condition grade A/B/C/D")
    confidence_score: int = Field(..., ge=0, le=100, description="Confidence 0-100")
    grade_explanation: str = Field(..., description="AI explanation for the condition grade")
    action_recommendation: ActionRecommendation = Field(
        ..., description="Recommended next action"
    )
    action_reasoning: str = Field(..., description="AI reasoning for the recommendation")
    resale_value: ResaleValue = Field(..., description="Estimated resale value range")
    green_credits: int = Field(..., ge=0, description="Green credits awarded")
    co2_savings_kg: float = Field(..., ge=0, description="Estimated CO2 savings in kg")
    buyer_personas: list[BuyerPersona] = Field(
        default_factory=list,
        description="Buyer personas (only for resell recommendations)",
    )
    video_note: str | None = Field(
        default=None,
        description="Present when assessment was generated from video frames",
    )


# ---------------------------------------------------------------------------
# Dashboard Models
# ---------------------------------------------------------------------------


class DashboardResponse(BaseModel):
    """Response for GET /api/dashboard with aggregated sustainability metrics."""

    total_green_credits: int = Field(default=0)
    total_assessments: int = Field(default=0)
    total_co2_saved_kg: float = Field(default=0.0)
    action_distribution: dict[str, int] = Field(default_factory=dict)
    recent_assessments: list[dict] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Error Models
# ---------------------------------------------------------------------------


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    message: str
