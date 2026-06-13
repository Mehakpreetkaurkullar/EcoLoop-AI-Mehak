"""
EcoLoop AI - Marketplace Service

Handles listing creation and retrieval for the second-life marketplace.
Listings are created from existing assessment data with a full assessment_snapshot
preserved for historical integrity. No new AI calls are made.
"""

import uuid
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status

from config.aws import get_listings_table, get_s3_client
from config.settings import get_settings

logger = logging.getLogger("ecoloop.marketplace")


def _to_decimal(value: float) -> Decimal:
    return Decimal(str(round(value, 2)))


def _float_to_decimal(obj: Any) -> Any:
    """Recursively convert float values to Decimal for DynamoDB storage."""
    if isinstance(obj, float):
        return Decimal(str(round(obj, 2)))
    elif isinstance(obj, dict):
        return {k: _float_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_float_to_decimal(i) for i in obj]
    return obj


def _decimal_to_float(obj: Any) -> Any:
    """Recursively convert Decimal values to float for JSON serialization."""
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: _decimal_to_float(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_decimal_to_float(i) for i in obj]
    return obj


def generate_listing_title(category: str, grade: str, listing_type: str) -> str:
    """Generate a marketplace listing title from assessment data."""
    grade_labels = {"A": "Like New", "B": "Good Condition", "C": "Fair Condition", "D": "Usable"}
    condition = grade_labels.get(grade, "Pre-Owned")
    prefix = "Refurbished" if listing_type == "refurbished" else ""
    return f"{prefix} {category} — {condition}".strip()


def generate_listing_description(
    category: str,
    grade: str,
    explanation: str,
    personas: list[dict],
    price_display: str,
) -> str:
    """Generate a marketplace description from existing assessment data."""
    grade_desc = {
        "A": "in excellent, like-new condition with no visible wear",
        "B": "in good condition with minor cosmetic wear",
        "C": "in fair condition with moderate wear signs",
        "D": "in usable condition, may show significant wear",
    }
    condition_text = grade_desc.get(grade, "in pre-owned condition")

    desc = f"{category} item {condition_text}. "

    if explanation:
        first_sentence = explanation.split(".")[0].strip()
        if first_sentence and len(first_sentence) < 150:
            desc += first_sentence + ". "

    desc += f"Estimated value: {price_display}. "

    if personas:
        buyer_labels = [p.get("label", "") for p in personas[:3] if p.get("label")]
        if buyer_labels:
            desc += f"Ideal for: {', '.join(buyer_labels)}."

    return desc.strip()


async def create_listing(listing_data: dict[str, Any]) -> dict[str, Any]:
    """
    Save a new listing to the Listings DynamoDB table.

    The listing_data must include assessment_snapshot for historical integrity.
    """
    table = get_listings_table()
    listing_id = uuid.uuid4().hex

    # Generate pre-signed image URL for marketplace display
    settings = get_settings()
    s3_client = get_s3_client()
    image_url = ""
    try:
        image_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket_name, "Key": listing_data["image_key"]},
            ExpiresIn=86400,
        )
    except Exception as e:
        logger.warning(f"Failed to generate image URL: {e}")

    item = {
        "listing_id": listing_id,
        "assessment_id": listing_data["assessment_id"],
        "user_session_id": listing_data["user_session_id"],
        "listing_type": listing_data["listing_type"],
        "title": listing_data["title"],
        "description": listing_data["description"],
        "image_key": listing_data["image_key"],
        "image_url": image_url,
        "product_category": listing_data["product_category"],
        "condition_grade": listing_data["condition_grade"],
        "suggested_price": _to_decimal(listing_data["suggested_price"]),
        "price_min": _to_decimal(listing_data["price_min"]),
        "price_max": _to_decimal(listing_data["price_max"]),
        "buyer_personas": listing_data["buyer_personas"],
        "assessment_snapshot": _float_to_decimal(listing_data["assessment_snapshot"]),
        "ai_verified": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "active",
    }

    try:
        table.put_item(Item=item)
        logger.info(f"Listing created: {listing_id} (type={listing_data['listing_type']}, ai_verified=True)")
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "listing_save_failed", "message": str(e)},
        )

    return _decimal_to_float(item)


async def get_listings(listing_type: str | None = None) -> list[dict[str, Any]]:
    """
    Retrieve active marketplace listings.

    Optionally filter by listing_type ('resale' or 'refurbished').
    Uses full scan with pagination (acceptable at hackathon scale).
    """
    table = get_listings_table()

    try:
        all_items = []
        scan_kwargs: dict[str, Any] = {
            "FilterExpression": "#s = :active",
            "ExpressionAttributeNames": {"#s": "status"},
            "ExpressionAttributeValues": {":active": "active"},
        }

        if listing_type:
            scan_kwargs["FilterExpression"] += " AND listing_type = :lt"
            scan_kwargs["ExpressionAttributeValues"][":lt"] = listing_type

        while True:
            resp = table.scan(**scan_kwargs)
            all_items.extend(resp.get("Items", []))
            if "LastEvaluatedKey" in resp:
                scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
            else:
                break

        # Sort newest first
        all_items.sort(key=lambda x: x.get("created_at", ""), reverse=True)

        # Convert Decimal to float
        return [_decimal_to_float(item) for item in all_items]

    except (BotoCoreError, ClientError) as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "listing_read_failed", "message": str(e)},
        )
